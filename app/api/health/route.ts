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

async function psGet(base: string, key: string, path: string, params: Record<string, string>) {
  const url = new URL(`${base}/api/${path}`);
  url.searchParams.set("ws_key", key);
  url.searchParams.set("output_format", "JSON");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = res.ok ? await res.json().catch(() => ({})) : {};
  return { ok: res.ok, status: res.status, data, url: url.toString().replace(key, "***") };
}

export async function GET() {
  const rawBase = process.env.PRESTASHOP_BASE_URL ?? null;
  const key = process.env.PRESTASHOP_API_KEY ?? null;
  const base = rawBase ? rawBase.replace(/\/api\/?$/, "").replace(/\/$/, "") : null;

  const env = {
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    PRESTASHOP_BASE_URL: rawBase,
    PRESTASHOP_API_KEY: Boolean(key),
  };

  let prestashop: any = { tested: false, ok: false, hint: "Faltan variables en Vercel." };

  if (base && key) {
    // ── Ping ──
    const ping = await psGet(base, key, "products", { display: "[id]", limit: "1" });
    prestashop = {
      tested: true, ok: ping.ok, status: ping.status,
      hint: ping.status === 200 ? "✓ OK: ws_key correcta."
        : ping.status === 401 ? "❌ 401: ws_key incorrecta."
        : ping.status === 404 ? "❌ 404: webservice desactivado."
        : `❌ HTTP ${ping.status}`,
    };

    if (ping.ok) {
      // ── Muestra catálogo ──
      const sample = await psGet(base, key, "products", { display: "[id,reference,name]", limit: "5" });
      prestashop.catalog_sample = (sample.data?.products ?? []).map((p: any) => ({
        id: Number(p.id), reference: plainText(p.reference), name: plainText(p.name),
      }));

      const all = await psGet(base, key, "products", { display: "[id]" });
      prestashop.total_productos = Array.isArray(all.data?.products) ? all.data.products.length : null;

      // ── TEST A: filter[name]=%SNR 6000% (producto CONOCIDO) ──
      const testA = await psGet(base, key, "products", {
        display: "[id,name]", "filter[name]": "%SNR 6000%", limit: "3",
      });
      const resA = testA.data?.products ?? [];
      prestashop.testA_filter_nombre_conocido = {
        query: "filter[name]=%SNR 6000%",
        total: Array.isArray(resA) ? resA.length : 0,
        resultados: (Array.isArray(resA) ? resA : []).slice(0, 3).map((p: any) => ({
          id: Number(p.id), name: plainText(p.name),
        })),
        conclusion: Array.isArray(resA) && resA.length > 0
          ? "✓ filter[name] FUNCIONA"
          : "❌ filter[name] NO funciona en esta instalación PS",
      };

      // ── TEST B: filter[name]=%6205% ──
      const testB = await psGet(base, key, "products", {
        display: "[id,name,price]", "filter[name]": "%6205%", limit: "5",
      });
      const resB = testB.data?.products ?? [];
      prestashop.testB_busqueda_6205 = {
        query: "filter[name]=%6205%",
        total: Array.isArray(resB) ? resB.length : 0,
        resultados: (Array.isArray(resB) ? resB : []).slice(0, 5).map((p: any) => ({
          id: Number(p.id), name: plainText(p.name), price: p.price,
        })),
        conclusion: Array.isArray(resB) && resB.length > 0
          ? "✓ Hay productos 6205 en el catálogo"
          : "❌ No hay productos 6205 O filter[name] no funciona",
      };

      // ── TEST C: PS Search API ──
      try {
        const searchUrl = new URL(`${base}/api/search`);
        searchUrl.searchParams.set("ws_key", key);
        searchUrl.searchParams.set("output_format", "JSON");
        searchUrl.searchParams.set("language", "1");
        searchUrl.searchParams.set("q", "6205");
        searchUrl.searchParams.set("limit", "5");
        const searchRes = await fetch(searchUrl.toString(), { cache: "no-store" });
        const searchData = searchRes.ok ? await searchRes.json().catch(() => ({})) : {};
        prestashop.testC_ps_search_api = {
          status: searchRes.status,
          total: Array.isArray(searchData?.products) ? searchData.products.length : 0,
          resultados: (searchData?.products ?? []).slice(0, 5),
          conclusion: searchRes.ok && Array.isArray(searchData?.products) && searchData.products.length > 0
            ? "✓ PS Search API funciona y devuelve 6205"
            : searchRes.ok ? "PS Search API disponible pero 0 resultados"
            : `PS Search API no disponible (${searchRes.status})`,
        };
      } catch (e) {
        prestashop.testC_ps_search_api = { error: String(e) };
      }
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
        tested: true, ok: res.ok, status: res.status,
        hint: res.status === 200 ? "✓ OK" : res.status === 401 ? "❌ clave inválida" : `HTTP ${res.status}`,
      };
    } catch (e) {
      openai = { tested: true, ok: false, hint: `❌ ${e}` };
    }
  }

  return NextResponse.json(
    { ok: prestashop.ok && openai.ok, env, prestashop, openai },
    { headers: { "Cache-Control": "no-store" } }
  );
}
