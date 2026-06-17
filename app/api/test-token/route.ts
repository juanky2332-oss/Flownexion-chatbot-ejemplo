import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Solo disponible cuando HMAC_SECRET + PRESTASHOP_DEMO=1 están configurados
export async function GET() {
  const isDemo =
    !process.env.PRESTASHOP_API_KEY ||
    process.env.PRESTASHOP_DEMO === "1" ||
    process.env.PRESTASHOP_DEMO === "true";

  if (!process.env.HMAC_SECRET || !isDemo) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const { generateIdentityToken } = await import("@/lib/hmac");
  const token = generateIdentityToken({
    id_customer: 9999,
    id_group: 3,
    email: "test@esgas.es",
  });
  return NextResponse.json({ token });
}
