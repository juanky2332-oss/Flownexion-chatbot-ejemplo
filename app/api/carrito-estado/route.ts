import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, preflight, getClientIp, isRateLimited } from "@/lib/http";
import { verifyIdentityToken } from "@/lib/hmac";
import { psCantidadEnCarrito, psGetCustomer, psResumenCarrito } from "@/lib/prestashop";

// El carrito de la tienda del cliente, para el chat cuando NO está dentro de
// la tienda (allí lo da la propia tienda al añadir):
//  - {id_product}: unidades de ese producto, para confirmar de verdad que la
//    ventanita de addchat.php añadió (se mira antes y después).
//  - {accion:"resumen"}: líneas, unidades y subtotal, para el resumen del chat.
// Solo para el cliente identificado con token firmado, o la cuenta de pruebas
// en la web del chat: nunca para un id o e-mail sin firmar (sería leer el
// carrito de otra persona).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  if (isRateLimited(getClientIp(req), "carrito-estado", 40)) return NextResponse.json({ qty: null, lineas: null }, { status: 429, headers });
  let body: { accion?: unknown; id_product?: unknown; id_product_attribute?: unknown; identityToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ qty: null, lineas: null }, { status: 400, headers });
  }
  const claims = verifyIdentityToken(typeof body?.identityToken === "string" ? body.identityToken : "");
  let customerId = claims?.id_customer;
  let groupId = claims?.id_group;
  if (!customerId && process.env.TEST_CUSTOMER_EMAIL?.trim()) {
    const c = await psGetCustomer(process.env.TEST_CUSTOMER_EMAIL.trim());
    customerId = c?.id;
    groupId = c?.groupId;
  }
  if (!customerId) return NextResponse.json({ qty: null, lineas: null }, { headers });

  if (body?.accion === "resumen") {
    const lineas = await psResumenCarrito(customerId, groupId);
    return NextResponse.json({ lineas }, { headers });
  }
  const qty = await psCantidadEnCarrito(customerId, Number(body?.id_product ?? 0), Number(body?.id_product_attribute ?? 0));
  return NextResponse.json({ qty }, { headers });
}
