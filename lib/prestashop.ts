// Cliente de la API Webservice de Prestashop.
// Solo server-side.

import "server-only";
import type { Product, StockInfo, PSCustomer } from "./types";
import { matchDescuento } from "./kb";
import { boreCodeFor, seriesPrefixesForBoreCode } from "./bearingSizes";

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

// El stock viaja SIEMPRE en cada producto devuelto (aquí y en modo real, ver
// getStockBulk más abajo): así la tarjeta de producto puede mostrar de
// entrada si hay o no unidades disponibles, sin depender de que el cliente
// pregunte explícitamente por disponibilidad. Antes se limpiaba con
// stripStock() y solo se rellenaba si el agente llamaba a get_stock — eso
// dejaba sin indicador de stock a los productos que solo se listan para
// comparar, que es justo cuando más falta hace saber cuál elegir.
function demoSearch(query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return DEMO_CATALOG.slice(0, 5);
  const norm = (s: string) => s.toLowerCase().replace(/[^0-9a-z]/g, "");
  const qNorm = norm(q);
  const matches = DEMO_CATALOG.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      norm(p.name).includes(qNorm) ||
      norm(p.reference).includes(qNorm)
  );
  return matches.length > 0 ? matches : DEMO_CATALOG.slice(0, 3);
}

function assertConfig() {
  if (DEMO_MODE) return;
  if (!BASE_URL || !API_KEY) throw new Error("Faltan PRESTASHOP_BASE_URL o PRESTASHOP_API_KEY.");
}

const PS_HEADERS = { Accept: "application/json" };

// Ninguna llamada al Webservice puede quedarse colgada indefinidamente.
// Sin límite, un Prestashop lento se lleva por delante la función entera:
// Vercel la mata a los 60 s y el cliente ve la página de error de la
// plataforma en vez de una respuesta del chat. Fallo real reproducido el
// 2026-07-27: cualquier consulta de producto devolvía 504.
// Con un tope por llamada, si la tienda va lenta se degrada de forma
// controlada (ese dato se queda sin confirmar y el bot ofrece el contacto)
// pero la conversación NUNCA se cae.
const PS_TIMEOUT_MS = 9000;
const PS_CATALOG_TIMEOUT_MS = 14000;

