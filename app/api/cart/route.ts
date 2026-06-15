import { NextRequest, NextResponse } from "next/server";
import { psCreateCart, CART_PAGE_URL } from "@/lib/prestashop";
import { corsHeaders, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);

  let body: { items?: { productId: number; qty: number }[]; customerId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers });
  }

  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { cartId: "", cartUrl: CART_PAGE_URL, itemAddUrls: [] },
      { headers }
    );
  }

  const result = await psCreateCart(items, body?.customerId);
  return NextResponse.json(result, { headers });
}
