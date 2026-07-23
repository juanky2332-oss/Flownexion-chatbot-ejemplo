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

function loadJson<T>(rel: string): T[] {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), rel), "utf-8")) as T[];
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

  // 3ª pasada — sin exacta en ningún candidato: parcial, acotada para no
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
  return matchSiblings(candidates, query);
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
