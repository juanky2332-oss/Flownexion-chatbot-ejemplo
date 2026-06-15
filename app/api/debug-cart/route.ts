/**
 * GET /api/debug-cart?q=6205+ZZ+C3
 * Busca un producto real, muestra idProductAttribute, crea carrito y devuelve recovery URL.
 */
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { psGetCustomer, psCreateCart, searchProducts } from "@/lib/prestashop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_EMAIL = "juancarlos@flownexion.com";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "rodamiento";
  try {
    const customer = await psGetCustomer(TEST_EMAIL);
    if (!customer) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

    const products = await searchProducts(q, customer.groupId);
    const product = products[0];
    if (!product) return NextResponse.json({ error: `No hay productos para: ${q}` }, { status: 404 });

    const result = await psCreateCart(
      [{ productId: product.id, qty: 3, idProductAttribute: product.idProductAttribute ?? 0 }],
      customer.id,
      customer.secureKey
    );

    return NextResponse.json({
      ok: !!result.cartId,
      product: {
        id: product.id,
        name: product.name,
        ref: product.reference,
        idProductAttribute: product.idProductAttribute ?? 0,
        price: product.price,
      },
      cartId: result.cartId,
      recoveryUrl: result.cartUrl,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
