// ─────────────────────────────────────────────────────────────
// Diagnóstico de cliente por email. Devuelve el registro completo de
// PrestaShop, incluido secure_key (token de recuperación de carrito/pedido)
// — requiere Bearer interno (INTERNAL_API_SECRET), igual que /api/products
// y /api/stock. Sin esto, cualquiera podía consultar el secure_key real de
// cualquier cliente solo con probar su email.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { psGetCustomer } from "@/lib/prestashop";
import { corsHeaders, preflight, hasInternalAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req);

  if (!hasInternalAuth(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers });
  }

  const email = req.nextUrl.searchParams.get("email") ?? "";
  if (!email.trim()) {
    return NextResponse.json({ error: "Email requerido" }, { status: 400, headers });
  }
  const customer = await psGetCustomer(email);
  if (!customer) {
    return NextResponse.json(
      { error: "Cliente no encontrado. Verifica que el email sea el mismo que usas en b2b.esgas.es" },
      { status: 404, headers }
    );
  }
  return NextResponse.json(customer, { headers });
}
