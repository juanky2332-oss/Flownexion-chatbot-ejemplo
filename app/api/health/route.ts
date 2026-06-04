// ─────────────────────────────────────────────────────────────
// Endpoint de diagnóstico. GET /api/health
//
// Sirve para comprobar la configuración SIN exponer ninguna clave:
//  - Qué variables de entorno están presentes (solo true/false).
//  - Si la API de Prestashop responde con la URL + ws_key actuales
//    (devuelve solo el código HTTP, nunca la clave).
//  - Si la clave de OpenAI es válida (solo true/false).
//
// Útil para localizar por qué el chat no responde. Se puede borrar
// cuando todo funcione.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const env = {
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    PRESTASHOP_BASE_URL: process.env.PRESTASHOP_BASE_URL || null,
    PRESTASHOP_API_KEY: Boolean(process.env.PRESTASHOP_API_KEY),
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || null,
  };

  // ── Comprobación de Prestashop ──
  let prestashop: {
    tested: boolean;
    ok: boolean;
    status: number | null;
    hint: string;
  } = { tested: false, ok: false, status: null, hint: "Faltan PRESTASHOP_BASE_URL o PRESTASHOP_API_KEY." };

  const base = process.env.PRESTASHOP_BASE_URL;
  const key = process.env.PRESTASHOP_API_KEY;
  if (base && key) {
    try {
      const url = new URL(`${base.replace(/\/+$/, "")}/api/products`);
      url.searchParams.set("ws_key", key);
      url.searchParams.set("output_format", "JSON");
      url.searchParams.set("limit", "1");
      const res = await fetch(url.toString(), { cache: "no-store" });
      const status = res.status;
      let hint = "";
      if (status === 200) hint = "OK: la ws_key funciona y el webservice está activo.";
      else if (status === 401) hint = "401: ws_key incorrecta o sin permiso sobre 'products'.";
      else if (status === 404) hint = "404: webservice desactivado o URL incorrecta.";
      else hint = `HTTP ${status}: revisa URL/permisos del webservice.`;
      prestashop = { tested: true, ok: res.ok, status, hint };
    } catch (e) {
      prestashop = {
        tested: true,
        ok: false,
        status: null,
        hint: `No se pudo conectar: ${e instanceof Error ? e.message : "error de red"}`,
      };
    }
  }

  // ── Comprobación de OpenAI ──
  let openai: { tested: boolean; ok: boolean; status: number | null; hint: string } = {
    tested: false,
    ok: false,
    status: null,
    hint: "Falta OPENAI_API_KEY.",
  };

  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        cache: "no-store",
      });
      let hint = "";
      if (res.status === 200) hint = "OK: la clave de OpenAI es válida.";
      else if (res.status === 401) hint = "401: clave de OpenAI inválida.";
      else if (res.status === 429) hint = "429: sin saldo/cuota en OpenAI.";
      else hint = `HTTP ${res.status}.`;
      openai = { tested: true, ok: res.ok, status: res.status, hint };
    } catch (e) {
      openai = {
        tested: true,
        ok: false,
        status: null,
        hint: `No se pudo conectar con OpenAI: ${e instanceof Error ? e.message : "error de red"}`,
      };
    }
  }

  return NextResponse.json({ ok: prestashop.ok && openai.ok, env, prestashop, openai });
}
