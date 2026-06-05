// ─────────────────────────────────────────────────────────────
// Endpoint de diagnóstico. GET /api/health
//
// Abre esta URL en el navegador para saber si la conexión con
// PrestaShop y OpenAI funciona. No expone ninguna clave secreta.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rawBase = process.env.PRESTASHOP_BASE_URL ?? null;
  const key = process.env.PRESTASHOP_API_KEY ?? null;

  // Normalizar BASE_URL: eliminar /api al final
  const base = rawBase
    ? rawBase.replace(/\/api\/?$/, "").replace(/\/$/, "")
    : null;

  const env = {
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    PRESTASHOP_BASE_URL: rawBase ?? null,
    PRESTASHOP_API_KEY: Boolean(key),
  };

  // ── Comprobación de Prestashop + muestra de catálogo ──
  let prestashop: {
    tested: boolean;
    ok: boolean;
    status: number | null;
    hint: string;
    total_productos: number | null;
    catalog_sample: Array<{ id: number; reference: string; name: string }> | null;
  } = {
    tested: false,
    ok: false,
    status: null,
    hint: "Faltan PRESTASHOP_BASE_URL o PRESTASHOP_API_KEY en Vercel.",
    total_productos: null,
    catalog_sample: null,
  };

  if (base && key) {
    try {
      // 1. Ping básico con limit=1
      const pingUrl = new URL(`${base}/api/products`);
      pingUrl.searchParams.set("ws_key", key);
      pingUrl.searchParams.set("output_format", "JSON");
      pingUrl.searchParams.set("display", "[id]");
      pingUrl.searchParams.set("limit", "1");

      const pingRes = await fetch(pingUrl.toString(), { cache: "no-store" });
      const status = pingRes.status;
      let hint = "";
      if (status === 200) hint = "✓ OK: ws_key correcta y webservice activo.";
      else if (status === 401) hint = "❌ 401: ws_key incorrecta o sin permiso sobre 'products'.";
      else if (status === 403) hint = "❌ 403: ws_key sin permisos GET sobre 'products'.";
      else if (status === 404) hint = "❌ 404: webservice desactivado o URL incorrecta.";
      else hint = `❌ HTTP ${status}`;

      prestashop.tested = true;
      prestashop.ok = pingRes.ok;
      prestashop.status = status;
      prestashop.hint = hint;

      // 2. Si OK, obtener muestra de 5 productos con id+reference+name
      if (pingRes.ok) {
        try {
          const sampleUrl = new URL(`${base}/api/products`);
          sampleUrl.searchParams.set("ws_key", key);
          sampleUrl.searchParams.set("output_format", "JSON");
          sampleUrl.searchParams.set("display", "[id,reference,name]");
          sampleUrl.searchParams.set("limit", "5");

          const sampleRes = await fetch(sampleUrl.toString(), { cache: "no-store" });
          if (sampleRes.ok) {
            const data = await sampleRes.json().catch(() => ({}));
            const products = data?.products ?? [];

            // Contar total de productos
            const countUrl = new URL(`${base}/api/products`);
            countUrl.searchParams.set("ws_key", key);
            countUrl.searchParams.set("output_format", "JSON");
            countUrl.searchParams.set("display", "[id]");
            const countRes = await fetch(countUrl.toString(), { cache: "no-store" });
            if (countRes.ok) {
              const countData = await countRes.json().catch(() => ({}));
              prestashop.total_productos = Array.isArray(countData?.products)
                ? countData.products.length
                : null;
            }

            const plainText = (field: unknown): string => {
              if (field == null) return "";
              if (typeof field === "string") return field;
              if (Array.isArray(field)) {
                const first = field[0] as { value?: string } | undefined;
                return first?.value ?? "";
              }
              if (typeof field === "object") {
                const obj = field as { language?: Array<{ value?: string }> };
                if (obj.language && Array.isArray(obj.language)) {
                  return obj.language[0]?.value ?? "";
                }
              }
              return String(field);
            };

            prestashop.catalog_sample = products.map((p: any) => ({
              id: Number(p.id),
              reference: plainText(p.reference),
              name: plainText(p.name),
            }));
          }
        } catch {
          // muestra de catálogo opcional — no falla el health
        }
      }
    } catch (e) {
      prestashop = {
        ...prestashop,
        tested: true,
        ok: false,
        status: null,
        hint: `❌ No se pudo conectar: ${e instanceof Error ? e.message : "error de red"}`,
      };
    }
  }

  // ── Comprobación de OpenAI ──
  let openai: { tested: boolean; ok: boolean; status: number | null; hint: string } = {
    tested: false,
    ok: false,
    status: null,
    hint: "Falta OPENAI_API_KEY en Vercel.",
  };

  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        cache: "no-store",
      });
      let hint = "";
      if (res.status === 200) hint = "✓ OK: clave de OpenAI válida.";
      else if (res.status === 401) hint = "❌ 401: clave de OpenAI inválida.";
      else if (res.status === 429) hint = "❌ 429: sin saldo/cuota en OpenAI.";
      else hint = `HTTP ${res.status}.`;
      openai = { tested: true, ok: res.ok, status: res.status, hint };
    } catch (e) {
      openai = {
        tested: true,
        ok: false,
        status: null,
        hint: `❌ No se pudo conectar con OpenAI: ${e instanceof Error ? e.message : "error de red"}`,
      };
    }
  }

  return NextResponse.json(
    { ok: prestashop.ok && openai.ok, env, prestashop, openai },
    { headers: { "Cache-Control": "no-store" } }
  );
}
