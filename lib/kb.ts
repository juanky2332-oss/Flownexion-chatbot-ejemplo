import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Row formats (arrays for compactness):
//   eq row  → [skf, fag_ina, nsk, ref_ntn, marca, ean]
//   ap row  → [ref, text]  (text = desc | gama | aplicaciones combined)
//   precio  → { regla, condicion, pct }

type EqRow = [string, string, string, string, string, string];
type ApRow = [string, string];
interface PrecioRow { regla: string; condicion: string; pct: number; }

function norm(s: unknown): string {
  return String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

// El cliente pregunta en lenguaje natural y a menudo con la marca pegada a
// la referencia ("el 3309 A de SKF", "SKF 3309A") — pero las columnas del
// KB solo contienen el código puro ("3309A", nunca "SKF 3309A" ni frases).
// Bug real detectado en producción: "¿me dices qué equivalencia hay para
// el 3309 A de SKF en NTN o SNR?" devolvía 0 resultados aunque el KB tiene
// ambas filas — el ruido de idioma se colaba en la comparación y rompía
// tanto el match exacto como el parcial. Se extraen candidatos de
// referencia real (tokens con dígitos, más su fusión con un sufijo corto
// pegado como "3309"+"A") en vez de depender de que el modelo mande la
// query ya limpia.
const QUERY_NOISE =
  /\b(SKF|FAG|INA|NSK|TIMKEN|KOYO|NACHI|ZKL|NKE|NTN|SNR|MARCA|REFERENCIA|REF|RODAMIENTO|RODAMIENTOS|EQUIVALENCIA|EQUIVALENTE|DE|DEL|EN|EL|LA|UN|UNA|Y|O|QUE|HAY|PARA|PUEDES|DECIRME|DIME|DIGA|DIGAME|CUAL|CUALES|TIENES|TIENE|TENEIS)\b/gi;

function extractQueryCandidates(rawQuery: string): string[] {
  const cleaned = String(rawQuery ?? "").replace(QUERY_NOISE, " ");
  // Recortar signos de puntuación pegados en los bordes de cada token
  // ("6205?", "¿6205", "(6205)", "6205."): una pregunta que TERMINA en la
  // referencia deja el "?" pegado y rompía el match exacto y el de prefijo.
  // Solo en los bordes — el interior se conserva porque hay referencias
  // reales con "-", "/" y "." dentro (UC205-100D1, 8Q-K95X102X20.8X3).
  const rawTokens = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/^[^0-9A-Za-z]+|[^0-9A-Za-z]+$/g, ""))
    .filter(Boolean);
  const candidates = new Set<string>();

  const joined = norm(cleaned);
  if (joined) candidates.add(joined);

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = norm(rawTokens[i]);
    if (!tok || !/\d/.test(tok)) continue;
    candidates.add(tok);
    // Fusión encadenada de sufijos cortos pegados a la referencia base:
    // "6205 ZZ C3" → "6205ZZ" y también "6205ZZC3" (los sufijos de
    // rodamiento van a menudo en tokens separados y hay más de uno).
    let acc = tok;
    for (let j = i + 1; j < rawTokens.length; j++) {
      const next = norm(rawTokens[j]);
      if (!next || next.length > 4) break;
      acc += next;
      candidates.add(acc);
    }
  }

  // Candidatos más específicos (más largos) primero.
  return [...candidates].filter((c) => c.length >= 3).sort((a, b) => b.length - a.length);
}

