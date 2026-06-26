// Cliente de la API Webservice de Prestashop.
// Solo server-side.

import "server-only";
import type { Product, StockInfo, PSCustomer } from "./types";

const BASE_URL = (process.env.PRESTASHOP_BASE_URL ?? "")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");
const API_KEY = process.env.PRESTASHOP_API_KEY ?? "";

const DEMO_MODE =
  !API_KEY ||
  process.env.PRESTASHOP_DEMO === "1" ||
  process.env.PRESTASHOP_DEMO === "true";

const STORE_URL = (BASE_URL || "https://b2b.esgas.es").replace(/\/+$/, "");
const CHECKOUT_URL = `${STORE_URL}/index.php?controller=order`;
const CART_PAGE_URL = `${STORE_URL}/carrito?action=show`;


function demoLinks(reference: string) {
  const ref = encodeURIComponent(reference);
  const search = `${STORE_URL}/index.php?controller=search&s=${ref}&search_query=${ref}`;
  return { link: search, cartLink: search, checkoutLink: CHECKOUT_URL };
}

type DemoSeedItem = Omit<Product, "link" | "cartLink" | "checkoutLink"> & { stock: number };

const DEMO_SEED: DemoSeedItem[] = [
  { id: 1001, name: "SNR 6201 ZZ",     reference: "6201ZZ",    price: 7.62,  description: "Ø12 mm, proteccion metalica.",           stock: 0   },
  { id: 1002, name: "SNR 6201 ZZ C3",  reference: "6201ZZC3",  price: 7.62,  description: "Ø12 mm, proteccion metalica, juego C3.", stock: 0   },
  { id: 1003, name: "SNR 6201 LLU",    reference: "6201LLU",   price: 8.10,  description: "Ø12 mm, sellado goma estanco.",          stock: 35  },
  { id: 1004, name: "SNR 6205 LLU",    reference: "6205LLU",   price: 6.50,  description: "Ø25 mm, sellado goma estanco.",          stock: 120 },
  { id: 1005, name: "SNR 6205 ZZ",     reference: "6205ZZ",    price: 5.80,  description: "Ø25 mm, proteccion metalica.",           stock: 75  },
  { id: 1006, name: "SNR 6205 ZZ C3",  reference: "6205ZZCM",  price: 6.10,  description: "Ø25 mm, proteccion metalica, juego C3.", stock: 50  },
  { id: 1007, name: "SNR 6206 LLU",    reference: "6206LLU",   price: 8.20,  description: "Ø30 mm, sellado goma.",                  stock: 85  },
  { id: 1008, name: "SNR 6305 LLU C3", reference: "6305LLU/C3",price: 9.90,  description: "Ø25 mm, goma, juego C3.",               stock: 40  },
  { id: 1009, name: "SNR 32008X",      reference: "32008X",    price: 12.50, description: "Rodillos conicos, Ø40 mm.",             stock: 30  },
];

const DEMO_CATALOG: Array<Product & { stock: number }> = DEMO_SEED.map((p) => ({
  ...p, ...demoLinks(p.reference),
}));

function stripStock(p: Product & { stock: number }): Product {
  const { stock: _stock, ...rest } = p;
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
      norm(p.reference).includes(qNorm)
  );
  return (matches.length > 0 ? matches : DEMO_CATALOG.slice(0, 3)).map(stripStock);
}

function assertConfig() {
  if (DEMO_MODE) return;
  if (!BASE_URL || !API_KEY) throw new Error("Faltan PRESTASHOP_BASE_URL o PRESTASHOP_API_KEY.");
}

const PS_HEADERS = { Accept: "application/json" };

