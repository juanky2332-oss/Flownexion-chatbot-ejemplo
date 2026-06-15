/**
 * GET /api/debug-cart
 * Busca el primer producto real del catálogo, crea carrito y devuelve recovery URL.
 */
import { NextResponse } from "next/server";
import { psGetCustomer, psCreateCart, searchProducts } from "@/lib/prestashop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_EMAIL = "juancarlos@flownexion.com";

export async function GET() {
  try {
    // 1. Cliente
    const customer = await psGetCustomer(TEST_EMAIL);
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    // 2. Buscar un producto real del catálogo
    const products = await searchProducts("rodamiento", customer.groupId);
    const product = products[0];
    if (!product) {
      return NextResponse.json({ error: "No se encontraron productos en el catálogo" }, { status: 404 });
    }

    // 3. Crear carrito con ese producto real, qty=2
    const result = await psCreateCart(
      [{ productId: product.id, qty: 2 }],
      customer.id,
      customer.secureKey
    );

    return NextResponse.json({
      ok: !!result.cartId && !!customer.secureKey,
      product: { id: product.id, name: product.name, ref: product.reference },
      customer: { id: customer.id, name: customer.firstName },
      cartId: result.cartId,
      recoveryUrl: result.cartUrl,
      instruction: "Abre la recoveryUrl estando logueado en b2b.esgas.es",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
