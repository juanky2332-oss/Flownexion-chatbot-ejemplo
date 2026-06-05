// ─────────────────────────────────────────────────────────────
// Endpoint de diagnóstico. GET /api/health
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const plainText = (field: unknown): string => {
  if (field == null) return "";
  if (typeof field === "string") return field;
  if (typeof field === "number") return String(field);
  if (Array.isArray(field)) return (field[0] as any)?.value ?? "";
  if (typeof field === "object") {
    const o = field as any;
    return o?.language?.[0]?.value ?? o?.value ?? "";
  }
  return "";
};

export async function GET() {
  const rawBase = process.env.PRESTASHOP_BASE_URL ?? null;
  const key = process.env.PRESTASHOP_API_KEY ?? null;
  const base = rawBase ? rawBase.replace(/\/api\/?$/, "").replace(/\/$/, "") : null;

  const env = {
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    PRESTASHOP_BASE_URL: rawBase,
    PRESTASHOP_API_KEY: Boolean(key),
  };

  // ── Ping a PrestaShop ──
  let prestashop: any = { tested: false, ok: false, status: null, hint: "Faltan variables en Vercel." };

  if (base && key) {
    try {
      const pingUrl = new URL(`${base}/api/products`);
      pingUrl.searchParams.set("ws_key", key);
      pingUrl.searchParams.set("output_format", "JSON");
      pingUrl.searchParams.set("display", "[id]");
      pingUrl.searchParams.set("limit", "1");
      const res = await fetch(pingUrl.toString(), { cache: "no-store" });
      const status = res.status;
      prestashop = {
        tested: true,
        ok: res.ok,
        status,
        hint: status === 200 ? "✓ OK: ws_key correcta y webservice activo."
          : status === 401 ? "❌ 401: ws_key incorrecta o sin permiso."
          : status === 404 ? "❌ 404: webservice desactivado o URL incorrecta."
          : `❌ HTTP ${status}`,
      };

      // ── Muestra del catálogo (primeros 5 productos) ──
      if (res.ok) {
        const sampleUrl = new URL(`${base}/api/products`);
        sampleUrl.searchParams.set("ws_key", key);
        sampleUrl.searchParams.set("output_format", "JSON");
        sampleUrl.searchParams.set("display", "[id,reference,name]");
        sampleUrl.searchParams.set("limit", "5");
        const sampleRes = await fetch(sampleUrl.toString(), { cache: "no-store" });
        if (sampleRes.ok) {
          const d = await sampleRes.json().catch(() => ({}));
          prestashop.catalog_sample = (d?.products ?? []).map((p: any) => ({
            id: Number(p.id),
            reference: plainText(p.reference),
            name: plainText(p.name),
          }));

          // Total de productos
          const allUrl = new URL(`${base}/api/products`);
          allUrl.searchParams.set("ws_key", key);
          allUrl.searchParams.set("output_format", "JSON");
          allUrl.searchParams.set("display", "[id]");
          const allRes = await fetch(allUrl.toString(), { cache: "no-store" });
          if (allRes.ok) {
            const allD = await allRes.json().catch(() => ({}));
            prestashop.total_productos = Array.isArray(allD?.products) ? allD.products.length : null;
          }
        }

        // ── Test de búsqueda real: filter[name]=%6205% ──
        try {
          const searchUrl = new URL(`${base}/api/products`);
          searchUrl.searchParams.set("ws_key", key);
          searchUrl.searchParams.set("output_format", "JSON");
          searchUrl.searchParams.set("display", "[id,reference,name,price]");
          searchUrl.searchParams.set("filter[name]", "%6205%");
          searchUrl.searchParams.set("limit", "5");
          const searchRes = await fetch(searchUrl.toString(), { cache: "no-store" });
          if (searchRes.ok) {
            const sd = await searchRes.json().catch(() => ({}));
            const results = sd?.products ?? [];
            prestashop.test_busqueda_6205 = {
              url_usada: searchUrl.toString().replace(key, "***"),
              total_encontrados: Array.isArray(results) ? results.length : 0,
              resultados: (Array.isArray(results) ? results : []).slice(0, 5).map((p: any) => ({
                id: Number(p.id),
                reference: plainText(p.reference),
                name: plainText(p.name),
                price: p.price,
              })),
              conclusion: Array.isArray(results) && results.length > 0
                ? "✓ filter[name] FUNCIONA y hay productos 6205 en el catálogo"
                : "❌ No encontró nada — filter[name] no funciona O no hay productos 6205",
            };
          }
        } catch (e) {
          prestashop.test_busqueda_6205 = { error: String(e) };
        }
      }
    } catch (e) {
      prestashop = { tested: true, ok: false, hint: `❌ ${e instanceof Error ? e.message : "error de red"}` };
    }
  }

  // ── OpenAI ──
  let openai: any = { tested: false, ok: false, hint: "Falta OPENAI_API_KEY." };
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        cache: "no-store",
      });
      openai = {
        tested: true,
        ok: res.ok,
        status: res.status,
        hint: res.status === 200 ? "✓ OK: clave de OpenAI válida."
          : res.status === 401 ? "❌ 401: clave de OpenAI inválida."
          : `HTTP ${res.status}`,
      };
    } catch (e) {
      openai = { tested: true, ok: false, hint: `❌ ${e instanceof Error ? e.message : "error"}` };
    }
  }

  return NextResponse.json(
    { ok: prestashop.ok && openai.ok, env, prestashop, openai },
    { headers: { "Cache-Control": "no-store" } }
  );
}
