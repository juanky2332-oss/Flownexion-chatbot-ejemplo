/**
 * GET /api/debug-cart?id_product=8854&qty=3
 * Usa psCreateCart (con búsqueda automática de dirección) y devuelve la URL de recuperación.
 */
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { psGetCustomer, psCreateCart } from "@/lib/prestashop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_EMAIL = "juancarlos@flownexion.com";

const BASE_URL = (process.env.PRESTASHOP_BASE_URL ?? "").replace(/\/$/, "");
const API_KEY = process.env.PRESTASHOP_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const idProduct = Number(req.nextUrl.searchParams.get("id_product") ?? "8854");
  const qty       = Number(req.nextUrl.searchParams.get("qty") ?? "3");
  const inspect   = req.nextUrl.searchParams.get("inspect");

  // Modo inspección: leer un carrito ya creado directamente de la WS API
  if (inspect) {
    const url = `${BASE_URL}/api/carts/${inspect}?ws_key=${API_KEY}&output_format=JSON`;
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.text();
    return NextResponse.json({ status: res.status, body: body.slice(0, 3000) });
  }

  // Buscar cliente de prueba
  const customer = await psGetCustomer(TEST_EMAIL);
  if (!customer) {
    return NextResponse.json({ error: "Cliente no encontrado: " + TEST_EMAIL }, { status: 404 });
  }

  // Crear carrito con producto (ahora busca dirección válida automáticamente)
  const result = await psCreateCart(
    [{ productId: idProduct, qty, idProductAttribute: 0 }],
    customer.id,
    customer.secureKey
  );

  return NextResponse.json({
    ok: !!result.cartId,
    cartId: result.cartId,
    cartUrl: result.cartUrl,
    customer: { id: customer.id, email: TEST_EMAIL },
    instrucciones: result.cartId
      ? "Abre cartUrl en el navegador para ver si el artículo aparece en el carrito"
      : "No se pudo crear el carrito — revisa los logs de Vercel",
  });
}
