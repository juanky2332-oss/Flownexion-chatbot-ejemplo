/**
 * GET /api/debug-cart?q=6205+ZZ+C3
 * Crea carrito WS y verifica con GET si los productos quedaron guardados.
 */
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { psGetCustomer, searchProducts } from "@/lib/prestashop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_EMAIL = "juancarlos@flownexion.com";

export async function GET(req: NextRequest) {
  const BASE_URL = (process.env.PRESTASHOP_BASE_URL ?? "").replace(/\/api\/?$/, "").replace(/\/$/, "");
  const API_KEY = process.env.PRESTASHOP_API_KEY ?? "";
  const q = req.nextUrl.searchParams.get("q") ?? "6205 ZZ C3";

  const customer = await psGetCustomer(TEST_EMAIL);
  if (!customer) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const products = await searchProducts(q, customer.groupId);
  const product = products[0];
  if (!product) return NextResponse.json({ error: `Sin resultados: ${q}` }, { status: 404 });

  const idProductAttribute = product.idProductAttribute ?? 0;

  // 1. Crear carrito WS
  const rows =
    `<cart_row>` +
    `<id_product>${product.id}</id_product>` +
    `<id_product_attribute>${idProductAttribute}</id_product_attribute>` +
    `<quantity>3</quantity>` +
    `</cart_row>`;

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">` +
    `<cart>` +
    `<id_currency>1</id_currency><id_lang>1</id_lang>` +
    `<id_customer>${customer.id}</id_customer>` +
    `<secure_key>${customer.secureKey}</secure_key>` +
    `<associations><cart_rows>${rows}</cart_rows></associations>` +
    `</cart></prestashop>`;

  const postRes = await fetch(`${BASE_URL}/api/carts?ws_key=${API_KEY}&output_format=JSON`, {
    method: "POST",
    headers: { "Content-Type": "application/xml", Accept: "application/json" },
    body: xml,
  });
  const postBody = await postRes.text();
  let cartId = "";
  try { cartId = String(JSON.parse(postBody)?.cart?.id ?? ""); } catch { /* xml */ }

  if (!cartId) {
    return NextResponse.json({ error: "Cart creation failed", status: postRes.status, body: postBody.slice(0, 500) });
  }

  // 2. GET el carrito creado para ver qué tiene
  const getRes = await fetch(
    `${BASE_URL}/api/carts/${cartId}?ws_key=${API_KEY}&output_format=JSON`,
    { headers: { Accept: "application/json" } }
  );
  const getBody = await getRes.text();
  let cartContents: any = {};
  try { cartContents = JSON.parse(getBody); } catch { /* xml */ }

  const recoveryUrl = `${BASE_URL}/index.php?controller=cart&action=show&recover_cart=${cartId}&token_cart=${customer.secureKey}`;

  return NextResponse.json({
    product: { id: product.id, name: product.name, idProductAttribute },
    cartId,
    cartRows: cartContents?.cart?.associations?.cart_rows ?? "NO ROWS",
    secureKeyInCart: cartContents?.cart?.secure_key ?? "MISSING",
    recoveryUrl,
    postStatus: postRes.status,
  });
}
