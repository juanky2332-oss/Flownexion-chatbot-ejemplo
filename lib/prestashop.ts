// ─────────────────────────────────────────────────────────────
// Cliente de la API Webservice de Prestashop.
//
// ⚠️ SOLO SERVER-SIDE. Este módulo lee PRESTASHOP_API_KEY de las
// variables de entorno y NUNCA debe importarse desde /components o
// /public. Únicamente lo usan las rutas /app/api/*.ts.
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
  { id: 1001, name: "SNR 6205LLU", reference: "6205LLU", price: 6.5, description: "Rodamiento rígido de bolas, Ø interior 25 mm, sellado de goma estanco.", stock: 120 },
  { id: 1002, name: "SNR 6205 ZZ", reference: "6205ZZ", price: 5.8, description: "Rodamiento rígido de bolas, Ø interior 25 mm, protección metálica.", stock: 75 },
  { id: 1003, name: "SNR 6205 ZZ C3", reference: "6205ZZCM", price: 6.1, description: "Rodamiento rígido de bolas, Ø interior 25 mm, protección metálica, juego C3.", stock: 50 },
  { id: 1004, name: "SNR 6206LLU", reference: "6206LLU", price: 8.2, description: "Rodamiento rígido de bolas, Ø interior 30 mm, sellado de goma.", stock: 85 },
  { id: 1005, name: "SNR 6305LLU C3", reference: "6305LLU/C3", price: 9.9, description: "Serie 63, Ø 25 mm, sellado de goma, juego C3.", stock: 40 },
  { id: 1006, name: "SNR 32008X", reference: "32008X", price: 12.5, description: "Rodillos cónicos, Ø interior 40 mm.", stock: 30 },
];

const DEMO_CATALOG: Array<Product & { stock: number }> = DEMO_SEED.map((p) => ({
  ...p,
  ...demoLinks(p.reference),
}));

function stripStock(p: Product & { stock: number }): Product {
  const { stock, ...rest } = p;
  return rest;
}

function demoSearch(query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return DEMO_CATALOG.slice(0, 5).map(stripStock);
  const norm = (s: string) => s.toLowerCase().replace(/[^0-9a-z]/g, "");
  const qNorm = norm(q);
  const matches = DEMO_CATALOG.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      norm(p.name).includes(qNorm) ||
      p.reference.toLowerCase().includes(q)
  );
  return (matches.length > 0 ? matches : DEMO_CATALOG.slice(0, 3)).map(stripStock);
}

function assertConfig() {
  if (DEMO_MODE) return;
  if (!BASE_URL || !API_KEY) {
    throw new Error("Faltan PRESTASHOP_BASE_URL o PRESTASHOP_API_KEY.");
  }
}

/**
 * Construye una URL de la API de Prestashop.
 *
 * IMPORTANTE: los parámetros filter[*] DEBEN tener los corchetes LITERALES
 * en la URL para que PHP los interprete como arrays. URLSearchParams codifica
 * los corchetes como %5B y %5D, lo que rompe los filtros de PS WS.
 * Por eso los filtros se añaden manualmente al string de la URL.
 */
function buildUrl(
  resource: string,
  opts: {
    display?: string;
    limit?: string;
    sort?: string;
    filters?: Record<string, string>; // filter[name], filter[id], etc.
  } = {}
): string {
  // Parámetros seguros (sin corchetes) vía URLSearchParams
  const base = new URL(`${BASE_URL}/api/${resource}`);
  base.searchParams.set("ws_key", API_KEY);
  base.searchParams.set("output_format", "JSON");
  base.searchParams.set("display", opts.display ?? "full");
  if (opts.limit) base.searchParams.set("limit", opts.limit);
  if (opts.sort) base.searchParams.set("sort", opts.sort);

  let url = base.toString();

  // Filtros: añadidos con corchetes LITERALES (PHP los parsea como arrays)
  if (opts.filters) {
    for (const [key, value] of Object.entries(opts.filters)) {
      url += `&${key}=${encodeURIComponent(value)}`;
    }
  }

  return url;
}

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
    link: `${STORE_URL}/index.php?controller=product&id_product=${id}`,
    cartLink: `${STORE_URL}/index.php?controller=cart&add=1&id_product=${id}&qty=1`,
    checkoutLink: CHECKOUT_LINK,
  };
}

function normalizeProduct(raw: any): Product {
  const id = Number(raw?.id ?? 0);
  const { link, cartLink, checkoutLink } = buildLinks(id);
  const price = Number.parseFloat(raw?.price ?? "0") || 0;
  return {
    id,
    name: plainText(raw?.name) || `Producto ${id}`,
    reference: plainText(raw?.name) || plainText(raw?.reference),
    price: Math.round(price * 100) / 100,
    description: plainText(raw?.description_short).replace(/<[^>]*>/g, "").trim(),
    link,
    cartLink,
    checkoutLink,
  };
}

/**
 * Busca productos por nombre en cascada.
 * Los filtros usan corchetes literales para que PS WS los interprete correctamente.
 */
export async function searchProducts(query: string): Promise<Product[]> {
  if (DEMO_MODE) return demoSearch(query);
  assertConfig();
  const safeQuery = query.trim().slice(0, 120);
  if (!safeQuery) return [];

  const normQuery = safeQuery.replace(/[\s\-\/\.]/g, "");
  const baseNum = safeQuery.match(/^(\d+)/)?.[1] ?? "";

  const strategies: Array<Record<string, string>> = [
    { "filter[name]": `%${safeQuery}%` },
  ];
  if (normQuery !== safeQuery) {
    strategies.push({ "filter[name]": `%${normQuery}%` });
  }
  if (baseNum && baseNum !== safeQuery && baseNum !== normQuery) {
    strategies.push({ "filter[name]": `%${baseNum}%` });
  }

  for (const filters of strategies) {
    try {
      const url = buildUrl("products", { display: "full", limit: "10", filters });
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      const list = data?.products;
      if (Array.isArray(list) && list.length > 0) {
        return list.map(normalizeProduct).filter((p) => p.id > 0);
      }
    } catch {
      continue;
    }
  }

  return [];
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

  return { id_product: idProduct, quantity, available: quantity > 0 };
}