// Lectores del KB con la ruta ESCRITA LITERALMENTE en cada readFileSync.
//
// No es verbosidad gratuita: el rastreador de ficheros de Next decide que
// incluir en la funcion serverless analizando el codigo de forma estatica, y
// solo sabe seguir rutas literales. Mientras la lectura se hacia con
// readFileSync(join(process.cwd(), rel)) -con "rel" recibido como argumento-
// NINGUN JSON del KB se empaquetaba en el despliegue: readFileSync fallaba en
// produccion, el catch devolvia [] y el bot contestaba "no tengo informacion
// tecnica" teniendo el dato delante. En local funcionaba siempre, porque ahi
// los ficheros estan en disco. Comprobado el 2026-07-27: de 36 ficheros de
// data/kb solo viajaba glosario.json, justo el unico que ya se leia con una
// ruta literal.
//
// Este mapa se genera desde el contenido real de data/kb. Si se anaden
// ficheros nuevos hay que anadirlos aqui, y verificar el despliegue mirando
// .next/server/app/api/chat/route.js.nft.json (debe listarlos todos).
const KB_READERS: Record<string, () => string> = {
  "data/kb/ap-1.json": () => readFileSync(join(process.cwd(), "data/kb/ap-1.json"), "utf-8"),
  "data/kb/ap-10.json": () => readFileSync(join(process.cwd(), "data/kb/ap-10.json"), "utf-8"),
  "data/kb/ap-2.json": () => readFileSync(join(process.cwd(), "data/kb/ap-2.json"), "utf-8"),
  "data/kb/ap-3.json": () => readFileSync(join(process.cwd(), "data/kb/ap-3.json"), "utf-8"),
  "data/kb/ap-4.json": () => readFileSync(join(process.cwd(), "data/kb/ap-4.json"), "utf-8"),
  "data/kb/ap-5.json": () => readFileSync(join(process.cwd(), "data/kb/ap-5.json"), "utf-8"),
  "data/kb/ap-6.json": () => readFileSync(join(process.cwd(), "data/kb/ap-6.json"), "utf-8"),
  "data/kb/ap-7.json": () => readFileSync(join(process.cwd(), "data/kb/ap-7.json"), "utf-8"),
  "data/kb/ap-8.json": () => readFileSync(join(process.cwd(), "data/kb/ap-8.json"), "utf-8"),
  "data/kb/ap-9.json": () => readFileSync(join(process.cwd(), "data/kb/ap-9.json"), "utf-8"),
  "data/kb/belts-1.json": () => readFileSync(join(process.cwd(), "data/kb/belts-1.json"), "utf-8"),
  "data/kb/belts-2.json": () => readFileSync(join(process.cwd(), "data/kb/belts-2.json"), "utf-8"),
  "data/kb/belts-3.json": () => readFileSync(join(process.cwd(), "data/kb/belts-3.json"), "utf-8"),
  "data/kb/belts-4.json": () => readFileSync(join(process.cwd(), "data/kb/belts-4.json"), "utf-8"),
  "data/kb/belts-5.json": () => readFileSync(join(process.cwd(), "data/kb/belts-5.json"), "utf-8"),
  "data/kb/belts-6.json": () => readFileSync(join(process.cwd(), "data/kb/belts-6.json"), "utf-8"),
  "data/kb/belts-7.json": () => readFileSync(join(process.cwd(), "data/kb/belts-7.json"), "utf-8"),
  "data/kb/belts-8.json": () => readFileSync(join(process.cwd(), "data/kb/belts-8.json"), "utf-8"),
  "data/kb/belts-perfiles.json": () => readFileSync(join(process.cwd(), "data/kb/belts-perfiles.json"), "utf-8"),
  "data/kb/eq-1.json": () => readFileSync(join(process.cwd(), "data/kb/eq-1.json"), "utf-8"),
  "data/kb/eq-2.json": () => readFileSync(join(process.cwd(), "data/kb/eq-2.json"), "utf-8"),
  "data/kb/eq-3.json": () => readFileSync(join(process.cwd(), "data/kb/eq-3.json"), "utf-8"),
  "data/kb/glosario.json": () => readFileSync(join(process.cwd(), "data/kb/glosario.json"), "utf-8"),
  "data/kb/precios.json": () => readFileSync(join(process.cwd(), "data/kb/precios.json"), "utf-8"),
  "data/kb/tech-1.json": () => readFileSync(join(process.cwd(), "data/kb/tech-1.json"), "utf-8"),
  "data/kb/tech-10.json": () => readFileSync(join(process.cwd(), "data/kb/tech-10.json"), "utf-8"),
  "data/kb/tech-11.json": () => readFileSync(join(process.cwd(), "data/kb/tech-11.json"), "utf-8"),
  "data/kb/tech-12.json": () => readFileSync(join(process.cwd(), "data/kb/tech-12.json"), "utf-8"),
  "data/kb/tech-2.json": () => readFileSync(join(process.cwd(), "data/kb/tech-2.json"), "utf-8"),
  "data/kb/tech-3.json": () => readFileSync(join(process.cwd(), "data/kb/tech-3.json"), "utf-8"),
  "data/kb/tech-4.json": () => readFileSync(join(process.cwd(), "data/kb/tech-4.json"), "utf-8"),
  "data/kb/tech-5.json": () => readFileSync(join(process.cwd(), "data/kb/tech-5.json"), "utf-8"),
  "data/kb/tech-6.json": () => readFileSync(join(process.cwd(), "data/kb/tech-6.json"), "utf-8"),
  "data/kb/tech-7.json": () => readFileSync(join(process.cwd(), "data/kb/tech-7.json"), "utf-8"),
  "data/kb/tech-8.json": () => readFileSync(join(process.cwd(), "data/kb/tech-8.json"), "utf-8"),
  "data/kb/tech-9.json": () => readFileSync(join(process.cwd(), "data/kb/tech-9.json"), "utf-8"),
};

function loadJson<T>(rel: string): T[] {
  const leer = KB_READERS[rel];
  if (!leer) return [];
  try {
    return JSON.parse(leer()) as T[];
  } catch {
    return [];
  }
}

// ── Lazy caches ──
let _eq: EqRow[] | null = null;
let _ap: ApRow[] | null = null;
let _pr: PrecioRow[] | null = null;

function loadEq(): EqRow[] {
  if (_eq !== null) return _eq;
  _eq = [
    ...loadJson<EqRow>("data/kb/eq-1.json"),
    ...loadJson<EqRow>("data/kb/eq-2.json"),
    ...loadJson<EqRow>("data/kb/eq-3.json"),
  ];
  return _eq;
}

function loadAp(): ApRow[] {
  if (_ap !== null) return _ap;
  _ap = [];
  for (let i = 1; i <= 10; i++) {
    _ap.push(...loadJson<ApRow>(`data/kb/ap-${i}.json`));
  }
  return _ap;
}

function loadPrecios(): PrecioRow[] {
  if (_pr !== null) return _pr;
  _pr = loadJson<PrecioRow>("data/kb/precios.json");
  return _pr;
}

