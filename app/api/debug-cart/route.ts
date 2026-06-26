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

export async function GET(req: NextRequest) {
  const idProduct = Number(req.nextUrl.searchParams.get("id_product") ?? "8854");
  const qty       = Number(req.nextUrl.searchParams.get("qty") ?? "3");

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
