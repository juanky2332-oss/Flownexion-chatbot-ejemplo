/**
 * GET /api/debug-cart?id_product=8854&qty=3
 * Diagnóstico completo: POST crear carrito, GET leer campos, PUT añadir items.
 * Muestra la respuesta exacta de PS en cada paso.
 */
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { psGetCustomer } from "@/lib/prestashop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_EMAIL = "juancarlos@flownexion.com";

export async function GET(req: NextRequest) {
  const BASE_URL = (process.env.PRESTASHOP_BASE_URL ?? "").replace(/\/api\/?$/, "").replace(/\/$/, "");
  const API_KEY  = process.env.PRESTASHOP_API_KEY ?? "";
  const STORE    = BASE_URL || "https://b2b.esgas.es";

  const idProduct = req.nextUrl.searchParams.get("id_product") ?? "8854";
  const qty       = req.nextUrl.searchParams.get("qty") ?? "3";

  // 1. Buscar cliente
  const customer = await psGetCustomer(TEST_EMAIL);
  if (!customer) return NextResponse.json({ error: "Cliente no encontrado: " + TEST_EMAIL }, { status: 404 });

  const customerXml  = `<id_customer>${customer.id}</id_customer>`;
  const secureKeyXml = `<secure_key>${customer.secureKey}</secure_key>`;

  // 2. POST — crear carrito vacío
  const createXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">` +
    `<cart><id_currency>1</id_currency><id_lang>1</id_lang>` +
    customerXml + secureKeyXml +
    `</cart></prestashop>`;

  const postRes  = await fetch(`${BASE_URL}/api/carts?ws_key=${API_KEY}&output_format=JSON`, {
    method: "POST",
    headers: { "Content-Type": "application/xml", Accept: "application/json" },
    body: createXml,
  });
  const postBody = await postRes.text();
  let cartId = "";
  try { cartId = String(JSON.parse(postBody)?.cart?.id ?? ""); } catch { /* xml */ }
  if (!cartId) { const m = postBody.match(/<id[^>]*>(\d+)<\/id>/); cartId = m?.[1] ?? ""; }

  if (!cartId) {
    return NextResponse.json({
      step: "POST_FAILED",
      postStatus: postRes.status,
      postBody: postBody.slice(0, 800),
    });
  }

  // 3. GET — leer campos reales del carrito recién creado
  const getRes  = await fetch(`${BASE_URL}/api/carts/${cartId}?ws_key=${API_KEY}&output_format=JSON`, {
    headers: { Accept: "application/json" },
  });
  const getBody = await getRes.text();
  let cartObj: any = {};
  try { cartObj = JSON.parse(getBody)?.cart ?? {}; } catch { /* xml */ }

  const idAddressDelivery = Number(cartObj?.id_address_delivery ?? 0);
  const idShopGroup       = Number(cartObj?.id_shop_group ?? 1);
  const idShop            = Number(cartObj?.id_shop ?? 1);

  // 4. PUT — añadir productos
  const row =
    `<cart_row>` +
    `<id_product>${idProduct}</id_product>` +
    `<id_product_attribute>0</id_product_attribute>` +
    `<id_address_delivery>${idAddressDelivery}</id_address_delivery>` +
    `<quantity>${qty}</quantity>` +
    `<id_customization>0</id_customization>` +
    `</cart_row>`;

  const putXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">` +
    `<cart>` +
    `<id>${cartId}</id>` +
    `<id_currency>1</id_currency><id_lang>1</id_lang>` +
    `<id_shop_group>${idShopGroup}</id_shop_group>` +
    `<id_shop>${idShop}</id_shop>` +
    customerXml + secureKeyXml +
    `<associations><cart_rows>${row}</cart_rows></associations>` +
    `</cart></prestashop>`;

  const putRes  = await fetch(`${BASE_URL}/api/carts/${cartId}?ws_key=${API_KEY}&output_format=JSON`, {
    method: "PUT",
    headers: { "Content-Type": "application/xml", Accept: "application/json" },
    body: putXml,
  });
  const putBody = await putRes.text();
  let putCart: any = {};
  try { putCart = JSON.parse(putBody)?.cart ?? {}; } catch { /* xml */ }

  // 5. GET de verificación — ¿tiene filas?
  const verifyRes  = await fetch(`${BASE_URL}/api/carts/${cartId}?ws_key=${API_KEY}&output_format=JSON`, {
    headers: { Accept: "application/json" },
  });
  const verifyBody = await verifyRes.text();
  let verifyCart: any = {};
  try { verifyCart = JSON.parse(verifyBody)?.cart ?? {}; } catch { /* xml */ }

  const recoveryUrl = `${STORE}/index.php?controller=cart&action=show&recover_cart=${cartId}&token_cart=${customer.secureKey}`;

  return NextResponse.json({
    customer: { id: customer.id, email: TEST_EMAIL },
    cartId,
    // Campos del GET tras crear
    cartFields: {
      id_address_delivery: idAddressDelivery,
      id_shop_group: idShopGroup,
      id_shop: idShop,
    },
    // Resultado del PUT
    putStatus: putRes.status,
    putOk: putRes.ok,
    putCartRows: putCart?.associations?.cart_rows ?? "NO_ROWS_IN_PUT_RESPONSE",
    putBodySnippet: putBody.slice(0, 600),
    // Verificación final
    verifyCartRows: verifyCart?.associations?.cart_rows ?? "NO_ROWS_AFTER_PUT",
    recoveryUrl,
  });
}
