/**
 * GET /api/debug-cart
 * Prueba end-to-end: busca cliente, crea carrito con secure_key, devuelve recovery URL.
 */
import { NextResponse } from "next/server";
import { psGetCustomer, psCreateCart } from "@/lib/prestashop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_EMAIL = "juancarlos@flownexion.com";

export async function GET() {
  try {
    const customer = await psGetCustomer(TEST_EMAIL);
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    // Usar id_product=1 con qty=3 como prueba
    const result = await psCreateCart(
      [{ productId: 1, qty: 3 }],
      customer.id,
      customer.secureKey
    );

    return NextResponse.json({
      ok: !!result.cartId && !!customer.secureKey,
      customer: { id: customer.id, name: customer.firstName, secureKey: customer.secureKey },
      cartId: result.cartId,
      recoveryUrl: result.cartUrl,
      fallbackUrls: result.itemAddUrls,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
