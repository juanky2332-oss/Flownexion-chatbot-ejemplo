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
  const rawTokens = cleaned.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const candidates = new Set<string>();

  const joined = norm(cleaned);
  if (joined) candidates.add(joined);

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = norm(rawTokens[i]);
    if (!tok || !/\d/.test(tok)) continue;
    candidates.add(tok);
    const next = rawTokens[i + 1] ? norm(rawTokens[i + 1]) : "";
    if (next && next.length <= 4) candidates.add(tok + next);
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

  // 2ª pasada — sin exacta en ningún candidato: parcial, acotada para no
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
