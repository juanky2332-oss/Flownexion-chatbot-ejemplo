/**
 * GET /api/debug-cart
 * Crea un carrito de prueba, obtiene su secure_key y devuelve la recovery URL.
 * Solo para depuración — quitar en producción.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const BASE_URL = (process.env.PRESTASHOP_BASE_URL ?? "").replace(/\/api\/?$/, "").replace(/\/$/, "");
  const API_KEY = process.env.PRESTASHOP_API_KEY ?? "";

  if (!BASE_URL || !API_KEY) {
    return NextResponse.json({ error: "Faltan PRESTASHOP_BASE_URL o PRESTASHOP_API_KEY" }, { status: 500 });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">` +
    `<cart>` +
    `<id_currency>1</id_currency>` +
    `<id_lang>1</id_lang>` +
    `<associations><cart_rows>` +
    `<cart_row><id_product>1</id_product><id_product_attribute>0</id_product_attribute><quantity>1</quantity></cart_row>` +
    `</cart_rows></associations>` +
    `</cart>` +
    `</prestashop>`;

  const postUrl = `${BASE_URL}/api/carts?ws_key=${API_KEY}&output_format=JSON`;

  try {
    // 1. Crear carrito
    const postRes = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/xml", Accept: "application/json" },
      body: xml,
    });
    const postBody = await postRes.text();
    const postJson = JSON.parse(postBody);
    const cartId = String(postJson?.cart?.id ?? "");

    if (!cartId) {
      return NextResponse.json({ step: "POST", status: postRes.status, body: postBody.slice(0, 1000) });
    }

    // 2. Obtener secure_key con GET
    const getUrl = `${BASE_URL}/api/carts/${cartId}?ws_key=${API_KEY}&output_format=JSON&display=[id,secure_key]`;
    const getRes = await fetch(getUrl, { headers: { Accept: "application/json" } });
    const getBody = await getRes.text();
    const getJson = JSON.parse(getBody);
    const secureKey = String(getJson?.cart?.secure_key ?? "");

    const recoveryUrl = secureKey
      ? `${BASE_URL}/index.php?controller=order&recover_cart=${cartId}&token_cart=${secureKey}`
      : "(sin secure_key — fallback al carrito)";

    return NextResponse.json({ cartId, secureKey, recoveryUrl, getBody: getBody.slice(0, 500) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
