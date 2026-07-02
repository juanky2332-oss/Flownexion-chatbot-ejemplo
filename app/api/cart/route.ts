import { NextRequest, NextResponse } from "next/server";
import { psCreateCart, psGetCustomer, psGetCustomerById, CART_PAGE_URL } from "@/lib/prestashop";
import { corsHeaders, preflight } from "@/lib/http";
import { verifyIdentityToken } from "@/lib/hmac";

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
    identityToken?: string;
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

  let customerId: number | undefined;
  let customerSecureKey: string | undefined;

  // Prioridad 1: email real del cliente logueado, verificado server-side desde
  // el token de identidad HMAC (nunca nos fiamos de un email que llegue suelto
  // del cliente).
  const verifiedClaims = body?.identityToken ? verifyIdentityToken(body.identityToken) : null;
  const lookupEmail = verifiedClaims?.email?.trim();
  if (lookupEmail) {
    const customer = await psGetCustomer(lookupEmail);
    if (customer) {
      customerId = customer.id;
      customerSecureKey = customer.secureKey;
    }
  }

  // Prioridad 2: id_customer sin firmar (window.prestashop.customer.id leído
  // en el navegador cuando no hay token HMAC disponible). Se vuelve a
  // resolver aquí contra la Webservice API — nunca se confía tal cual.
  if (!customerId && typeof body?.customerId === "number" && body.customerId > 0) {
    const customer = await psGetCustomerById(body.customerId);
    if (customer) {
      customerId = customer.id;
      customerSecureKey = customer.secureKey;
    }
  }

  // Prioridad 3: TEST_CUSTOMER_EMAIL, solo para probar el flujo standalone
  // sin estar logueado en b2b.esgas.es.
  if (!customerId && process.env.TEST_CUSTOMER_EMAIL?.trim()) {
    const customer = await psGetCustomer(process.env.TEST_CUSTOMER_EMAIL.trim());
    if (customer) {
      customerId = customer.id;
      customerSecureKey = customer.secureKey;
    }
  }

  const result = await psCreateCart(items, customerId, customerSecureKey);
  console.log("[api/cart] resultado:", { cartId: result.cartId, cartUrl: result.cartUrl?.slice(0, 80) });
  return NextResponse.json(result, { headers });
}
