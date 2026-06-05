// ─────────────────────────────────────────────────────────────
// Cliente de la API Webservice de Prestashop.
// ⚠️ SOLO SERVER-SIDE.
// ─────────────────────────────────────────────────────────────

import "server-only";
import type { Product, StockInfo } from "./types";

const BASE_URL = (process.env.PRESTASHOP_BASE_URL ?? "")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");
const API_KEY = process.env.PRESTASHOP_API_KEY ?? "";

const DEMO_MODE =
  !API_KEY ||
  process.env.PRESTASHOP_DEMO === "1" ||
  process.env.PRESTASHOP_DEMO === "true";

const STORE_URL = (BASE_URL || "https://b2b.esgas.es").replace(/\/+$/, "");
const CHECKOUT_LINK = `${STORE_URL}/index.php?controller=order`;

function demoLinks(reference: string) {
  const ref = encodeURIComponent(reference);
  const search = `${STORE_URL}/index.php?controller=search&s=${ref}&search_query=${ref}`;
  return { link: search, cartLink: search, checkoutLink: CHECKOUT_LINK };
}

const DEMO_SEED: Array<Omit<Product, "link" | "cartLink" | "checkoutLink"> & { stock: number }> = [
  { id: 1001, name: "SNR 6205LLU", reference: "6205LLU", price: 6.5, description: "Ø 25 mm, sellado goma estanco.", stock: 120 },
  { id: 1002, name: "SNR 6205 ZZ", reference: "6205ZZ", price: 5.8, description: "Ø 25 mm, protección metálica.", stock: 75 },
  { id: 1003, name: "SNR 6205 ZZ C3", reference: "6205ZZCM", price: 6.1, description: "Ø 25 mm, protección metálica, juego C3.", stock: 50 },
  { id: 1004, name: "SNR 6206LLU", reference: "6206LLU", price: 8.2, description: "Ø 30 mm, sellado goma.", stock: 85 },
  { id: 1005, name: "SNR 6305LLU C3", reference: "6305LLU/C3", price: 9.9, description: "Ø 25 mm, goma, juego C3.", stock: 40 },
  { id: 1006, name: "SNR 32008X", reference: "32008X", price: 12.5, description: "Rodillos cónicos, Ø 40 mm.", stock: 30 },
];

const DEMO_CATALOG: Array<Product & { stock: number }> = DEMO_SEED.map((p) => ({
  ...p, ...demoLinks(p.reference),
}));

function stripStock(p: Product & { stock: number }): Product {
  const { stock, ...rest } = p; return rest;
}

function demoSearch(query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return DEMO_CATALOG.slice(0, 5).map(stripStock);
  const norm = (s: string) => s.toLowerCase().replace(/[^0-9a-z]/g, "");
  const qNorm = norm(q);
  const matches = DEMO_CATALOG.filter((p) =>
    p.name.toLowerCase().includes(q) || norm(p.name).includes(qNorm)
  );
  return (matches.length > 0 ? matches : DEMO_CATALOG.slice(0, 3)).map(stripStock);
}

function assertConfig() {
  if (DEMO_MODE) return;
  if (!BASE_URL || !API_KEY) throw new Error("Faltan PRESTASHOP_BASE_URL o PRESTASHOP_API_KEY.");
}

const PS_HEADERS = { Accept: "application/json" };

/**
 * Construye URL de PS WS.
 * filter[*] se añaden con corchetes LITERALES — PHP los necesita literales,
 * URLSearchParams los codificaría como %5B%5D y el filtrado no funcionaría.
 */
function buildUrl(resource: string, opts: {
  display?: string;
  limit?: string;
  filters?: Record<string, string>;
} = {}): string {
  const url = new URL(`${BASE_URL}/api/${resource}`);
  url.searchParams.set("ws_key", API_KEY);
  url.searchParams.set("output_format", "JSON");
  url.searchParams.set("display", opts.display ?? "full");
  if (opts.limit) url.searchParams.set("limit", opts.limit);

  let str = url.toString();
  if (opts.filters) {
    for (const [k, v] of Object.entries(opts.filters)) {
      str += `&${k}=${encodeURIComponent(v)}`;
    }
  }
  return str;
}

function plainText(field: unknown): string {
  if (field == null) return "";
  if (typeof field === "string") return field;
  if (typeof field === "number") return String(field);
  if (Array.isArray(field)) return (field[0] as { value?: string })?.value ?? "";
  if (typeof field === "object") {
    const o = field as { value?: string; language?: Array<{ value?: string }> };
    return o.language?.[0]?.value ?? o.value ?? "";
  }
  return "";
}