async function psFetch(url: string, timeoutMs = PS_TIMEOUT_MS): Promise<Response | null> {
  try {
    return await fetch(url, {
      headers: PS_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Timeout, DNS, red… el llamante decide cómo degradar.
    return null;
  }
}

/**
 * Igual que psFetch pero lanzando si no hay respuesta, para los puntos que ya
 * estaban dentro de un try/catch y esperan una Response. Mantiene el
 * comportamiento anterior (un fallo de red también lanzaba desde fetch),
 * añadiendo únicamente el límite de tiempo.
 */
async function psFetchOrThrow(url: string, timeoutMs = PS_TIMEOUT_MS): Promise<Response> {
  const res = await psFetch(url, timeoutMs);
  if (!res) throw new Error("Prestashop no respondio dentro del tiempo limite");
  return res;
}

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

  // Si el campo reference contiene solo dígitos (EAN-8 a EAN-14), usamos
  // supplier_reference como alternativa, o el nombre del producto.
  const rawRef = plainText(raw?.reference);
  const isBarcode = /^\d{8,14}$/.test(rawRef);
  const reference = !isBarcode && rawRef
    ? rawRef
    : (plainText(raw?.supplier_reference) || plainText(raw?.name));

  return {
    id,
    name: plainText(raw?.name) || `Producto ${id}`,
    reference,
    price: Math.round(price * 100) / 100,
    description: plainText(raw?.description_short).replace(/<[^>]*>/g, "").trim(),
    idProductAttribute,
    ...buildLinks(id, idProductAttribute),
  };
}

let _nameCache: Array<{ id: number; name: string; reference: string }> | null = null;
let _nameCacheTs = 0;
// 30 min: el índice solo lleva nombres y referencias (precio y stock se
// consultan siempre al momento), así que no hace falta rehacerlo cada 5 min.
const NAME_CACHE_TTL = 30 * 60 * 1000;
let _nameCacheEnCurso: Promise<Array<{ id: number; name: string; reference: string }>> | null = null;

// Índice ligero de TODO el catálogo para la búsqueda: nombre + referencia +
// referencia de proveedor. Antes solo se pedía [id,name] y la búsqueda
// comparaba únicamente contra el nombre — cualquier producto cuyo nombre no
// contuviese literalmente la referencia era invisible para el bot aunque
// existiera en la tienda (fallo real de fiabilidad: "no lo tenemos" siendo
// falso, que es exactamente lo que no nos podemos permitir).
// Marca de cuándo falló el último intento de bajar el catálogo completo.
//
// Sin esto, un Prestashop lento sale carísimo: la llamada agota sus 14 s, no
// se cachea nada, y la SIGUIENTE búsqueda de la misma conversación vuelve a
// intentarlo y a esperar otros 14 s. Medido en producción: "quiero comprar el
// rodamiento 3309" encadenaba varios intentos y se plantaba en 50 s.
// Recordando el fallo durante un rato, el primer intento paga el coste y los
// demás fallan al instante y tiran de las búsquedas rápidas.
let _nameCacheFalloTs = 0;
const NAME_FAIL_TTL = 60 * 1000;

async function getAllNames(): Promise<Array<{ id: number; name: string; reference: string }>> {
  if (_nameCache && Date.now() - _nameCacheTs < NAME_CACHE_TTL) return _nameCache;
  // Caducado pero existente: se usa el que hay y se renueva por detrás, así
  // ninguna consulta del cliente paga la descarga del catálogo entero.
  if (_nameCache) {
    if (!_nameCacheEnCurso) _nameCacheEnCurso = descargarIndice().finally(() => (_nameCacheEnCurso = null));
    return _nameCache;
  }
  if (Date.now() - _nameCacheFalloTs < NAME_FAIL_TTL) return [];
  // Si ya se está descargando (p. ej. lo lanzó el precalentado al abrir el
  // chat), se espera a esa misma descarga en vez de pedirla dos veces.
  _nameCacheEnCurso ??= descargarIndice().finally(() => (_nameCacheEnCurso = null));
  return _nameCacheEnCurso;
}

/**
 * Precalienta el índice del catálogo. Lo pide el chat en cuanto el cliente lo
 * abre: mientras escribe su pregunta, la descarga (la parte lenta de la
 * tienda) ya está hecha o en marcha.
 */
export async function calentarCatalogo(): Promise<number> {
  if (DEMO_MODE) return 0;
  return (await getAllNames()).length;
}

async function descargarIndice(): Promise<Array<{ id: number; name: string; reference: string }>> {

  const url = buildUrl("products", { display: "[id,name,reference,supplier_reference]" });
  const res = await psFetch(url, PS_CATALOG_TIMEOUT_MS);
  if (!res || !res.ok) {
    _nameCacheFalloTs = Date.now();
    return [];
  }
  try {
    const data = await res.json().catch(() => ({}));
    const list = (data?.products ?? []).map((p: any) => ({
      id: Number(p.id),
      name: plainText(p.name),
      reference: [plainText(p.reference), plainText(p.supplier_reference)]
        .filter(Boolean)
        .join(" "),
    }));
    _nameCache = list;
    _nameCacheTs = Date.now();
    return list;
  } catch {
    return [];
  }
}

/**
 * Búsqueda RÁPIDA delegando el filtrado al propio Prestashop.
 *
 * getAllNames() se descarga el catálogo entero (5.400+ artículos) y filtra en
 * memoria. Es exhaustivo, pero el Webservice tarda muchísimo en servir esa
 * consulta y era la causa real de que TODA consulta de producto acabase en
 * timeout de la función. Aquí se pregunta primero por lo concreto —tres
 * consultas pequeñas y en paralelo, por referencia, referencia de proveedor y
 * nombre— que devuelven en cientos de milisegundos.
 *
 * Es una OPTIMIZACIÓN, no un reemplazo: si no encuentra nada, el llamante
 * sigue cayendo al catálogo completo, así que no se pierde ni un resultado
 * respecto al comportamiento anterior.
 */
async function quickSearchNames(
  query: string,
  limite = 10
): Promise<Array<{ id: number; name: string; reference: string }>> {
  const q = query.trim();
  if (!q) return [];

  const campos = ["reference", "supplier_reference", "name"] as const;
  const peticiones = campos.map((campo) =>
    psFetch(
      buildUrl("products", {
        display: "[id,name,reference,supplier_reference]",
        limit: String(limite),
        // %valor% = "contiene", la sintaxis LIKE del Webservice de Prestashop.
        filters: { [`filter[${campo}]`]: `%[${q}]%` },
      })
    )
  );

  const respuestas = await Promise.all(peticiones);
  const porId = new Map<number, { id: number; name: string; reference: string }>();

  for (const res of respuestas) {
    if (!res || !res.ok) continue;
    try {
      const data = await res.json().catch(() => ({}));
      for (const p of data?.products ?? []) {
        const id = Number(p?.id);
        if (!id || porId.has(id)) continue;
        porId.set(id, {
          id,
          name: plainText(p?.name),
          reference: [plainText(p?.reference), plainText(p?.supplier_reference)]
            .filter(Boolean)
            .join(" "),
        });
      }
    } catch {
      /* una vía puede fallar sin invalidar las demás */
    }
  }

  return [...porId.values()];
}

// ─── Nombres reales de proveedor y grupo de cliente (para cruce con precios.json) ──

let _supplierCache: Map<number, string> | null = null;
let _supplierCacheTs = 0;

async function getSupplierName(id: number): Promise<string | null> {
  if (!id) return null;
  if (_supplierCache && Date.now() - _supplierCacheTs < NAME_CACHE_TTL) {
    return _supplierCache.get(id) ?? null;
  }
  try {
    const url = buildUrl("suppliers", { display: "[id,name]" });
    const res = await psFetchOrThrow(url);
    if (!res.ok) return _supplierCache?.get(id) ?? null;
    const data = await res.json().catch(() => ({}));
    const map = new Map<number, string>();
    for (const s of data?.suppliers ?? []) map.set(Number(s.id), plainText(s.name));
    _supplierCache = map;
    _supplierCacheTs = Date.now();
    return map.get(id) ?? null;
  } catch {
    return _supplierCache?.get(id) ?? null;
  }
}

let _groupCache: Map<number, string> | null = null;
let _groupCacheTs = 0;

async function getGroupName(id: number): Promise<string | null> {
  if (!id) return null;
  if (_groupCache && Date.now() - _groupCacheTs < NAME_CACHE_TTL) {
    return _groupCache.get(id) ?? null;
  }
  try {
    const url = buildUrl("groups", { display: "[id,name]" });
    const res = await psFetchOrThrow(url);
    if (!res.ok) return _groupCache?.get(id) ?? null;
    const data = await res.json().catch(() => ({}));
    const map = new Map<number, string>();
    for (const g of data?.groups ?? []) map.set(Number(g.id), plainText(g.name));
    _groupCache = map;
    _groupCacheTs = Date.now();
    return map.get(id) ?? null;
  } catch {
    return _groupCache?.get(id) ?? null;
  }
}

/**
 * Descuento por regla de catálogo real (data/kb/precios.json), cruzando el
 * proveedor real del producto y el grupo real del cliente (ambos leídos en
 * vivo de la Webservice). Es la vía que sí ve las 54 specific_price_rules
 * confirmadas ("GRUPO XX CLIENTE GR/MD/PQ") — specific_prices (más abajo)
 * NO las ve porque son reglas de catálogo, no precios manuales por producto.
 * No hay acceso al servidor de Prestashop para desplegar priceinfo.php
 * (Product::getPriceStatic), así que esta es la fuente correcta disponible.
 */
async function psGetCatalogDiscount(
  supplierId: number,
  groupId: number | undefined,
  basePrice: number
): Promise<{ price: number; discountPct: number | null } | null> {
  if (!supplierId || groupId === undefined || basePrice <= 0) return null;
  const [supplierName, groupName] = await Promise.all([
    getSupplierName(supplierId),
    getGroupName(groupId),
  ]);
  const pct = matchDescuento(supplierName, groupName);
  if (pct === null) return null;
  return {
    price: Math.round(basePrice * (1 - pct / 100) * 100) / 100,
    discountPct: pct / 100,
  };
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
    const res = await psFetchOrThrow(url);
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

// ─── Precio EXACTO de la tienda: filas de specific_prices ───────────────────
// PrestaShop "materializa" cada regla de catálogo (las "GRUPO XX CLIENTE GR")
// en filas de specific_price por producto y grupo, con id_specific_price_rule
// relleno. Comprobado contra b2b.esgas.es el 26-10-2026: el SNR 6205 trae una
// fila por cada grupo con descuento (GR 83,7 %, MD 83,0 %, PQ 82,4 %, GA 83,7 %).
// Esas filas son lo que PrestaShop aplica de verdad, así que son la fuente
// principal: siguen al día solas cuando ESGAS crea o cambia una regla (la tienda
// ya tiene 76 reglas y el grupo "Cliente GA", que la tabla fija precios.json de
// 54 no conoce). precios.json queda solo como respaldo si la Webservice falla.

export interface FilaPrecioEspecifico {
  id_product: number;
  id_product_attribute: number;
  id_shop: number;
  id_currency: number;
  id_country: number;
  id_group: number;
  id_customer: number;
  id_cart: number;
  id_specific_price_rule: number;
  price: number;
  from_quantity: number;
  reduction: number;
  reduction_type: string;
  reduction_tax: number;
  from: string;
  to: string;
}

const FECHA_VACIA = "0000-00-00 00:00:00";
// Valores por defecto de una tienda PrestaShop en España: EUR = 1, España = 6.
const ID_MONEDA = Number(process.env.PRESTASHOP_ID_CURRENCY ?? 1);
const ID_PAIS = Number(process.env.PRESTASHOP_ID_COUNTRY ?? 6);
const ID_TIENDA = 1;
const IVA = 0.21;

/**
 * Filas de specific_prices de varios productos en UNA consulta (más las de
 * id_product = 0, que valen para todo el catálogo). null = la Webservice no
 * respondió: el llamante debe usar el respaldo, NUNCA tomarlo por "sin descuento".
 */
export async function filasPrecioEspecifico(ids: number[]): Promise<Map<number, FilaPrecioEspecifico[]> | null> {
  const unicos = Array.from(new Set(ids.filter((id) => id > 0)));
  if (unicos.length === 0) return new Map();
  try {
    const url = buildUrl("specific_prices", {
      display: "full",
      filters: { "filter[id_product]": `[0|${unicos.join("|")}]` },
    });
    const res = await psFetchOrThrow(url);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    // Sin filas, PrestaShop devuelve [] (o {}) en vez de { specific_prices: [] }.
    const lista: any[] = Array.isArray(data?.specific_prices) ? data.specific_prices : [];
    const out = new Map<number, FilaPrecioEspecifico[]>();
    for (const r of lista) {
      const fila: FilaPrecioEspecifico = {
        id_product: Number(r.id_product ?? 0),
        id_product_attribute: Number(r.id_product_attribute ?? 0),
        id_shop: Number(r.id_shop ?? 0),
        id_currency: Number(r.id_currency ?? 0),
        id_country: Number(r.id_country ?? 0),
        id_group: Number(r.id_group ?? 0),
        id_customer: Number(r.id_customer ?? 0),
        id_cart: Number(r.id_cart ?? 0),
        id_specific_price_rule: Number(r.id_specific_price_rule ?? 0),
        price: Number.parseFloat(r.price ?? "-1"),
        from_quantity: Number(r.from_quantity ?? 1),
        reduction: Number.parseFloat(r.reduction ?? "0") || 0,
        reduction_type: String(r.reduction_type ?? "percentage"),
        reduction_tax: Number(r.reduction_tax ?? 0),
        from: String(r.from ?? FECHA_VACIA),
        to: String(r.to ?? FECHA_VACIA),
      };
      const lista = out.get(fila.id_product) ?? [];
      lista.push(fila);
      out.set(fila.id_product, lista);
    }
    return out;
  } catch {
    return null;
  }
}

/** "2026-10-26 12:00:00" en hora de Madrid, que es como guarda las fechas la tienda. */
function ahoraTienda(): string {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date());
  return p.replace("T", " ");
}

/**
 * Elige la fila que aplicaría PrestaShop 1.7 (SpecificPrice::getSpecificPrice)
 * y calcula el precio sin IVA para 1 unidad. Mismo filtro y mismo orden que la
 * consulta SQL del núcleo: atributo DESC, carrito DESC, cantidad DESC, regla
 * ASC, puntuación DESC (cliente 32, tienda 16, moneda 8, país 4, grupo 2).
 */
export function precioSegunTienda(
  filas: FilaPrecioEspecifico[],
  basePrice: number,
  groupId?: number,
  idCustomer?: number,
  idProductAttribute = 0
): { price: number; discountPct: number | null; fila: FilaPrecioEspecifico | null } {
  const ahora = ahoraTienda();
  const vale = (v: number, propio: number | undefined) => v === 0 || (propio !== undefined && v === propio);
  const candidatas = filas.filter(
    (f) =>
      vale(f.id_shop, ID_TIENDA) &&
      vale(f.id_currency, ID_MONEDA) &&
      vale(f.id_country, ID_PAIS) &&
      vale(f.id_group, groupId) &&
      vale(f.id_customer, idCustomer) &&
      vale(f.id_product_attribute, idProductAttribute) &&
      f.id_cart === 0 &&
      (f.from_quantity > 1 ? f.from_quantity : 0) <= 1 &&
      (f.from === FECHA_VACIA || f.from <= ahora) &&
      (f.to === FECHA_VACIA || f.to >= ahora)
  );
  if (candidatas.length === 0) return { price: basePrice, discountPct: null, fila: null };

  const puntos = (f: FilaPrecioEspecifico) =>
    (idCustomer && f.id_customer === idCustomer ? 32 : 0) +
    (f.id_shop === ID_TIENDA ? 16 : 0) +
    (f.id_currency === ID_MONEDA ? 8 : 0) +
    (f.id_country === ID_PAIS ? 4 : 0) +
    (groupId !== undefined && f.id_group === groupId ? 2 : 0);
  candidatas.sort(
    (a, b) =>
      b.id_product_attribute - a.id_product_attribute ||
      b.id_cart - a.id_cart ||
      b.from_quantity - a.from_quantity ||
      a.id_specific_price_rule - b.id_specific_price_rule ||
      puntos(b) - puntos(a) ||
      (b.to > a.to ? 1 : b.to < a.to ? -1 : 0) ||
      (b.from > a.from ? 1 : b.from < a.from ? -1 : 0)
  );
  const fila = candidatas[0];

  // Precio fijo (price >= 0) sustituye a la tarifa; la reducción se aplica encima.
  let precio = fila.price >= 0 ? fila.price : basePrice;
  if (fila.reduction_type === "percentage") {
    precio = precio * (1 - fila.reduction);
  } else if (fila.reduction_type === "amount") {
    // reduction_tax = 1: el importe incluye IVA y la tienda B2B muestra sin IVA.
    precio = precio - (fila.reduction_tax === 1 ? fila.reduction / (1 + IVA) : fila.reduction);
  }
  precio = Math.max(0, Math.round(precio * 100) / 100);
  // Con un porcentaje sobre la tarifa se da el de la regla tal cual (83,7 %, no
  // el 83,69 % que saldría de dividir precios ya redondeados).
  const pct =
    fila.price < 0 && fila.reduction_type === "percentage"
      ? fila.reduction
      : basePrice > 0 ? 1 - precio / basePrice : 0;
  return { price: precio, discountPct: pct > 0.00001 ? pct : null, fila };
}

// ─── Precio real vía priceinfo.php (Product::getPriceStatic) ────────────────
// Fuente primaria de precio: usa la misma función que PrestaShop usa para
// pintar la ficha del producto (specific_prices + reglas de precios de
// catálogo), así que nunca puede divergir de lo que ve el cliente en la web.
// Si el endpoint no está desplegado o no responde, se degrada de forma
// silenciosa a psGetBestSpecificPrice (fuente secundaria, menos completa).

const PRICE_SECRET = process.env.PRESTASHOP_PRICE_SECRET ?? "";

interface RealPriceEntry {
  price: number;
  originalPrice: number;
  discountPct: number | null;
}

async function psGetRealPrices(
  ids: number[],
  idCustomer?: number
): Promise<Record<number, RealPriceEntry>> {
  if (!PRICE_SECRET || ids.length === 0) return {};
  try {
    const url = new URL(`${STORE_URL}/priceinfo.php`);
    url.searchParams.set("ids", ids.join(","));
    url.searchParams.set("secret", PRICE_SECRET);
    if (idCustomer) url.searchParams.set("id_customer", String(idCustomer));

    const res = await psFetchOrThrow(url.toString());
    if (!res.ok) return {};
    const data = await res.json().catch(() => ({}));

    const out: Record<number, RealPriceEntry> = {};
    for (const id of ids) {
      const entry = data?.[id] ?? data?.[String(id)];
      if (
        entry &&
        typeof entry.price === "number" &&
        typeof entry.originalPrice === "number"
      ) {
        out[id] = {
          price: entry.price,
          originalPrice: entry.originalPrice,
          discountPct:
            typeof entry.discountPct === "number" ? entry.discountPct / 100 : null,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

// ─── Dirección válida para cart_rows ─────────────────────────────────────────

async function getValidAddressId(customerId?: number): Promise<number> {
  if (customerId) {
    try {
      const res = await fetch(
        `${BASE_URL}/api/addresses?ws_key=${API_KEY}&output_format=JSON&display=[id]&filter[id_customer]=[${customerId}]&limit=1`,
        { headers: PS_HEADERS, cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const id = Number(data?.addresses?.[0]?.id ?? 0);
        if (id > 0) return id;
      }
    } catch { /* continuar */ }
  }

  try {
    const res = await fetch(
      `${BASE_URL}/api/addresses?ws_key=${API_KEY}&output_format=JSON&display=[id]&limit=1`,
      { headers: PS_HEADERS, cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return Number(data?.addresses?.[0]?.id ?? 0);
    }
  } catch { /* usar 0 */ }

  return 0;
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
    const res = await psFetchOrThrow(url);
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

/**
 * Resuelve el cliente real por id_customer contra la Webservice API (fuente
 * de verdad propia, con nuestra ws_key). Se usa cuando no hay identityToken
 * firmado: el id_customer viaja sin firmar desde window.prestashop.customer.id
 * (leído en el navegador por widget.js), pero el grupo real NUNCA se confía
 * del cliente — siempre se vuelve a consultar aquí.
 */
export async function psGetCustomerById(id: number): Promise<PSCustomer | null> {
  if (DEMO_MODE || !id || id <= 0) return null;
  try {
    const url = buildUrl("customers", {
      display: "[id,id_default_group,firstname,lastname,email,secure_key]",
      filters: { "filter[id]": `[${id}]` },
    });
    const res = await psFetchOrThrow(url);
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const c = data?.customers?.[0];
    if (!c || Number(c.id) !== id) return null;
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

export async function searchProducts(
  query: string,
  groupId?: number,
  idCustomer?: number
): Promise<Product[]> {
  if (DEMO_MODE) return demoSearch(query);
  assertConfig();

  const safeQuery = query.trim().slice(0, 120);
  if (!safeQuery) return [];

  const qLow = safeQuery.toLowerCase();
  const qNorm = qLow.replace(/[\s\-\/\.]/g, "");

  const encaja = (p: { name: string; reference: string }): boolean => {
    const nl = p.name.toLowerCase();
    const nn = nl.replace(/[\s\-\/\.]/g, "");
    const rl = p.reference.toLowerCase();
    const rn = rl.replace(/[\s\-\/\.]/g, "");
    return nl.includes(qLow) || nn.includes(qNorm) || rl.includes(qLow) || rn.includes(qNorm);
  };

  // Búsqueda EN CAPAS, de la más precisa a la más amplia. El objetivo es que
  // un "no lo tenemos" siendo falso sea imposible: es el peor fallo posible
  // de cara al cliente, y pasó de verdad con "6205 ZZ C3", que SÍ está en la
  // tienda. La causa era depender del barrido completo del catálogo, que va
  // justo en el límite de su tiempo y unas veces llega y otras no.
  //
  // La clave de las capas 2 y 3: aunque busquemos en Prestashop por algo más
  // corto (la referencia base "6205"), el filtro local sigue exigiendo la
  // consulta COMPLETA ("6205zzc3"), así que no se cuela un producto que no
  // sea el que pide el cliente.
  const intentos: Array<() => Promise<Array<{ id: number; name: string; reference: string }>>> = [
    // 1. Tal cual lo ha escrito el cliente ("6205 ZZ C3").
    () => quickSearchNames(safeQuery),
    // 2. Sin separadores ("6205ZZC3"), que es como suele estar la referencia.
    () => (qNorm !== qLow ? quickSearchNames(qNorm) : Promise.resolve([])),
    // 3. Solo la referencia base ("6205"), pidiendo más resultados: recupera
    //    los casos en los que la tienda escribe los sufijos de otra forma.
    () => {
      const base = safeQuery.match(/\d{3,5}/)?.[0];
      return base && base !== qNorm ? quickSearchNames(base, 60) : Promise.resolve([]);
    },
    // 4. Último recurso: barrido completo del catálogo.
    async () => getAllNames(),
  ];

  let matched: Array<{ id: number; name: string; reference: string }> = [];
  for (const intento of intentos) {
    const encontrados = await intento();
    matched = encontrados.filter(encaja).slice(0, 5);
    if (matched.length > 0) break;
  }

  if (matched.length === 0) return [];
  // Hasta 5 (antes 3): una misma referencia base convive con varias variantes
  // de sufijo (6205, 6205 ZZ, 6205 LLU, 6205 C3...) y con el corte en 3 la
  // única que tenía unidades podía no llegar a verse. El coste es una consulta
  // de stock por lotes algo mayor; el precio ya se resolvía para todas.
  return hydrateProducts(matched, groupId, idCustomer, 5);
}

/**
 * A partir de una lista ya localizada de {id, name}, completa cada producto
 * con detalle, precio real del cliente y stock.
 *
 * Está extraído de searchProducts para que searchByBore pueda reutilizarlo:
 * antes searchByBore llamaba SEIS veces a searchProducts (una por serie) y,
 * como cada una hace su búsqueda rápida, su posible barrido de catálogo, su
 * detalle, sus precios y su stock, una sola llamada a la tool se convertía en
 * unas cuarenta peticiones a Prestashop. Con el catálogo en frío eso se
 * comía el limite de la funcion y la respuesta acababa en FUNCTION_INVOCATION_TIMEOUT.
 */
async function hydrateProducts(
  matched: Array<{ id: number; name: string }>,
  groupId?: number,
  idCustomer?: number,
  limit = 3
): Promise<Product[]> {
  if (matched.length === 0) return [];

  const ids = matched.map((p) => p.id).join("|");
  const detailUrl = buildUrl("products", {
    display: "full",
    limit: String(matched.length),
    filters: { "filter[id]": `[${ids}]` },
  });

  let rawProducts: any[] = [];
  try {
    const res = await psFetchOrThrow(detailUrl);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      rawProducts = data?.products ?? [];
    }
  } catch { /* ignorar */ }

  const rawList = rawProducts.length > 0 ? rawProducts : matched.map((p) => ({ id: p.id, name: p.name }));
  const idsRaw = rawList.map((raw: any) => Number(raw?.id ?? 0)).filter((id: number) => id > 0);
  const [realPrices, filasPrecio] = await Promise.all([
    psGetRealPrices(idsRaw, idCustomer),
    filasPrecioEspecifico(idsRaw),
  ]);

  const products = await Promise.all(
    rawList.map(
      async (raw: any) => {
        const basePrice = Number.parseFloat(raw?.price ?? "0") || 0;
        const product = normalizeProduct(raw, basePrice);
        if (basePrice <= 0) return product;

        const real = realPrices[product.id];
        if (real) {
          return { ...product, ...real };
        }

        // Fuente principal: las filas de precio que la propia tienda aplica.
        if (filasPrecio) {
          const filas = [...(filasPrecio.get(product.id) ?? []), ...(filasPrecio.get(0) ?? [])];
          const t = precioSegunTienda(filas, basePrice, groupId, idCustomer, product.idProductAttribute ?? 0);
          return {
            ...product,
            price: t.price,
            originalPrice: basePrice,
            discountPct: t.discountPct,
          };
        }

        // Respaldo (la Webservice no ha respondido a specific_prices): cruce con
        // la regla de catálogo real del producto
        // (proveedor real × grupo real del cliente) contra precios.json.
        const supplierId = Number(raw?.id_supplier ?? 0);
        const catalogDiscount = await psGetCatalogDiscount(supplierId, groupId, basePrice);
        if (catalogDiscount) {
          return {
            ...product,
            price: catalogDiscount.price,
            originalPrice: basePrice,
            discountPct: catalogDiscount.discountPct,
          };
        }

        // Último fallback: specific_prices manuales por producto (no reglas de catálogo).
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
    )
  );

  const finalProducts = products.filter((p) => p.id > 0).slice(0, limit);
  const stockMap = await getStockBulk(
    finalProducts.map((p) => p.id),
    Object.fromEntries(finalProducts.map((p) => [p.id, p.idProductAttribute ?? 0]))
  );
  return finalProducts.map((p) =>
    p.id in stockMap ? { ...p, stock: stockMap[p.id] } : p
  );
}

/**
 * Busca en el catálogo real todas las series estándar (60xx, 62xx, 63xx,
 * 72xx, 320xx, UC) para un diámetro interior (bore) dado, en vez de dejar
 * que el modelo adivine y encadene manualmente varias llamadas a
 * search_products — es justo el paso que fallaba en conversaciones reales
 * ("¿qué otras opciones tienes con este mismo diámetro?", "¿y el siguiente
 * por encima de 25mm?"). Ejecuta las búsquedas por prefijo en paralelo
 * reutilizando searchProducts (y por tanto DEMO_MODE, precios y stock ya
 * resueltos) y devuelve los resultados reales fusionados sin duplicados.
 */
/**
 * ¿El texto contiene el prefijo de serie como número COMPLETO?
 *
 * Buscar el prefijo como subcadena suelta metía basura de verdad: pidiendo
 * rodamientos de dØ25 mm salían un "NTN 22326 EA K W33 C3" y un
 * "33600 52RS TL" porque sus referencias contienen "6005" en medio de otro
 * número. Se exige que no haya un dígito pegado ni delante ni detrás.
 */
function esDeLaSerie(texto: string, prefijo: string): boolean {
  const i = texto.indexOf(prefijo);
  if (i < 0) return false;
  const antes = texto[i - 1];
  const despues = texto[i + prefijo.length];
  return !/\d/.test(antes ?? "") && !/\d/.test(despues ?? "");
}

export async function searchByBore(
  boreMm: number,
  groupId?: number,
  idCustomer?: number
): Promise<Product[]> {
  const code = boreCodeFor(boreMm);
  if (!code) return [];
  if (DEMO_MODE) {
    const prefixes = seriesPrefixesForBoreCode(code);
    const seen = new Set<number>();
    const merged: Product[] = [];
    for (const p of prefixes) {
      for (const prod of demoSearch(p.prefix)) {
        if (seen.has(prod.id)) continue;
        seen.add(prod.id);
        merged.push(prod);
      }
    }
    return merged.slice(0, 6);
  }
  assertConfig();

  const prefixes = seriesPrefixesForBoreCode(code);
  const normPrefijos = prefixes.map((p) => p.prefix.toLowerCase().replace(/[\s\-\/\.]/g, ""));

  const seen = new Set<number>();
  const matched: Array<{ id: number; name: string }> = [];
  const anotar = (lista: Array<{ id: number; name: string; reference: string }>, pref: string): void => {
    for (const p of lista) {
      if (matched.length >= 6) return;
      if (seen.has(p.id)) continue;
      const nn = p.name.toLowerCase().replace(/[\s\-\/\.]/g, "");
      const rn = p.reference.toLowerCase().replace(/[\s\-\/\.]/g, "");
      if (esDeLaSerie(nn, pref) || esDeLaSerie(rn, pref)) {
        seen.add(p.id);
        matched.push({ id: p.id, name: p.name });
      }
    }
  };

  // 1º las búsquedas rápidas por serie, en paralelo: son consultas pequeñas
  // que Prestashop resuelve en milisegundos. Antes esto pasaba siempre por el
  // catálogo completo, y cuando esa descarga va lenta se lleva por delante
  // toda la conversación.
  const rapidas = await Promise.all(normPrefijos.map((pref) => quickSearchNames(pref)));
  normPrefijos.forEach((pref, i) => anotar(rapidas[i], pref));

  // 2º solo si no ha salido nada, el barrido completo del catálogo — una vez,
  // y compartido por las seis series.
  if (matched.length === 0) {
    const allNames = await getAllNames();
    if (allNames.length === 0) return [];
    for (const pref of normPrefijos) anotar(allNames, pref);
  }

  return hydrateProducts(matched, groupId, idCustomer, 6);
}

/**
 * Stock de varios productos a la vez, para adjuntarlo automáticamente a
 * cada resultado de búsqueda (ver comentario en demoSearch). Si la llamada
 * falla, devuelve {} y los productos se quedan sin campo stock (sin
 * indicador) en vez de mostrar "sin stock" de forma incorrecta.
 */
/**
 * Unidades de UNA ficha a partir de sus filas de stock_availables.
 *
 * PrestaShop guarda una fila por combinación y, además, una con
 * id_product_attribute = 0 que ya es la SUMA de todas. Sumar todas las filas
 * (lo que se hacía antes) contaba dos veces el stock de cualquier producto con
 * combinaciones. Se toma la fila de la combinación pedida; si no la hay, la del
 * producto (attr 0); y una cantidad negativa (vendido de más) es 0 disponible.
 */
export function unidadesDisponibles(filas: Array<{ id_product_attribute?: unknown; quantity?: unknown }>, idProductAttribute = 0): number {
  const deAttr = (a: number) => filas.filter((f) => Number(f.id_product_attribute ?? 0) === a);
  let elegidas = idProductAttribute > 0 ? deAttr(idProductAttribute) : [];
  if (elegidas.length === 0) elegidas = deAttr(0);
  if (elegidas.length === 0) elegidas = filas;
  // Varias filas de la misma combinación = varias tiendas: se queda la mayor.
  const q = elegidas.reduce((m, f) => Math.max(m, Number(f.quantity) || 0), Number.NEGATIVE_INFINITY);
  return Number.isFinite(q) ? Math.max(0, q) : 0;
}

async function getStockBulk(ids: number[], attrPorId: Record<number, number> = {}): Promise<Record<number, number>> {
  if (ids.length === 0) return {};
  try {
    const url = buildUrl("stock_availables", {
      display: "full",
      filters: { "filter[id_product]": `[${ids.join("|")}]` },
    });
    const res = await psFetchOrThrow(url);
    if (!res.ok) return {};
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data?.stock_availables) ? data.stock_availables : [];
    const porProducto = new Map<number, any[]>();
    for (const row of list) {
      const pid = Number(row?.id_product ?? 0);
      if (!pid) continue;
      porProducto.set(pid, [...(porProducto.get(pid) ?? []), row]);
    }
    const out: Record<number, number> = {};
    for (const [pid, filas] of Array.from(porProducto)) out[pid] = unidadesDisponibles(filas, attrPorId[pid] ?? 0);
    return out;
  } catch {
    return {};
  }
}

export async function getStock(idProduct: number, idProductAttribute = 0): Promise<StockInfo> {
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

  const res = await psFetchOrThrow(url);
  if (!res.ok) throw new Error(`stock_availables respondio ${res.status}`);

  const data = await res.json().catch(() => ({}));
  const list = Array.isArray(data?.stock_availables) ? data.stock_availables : [];
  const quantity = unidadesDisponibles(list, idProductAttribute);

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

    const getUrl = `${BASE_URL}/api/carts/${cartId}?ws_key=${API_KEY}&output_format=JSON`;
    const getRes = await fetch(getUrl, { headers: PS_HEADERS, cache: "no-store" });
    const cartData = getRes.ok ? await getRes.json().catch(() => ({})) : {};
    const cartObj = cartData?.cart ?? {};

    let idAddressDelivery = Number(cartObj?.id_address_delivery ?? 0);
    const idShopGroup = Number(cartObj?.id_shop_group ?? 1);
    const idShop = Number(cartObj?.id_shop ?? 1);
    const cartSecureKey = String(cartObj?.secure_key ?? customerSecureKey ?? "").trim();

    if (idAddressDelivery === 0) {
      idAddressDelivery = await getValidAddressId(customerId);
    }

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
      console.log("[psCreateCart] carrito", cartId, "listo con", items.length, "producto(s), addr", idAddressDelivery);
    }

    const tokenCart = cartSecureKey || customerSecureKey?.trim() || "";
    const cartUrl = tokenCart
      ? `${STORE_URL}/index.php?controller=cart&action=show&recover_cart=${cartId}&token_cart=${tokenCart}`
      : CART_PAGE_URL;

    return { cartId, cartUrl, itemAddUrls };
  } catch (err) {
    console.error("[psCreateCart] Exception:", err);
    return { cartId: "", cartUrl: CART_PAGE_URL, itemAddUrls };
  }
}

export { CART_PAGE_URL };

/**
 * Unidades de un producto en el carrito más reciente del cliente (Webservice).
 * Sirve para COMPROBAR un añadido hecho fuera de la tienda (la ventanita de
 * addchat.php): se mira antes y después, y solo si sube se confirma
 * "✓ Añadido" en el chat. null = no se ha podido comprobar.
 */
export async function psCantidadEnCarrito(customerId: number, idProduct: number, idProductAttribute = 0): Promise<number | null> {
  if (DEMO_MODE || !customerId || !idProduct) return null;
  try {
    const url = buildUrl("carts", {
      display: "full",
      limit: "1",
      filters: { "filter[id_customer]": `[${customerId}]`, sort: "[id_DESC]" },
    });
    const res = await psFetch(url, 8000);
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const cart = data?.carts?.[0];
    if (!cart) return 0;
    const filas: Array<{ id_product?: string | number; id_product_attribute?: string | number; quantity?: string | number }> =
      cart?.associations?.cart_rows ?? [];
    return filas
      .filter((r) => Number(r.id_product) === idProduct && Number(r.id_product_attribute ?? 0) === Number(idProductAttribute ?? 0))
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  } catch {
    return null;
  }
}

export interface LineaCarritoTienda {
  id_product: number;
  id_product_attribute: number;
  qty: number;
  name: string;
  reference: string;
  price: number;
}

/**
 * Lo que el cliente tiene AHORA en su carrito de la tienda (el más reciente),
 * con nombre y precio de su cuenta: alimenta el resumen del carrito del chat
 * cuando el chat no está dentro de la tienda. null = no se puede leer.
 */
export async function psResumenCarrito(customerId: number, groupId?: number): Promise<LineaCarritoTienda[] | null> {
  if (DEMO_MODE || !customerId) return null;
  try {
    const url = buildUrl("carts", {
      display: "full",
      limit: "1",
      filters: { "filter[id_customer]": `[${customerId}]`, sort: "[id_DESC]" },
    });
    const res = await psFetch(url, 8000);
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const filas: Array<{ id_product?: string | number; id_product_attribute?: string | number; quantity?: string | number }> =
      data?.carts?.[0]?.associations?.cart_rows ?? [];
    const lineas = filas
      .map((r) => ({ id: Number(r.id_product), attr: Number(r.id_product_attribute ?? 0), qty: Number(r.quantity) || 0 }))
      .filter((r) => r.id > 0 && r.qty > 0)
      .slice(0, 20);
    if (!lineas.length) return [];
    const productos = await hydrateProducts(lineas.map((l) => ({ id: l.id, name: "" })), groupId, customerId, lineas.length);
    return lineas.map((l) => {
      const p = productos.find((x) => x.id === l.id);
      return {
        id_product: l.id,
        id_product_attribute: l.attr,
        qty: l.qty,
        name: p?.name ?? `Producto ${l.id}`,
        reference: p?.reference ?? "",
        price: p?.price ?? 0,
      };
    });
  } catch {
    return null;
  }
}

// ─── Auditoría de precio y stock (solo diagnóstico, /api/auditoria) ─────────
// Recorre un tramo del catálogo y, para cada producto y grupo de cliente,
// compara el precio que enseña el bot con el que aplica la tienda (sus filas
// de specific_prices) y el que saldría de la tabla fija precios.json; y el
// stock que enseña el bot con la fila de stock de la ficha.
export async function auditarPrecioYStock(desde: number, cuantos: number, grupos: number[]) {
  assertConfig();
  const url = buildUrl("products", {
    display: "[id,name,reference,price,id_supplier,active,quantity]",
    limit: `${desde},${cuantos}`,
  });
  const res = await psFetchOrThrow(url, 20000);
  const data = await res.json().catch(() => ({}));
  const prods: any[] = Array.isArray(data?.products) ? data.products : [];
  const ids = prods.map((p) => Number(p.id));

  const [filasPrecio, stockRes, combRes] = await Promise.all([
    filasPrecioEspecifico(ids),
    psFetchOrThrow(buildUrl("stock_availables", { display: "full", filters: { "filter[id_product]": `[${ids.join("|")}]` } }), 20000),
    psFetchOrThrow(buildUrl("combinations", { display: "[id,id_product]", filters: { "filter[id_product]": `[${ids.join("|")}]` } }), 20000),
  ]);
  const stockData = await stockRes.json().catch(() => ({}));
  const combData = await combRes.json().catch(() => ({}));
  const filasStock = new Map<number, any[]>();
  for (const r of Array.isArray(stockData?.stock_availables) ? stockData.stock_availables : []) {
    const pid = Number(r.id_product);
    filasStock.set(pid, [...(filasStock.get(pid) ?? []), r]);
  }
  const combos = new Map<number, number[]>();
  for (const c of Array.isArray(combData?.combinations) ? combData.combinations : []) {
    const pid = Number(c.id_product);
    combos.set(pid, [...(combos.get(pid) ?? []), Number(c.id)]);
  }

  const filas: any[] = [];
  for (const p of prods) {
    const id = Number(p.id);
    const base = Number.parseFloat(p.price ?? "0") || 0;
    const sp = [...(filasPrecio?.get(id) ?? []), ...(filasPrecio?.get(0) ?? [])];
    const comb = combos.get(id) ?? [];
    const st = filasStock.get(id) ?? [];
    const stockAntes = st.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
    const stockAhora = unidadesDisponibles(st, comb[0] ?? 0);
    const supplier = await getSupplierName(Number(p.id_supplier ?? 0));
    const porGrupo: Record<string, any> = {};
    for (const g of grupos) {
      const tienda = precioSegunTienda(sp, base, g);
      const pctTabla = matchDescuento(supplier, await getGroupName(g));
      const tabla = pctTabla === null ? null : Math.round(base * (1 - pctTabla / 100) * 100) / 100;
      porGrupo[g] = { tienda: tienda.price, regla: tienda.fila?.id_specific_price_rule ?? null, tabla };
    }
    filas.push({
      id, name: plainText(p.name), ref: plainText(p.reference), activo: p.active, base, supplier,
      combinaciones: comb.length, stockFilas: st.map((x) => [Number(x.id_product_attribute), Number(x.quantity)]),
      stockAntes, stockAhora, quantityProducto: Number(p.quantity ?? NaN), filasPrecio: sp.length,
      porGrupo,
    });
  }
  return { desde, cuantos, devueltos: prods.length, filasPrecioOk: filasPrecio !== null, filas };
}
