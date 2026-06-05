// ─────────────────────────────────────────────────────────────
// Cliente de la API Webservice de Prestashop.
//
// ⚠️ SOLO SERVER-SIDE. Este módulo lee PRESTASHOP_API_KEY de las
// variables de entorno y NUNCA debe importarse desde /components o
// /public. Únicamente lo usan las rutas /app/api/*.ts.
// ─────────────────────────────────────────────────────────────

import "server-only";
import type { Product, StockInfo } from "./types";

// Normalizar BASE_URL: acepta con o sin /api al final.
// "https://b2b.esgas.es"     → "https://b2b.esgas.es"
// "https://b2b.esgas.es/api" → "https://b2b.esgas.es"  ✓
const BASE_URL = (process.env.PRESTASHOP_BASE_URL ?? "")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");
const API_KEY = process.env.PRESTASHOP_API_KEY ?? "";

// Modo demo: si no hay ws_key configurada, o se fuerza con PRESTASHOP_DEMO,
// el chatbot funciona con un catálogo de ejemplo (sin tienda real).
const DEMO_MODE =
  !API_KEY ||
  process.env.PRESTASHOP_DEMO === "1" ||
  process.env.PRESTASHOP_DEMO === "true";

const STORE_URL = (BASE_URL || "https://b2b.esgas.es").replace(/\/+$/, "");

/** URL del checkout / pago de la tienda (común a todos los productos). */
const CHECKOUT_LINK = `${STORE_URL}/index.php?controller=order`;

function demoLinks(reference: string) {
  const ref = encodeURIComponent(reference);
  const search = `${STORE_URL}/index.php?controller=search&s=${ref}&search_query=${ref}`;
  return { link: search, cartLink: search, checkoutLink: CHECKOUT_LINK };
}

// ───── Catálogo de demostración (rodamientos NTN/SNR habituales) ─────
const DEMO_SEED: Array<Omit<Product, "link" | "cartLink" | "checkoutLink"> & { stock: number }> = [
  { id: 1001, name: "Rodamiento NTN 6205LLU", reference: "6205LLU", price: 6.5, description: "Rodamiento rígido de bolas, Ø interior 25 mm, sellado de goma estanco (LLU = 2RS).", stock: 120 },
  { id: 1002, name: "Rodamiento NTN 6206LLU", reference: "6206LLU", price: 8.2, description: "Rodamiento rígido de bolas, Ø interior 30 mm, sellado de goma estanco.", stock: 85 },
  { id: 1003, name: "Rodamiento NTN 6203LLU", reference: "6203LLU", price: 4.2, description: "Rodamiento rígido de bolas, Ø interior 17 mm, sellado de goma estanco.", stock: 150 },
  { id: 1004, name: "Rodamiento NTN 6004LLB", reference: "6004LLB", price: 4.8, description: "Rodamiento rígido de bolas, Ø interior 20 mm, sellado de goma de bajo rozamiento (LLB).", stock: 200 },
  { id: 1005, name: "Rodamiento NTN 6305LLU C3", reference: "6305LLU/C3", price: 9.9, description: "Rodamiento rígido de bolas serie 63, Ø interior 25 mm, sellado de goma, juego radial ampliado C3.", stock: 40 },
  { id: 1006, name: "Rodamiento NTN 6205ZZ", reference: "6205ZZ", price: 5.8, description: "Rodamiento rígido de bolas, Ø interior 25 mm, protección metálica por ambos lados.", stock: 75 },
  { id: 1007, name: "Rodamiento NTN 6205ZZ C3", reference: "6205ZZCM", price: 6.1, description: "Rodamiento rígido de bolas, Ø interior 25 mm, protección metálica, juego radial ampliado C3.", stock: 50 },
  { id: 1008, name: "Rodamiento NTN 6206ZZ", reference: "6206ZZ", price: 7.3, description: "Rodamiento rígido de bolas, Ø interior 30 mm, protección metálica.", stock: 60 },
  { id: 1009, name: "Rodamiento de rodillos cónicos NTN 32008X", reference: "32008X", price: 12.5, description: "Rodamiento de rodillos cónicos, Ø interior 40 mm, cargas combinadas.", stock: 30 },
  { id: 1010, name: "Soporte con rodamiento SNR UC205", reference: "UC205", price: 7.8, description: "Rodamiento de inserción con prisionero, Ø interior 25 mm.", stock: 60 },
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
      p.reference.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      norm(p.reference).includes(qNorm) ||
      qNorm.includes(norm(p.reference))
  );
  return (matches.length > 0 ? matches : DEMO_CATALOG.slice(0, 3)).map(stripStock);
}

