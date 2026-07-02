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

/**
 * Construye URL de PS WS con corchetes LITERALES en los filtros.
 * URLSearchParams codifica [ y ] como %5B y %5D, lo que rompe los filtros
 * de la WS de PrestaShop (PHP necesita los corchetes literales).
 */
function buildPsUrl(
  base: string,
  key: string,
  resource: string,
  params: Record<string, string>
): string {
  const url = new URL(`${base}/api/${resource}`);
  url.searchParams.set("ws_key", key);
  url.searchParams.set("output_format", "JSON");

  let urlStr = url.toString();
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith("filter[")) {
      // Corchetes literales para PHP
      urlStr += `&${k}=${encodeURIComponent(v)}`;
    } else {
      url.searchParams.set(k, v);
      // Reconstruir — necesario porque URLSearchParams ya fue serializado
      const rebuilt = new URL(`${base}/api/${resource}`);
      rebuilt.searchParams.set("ws_key", key);
      rebuilt.searchParams.set("output_format", "JSON");
      for (const [k2, v2] of Object.entries(params)) {
        if (!k2.startsWith("filter[")) rebuilt.searchParams.set(k2, v2);
      }
      urlStr = rebuilt.toString();
      // Re-añadir filtros
      for (const [k2, v2] of Object.entries(params)) {
        if (k2.startsWith("filter[")) urlStr += `&${k2}=${encodeURIComponent(v2)}`;
      }
      break;
    }
  }
  return urlStr;
}

async function psGet(base: string, key: string, resource: string, params: Record<string, string>) {
  const url = buildPsUrl(base, key, resource, params);
  const res = await fetch(url, { cache: "no-store" });
  const data = res.ok ? await res.json().catch(() => ({})) : {};
  return { ok: res.ok, status: res.status, data, url: url.replace(key, "***") };
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
    const ping = await psGet(base, key, "products", { display: "[id]", limit: "1" });
    prestashop = {
      tested: true, ok: ping.ok, status: ping.status,
      hint: ping.status === 200 ? "✓ OK: ws_key correcta."
        : ping.status === 401 ? "❌ 401: ws_key incorrecta."
        : ping.status === 404 ? "❌ 404: webservice desactivado."
        : `❌ HTTP ${ping.status}`,
    };

    if (ping.ok) {
      const sample = await psGet(base, key, "products", { display: "[id,reference,name]", limit: "5" });
      prestashop.catalog_sample = (sample.data?.products ?? []).map((p: any) => ({
        id: Number(p.id), reference: plainText(p.reference), name: plainText(p.name),
      }));

      const all = await psGet(base, key, "products", { display: "[id]" });
      prestashop.total_productos = Array.isArray(all.data?.products) ? all.data.products.length : null;

      // Test A: filter[name] con producto CONOCIDO
      const testA = await psGet(base, key, "products", {
        display: "[id,name]", "filter[name]": "%SNR 6000%", limit: "3",
      });
      const resA = testA.data?.products ?? [];
      prestashop.testA_filter_nombre_conocido = {
        url_usada: testA.url,
        total: Array.isArray(resA) ? resA.length : 0,
        resultados: (Array.isArray(resA) ? resA : []).slice(0, 3).map((p: any) => ({
          id: Number(p.id), name: plainText(p.name),
        })),
        conclusion: Array.isArray(resA) && resA.length > 0
          ? "✓ filter[name] FUNCIONA AHORA"
          : "❌ filter[name] sigue sin funcionar",
      };

      // Test B: filter[name]=%6205%
      const testB = await psGet(base, key, "products", {
        display: "[id,name,price]", "filter[name]": "%6205%", limit: "5",
      });
      const resB = testB.data?.products ?? [];
      prestashop.testB_busqueda_6205 = {
        total: Array.isArray(resB) ? resB.length : 0,
        resultados: (Array.isArray(resB) ? resB : []).slice(0, 5).map((p: any) => ({
          id: Number(p.id), name: plainText(p.name), price: p.price,
        })),
        conclusion: Array.isArray(resB) && resB.length > 0
          ? "✓ Hay productos 6205 en el catálogo"
          : "❌ No hay productos 6205 O filter[name] aún no funciona",
      };

      // Test C: specific_prices del primer producto 6205 encontrado — para
      // saber si el ws_key tiene permiso de lectura sobre este recurso y si
      // hay filas de descuento manual asociadas al producto.
      const firstId = Array.isArray(resB) && resB[0] ? Number(resB[0].id) : null;
      if (firstId) {
        const testC = await psGet(base, key, "specific_prices", {
          display: "full", "filter[id_product]": `[${firstId}]`,
        });
        prestashop.testC_specific_prices = {
          id_product_probado: firstId,
          status: testC.status,
          ok: testC.ok,
          filas: testC.data?.specific_prices ?? testC.data,
          conclusion: !testC.ok
            ? `❌ HTTP ${testC.status}: el ws_key probablemente NO tiene permiso de lectura sobre "specific_prices" (revisar en Parámetros avanzados → Webservice → esta clave → permisos)`
            : (Array.isArray(testC.data?.specific_prices) && testC.data.specific_prices.length > 0)
              ? "✓ Hay filas de specific_prices para este producto"
              : "⚠️ 0 filas — el descuento de este producto NO es un specific_price manual, es probablemente una regla de precios de catálogo (Descuentos de tienda)",
        };
      }

      // Test D: specific_price_rules (reglas de "Descuentos de tienda") —
      // solo para ver si el ws_key tiene acceso a este recurso y cuántas
      // reglas activas hay, sin intentar evaluar condiciones todavía.
      const testD = await psGet(base, key, "specific_price_rules", { display: "full" });
      const rulesRaw = testD.data?.specific_price_rules;
      prestashop.testD_specific_price_rules = {
        status: testD.status,
        ok: testD.ok,
        total_reglas: Array.isArray(rulesRaw) ? rulesRaw.length : rulesRaw ? 1 : 0,
        muestra: Array.isArray(rulesRaw) ? rulesRaw.slice(0, 3) : rulesRaw,
        conclusion: !testD.ok
          ? `❌ HTTP ${testD.status}: el ws_key NO tiene permiso de lectura sobre "specific_price_rules"`
          : "✓ acceso OK — revisar 'muestra' para ver la forma real de las reglas y sus condiciones",
      };
    }
  }

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
