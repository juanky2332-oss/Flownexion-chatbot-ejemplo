// ─────────────────────────────────────────────────────────────
// Cliente de la API Webservice de Prestashop.
//
// ⚠️ SOLO SERVER-SIDE. Este módulo lee PRESTASHOP_API_KEY de las
// variables de entorno y NUNCA debe importarse desde /components o
// /public. Únicamente lo usan las rutas /app/api/*.ts.
// ─────────────────────────────────────────────────────────────

import "server-only";
import type { Product, StockInfo } from "./types";

const BASE_URL = process.env.PRESTASHOP_BASE_URL ?? "";
const API_KEY = process.env.PRESTASHOP_API_KEY ?? "";

function assertConfig() {
  if (!BASE_URL || !API_KEY) {
    throw new Error(
      "Faltan PRESTASHOP_BASE_URL o PRESTASHOP_API_KEY en las variables de entorno."
    );
  }
}

/** Construye una URL de la API añadiendo la ws_key de forma segura (server-side). */
function buildUrl(resource: string, params: Record<string, string>): string {
  const url = new URL(`${BASE_URL}/api/${resource}`);
  url.searchParams.set("ws_key", API_KEY);
  url.searchParams.set("output_format", "JSON");
  url.searchParams.set("display", "full");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/** El valor de un campo Prestashop puede venir como string o como {language:[{value}]}. */
function plainText(field: unknown): string {
  if (field == null) return "";
  if (typeof field === "string") return field;
  if (typeof field === "number") return String(field);
  if (Array.isArray(field)) {
    const first = field[0] as { value?: string } | undefined;
    return first?.value ?? "";
  }
  if (typeof field === "object") {
    const obj = field as { value?: string; language?: Array<{ value?: string }> };
    if (obj.language && Array.isArray(obj.language)) {
      return obj.language[0]?.value ?? "";
    }
    if (typeof obj.value === "string") return obj.value;
  }
  return "";
}

function buildLinks(id: number) {
  return {
    link: `${BASE_URL}/index.php?controller=product&id_product=${id}`,
    cartLink: `${BASE_URL}/index.php?controller=cart&add=1&id_product=${id}&qty=1`,
  };
}

/** Normaliza un producto crudo de Prestashop a nuestro tipo limpio. */
function normalizeProduct(raw: any): Product {
  const id = Number(raw?.id ?? 0);
  const { link, cartLink } = buildLinks(id);
  const price = Number.parseFloat(raw?.price ?? "0") || 0;
  return {
    id,
    name: plainText(raw?.name) || `Producto ${id}`,
    reference: plainText(raw?.reference),
    price: Math.round(price * 100) / 100,
    description: plainText(raw?.description_short).replace(/<[^>]*>/g, "").trim(),
    link,
    cartLink,
  };
}

/**
 * Busca productos por nombre. Devuelve un array limpio (sin exponer la ws_key).
 */
export async function searchProducts(query: string): Promise<Product[]> {
  assertConfig();
  const safeQuery = query.trim().slice(0, 120);
  if (!safeQuery) return [];

  const url = buildUrl("products", {
    "filter[name]": `[${safeQuery}]%`,
    limit: "10",
  });

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    // No filtramos por nombre devuelto vacío: Prestashop a veces responde 200 sin productos.
    throw new Error(`Prestashop products respondió ${res.status}`);
  }

  const data = await res.json().catch(() => ({}));
  const list = data?.products;
  if (!Array.isArray(list)) return [];

  return list.map(normalizeProduct).filter((p) => p.id > 0);
}

/**
 * Consulta el stock real de un producto. Devuelve { quantity, available }.
 */
export async function getStock(idProduct: number): Promise<StockInfo> {
  assertConfig();
  const url = buildUrl("stock_availables", {
    "filter[id_product]": String(idProduct),
  });

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Prestashop stock_availables respondió ${res.status}`);
  }

  const data = await res.json().catch(() => ({}));
  const list = data?.stock_availables;
  let quantity = 0;
  if (Array.isArray(list) && list.length > 0) {
    quantity = list.reduce(
      (sum: number, s: any) => sum + (Number(s?.quantity) || 0),
      0
    );
  }

  return {
    id_product: idProduct,
    quantity,
    available: quantity > 0,
  };
}
