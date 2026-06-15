import { NextRequest, NextResponse } from "next/server";
import { psGetCustomer } from "@/lib/prestashop";
import { corsHeaders, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req);
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