function buildLinks(id: number) {
  return {
    link: `${STORE_URL}/index.php?controller=product&id_product=${id}`,
    cartLink: `${STORE_URL}/index.php?controller=cart&add=1&id_product=${id}&qty=1`,
    checkoutLink: CHECKOUT_LINK,
  };
}

function normalizeProduct(raw: any): Product {
  const id = Number(raw?.id ?? 0);
  const price = Number.parseFloat(raw?.price ?? "0") || 0;
  return {
    id,
    name: plainText(raw?.name) || `Producto ${id}`,
    reference: plainText(raw?.name) || plainText(raw?.reference),
    price: Math.round(price * 100) / 100,
    description: plainText(raw?.description_short).replace(/<[^>]*>/g, "").trim(),
    ...buildLinks(id),
  };
}

// ── Caché en memoria de IDs+nombres ──────────────────────────────────────────
// filter[name] NO funciona en este PS (campo multilingüe, no filtrable por WS).
// Solución: traer todos los IDs+nombres sin filtro, filtrar en JS, luego
// pedir detalles por filter[id] (campo directo, sí funciona).
let _nameCache: Array<{ id: number; name: string }> | null = null;
let _nameCacheTs = 0;
const NAME_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getAllNames(): Promise<Array<{ id: number; name: string }>> {
  if (_nameCache && Date.now() - _nameCacheTs < NAME_CACHE_TTL) return _nameCache;

  // Sin limit = todos los productos (5353 en este catálogo)
  const url = buildUrl("products", { display: "[id,name]" });
  try {
    const res = await fetch(url, { headers: PS_HEADERS, cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const list = (data?.products ?? []).map((p: any) => ({
      id: Number(p.id),
      name: plainText(p.name),
    }));
    _nameCache = list;
    _nameCacheTs = Date.now();
    return list;
  } catch {
    return [];
  }
}

/**
 * Busca productos en dos pasos:
 * 1. Carga todos los IDs+nombres (caché 5 min) y filtra en memoria
 * 2. Obtiene detalles completos de los matches usando filter[id]
 */
export async function searchProducts(query: string): Promise<Product[]> {
  if (DEMO_MODE) return demoSearch(query);
  assertConfig();

  const safeQuery = query.trim().slice(0, 120);
  if (!safeQuery) return [];

  const qLow = safeQuery.toLowerCase();
  const qNorm = qLow.replace(/[\s\-\/\.]/g, "");

  // Paso 1: filtrado en memoria
  const allNames = await getAllNames();
  if (allNames.length === 0) return [];

  const matched = allNames.filter((p) => {
    const nl = p.name.toLowerCase();
    const nn = nl.replace(/[\s\-\/\.]/g, "");
    return nl.includes(qLow) || nn.includes(qNorm);
  }).slice(0, 5);

  if (matched.length === 0) return [];

  // Paso 2: detalles completos por filter[id]=[id1|id2|...] — campo directo, funciona
  const ids = matched.map((p) => p.id).join("|");
  const detailUrl = buildUrl("products", {
    display: "full",
    limit: "5",
    filters: { "filter[id]": `[${ids}]` },
  });

  try {
    const res = await fetch(detailUrl, { headers: PS_HEADERS, cache: "no-store" });
    if (!res.ok) {
      return matched.map((p) => ({
        id: p.id, name: p.name, reference: p.name,
        price: 0, description: "", ...buildLinks(p.id),
      }));
    }
    const data = await res.json().catch(() => ({}));
    const products = (data?.products ?? []).map(normalizeProduct).filter((p: Product) => p.id > 0);
    return products.length > 0 ? products : matched.map((p) => ({
      id: p.id, name: p.name, reference: p.name,
      price: 0, description: "", ...buildLinks(p.id),
    }));
  } catch {
    return matched.map((p) => ({
      id: p.id, name: p.name, reference: p.name,
      price: 0, description: "", ...buildLinks(p.id),
    }));
  }
}

export async function getStock(idProduct: number): Promise<StockInfo> {
  if (DEMO_MODE) {
    const found = DEMO_CATALOG.find((p) => p.id === idProduct);
    const quantity = found?.stock ?? 0;
    return { id_product: idProduct, quantity, available: quantity > 0 };
  }
  assertConfig();

  const url = buildUrl("stock_availables", {
    display: "full",
    filters: { "filter[id_product]": String(idProduct) },
  });

  const res = await fetch(url, { headers: PS_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`stock_availables respondió ${res.status}`);

  const data = await res.json().catch(() => ({}));
  const list = data?.stock_availables;
  const quantity = Array.isArray(list)
    ? list.reduce((s: number, x: any) => s + (Number(x?.quantity) || 0), 0)
    : 0;

  return { id_product: idProduct, quantity, available: quantity > 0 };
}
