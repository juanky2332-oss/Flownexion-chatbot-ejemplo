// ─────────────────────────────────────────────────────────────
// Proxy seguro → API de productos de Prestashop.
// Protege la PRESTASHOP_API_KEY: el cliente nunca la ve.
// GET /api/products?q=nombre_producto
// Requiere Bearer interno (INTERNAL_API_SECRET).
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@/lib/prestashop";
import { corsHeaders, preflight, hasInternalAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req);

  if (!hasInternalAuth(req)) {
    return NextResponse.json(
      { error: "No autorizado" },
      { status: 401, headers }
    );
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json(
      { error: "Falta el parámetro 'q'" },
      { status: 400, headers }
    );
  }

  try {
    const products = await searchProducts(q);
    return NextResponse.json({ products }, { headers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 502, headers }
    );
  }
}
