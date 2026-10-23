import { NextRequest, NextResponse } from "next/server";
import { calentarCatalogo } from "@/lib/prestashop";
import { corsHeaders, preflight, getClientIp, isRateLimited } from "@/lib/http";

// El chat lo llama al abrirse: deja descargado el índice del catálogo mientras
// el cliente escribe, para que su primera consulta no espere a la tienda.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  if (isRateLimited(getClientIp(req), "calentar", 6)) return NextResponse.json({ ok: true }, { headers });
  try {
    await calentarCatalogo();
  } catch {
    /* sin importancia: la consulta real tiene sus propias búsquedas rápidas */
  }
  return NextResponse.json({ ok: true }, { headers });
}
