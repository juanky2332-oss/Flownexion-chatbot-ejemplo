import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.HMAC_SECRET ?? "";

export interface IdentityClaims {
  id_customer: number;
  id_group: number;
  email: string;
}

/**
 * Verifica un token firmado emitido por el módulo nexionchat de PrestaShop.
 * Formato: base64(json_payload).hmac_sha256_hex
 * Retorna null si el token es inválido, expirado o HMAC_SECRET no está configurado.
 */
export function verifyIdentityToken(token: string): IdentityClaims | null {
  if (!SECRET || !token) return null;
  try {
    const lastDot = token.lastIndexOf(".");
    if (lastDot <= 0) return null;

    const payloadB64 = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);

    // PHP base64_encode usa base64 estándar (no URL-safe)
    const payloadJson = Buffer.from(payloadB64, "base64").toString("utf8");
    const expected = createHmac("sha256", SECRET).update(payloadJson).digest("hex");

    // HMAC-SHA256 → siempre 64 chars hex; comparación en tiempo constante
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"))) return null;

    const claims = JSON.parse(payloadJson) as {
      id_customer?: unknown;
      id_group?: unknown;
      email?: unknown;
      exp?: unknown;
    };

    if (typeof claims.exp === "number" && Date.now() / 1000 > claims.exp) return null;
    if (!claims.id_customer || !claims.id_group || !claims.email) return null;

    return {
      id_customer: Number(claims.id_customer),
      id_group: Number(claims.id_group),
      email: String(claims.email),
    };
  } catch {
    return null;
  }
}

/** Genera un token firmado. Solo usar server-side (test endpoint). */
export function generateIdentityToken(claims: IdentityClaims, ttlSeconds = 900): string {
  if (!SECRET) throw new Error("HMAC_SECRET no configurado");
  const payload = JSON.stringify({
    id_customer: claims.id_customer,
    id_group: claims.id_group,
    email: claims.email,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  const payloadB64 = Buffer.from(payload).toString("base64");
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payloadB64}.${sig}`;
}