function buildUrl(
  resource: string,
  opts: {
    display?: string;
    limit?: string;
    filters?: Record<string, string>;
  } = {}
): string {
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

function buildLinks(id: number, idProductAttribute = 0) {
  const back = encodeURIComponent("/carrito");
  return {
    link: `${STORE_URL}/index.php?controller=product&id_product=${id}`,
    cartLink: `${STORE_URL}/index.php?controller=cart&add=1&id_product=${id}&id_product_attribute=${idProductAttribute}&qty=1&action=add&back=${back}`,
    checkoutLink: CHECKOUT_URL,
  };
}

function normalizeProduct(raw: any, basePrice?: number): Product {
  const id = Number(raw?.id ?? 0);
  const price = basePrice ?? (Number.parseFloat(raw?.price ?? "0") || 0);
  const combinations: Array<{ id: string | number }> = raw?.associations?.combinations ?? [];
  const idProductAttribute = combinations.length > 0 ? Number(combinations[0].id) : 0;
  return {
    id,
    name: plainText(raw?.name) || `Producto ${id}`,
    reference: plainText(raw?.reference) || plainText(raw?.name),
    price: Math.round(price * 100) / 100,
    description: plainText(raw?.description_short).replace(/<[^>]*>/g, "").trim(),
    idProductAttribute,
    ...buildLinks(id, idProductAttribute),
  };
}

let _nameCache: Array<{ id: number; name: string }> | null = null;
let _nameCacheTs = 0;
const NAME_CACHE_TTL = 5 * 60 * 1000;

async function getAllNames(): Promise<Array<{ id: number; name: string }>> {
  if (_nameCache && Date.now() - _nameCacheTs < NAME_CACHE_TTL) return _nameCache;

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

// ─── B2B: precios específicos por grupo ──────────────────────────────────────

async function psGetBestSpecificPrice(
  productId: number,
  basePrice: number,
  groupId?: number
): Promise<{ price: number; discountPct: number | null }> {
  if (!productId || basePrice <= 0) return { price: basePrice, discountPct: null };
  try {
    const url = buildUrl("specific_prices", {
      display: "full",
      filters: { "filter[id_product]": `[${productId}]` },
    });
    const res = await fetch(url, { headers: PS_HEADERS, cache: "no-store" });
    if (!res.ok) return { price: basePrice, discountPct: null };

    const data = await res.json().catch(() => ({}));
    const prices: any[] = (data?.specific_prices ?? []).filter((sp: any) => {
      const spCustomer = Number(sp.id_customer ?? 0);
      const spGroup = Number(sp.id_group ?? 0);
      const fromQty = Number(sp.from_quantity ?? 1);
      if (spCustomer !== 0) return false;
      if (fromQty > 1) return false;
      return spGroup === 0 || (groupId !== undefined && spGroup === groupId);
    });

    if (!prices.length) return { price: basePrice, discountPct: null };

    prices.sort((a: any, b: any) => {
      const aGroup = Number(a.id_group ?? 0);
      const bGroup = Number(b.id_group ?? 0);
      if (groupId !== undefined) {
        if (aGroup === groupId && bGroup !== groupId) return -1;
        if (bGroup === groupId && aGroup !== groupId) return 1;
      }
      return parseFloat(b.reduction) - parseFloat(a.reduction);
    });

    const best = prices[0];
    const fixedPrice = parseFloat(best.price ?? "0");
    if (fixedPrice > 0) {
      const pct = basePrice > 0 ? 1 - fixedPrice / basePrice : null;
      return {
        price: Math.round(fixedPrice * 100) / 100,
        discountPct: pct !== null && pct > 0 ? pct : null,
      };
    }
    if (best.reduction_type === "percentage") {
      const pct = parseFloat(best.reduction);
      return {
        price: Math.round(basePrice * (1 - pct) * 100) / 100,
        discountPct: pct,
      };
    }
    if (best.reduction_type === "amount") {
      const amt = parseFloat(best.reduction);
      const finalPrice = Math.max(0, Math.round((basePrice - amt) * 100) / 100);
      const pct = basePrice > 0 ? (basePrice - finalPrice) / basePrice : null;
      return { price: finalPrice, discountPct: pct && pct > 0 ? pct : null };
    }
    return { price: basePrice, discountPct: null };
  } catch {
    return { price: basePrice, discountPct: null };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function psGetCustomer(email: string): Promise<PSCustomer | null> {
  if (DEMO_MODE || !email.trim()) return null;
  try {
    const enc = email.trim().toLowerCase();
    const url = buildUrl("customers", {
      display: "[id,id_default_group,firstname,lastname,email,secure_key]",
      filters: { "filter[email]": `[${enc}]` },
    });
    const res = await fetch(url, { headers: PS_HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const c = data?.customers?.[0];
    if (!c) return null;
    return {
      id: Number(c.id),
      groupId: Number(c.id_default_group),
      firstName: c.firstname,
      lastName: c.lastname,
      email: c.email,
      secureKey: String(c.secure_key ?? "").trim(),
    };
  } catch {
    return null;
  }
}

export async function searchProducts(query: string, groupId?: number): Promise<Product[]> {
  if (DEMO_MODE) return demoSearch(query);
  assertConfig();

  const safeQuery = query.trim().slice(0, 120);
  if (!safeQuery) return [];

  const qLow = safeQuery.toLowerCase();
  const qNorm = qLow.replace(/[\s\-\/\.]/g, "");

  const allNames = await getAllNames();
  if (allNames.length === 0) return [];

  const matched = allNames
    .filter((p) => {
      const nl = p.name.toLowerCase();
      const nn = nl.replace(/[\s\-\/\.]/g, "");
      return nl.includes(qLow) || nn.includes(qNorm);
    })
    .slice(0, 5);

  if (matched.length === 0) return [];

  const ids = matched.map((p) => p.id).join("|");
  const detailUrl = buildUrl("products", {
    display: "full",
    limit: "5",
    filters: { "filter[id]": `[${ids}]` },
  });

  let rawProducts: any[] = [];
  try {
    const res = await fetch(detailUrl, { headers: PS_HEADERS, cache: "no-store" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      rawProducts = data?.products ?? [];
    }
  } catch { /* ignorar */ }

  const products = await Promise.all(
    (rawProducts.length > 0 ? rawProducts : matched.map((p) => ({ id: p.id, name: p.name }))).map(
      async (raw: any) => {
        const basePrice = Number.parseFloat(raw?.price ?? "0") || 0;
        const product = normalizeProduct(raw, basePrice);
        if (groupId !== undefined && basePrice > 0) {
          const { price: discountedPrice, discountPct } = await psGetBestSpecificPrice(
            product.id, basePrice, groupId
          );
          return {
            ...product,
            price: discountedPrice,
            originalPrice: basePrice,
            discountPct,
          };
        }
        return product;
      }
    )
  );

  return products.filter((p) => p.id > 0).slice(0, 3);
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
  if (!res.ok) throw new Error(`stock_availables respondio ${res.status}`);

  const data = await res.json().catch(() => ({}));
  const list = data?.stock_availables;
  const quantity = Array.isArray(list)
    ? list.reduce((s: number, x: any) => s + (Number(x?.quantity) || 0), 0)
    : 0;

  return { id_product: idProduct, quantity, available: quantity > 0 };
}

// ─── Carrito via WS API ───────────────────────────────────────────────────────

export interface CartResult {
  cartId: string;
  cartUrl: string;
  itemAddUrls: string[];
  debug?: string;
}

function xmlField(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
  return xml.match(re)?.[1]?.trim() ?? "";
}

export async function psCreateCart(
  items: { productId: number; qty: number; idProductAttribute?: number }[],
  customerId?: number,
  customerSecureKey?: string
): Promise<CartResult> {
  const back = encodeURIComponent("/carrito");
  const itemAddUrls = items.map(
    (i) =>
      `${STORE_URL}/index.php?controller=cart&add=1&id_product=${i.productId}&id_product_attribute=${i.idProductAttribute ?? 0}&qty=${i.qty}&action=add&back=${back}`
  );

  if (DEMO_MODE || !items.length) {
    return { cartId: "", cartUrl: CART_PAGE_URL, itemAddUrls };
  }

  try {
    const customerXml = customerId ? `<id_customer>${customerId}</id_customer>` : "";
    const secureKeyXml = customerSecureKey
      ? `<secure_key>${customerSecureKey.trim()}</secure_key>`
      : "";

    // Paso 1: POST para crear carrito vacío
    // PS WebService ignora cart_rows en POST — hay que añadirlos con PUT después
    const createXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">` +
      `<cart>` +
      `<id_currency>1</id_currency>` +
      `<id_lang>1</id_lang>` +
      customerXml +
      secureKeyXml +
      `</cart>` +
      `</prestashop>`;

    const postUrl = `${BASE_URL}/api/carts?ws_key=${API_KEY}&output_format=JSON`;
    const postRes = await fetch(postUrl, {
      method: "POST",
      headers: { ...PS_HEADERS, "Content-Type": "application/xml" },
      body: createXml,
    });

    const postBody = await postRes.text().catch(() => "");

    if (!postRes.ok) {
      console.error("[psCreateCart] POST error", postRes.status, postBody.slice(0, 300));
      return { cartId: "", cartUrl: CART_PAGE_URL, itemAddUrls };
    }

    let cartId = "";
    if (postBody.trimStart().startsWith("{")) {
      try { cartId = String(JSON.parse(postBody)?.cart?.id ?? ""); } catch { /* ignorar */ }
    }
    if (!cartId) cartId = xmlField(postBody, "id");
    if (!cartId) {
      const loc = postRes.headers.get("location") ?? "";
      cartId = loc.match(/\/carts\/(\d+)/)?.[1] ?? "";
    }

    if (!cartId) {
      console.error("[psCreateCart] No cart ID:", postBody.slice(0, 300));
      return { cartId: "", cartUrl: CART_PAGE_URL, itemAddUrls };
    }

    // Paso 2: GET para obtener campos reales del carrito (id_address_delivery, id_shop, etc.)
    const getUrl = `${BASE_URL}/api/carts/${cartId}?ws_key=${API_KEY}&output_format=JSON`;
    const getRes = await fetch(getUrl, { headers: PS_HEADERS, cache: "no-store" });
    const cartData = getRes.ok ? await getRes.json().catch(() => ({})) : {};
    const cartObj = cartData?.cart ?? {};

    const idAddressDelivery = Number(cartObj?.id_address_delivery ?? 0);
    const idShopGroup = Number(cartObj?.id_shop_group ?? 1);
    const idShop = Number(cartObj?.id_shop ?? 1);

    // Paso 3: PUT para añadir los productos — ahora sí los acepta PS
    const rows = items
      .map(
        (i) =>
          `<cart_row>` +
          `<id_product>${i.productId}</id_product>` +
          `<id_product_attribute>${i.idProductAttribute ?? 0}</id_product_attribute>` +
          `<id_address_delivery>${idAddressDelivery}</id_address_delivery>` +
          `<quantity>${i.qty}</quantity>` +
          `<id_customization>0</id_customization>` +
          `</cart_row>`
      )
      .join("");

    const putXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">` +
      `<cart>` +
      `<id>${cartId}</id>` +
      `<id_currency>1</id_currency>` +
      `<id_lang>1</id_lang>` +
      `<id_shop_group>${idShopGroup}</id_shop_group>` +
      `<id_shop>${idShop}</id_shop>` +
      customerXml +
      secureKeyXml +
      `<associations><cart_rows>${rows}</cart_rows></associations>` +
      `</cart>` +
      `</prestashop>`;

    const putUrl = `${BASE_URL}/api/carts/${cartId}?ws_key=${API_KEY}`;
    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers: { ...PS_HEADERS, "Content-Type": "application/xml" },
      body: putXml,
    });

    if (!putRes.ok) {
      const putBody = await putRes.text().catch(() => "");
      console.error("[psCreateCart] PUT error", putRes.status, putBody.slice(0, 300));
    } else {
      console.log("[psCreateCart] carrito", cartId, "actualizado con", items.length, "producto(s)");
    }

    const secureKey = customerSecureKey?.trim() ?? "";
    const cartUrl = secureKey
      ? `${STORE_URL}/index.php?controller=cart&action=show&recover_cart=${cartId}&token_cart=${secureKey}`
      : CART_PAGE_URL;

    return { cartId, cartUrl, itemAddUrls };
  } catch (err) {
    console.error("[psCreateCart] Exception:", err);
    return { cartId: "", cartUrl: CART_PAGE_URL, itemAddUrls };
  }
}

export { CART_PAGE_URL };
