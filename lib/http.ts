// ─────────────────────────────────────────────────────────────
// Utilidades HTTP compartidas por las API routes:
//  - CORS basado en ALLOWED_ORIGINS
//  - Rate limiting en memoria (30 req/min por IP)
//  - Auth interna server→server (INTERNAL_API_SECRET)
//
// ⚠️ SOLO SERVER-SIDE.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { NextRequest } from "next/server";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/** Devuelve las cabeceras CORS apropiadas para el origen de la request. */
export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow =
    ALLOWED_ORIGINS.includes(origin) && origin
      ? origin
      : ALLOWED_ORIGINS[0] ?? "";

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

/** Responde a las preflight OPTIONS. */
export function preflight(req: NextRequest): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

// ───── Rate limiting en memoria (por instancia) ─────
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const hits = new Map<string, number[]>();

/** Extrae la IP del cliente a partir de las cabeceras de Vercel. */
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Devuelve true si la IP ha superado el límite de 30 req/min. */
export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  hits.set(ip, timestamps);

  // Limpieza ocasional para no crecer sin límite.
  if (hits.size > 5000) {
    for (const [key, ts] of hits) {
      if (ts.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }

  return timestamps.length > MAX_REQUESTS;
}

/** Comprueba el Bearer interno para las llamadas server→server. */
export function hasInternalAuth(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}
