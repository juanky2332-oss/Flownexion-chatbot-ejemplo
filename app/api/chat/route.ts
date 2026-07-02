import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { corsHeaders, preflight, getClientIp, isRateLimited } from "@/lib/http";
import { verifyIdentityToken } from "@/lib/hmac";
import { psGetCustomerById } from "@/lib/prestashop";
import type { ChatRequest, Message, CartItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { output: "Has hecho demasiadas peticiones. Espera un momento, por favor." },
      { status: 429, headers }
    );
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ output: "Petición inválida." }, { status: 400, headers });
  }

  const message = (body?.message ?? "").toString().trim();
  if (!message) {
    return NextResponse.json(
      { output: "Cuéntame qué necesitas y te ayudo a encontrarlo." },
      { status: 400, headers }
    );
  }

  const history: Message[] = Array.isArray(body?.history)
    ? body.history
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
        .slice(-20)
    : [];

  const cart: CartItem[] | undefined = Array.isArray(body?.cart)
    ? (body.cart as CartItem[]).slice(0, 20)
    : undefined;

  // Identidad: el token HMAC firmado tiene prioridad absoluta sobre cualquier dato del body
  let customerGroupId: number | undefined;
  let customerId: number | undefined;
  const claims = verifyIdentityToken(body?.identityToken ?? "");
  if (claims) {
    customerGroupId = claims.id_group;
    customerId = claims.id_customer;
  } else {
    // Sin token firmado (no hay módulo Prestashop instalado que lo genere):
    // el id_customer llega sin firmar desde window.prestashop.customer.id,
    // pero el grupo NUNCA se confía del cliente — se vuelve a resolver aquí
    // contra la Webservice API con nuestra propia ws_key.
    const rawId =
      typeof body?.customerId === "number" && body.customerId > 0
        ? body.customerId
        : undefined;
    if (rawId) {
      const real = await psGetCustomerById(rawId);
      if (real) {
        customerId = real.id;
        customerGroupId = real.groupId;
      }
    } else if (!process.env.HMAC_SECRET) {
      // Sin secreto configurado y sin customerId (demo/dev): acepta
      // customerGroupId directo del body.
      customerGroupId =
        typeof body?.customerGroupId === "number" && body.customerGroupId > 0
          ? body.customerGroupId
          : undefined;
    }
  }

  try {
    const { output, products, needsHuman } = await runAgent(
      message,
      history,
      cart,
      customerGroupId,
      customerId
    );
    return NextResponse.json({ output, products, needsHuman }, { headers });
  } catch (err) {
    console.error("[/api/chat] error:", err);
    const msg = err instanceof Error ? err.message : "";
    let output =
      "Ups, ha habido un problema técnico procesando tu consulta. ¿Puedes intentarlo de nuevo en un momento?";
    if (/OPENAI_API_KEY/i.test(msg)) {
      output =
        "El asistente aún no está configurado: falta la clave de OpenAI (OPENAI_API_KEY) en el servidor.";
    } else if (/401|invalid.*api key|incorrect api key/i.test(msg)) {
      output = "La clave de OpenAI configurada no es válida. Revisa OPENAI_API_KEY.";
    } else if (/429|quota|insufficient/i.test(msg)) {
      output = "La cuenta de OpenAI no tiene saldo/cuota disponible en este momento.";
    }
    return NextResponse.json({ output }, { status: 500, headers });
  }
}
