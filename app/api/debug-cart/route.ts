/**
 * GET /api/debug-cart
 * Crea un carrito de prueba en PS WS y devuelve la respuesta raw.
 * Solo para depuración — quitar en producción.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const BASE_URL = (process.env.PRESTASHOP_BASE_URL ?? "").replace(/\/api\/?$/, "").replace(/\/$/, "");
  const API_KEY = process.env.PRESTASHOP_API_KEY ?? "";

  if (!BASE_URL || !API_KEY) {
    return NextResponse.json({ error: "Faltan env vars PRESTASHOP_BASE_URL o PRESTASHOP_API_KEY" }, { status: 500 });
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

  const url = `${BASE_URL}/api/carts?ws_key=${API_KEY}&output_format=JSON`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/xml", Accept: "application/json" },
      body: xml,
    });

    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });

    return NextResponse.json({
      status: res.status,
      headers,
      body: body.slice(0, 2000),
      bodyIsJson: body.trimStart().startsWith("{"),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
