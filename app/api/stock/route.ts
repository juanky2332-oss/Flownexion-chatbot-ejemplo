// ─────────────────────────────────────────────────────────────
// Proxy seguro → stock_availables de Prestashop.
// Protege la PRESTASHOP_API_KEY: el cliente nunca la ve.
// GET /api/stock?id=product_id  →  { quantity, available }
// Requiere Bearer interno (INTERNAL_API_SECRET).
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getStock } from "@/lib/prestashop";
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

  const idParam = req.nextUrl.searchParams.get("id") ?? "";
  const id = Number.parseInt(idParam, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json(
      { error: "Parámetro 'id' inválido" },
      { status: 400, headers }
    );
  }

  try {
    const stock = await getStock(id);
    return NextResponse.json(
      { quantity: stock.quantity, available: stock.available },
      { headers }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 502, headers }
    );
  }
}