// ── Public API ──

/**
 * Busca TODAS las equivalencias NTN/SNR de una referencia de marca externa,
 * agotando el documento completo (las 3 fuentes eq-*.json) en vez de
 * pararse en la primera fila que encaja. Una misma referencia externa
 * (p.ej. SKF 3309A) puede tener una fila de equivalencia en NTN y otra
 * fila distinta en SNR — hay que devolver ambas, no solo la primera que
 * aparezca en el fichero.
 *
 * 1ª pasada: coincidencia EXACTA del campo normalizado (evita que una
 * búsqueda de "3309A" devuelva primero variantes tipo "3309A/C3" o
 * "3309ATN9" y se coma el hueco antes de llegar a la fila exacta de la
 * otra marca — ese era el bug real: "includes" + límite de 3 resultados
 * dejaba fuera la equivalencia NTN cuando la SNR (u otra variante) salía
 * antes en el fichero).
 * 2ª pasada (solo si la exacta no encontró nada): coincidencia parcial,
 * para no dejar al cliente sin respuesta si no dio la referencia exacta.
 */
type EqMatch = { ref_buscada: string; ref_ntn_snr: string; marca: string };

function dedupeEq(rows: EqMatch[]): EqMatch[] {
  const seen = new Set<string>();
  const out: EqMatch[] = [];
  for (const r of rows) {
    const key = `${norm(r.marca)}::${norm(r.ref_ntn_snr)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// Prioridad de marca acordada con el cliente: NTN antes que SNR.
function byMarcaPriority(a: { marca: string }, b: { marca: string }): number {
  return norm(a.marca) === "NTN" ? -1 : norm(b.marca) === "NTN" ? 1 : 0;
}

function matchEqAgainst(q: string, originalQuery: string): { exact: EqMatch[]; partial: EqMatch[] } {
  const exact: EqMatch[] = [];
  const partial: EqMatch[] = [];
  for (const row of loadEq()) {
    const [skf, fag, nsk, ref, marca] = row;
    if (!ref) continue;
    const codes = [skf, fag, nsk].filter(Boolean).map(norm);
    if (codes.some((c) => c === q)) {
      exact.push({ ref_buscada: originalQuery, ref_ntn_snr: ref, marca });
    } else if (codes.some((c) => c.includes(q))) {
      partial.push({ ref_buscada: originalQuery, ref_ntn_snr: ref, marca });
    }
  }
  return { exact, partial };
}

/**
 * Cruce interno NTN↔SNR: el cliente da directamente una referencia NTN o
 * SNR y quiere la gemela de la otra marca. El documento no cruza NTN↔SNR
 * en una misma fila, pero dos filas que comparten el mismo código externo
 * (SKF/FAG/NSK) son la misma pieza en ambas marcas — se localizan las
 * filas cuya columna ref coincide con el candidato y se devuelven todas
 * las filas hermanas (incluida la propia, para que la respuesta muestre
 * ambas referencias juntas).
 */
function matchSiblings(candidates: string[], originalQuery: string): EqMatch[] {
  for (const c of candidates) {
    const own = loadEq().filter((row) => norm(row[3]) === c);
    if (!own.length) continue;
    const extCodes = new Set<string>();
    for (const row of own) {
      for (const code of [row[0], row[1], row[2]]) {
        if (code) extCodes.add(norm(code));
      }
    }
    const out: EqMatch[] = own.map((row) => ({
      ref_buscada: originalQuery,
      ref_ntn_snr: row[3],
      marca: row[4],
    }));
    if (extCodes.size) {
      for (const row of loadEq()) {
        const codes = [row[0], row[1], row[2]].filter(Boolean).map(norm);
        if (codes.some((x) => extCodes.has(x))) {
          out.push({ ref_buscada: originalQuery, ref_ntn_snr: row[3], marca: row[4] });
        }
      }
    }
    return dedupeEq(out).sort(byMarcaPriority);
  }
  return [];
}

/**
 * Resolución de referencia BASE para consultas con SOLO el número, sin
 * sufijo ("3309" en vez de "3309A"). Bug real reproducido en producción
 * (2026-07-26): el cliente escribió "¿qué equivalencia hay para el 3309 de
 * SKF en NTN o SNR?" y, al no haber coincidencia exacta de "3309" (el KB
 * guarda "3309A", "3309ATN9", "3309ANR", "3309A-2Z"...), se caía al match
 * por substring, que devolvía 8 variantes ruidosas (serie 5309, 63309,
 * /C3...) con la equivalencia base correcta (SNR 3309A + NTN 3309S)
 * enterrada al final — el modelo no la distinguía y solo daba la SNR,
 * omitiendo el NTN.
 *
 * Estrategia: entre todos los códigos externos que EMPIEZAN por ese número,
 * el/los más corto(s) son la variante base (SKF designa el 3309 básico como
 * "3309A"; el equivalente NSK "3309J" también tiene esa longitud mínima y
 * apunta a la misma pieza). Se resuelve por EXACTA sobre esa(s) base(s) y se
 * agotan sus equivalencias en ambas marcas, sin el ruido de las variantes
 * con sufijo. Solo se dispara con candidatos puramente numéricos: si el
 * cliente ya dio un sufijo, la pasada exacta lo cubrió antes.
 */
function matchByBaseRef(candidates: string[], originalQuery: string): EqMatch[] {
  for (const q of candidates) {
    if (!/^\d+$/.test(q)) continue;
    let minLen = Infinity;
    const starting = new Set<string>();
    for (const row of loadEq()) {
      for (const code of [row[0], row[1], row[2]]) {
        const c = norm(code);
        if (c.length > q.length && c.startsWith(q)) {
          starting.add(c);
          if (c.length < minLen) minLen = c.length;
        }
      }
    }
    if (!starting.size) continue;
    const baseCodes = [...starting].filter((c) => c.length === minLen);
    const out: EqMatch[] = [];
    for (const bc of baseCodes) {
      out.push(...matchEqAgainst(bc, originalQuery).exact);
    }
    if (out.length) return dedupeEq(out).sort(byMarcaPriority);
  }
  return [];
}

export function findEquivalence(query: string): EqMatch[] {
  const candidates = extractQueryCandidates(query);
  if (!candidates.length) return [];

  // 1ª pasada — coincidencia EXACTA: prueba cada candidato (más específico
  // primero) y se queda con el primero que dé resultado, para no mezclar
  // el acierto exacto de una referencia real con el ruido de otro candidato
  // más corto y menos específico.
  for (const c of candidates) {
    const { exact } = matchEqAgainst(c, query);
    if (exact.length) return dedupeEq(exact).sort(byMarcaPriority);
  }

  // 2ª pasada — la referencia dada es directamente NTN/SNR: cruce interno
  // a la marca gemela vía códigos externos compartidos.
  const siblings = matchSiblings(candidates, query);
  if (siblings.length) return siblings;

  // 3ª pasada — el cliente dio solo el número base sin sufijo ("3309"):
  // resolver a la referencia base y sus equivalencias en ambas marcas,
  // ANTES de caer al parcial ruidoso.
  const baseRef = matchByBaseRef(candidates, query);
  if (baseRef.length) return baseRef;

  // 4ª pasada — sin exacta en ningún candidato: parcial, acotada para no
  // devolver ruido, probando también cada candidato de más a menos específico.
  for (const c of candidates) {
    const { partial } = matchEqAgainst(c, query);
    if (partial.length) return dedupeEq(partial).sort(byMarcaPriority).slice(0, 8);
  }

  return [];
}

/**
 * Variante SOLO exacta de findEquivalence, pensada para el pre-chequeo
 * automático de agent.ts (ver AUTODETECCIÓN DE EQUIVALENCIA): se ejecuta
 * sobre el mensaje entero del cliente, en bruto, ANTES de llamar al modelo
 * — no puede depender del fallback parcial (que ya es "acotado pero
 * ruidoso" a propósito para cuando el cliente pide explícitamente una
 * equivalencia) porque aquí NO sabemos todavía si el mensaje es realmente
 * sobre equivalencias; solo un acierto exacto e inequívoco es lo bastante
 * fiable para inyectarse como dato verificado sin que el modelo lo pida.
 */
export function findExactEquivalence(query: string): EqMatch[] {
  const candidates = extractQueryCandidates(query);
  for (const c of candidates) {
    const { exact } = matchEqAgainst(c, query);
    if (exact.length) return dedupeEq(exact).sort(byMarcaPriority);
  }
  // El cruce interno NTN↔SNR también es exacto e inequívoco (coincidencia
  // exacta de la columna ref + códigos externos compartidos), así que vale
  // igualmente como dato verificado para la pre-inyección.
  const siblings = matchSiblings(candidates, query);
  if (siblings.length) return siblings;

  // Referencia base sin sufijo ("3309" → base "3309A"): la resolución acaba
  // en coincidencia EXACTA sobre el código base, así que sigue siendo dato
  // verificado apto para pre-inyectar sin que el modelo lo pida.
  return matchByBaseRef(candidates, query);
}

// ── Ficha técnica local (Informacion tecnica NTN.xlsx → tech-*.json) ──

type TechRow = [string, string, string, Record<string, string | number>];

// Claves cortas del JSON compacto → etiqueta legible que se le da al modelo.
// Debe ir en sincronía con TECH_COLS de scripts/build-kb.ts.
const TECH_LABELS: Record<string, string> = {
  clase: "Clase de producto",
  clase2: "Tipo",
  di: "Diámetro interior dØ (mm)",
  de: "Diámetro exterior DØ (mm)",
  an: "Ancho B (mm)",
  peso: "Peso (g)",
  anext: "Ancho del anillo exterior (mm)",
  ang: "Ángulo de contacto (°)",
  sist: "Sistema de medida",
  tol: "Tolerancia",
  toldesc: "Descripción de la tolerancia",
  junta: "Junta",
  juntadesc: "Descripción de la junta",
  matani: "Material de los anillos",
  serie: "Serie",
  matjaula: "Material de la jaula",
  aguj: "Tipo de agujero",
  brida: "Brida en anillo exterior",
  anillo: "Anillo elástico en anillo exterior",
  hileras: "Número de hileras",
  tipoej: "Tipo de ejecución (L=libre, F=fijo)",
  aloj: "Diseño del alojamiento",
  nfij: "Número de agujeros de fijación",
  fijeje: "Tipo de fijación al eje",
  reengr: "Reengrasable",
  laloj: "Longitud del alojamiento (mm)",
  haloj: "Altura del alojamiento (mm)",
  waloj: "Anchura del alojamiento (mm)",
  dmont: "Distancia de los agujeros de montaje (mm)",
  dbase: "Distancia de la base de montaje al eje central (mm)",
  mataloj: "Material del alojamiento",
  rosca: "Rosca",
  cest: "Capacidad de carga estática (kN)",
  cdin: "Capacidad de carga dinámica (kN)",
  vref: "Velocidad de referencia (rpm)",
  vlim: "Velocidad límite (rpm)",
  iso: "Criterio dimensional",
};

interface TechEntry {
  marca: string;
  ref: string;
  refNorm: string;
  ean: string;
  campos: Record<string, string | number>;
}

let _tech: TechEntry[] | null = null;

function loadTech(): TechEntry[] {
  if (_tech !== null) return _tech;
  _tech = [];
  for (let i = 1; i <= 20; i++) {
    const chunk = loadJson<TechRow>(`data/kb/tech-${i}.json`);
    if (!chunk.length) break;
    for (const [marca, ref, ean, campos] of chunk) {
      _tech.push({ marca, ref, refNorm: norm(ref), ean, campos });
    }
  }
  return _tech;
}

export interface TechInfo {
  marca: string;
  referencia: string;
  ean: string;
  datos: Record<string, string | number>;
}

function labelTech(row: TechEntry): TechInfo {
  const datos: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(row.campos)) {
    datos[TECH_LABELS[k] ?? k] = v;
  }
  return { marca: row.marca, referencia: row.ref, ean: row.ean, datos };
}

/**
 * Ficha técnica completa de una referencia desde el documento oficial del
 * cliente (Informacion tecnica NTN.xlsx). Mismo tratamiento de query que
 * findEquivalence: el modelo manda lenguaje natural con ruido, así que se
 * extraen candidatos de referencia y se prueban de más a menos específico.
 * Exacta primero; si no hay, por prefijo (el cliente suele omitir sufijos:
 * "6205" debe encontrar 6205ZZ, 6205LLU...) acotada para no inundar.
 */
export function findTechnicalInfo(query: string): TechInfo[] {
  const candidates = extractQueryCandidates(query);
  if (!candidates.length) return [];
  const data = loadTech();

  for (const c of candidates) {
    const exact = data.filter((r) => r.refNorm === c);
    if (exact.length) return exact.slice(0, 4).map(labelTech);
  }
  for (const c of candidates) {
    if (c.length < 4) continue;
    const pref = data.filter((r) => r.refNorm.startsWith(c));
    if (pref.length) return pref.slice(0, 5).map(labelTech);
  }
  return [];
}

export function findApplications(query: string): { referencia: string; info: string }[] {
  const q = norm(query);
  if (!q || q.length < 3) return [];
  const data = loadAp();

  // Exact reference match first
  const exact = data.filter(([ref]) => norm(ref) === q);
  if (exact.length) return exact.map(([ref, info]) => ({ referencia: ref, info }));

  // Keyword scoring in the combined text field
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];

  const scored = data
    .map((row) => {
      const hay = row[1].toLowerCase();
      const hits = words.filter((w) => hay.includes(w)).length;
      return { row, hits };
    })
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3);

  return scored.map(({ row: [ref, info] }) => ({ referencia: ref, info }));
}

export function getPrecios(): PrecioRow[] {
  return loadPrecios();
}

// ── Glosario técnico (data/kb/glosario.json) ─────────────────────────────────
// Fuente ÚNICA de verdad para conceptos técnicos (sellado, juego, jaulas,
// precisión, sufijos, correas). Nació de un fallo real reportado por el
// cliente: el bot explicaba mal la diferencia entre dos tipos de sellado
// porque la única referencia que tenía era una línea del prompt que agrupaba
// "LLU / 2RS / 2RZ" como si los tres fuesen juntas de contacto — y el 2RZ es
// SIN contacto. Sacar estas explicaciones a un fichero de datos editable
// permite corregirlas sin tocar código (ver docs/MANTENIMIENTO-KB.md).

interface GlossaryEntry {
  id: string;
  categoria: string;
  prioridad?: number;
  terminos: string[];
  titulo: string;
  texto: string;
  fuente?: string;
}

let _glo: GlossaryEntry[] | null = null;

function loadGlossary(): GlossaryEntry[] {
  if (_glo !== null) return _glo;
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "data/kb/glosario.json"), "utf-8")
    ) as { entradas?: GlossaryEntry[] };
    _glo = Array.isArray(raw.entradas) ? raw.entradas : [];
  } catch {
    _glo = [];
  }
  return _glo;
}

/** Mayúsculas sin acentos, para comparar términos con lo que escribe el cliente. */
function normTerm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

export interface GlossaryHit {
  titulo: string;
  explicacion: string;
  fuente?: string;
}

/**
 * Busca explicaciones de concepto en el glosario.
 *
 * Los términos de una sola palabra se comparan como TOKEN COMPLETO, nunca por
 * substring: si no, "Z" (deflector) dispararía con cualquier palabra que
 * contenga una z y "E" con media frase. Los términos con espacios ("tipos de
 * sellado", "sin contacto") sí se buscan como substring, porque ahí la
 * secuencia completa ya es lo bastante específica.
 *
 * Se ordena por número de términos acertados y, a igualdad, por la prioridad
 * declarada en el fichero — así una pregunta genérica de "tipos de sellado"
 * saca primero la entrada comparativa y no una de un sufijo suelto.
 */
export function findGlossary(query: string, limit = 3): GlossaryHit[] {
  const qNorm = normTerm(query);
  if (!qNorm) return [];
  const tokens = new Set(
    qNorm
      .split(/[^0-9A-Z/]+/)
      .map((t) => t.replace(/^[^0-9A-Z]+|[^0-9A-Z]+$/g, ""))
      .filter(Boolean)
  );

  const scored = loadGlossary()
    .map((e) => {
      let hits = 0;
      for (const term of e.terminos ?? []) {
        const t = normTerm(term);
        if (!t) continue;
        if (t.includes(" ") ? qNorm.includes(t) : tokens.has(t)) hits++;
      }
      return { e, hits };
    })
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits || (b.e.prioridad ?? 0) - (a.e.prioridad ?? 0));

  return scored.slice(0, limit).map(({ e }) => ({
    titulo: e.titulo,
    explicacion: e.texto,
    fuente: e.fuente,
  }));
}

// Disparadores de la pre-inyección automática del glosario (ver agent.ts).
// Viven aquí, junto al glosario, para poder probarlos con el código real en
// vez de con una copia del regex en el test.
//
// Se exige o bien una fórmula de pregunta conceptual, o bien un sufijo/término
// técnico explícito. Sin ese filtro, un pedido normal ("el 6205 ZZ, 10
// unidades") arrastraría la explicación entera del glosario a una conversación
// que solo quería comprar.
const CONCEPT_QUESTION =
  /\b(DIFERENCIA\w*|DISTIN\w+|QUE\s+SIGNIFICA|QUE\s+ES|QUE\s+SON|PARA\s+QUE\s+SIRVE|CUAL\s+ES\s+MEJOR|CUANDO\s+SE\s+USA|CUANDO\s+USAR|EXPLIC\w+|SIGNIFICADO|VENTAJA\w*|MEJOR\s+PARA|SE\s+DIFERENCIA\w*)\b/i;
const CONCEPT_TERM =
  /\b(SELLAD\w+|SELLO|SELLOS|JUNTA|JUNTAS|ESTANQU\w+|DEFLECTOR\w*|OBTURA\w+|JUEGO\s+RADIAL|JUEGO\s+INTERNO|HOLGURA|JAULA|JAULAS|PRECISION|SUFIJO|SUFIJOS|2RS1?|2RZ|2Z|2ZR|ZZ|LLU|LLB|LLH|DDU|RSR|VV|C[2-5]|CN|P[456]|TVH|TN9|T2X|G15)\b/i;

/**
 * Glosario a pre-inyectar para un mensaje de cliente, o [] si el mensaje no
 * es una consulta de concepto. Se ejecuta en código sobre el mensaje en bruto:
 * no depende de que el modelo decida llamar a explain_technical_term.
 */
export function findGlossaryForMessage(message: string): GlossaryHit[] {
  const m = String(message ?? "");
  const plain = m
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // "qué es" → "que es", para que el regex acierte
  if (!CONCEPT_QUESTION.test(plain) && !CONCEPT_TERM.test(plain)) return [];
  return findGlossary(m, 3);
}

// ── Correas Continental (data/kb/belts-*.json) ───────────────────────────────
// Fila: [nombre, descripcion, pesoKg, perfil, gama, estado, li, ld, codigo]
type BeltRow = [string, string, number, string, string, string, number | null, number | null, string];

interface BeltEntry {
  nombre: string;
  nombreNorm: string;
  codigo: string;
  codigoNorm: string;
  descripcion: string;
  descNorm: string;
  pesoKg: number;
  perfil: string;
  perfilTokens: string[];
  gama: string;
  estado: string;
  li: number | null;
  ld: number | null;
}

let _belts: BeltEntry[] | null = null;

function loadBelts(): BeltEntry[] {
  if (_belts !== null) return _belts;
  _belts = [];
  for (let i = 1; i <= 20; i++) {
    const chunk = loadJson<BeltRow>(`data/kb/belts-${i}.json`);
    if (!chunk.length) break;
    for (const [nombre, descripcion, pesoKg, perfil, gama, estado, li, ld, codigo] of chunk) {
      _belts.push({
        nombre,
        nombreNorm: beltNorm(nombre),
        codigo: codigo ?? "",
        codigoNorm: beltNorm(codigo ?? ""),
        descripcion,
        descNorm: beltNorm(descripcion),
        pesoKg,
        perfil,
        // "13/A" → ["13","A"] · "SPZ / 3V / 9N" → ["SPZ","3V","9N"]
        perfilTokens: perfil.split(/[/\s]+/).map((t) => norm(t)).filter(Boolean),
        gama,
        estado,
        li,
        ld,
      });
    }
  }
  return _belts;
}

export interface BeltInfo {
  nombre: string;
  tipo: string;
  perfil: string;
  descripcion: string;
  peso_g: number;
  disponibilidad_fabricante: string;
  longitud_interior_Li_mm?: number;
  longitud_primitiva_Ld_mm?: number;
}

function labelBelt(b: BeltEntry): BeltInfo {
  const out: BeltInfo = {
    nombre: b.nombre,
    tipo: b.gama,
    perfil: b.perfil,
    descripcion: b.descripcion,
    peso_g: Math.round(b.pesoKg * 1000),
    disponibilidad_fabricante: b.estado,
  };
  if (b.li !== null) out.longitud_interior_Li_mm = b.li;
  if (b.ld !== null) out.longitud_primitiva_Ld_mm = b.ld;
  return out;
}

/**
 * Palabras de relleno de una consulta de correa. Se quitan ANTES de extraer
 * los tokens, para que no contaminen la fusión perfil+longitud.
 */
const BELT_NOISE =
  /\b(CORREA|CORREAS|PERFIL|PERFILES|NECESITO|NECESITARIA|QUIERO|QUERIA|TENEIS|TIENES|TIENE|TENGO|HAY|DAME|DIME|BUSCO|BUSCAR|PONME|UNA|UNAS|UN|UNOS|EL|LA|LOS|LAS|DE|DEL|PARA|CON|POR|FAVOR|MM|MILIMETROS|TRAPECIAL|TRAPECIALES|TRAPEZOIDAL|TRAPEZOIDALES|DENTADA|DENTADAS|SINCRONA|SINCRONAS|ESTRECHA|ESTRECHAS|CLASICA|CLASICAS|CONTINENTAL|CONTI|MODELO|REFERENCIA|REF)\b/gi;

/** Normalización de designación de correa: mayúsculas, sin acentos ni separadores. */
function beltNorm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^0-9A-Z.]/g, "");
}

/**
 * Candidatos de designación a partir de lenguaje natural.
 *
 * No se reutiliza extractQueryCandidates (la de rodamientos) a propósito:
 * aquella solo genera candidatos a partir de tokens QUE CONTIENEN DÍGITOS, así
 * que un perfil puramente alfabético como la "A" de "correa A 1250" se
 * descartaba y nunca llegaba a fusionarse en "A1250". Resultado real del bug:
 * "correa A 1250" caía al match parcial por "1250" y devolvía una correa de
 * perfil Z cuya descripción contenía 1250 — perfil equivocado.
 */
function beltCandidates(query: string): { candidates: string[]; tokens: string[] } {
  const cleaned = String(query ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(BELT_NOISE, " ");

  const tokens = cleaned
    .split(/[^0-9A-Z.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);

  const candidates = new Set<string>();
  if (tokens.length) candidates.add(tokens.join(""));

  for (let i = 0; i < tokens.length; i++) {
    candidates.add(tokens[i]);
    // Fusión con los siguientes tokens: "A"+"1250" → "A1250";
    // "600"+"8M"+"30" → "6008M" y "6008M30".
    let acc = tokens[i];
    for (let j = i + 1; j < Math.min(i + 3, tokens.length); j++) {
      acc += tokens[j];
      candidates.add(acc);
    }
  }

  // Más específico (más largo) primero.
  return {
    candidates: [...candidates].filter((c) => c.length >= 2).sort((a, b) => b.length - a.length),
    tokens,
  };
}

/**
 * Busca una correa Continental por designación en lenguaje natural.
 *
 * El caso difícil, y el motivo de la pasada 3: en las trapeciales CLÁSICAS el
 * nombre del fabricante va en PULGADAS ("A49") mientras que el cliente español
 * pide siempre los milímetros ("una correa A 1250"). Los mm solo están en la
 * descripción, como Li y Ld, así que hay que cruzar perfil + longitud en mm
 * o esas referencias serían imposibles de encontrar por nombre.
 */
export function findBelt(query: string, limit = 6): BeltInfo[] {
  const { candidates, tokens } = beltCandidates(query);
  if (!candidates.length) return [];
  const data = loadBelts();

  // 1ª pasada — nombre o código de material exacto ("SPZ1600", "8PJ356").
  for (const c of candidates) {
    const exact = data.filter((b) => b.nombreNorm === c || b.codigoNorm === c);
    if (exact.length) return exact.slice(0, limit).map(labelBelt);
  }

  // 2ª pasada — perfil + longitud en mm ("A 1250" → perfil A, Li 1250).
  // Se acepta tanto la Li como la Ld porque el cliente no siempre sabe cuál
  // de las dos lleva grabada la correa que trae; devolver las dos lecturas es
  // lo correcto, y el prompt obliga al bot a preguntar cuál es la suya.
  //
  // El par (perfil, longitud) se saca de los TOKENS, no de la designación ya
  // fusionada: partir "A1250" con una expresión regular es ambiguo (el motor
  // la parte como perfil "A1" + longitud "250" y no encuentra nada), mientras
  // que los tokens ["A","1250"] no admiten más que una lectura.
  const pares: [string, number][] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = beltNorm(tokens[i]);
    // Token único ya pegado: "SPB2360", "AX19", "XPZ1250".
    const solo = tok.match(/^([A-Z]+)(\d{2,5})$/);
    if (solo) pares.push([solo[1], Number(solo[2])]);
    // Perfil y longitud en tokens separados: "A" + "1250".
    const sig = beltNorm(tokens[i + 1] ?? "");
    if (/^[A-Z]+$/.test(tok) && /^\d{2,5}$/.test(sig)) pares.push([tok, Number(sig)]);
  }
  for (const [perfil, largo] of pares) {
    const hit = data.filter(
      (b) => b.perfilTokens.includes(perfil) && (b.li === largo || b.ld === largo)
    );
    if (hit.length) return hit.slice(0, limit).map(labelBelt);
  }

  // 3ª pasada — TODOS los tokens presentes en nombre/código/descripción.
  // Es lo que rescata designaciones que el cliente escribe con separadores
  // distintos a los del fabricante ("600-8M-30" contra "600-H8M-30").
  if (tokens.length) {
    const norms = tokens.map((t) => beltNorm(t)).filter(Boolean);
    const hit = data.filter((b) => {
      const hay = `${b.nombreNorm} ${b.codigoNorm} ${b.descNorm}`;
      return norms.every((t) => hay.includes(t));
    });
    if (hit.length) {
      // El nombre más corto es la designación más específica que encaja.
      return hit
        .sort((a, b) => a.nombreNorm.length - b.nombreNorm.length)
        .slice(0, limit)
        .map(labelBelt);
    }
  }

  // 4ª pasada — parcial sobre nombre y descripción, acotada.
  for (const c of candidates) {
    if (c.length < 4) continue;
    const part = data.filter((b) => b.nombreNorm.includes(c) || b.descNorm.includes(c));
    if (part.length) return part.slice(0, limit).map(labelBelt);
  }

  return [];
}

/** Perfiles/gamas reales del catálogo Continental, para responder "¿qué perfiles tenéis?". */
export function getBeltProfiles(): string[] {
  return loadJson<string>("data/kb/belts-perfiles.json");
}

// Disparador de la pre-inyección automática de correas (ver agent.ts).
// Se exige una palabra inequívoca de correa: ni "6205" ni una referencia de
// rodamiento pueden activarlo. Los perfiles cortos y ambiguos (AX, PJ, PL…)
// se dejan fuera a propósito — si el cliente los usa, lo normal es que diga
// también "correa", y ese ancla ya los cubre.
const BELT_INTENT =
  /\b(CORREAS?|TRAPECIAL\w*|TRAPEZOIDAL\w*|POLY.?V|MULTIRIB|SYNCHRO\w*|SPZ|SPA|SPB|SPC|XPZ|XPA|XPB|XPC|HTD|STD|CTD|POLYFLAT|VARISPEED|TORQUE\s+TEAM)\b/i;

/**
 * Correas a pre-inyectar para un mensaje de cliente, o [] si el mensaje no va
 * de correas o no hay coincidencia.
 *
 * Mismo motivo que en equivalencias y glosario: probado contra el despliegue
 * real, el modelo unas veces llama a find_belt y otras responde "no la he
 * encontrado en el catálogo de Continental" sin haberla buscado — con la
 * correa existiendo en el KB. Resolviéndolo en código, sobre el mensaje en
 * bruto, la respuesta correcta deja de depender de esa decisión del modelo.
 */
export function findBeltForMessage(message: string): BeltInfo[] {
  const m = String(message ?? "");
  const plain = m.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!BELT_INTENT.test(plain)) return [];
  return findBelt(m, 4);
}

function normLoose(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quitar acentos
    .trim()
    .toUpperCase();
}

function codesEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  return !Number.isNaN(na) && !Number.isNaN(nb) && na === nb;
}

/**
 * Cruza el nombre real del proveedor de un producto y el nombre real del
 * grupo de cliente (ambos leídos en vivo de la Webservice de Prestashop)
 * contra las reglas de descuento de catálogo confirmadas por el cliente en
 * data/kb/precios.json. Acepta variantes de formato ("Grupo 01" o "01",
 * "Cliente GR" o "GR") para no depender de adivinar el valor exacto.
 * Devuelve null si no hay coincidencia — nunca inventa un descuento.
 */
export function matchDescuento(
  supplierName: string | null | undefined,
  groupName: string | null | undefined
): number | null {
  if (!supplierName || !groupName) return null;

  const supplierCode = normLoose(supplierName).replace(/^GRUPO\s+/, "").trim();
  if (!supplierCode) return null;

  const groupNorm = normLoose(groupName);
  const tierMatch = groupNorm.match(/\b(GR|MD|PQ)\b\s*$/);
  const tier = tierMatch ? tierMatch[1] : groupNorm.replace(/^CLIENTE\s+/, "").trim();
  if (!tier) return null;

  for (const row of loadPrecios()) {
    const reglaMatch = normLoose(row.regla).match(/^GRUPO\s+(.+?)\s+CLIENTE\s+(GR|MD|PQ)$/);
    if (!reglaMatch) continue;
    const [, reglaCode, reglaTier] = reglaMatch;
    if (reglaTier === tier && codesEqual(reglaCode, supplierCode)) {
      return row.pct;
    }
  }
  return null;
}