function assertConfig() {
  if (DEMO_MODE) return;
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
    link: `${STORE_URL}/index.php?controller=product&id_product=${id}`,
    cartLink: `${STORE_URL}/index.php?controller=cart&add=1&id_product=${id}&qty=1`,
    checkoutLink: CHECKOUT_LINK,
  };
}

/** Normaliza un producto crudo de Prestashop a nuestro tipo limpio. */
function normalizeProduct(raw: any): Product {
  const id = Number(raw?.id ?? 0);
  const { link, cartLink, checkoutLink } = buildLinks(id);
  const price = Number.parseFloat(raw?.price ?? "0") || 0;
  return {
    id,
    name: plainText(raw?.name) || `Producto ${id}`,
    reference: plainText(raw?.reference),
    price: Math.round(price * 100) / 100,
    description: plainText(raw?.description_short).replace(/<[^>]*>/g, "").trim(),
    link,
    cartLink,
    checkoutLink,
  };
}

/**
 * Busca productos en cascada: referencia exacta → ref normalizada →
 * ref contiene → nombre contiene.
 */
export async function searchProducts(query: string): Promise<Product[]> {
  if (DEMO_MODE) return demoSearch(query);
  assertConfig();
  const safeQuery = query.trim().slice(0, 120);
  if (!safeQuery) return [];

  // Normalizar query: quitar espacios, guiones, barras, puntos.
  // "6205 ZZ C3" → "6205ZZC3"  |  "6205-2RS" → "62052RS"
  const normQuery = safeQuery.replace(/[\s\-\/\.]/g, "");

  // Extraer solo la parte numérica base para último recurso ("6205ZZC3" → "6205")
  const baseNum = safeQuery.match(/^(\d+)/)?.[1] ?? "";

  const strategies: string[] = [
    // 1. Referencia exacta tal cual el usuario escribió
    buildUrl("products", { "filter[reference]": safeQuery, limit: "10" }),
  ];

  // 2. Referencia sin espacios/guiones (caso más frecuente en NTN: "6205ZZCM")
  if (normQuery !== safeQuery) {
    strategies.push(buildUrl("products", { "filter[reference]": normQuery, limit: "10" }));
  }

  // 3 y 4. Búsqueda parcial (contiene) con ambas variantes
  strategies.push(buildUrl("products", { "filter[reference]": `%${safeQuery}%`, limit: "10" }));
  if (normQuery !== safeQuery) {
    strategies.push(buildUrl("products", { "filter[reference]": `%${normQuery}%`, limit: "10" }));
  }

  // 5. Nombre contiene query original
  strategies.push(buildUrl("products", { "filter[name]": `%${safeQuery}%`, limit: "10" }));

  // 6. Último recurso: solo el número base (devuelve todos los 6205-xxx)
  if (baseNum && baseNum !== safeQuery && baseNum !== normQuery) {
    strategies.push(buildUrl("products", { "filter[reference]": `%${baseNum}%`, limit: "10" }));
  }

  for (const url of strategies) {
    try {
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

/**
 * Consulta el stock real de un producto. Devuelve { quantity, available }.
 */
export async function getStock(idProduct: number): Promise<StockInfo> {
  if (DEMO_MODE) {
    const found = DEMO_CATALOG.find((p) => p.id === idProduct);
    const quantity = found?.stock ?? 0;
    return { id_product: idProduct, quantity, available: quantity > 0 };
  }
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
