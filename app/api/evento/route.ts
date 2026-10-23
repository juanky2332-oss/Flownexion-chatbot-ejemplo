import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, preflight, getClientIp, isRateLimited } from "@/lib/http";
import { registrarEvento, TIPOS_EVENTO, type TipoEvento } from "@/lib/registro";

// Lo que pasa en el chat después de la respuesta: productos añadidos al
// carrito, "tramitar pedido", PDF descargado, contacto pulsado, valoraciones
// 👍/👎 y datos de contacto que deja el cliente al escalar. Es lo que permite
// medir en el panel cuántas consultas acaban en carrito.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  if (isRateLimited(getClientIp(req), "evento", 60)) {
    return NextResponse.json({ ok: false }, { status: 429, headers });
  }
  let body: { sessionId?: unknown; tipo?: unknown; datos?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers });
  }
  const tipo = String(body?.tipo ?? "") as TipoEvento;
  if (!TIPOS_EVENTO.includes(tipo)) return NextResponse.json({ ok: false }, { status: 400, headers });
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "sin-sesion";
  const datos = body?.datos && typeof body.datos === "object" ? body.datos : {};

  if (!sessionId.startsWith("prueba-")) await registrarEvento(sessionId, tipo, datos);

  // Datos de contacto que deja el cliente al escalar: además de quedar en el
  // panel, se reenvían al aviso que se configure (n8n, Zapier, Make...) para
  // que ESGAS se entere en el momento.
  if (tipo === "contacto_datos" && process.env.AVISO_CONTACTO_WEBHOOK) {
    try {
      await fetch(process.env.AVISO_CONTACTO_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...datos }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.error("[evento] aviso de contacto no enviado:", (err as Error).message);
    }
  }
  return NextResponse.json({ ok: true }, { headers });
}
