/**
 * GET /api/debug-cart
 * Muestra la respuesta raw del POST a /api/carts con y sin cliente.
 */
import { NextResponse } from "next/server";
import { psGetCustomer } from "@/lib/prestashop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_EMAIL = "juancarlos@flownexion.com";

export async function GET() {
  const BASE_URL = (process.env.PRESTASHOP_BASE_URL ?? "").replace(/\/api\/?$/, "").replace(/\/$/, "");
  const API_KEY = process.env.PRESTASHOP_API_KEY ?? "";

  if (!BASE_URL || !API_KEY) {
    return NextResponse.json({ error: "Faltan env vars" }, { status: 500 });
  }

  const customer = await psGetCustomer(TEST_EMAIL);
  if (!customer) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // Probar 3 variantes de XML para ver cuál acepta PS
  const variants = [
    {
      label: "sin_cliente",
      xml:
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<prestashop xmlns:xlink="http://www.w3.org/1999/xlink"><cart>` +
        `<id_currency>1</id_currency><id_lang>1</id_lang>` +
        `<associations><cart_rows>` +
        `<cart_row><id_product>1</id_product><id_product_attribute>0</id_product_attribute><quantity>2</quantity></cart_row>` +
        `</cart_rows></associations>` +
        `</cart></prestashop>`,
    },
    {
      label: "con_cliente_sin_secure_key",
      xml:
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<prestashop xmlns:xlink="http://www.w3.org/1999/xlink"><cart>` +
        `<id_currency>1</id_currency><id_lang>1</id_lang>` +
        `<id_customer>${customer.id}</id_customer>` +
        `<associations><cart_rows>` +
        `<cart_row><id_product>1</id_product><id_product_attribute>0</id_product_attribute><quantity>2</quantity></cart_row>` +
        `</cart_rows></associations>` +
        `</cart></prestashop>`,
    },
    {
      label: "con_cliente_y_secure_key",
      xml:
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<prestashop xmlns:xlink="http://www.w3.org/1999/xlink"><cart>` +
        `<id_currency>1</id_currency><id_lang>1</id_lang>` +
        `<id_customer>${customer.id}</id_customer>` +
        `<secure_key>${customer.secureKey}</secure_key>` +
        `<associations><cart_rows>` +
        `<cart_row><id_product>1</id_product><id_product_attribute>0</id_product_attribute><quantity>2</quantity></cart_row>` +
        `</cart_rows></associations>` +
        `</cart></prestashop>`,
    },
  ];

  const results: Record<string, unknown> = {
    customer: { id: customer.id, name: customer.firstName, secureKey: customer.secureKey },
  };

  for (const v of variants) {
    try {
      const res = await fetch(`${BASE_URL}/api/carts?ws_key=${API_KEY}&output_format=JSON`, {
        method: "POST",
        headers: { "Content-Type": "application/xml", Accept: "application/json" },
        body: v.xml,
      });
      const body = await res.text();
      results[v.label] = { status: res.status, body: body.slice(0, 800) };
    } catch (err) {
      results[v.label] = { error: String(err) };
    }
  }

  return NextResponse.json(results);
}
