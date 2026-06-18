import { NextRequest, NextResponse } from "next/server";
import { psCreateCart, psGetCustomer, CART_PAGE_URL } from "@/lib/prestashop";
import { corsHeaders, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);

  let body: {
    items?: { productId: number; qty: number; idProductAttribute?: number }[];
    customerId?: number;
    customerSecureKey?: string;
  };
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

  let customerId = body?.customerId;
  let customerSecureKey = body?.customerSecureKey;

  // 🧪 MODO PRUEBAS: si no llega cliente en el body, usamos la cuenta de
  // pruebas configurada en TEST_CUSTOMER_EMAIL para que el carrito creado
  // por la Webservice quede asociado a un cliente real con secure_key.
  if ((!customerId || !customerSecureKey) && process.env.TEST_CUSTOMER_EMAIL) {
    const testCustomer = await psGetCustomer(process.env.TEST_CUSTOMER_EMAIL);
    if (testCustomer) {
      customerId = testCustomer.id;
      customerSecureKey = testCustomer.secureKey;
    }
  }

  const result = await psCreateCart(items, customerId, customerSecureKey);
  return NextResponse.json(result, { headers });
}
