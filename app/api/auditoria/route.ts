// Auditoría de precio y stock contra la tienda real. Solo Flownexion:
// exige el Bearer interno (INTERNAL_API_SECRET), igual que /api/health.

import { NextRequest, NextResponse } from "next/server";
import { auditarPrecioYStock } from "@/lib/prestashop";
import { hasInternalAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!hasInternalAuth(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const desde = Math.max(0, Number(sp.get("desde") ?? 0) || 0);
  const cuantos = Math.min(150, Math.max(1, Number(sp.get("cuantos") ?? 50) || 50));
  const grupos = (sp.get("grupos") ?? "3,4,5,6,22")
    .split(",").map((g) => Number(g)).filter((g) => g > 0);
  try {
    return NextResponse.json(await auditarPrecioYStock(desde, cuantos, grupos));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 502 });
  }
}
