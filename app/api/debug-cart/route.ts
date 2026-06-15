/**
 * GET /api/debug-cart
 * Busca el cliente de prueba, crea un carrito con su secure_key y devuelve la recovery URL.
 */
import { NextResponse } from "next/server";
import { psGetCustomer, psCreateCart } from "@/lib/prestashop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_EMAIL = "juancarlos@flownexion.com";
const TEST_PRODUCT_ID = 1;

export async function GET() {
  try {
    // 1. Obtener cliente (incluye secure_key)
    const customer = await psGetCustomer(TEST_EMAIL);
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado", email: TEST_EMAIL }, { status: 404 });
    }

    // 2. Crear carrito con su secure_key
    const result = await psCreateCart(
      [{ productId: TEST_PRODUCT_ID, qty: 2 }],
      customer.id,
      customer.secureKey
    );

    return NextResponse.json({
      customer: { id: customer.id, name: `${customer.firstName} ${customer.lastName}`, secureKey: customer.secureKey },
      cart: result,
      recoveryUrlWorks: !!result.cartId && !!customer.secureKey,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
