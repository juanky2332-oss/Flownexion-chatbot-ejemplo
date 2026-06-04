// ─────────────────────────────────────────────────────────────
// API principal del chatbot: agente IA "Carlos".
// POST /api/chat
// Body: { message: string, sessionId: string, history: Message[] }
// Respuesta: { output: string, products?: Product[] }
//
// CORS restringido a ALLOWED_ORIGINS. Rate limit 30 req/min por IP.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import {
  corsHeaders,
  preflight,
  getClientIp,
  isRateLimited,
} from "@/lib/http";
import type { ChatRequest, Message } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);

  // Rate limiting por IP (cabeceras de Vercel).
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
    return NextResponse.json(
      { output: "Petición inválida." },
      { status: 400, headers }
    );
  }

  const message = (body?.message ?? "").toString().trim();
  if (!message) {
    return NextResponse.json(
      { output: "Cuéntame qué necesitas y te ayudo a encontrarlo. 😊" },
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

  try {
    const { output, products } = await runAgent(message, history);
    return NextResponse.json({ output, products }, { headers });
  } catch (err) {
    console.error("[/api/chat] error:", err);
    return NextResponse.json(
      {
        output:
          "Ups, ha habido un problema técnico procesando tu consulta. ¿Puedes intentarlo de nuevo en un momento?",
      },
      { status: 500, headers }
    );
  }
}
