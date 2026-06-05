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

  // Normalizar BASE_URL: eliminar /api al final (igual que en prestashop.ts)
  const base = rawBase
    ? rawBase.replace(/\/api\/?$/, "").replace(/\/$/, "")
    : null;

  const env = {
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    PRESTASHOP_BASE_URL: rawBase ?? null,
    PRESTASHOP_BASE_URL_normalizado: base ?? null,
    PRESTASHOP_API_KEY: Boolean(key),
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? null,
  };

  // ── Comprobación de Prestashop ──
  let prestashop: {
    tested: boolean;
    ok: boolean;
    status: number | null;
    hint: string;
    url_probada: string | null;
  } = {
    tested: false,
    ok: false,
    status: null,
    hint: "Faltan PRESTASHOP_BASE_URL o PRESTASHOP_API_KEY en Vercel.",
    url_probada: null,
  };

  if (base && key) {
    try {
      const url = new URL(`${base}/api/products`);
      url.searchParams.set("ws_key", key);
      url.searchParams.set("output_format", "JSON");
      url.searchParams.set("limit", "1");
      const testUrl = url.toString();
      const res = await fetch(testUrl, { cache: "no-store" });
      const status = res.status;
      let hint = "";
      if (status === 200) hint = "✓ OK: ws_key correcta y webservice activo.";
      else if (status === 401) hint = "❌ 401: ws_key incorrecta o sin permiso sobre 'products'. Revisa la API Key en PrestaShop → Parámetros avanzados → Webservice.";
      else if (status === 403) hint = "❌ 403: ws_key sin permisos. Activa los permisos GET en PrestaShop → Webservice.";
      else if (status === 404) hint = "❌ 404: webservice desactivado o URL incorrecta. Activa el webservice en PrestaShop → Parámetros avanzados → Webservice.";
      else hint = `❌ HTTP ${status}: revisa URL y permisos del webservice.`;
      prestashop = { tested: true, ok: res.ok, status, hint, url_probada: testUrl.replace(key, "***") };
    } catch (e) {
      prestashop = {
        tested: true,
        ok: false,
        status: null,
        hint: `❌ No se pudo conectar: ${e instanceof Error ? e.message : "error de red"}`,
        url_probada: `${base}/api/products?ws_key=***&...`,
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
