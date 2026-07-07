import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { corsHeaders, preflight, getClientIp, isRateLimited } from "@/lib/http";
import { verifyIdentityToken } from "@/lib/hmac";
import { psGetCustomer, psGetCustomerById } from "@/lib/prestashop";
import { isPromptExtractionAttempt, IDENTITY_DEFLECTION } from "@/lib/guardrails";
import type { ChatRequest, Message, CartItem } from "@/lib/types";

const MAX_MESSAGE_LENGTH = 1500;

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

  const message = (body?.message ?? "").toString().trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!message) {
    return NextResponse.json(
      { output: "Cuéntame qué necesitas y te ayudo a encontrarlo." },
      { status: 400, headers }
    );
  }

  // Defensa en profundidad: intercepta los intentos más obvios de extraer
  // el system prompt/identidad del modelo sin gastar una llamada a OpenAI.
  // Ver lib/guardrails.ts — el system prompt cubre además las reformulaciones
  // más sutiles que esta heurística no detecta.
  if (isPromptExtractionAttempt(message)) {
    return NextResponse.json({ output: IDENTITY_DEFLECTION, products: [] }, { headers });
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

  // Sin ninguna identidad real (probando standalone en el deploy de Vercel,
  // sin login en b2b.esgas.es): igual que /api/cart, cae al cliente de
  // pruebas configurado en TEST_CUSTOMER_EMAIL para poder verificar el
  // precio con descuento antes de embeber el chat en la tienda real.
  if (!customerId && process.env.TEST_CUSTOMER_EMAIL?.trim()) {
    const testCustomer = await psGetCustomer(process.env.TEST_CUSTOMER_EMAIL.trim());
    if (testCustomer) {
      customerId = testCustomer.id;
      customerGroupId = testCustomer.groupId;
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
    // El detalle (clave de OpenAI ausente/inválida, sin cuota, etc.) es
    // información interna de infraestructura: se queda en los logs del
    // servidor para diagnóstico, pero al cliente nunca se le muestra —
    // revelarla es tan indeseable como revelar el system prompt.
    const msg = err instanceof Error ? err.message : "";
    let category = "error_generico";
    if (/OPENAI_API_KEY/i.test(msg)) category = "falta_openai_api_key";
    else if (/401|invalid.*api key|incorrect api key/i.test(msg)) category = "openai_api_key_invalida";
    else if (/429|quota|insufficient/i.test(msg)) category = "openai_sin_cuota";
    console.error("[/api/chat] error:", category, err);

    return NextResponse.json(
      {
        output:
          "Ups, ha habido un problema técnico procesando tu consulta. ¿Puedes intentarlo de nuevo en un momento?",
      },
      { status: 500, headers }
    );
  }
}
