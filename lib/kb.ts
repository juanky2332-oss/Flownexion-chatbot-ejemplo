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

export function extractQueryCandidates(rawQuery: string): string[] {
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
  "data/kb/tl-dentadas.json": () => readFileSync(join(process.cwd(), "data/kb/tl-dentadas.json"), "utf-8"),
  "data/kb/tl-industriales.json": () => readFileSync(join(process.cwd(), "data/kb/tl-industriales.json"), "utf-8"),
  "data/kb/tl-soportes.json": () => readFileSync(join(process.cwd(), "data/kb/tl-soportes.json"), "utf-8"),
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
  /** Advertencia para el modelo (no es un dato de la ficha ni va al PDF). */
  aviso?: string;
  /**
   * Cómo casa con lo pedido: "exacta" (misma referencia), "equivalente"
   * (misma pieza con la nomenclatura de NTN/SNR: 2RS → EE/LLU, 2Z → ZZ) o
   * "base" (solo la referencia base, sin los sufijos pedidos: NO es la pieza).
   */
  coincidencia?: "exacta" | "equivalente" | "variante" | "base";
  /** Lo que se pidió, cuando la ficha es de una equivalente o de la base. */
  pedida?: string;
}

// ── Saneado de la ficha (auditoría del 22-10-2026, npm run audit:fichas) ────
// El Excel del cliente trae errores que el bot repetía con total seguridad y
// que acababan también en el PDF. No se tocan los datos de origen (son del
// cliente y se regeneran con build:kb): se corrigen al leerlos.
//  - 665 soportes con el eje y el diámetro exterior INTERCAMBIADOS (ESC201:
//    "dØ40 × DØ12", cuando es un cartucho para eje de 12 con rodamiento de
//    40). En un soporte el diámetro pequeño es siempre el del eje.
//  - Rodamientos con dØ ≥ DØ (copas cónicas en pulgadas, jaulas de agujas,
//    arandelas axiales, alguna Topline): imposible; no se dan esos diámetros.
//  - Pesos a 0 y pesos físicamente imposibles (más que un anillo macizo de
//    acero de esas medidas, p.ej. 6001FT150ZZ: 210 g para 12×28×8).
// Lo que se quita va en "aviso" para el modelo (no en la ficha ni en el PDF):
// así no lo inventa ni lo da por bueno, y puede confirmarlo por fuente oficial.
const CAMPOS_FISICOS = ["di", "de", "an", "peso", "cest", "cdin", "vref", "vlim"];

function sanearCampos(row: TechEntry): { campos: Record<string, string | number>; avisos: string[] } {
  const c: Record<string, string | number> = { ...row.campos };
  const avisos: string[] = [];
  const n = (k: string): number | null => {
    const v = c[k];
    if (v === undefined || v === null || v === "") return null;
    const x = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(x) ? x : null;
  };

  for (const k of CAMPOS_FISICOS) {
    const v = n(k);
    if (v !== null && v <= 0) delete c[k];
  }

  const esSoporte = /soporte/i.test(`${c.clase ?? ""} ${c.clase2 ?? ""}`) || c.aloj !== undefined;
  let di = n("di"), de = n("de");
  if (di !== null && de !== null && di >= de) {
    if (esSoporte) {
      c.di = de;
      c.de = di;
      [di, de] = [de, di];
    } else {
      delete c.di;
      delete c.de;
      di = de = null;
      avisos.push(
        "Los diámetros interior/exterior de esta referencia en la base de datos son incoherentes y se han omitido: " +
        "no los des de memoria; confírmalos con search_official_source o las TABLAS DIMENSIONALES, o indica que se confirman por contacto."
      );
    }
  }

  const an = n("an"), peso = n("peso");
  if (!esSoporte && di !== null && de !== null && an !== null && peso !== null) {
    // Cota superior física: un anillo MACIZO de acero (7,85 g/cm³) de esas
    // medidas, con un 15 % de margen. Un rodamiento real pesa bastante menos.
    const maxG = ((Math.PI / 4) * (de ** 2 - di ** 2) * an / 1000) * 7.85 * 1.15;
    if (peso > maxG && peso > 5) {
      delete c.peso;
      avisos.push("El peso de esta referencia en la base de datos es incoherente con sus medidas y se ha omitido: no lo des.");
    }
  }
  return { campos: c, avisos };
}

function labelTech(row: TechEntry): TechInfo {
  const { campos, avisos } = sanearCampos(row);
  const datos: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(campos)) {
    datos[TECH_LABELS[k] ?? k] = v;
  }
  return {
    marca: row.marca,
    referencia: row.ref,
    ean: row.ean,
    datos,
    ...(avisos.length ? { aviso: avisos.join(" ") } : {}),
  };
}

/**
 * Ficha técnica completa de una referencia desde el documento oficial del
 * cliente (Informacion tecnica NTN.xlsx). Mismo tratamiento de query que
 * findEquivalence: el modelo manda lenguaje natural con ruido, así que se
 * extraen candidatos de referencia y se prueban de más a menos específico.
 * Exacta primero; si no hay, por prefijo (el cliente suele omitir sufijos:
 * "6205" debe encontrar 6205ZZ, 6205LLU...) acotada para no inundar.
 */
// Mismo sellado con otra nomenclatura. NTN/SNR llaman EE (SNR) o LLU (NTN) a
// la junta de goma con contacto que otras marcas llaman 2RS/2RS1/DDU, y ZZ a
// los deflectores 2Z/2ZR. Sin esto, "6201 2RS" no encontraba su ficha y caía a
// la del 6201 ABIERTO, con su velocidad límite (38.000 rpm) y su peso, que no
// son los de un rodamiento sellado (visto en producción el 23-10-2026).
const SINONIMOS_SELLADO: [RegExp, string[]][] = [
  [/(2RS1|2RSR|2RSH|2RS|DDU|LLU|EE)(?=(C\d|CM|NR)?$)/, ["EE", "LLU"]],
  [/(2ZR|2Z|ZZ)(?=(C\d|CM|NR)?$)/, ["ZZ"]],
];
function variantesSellado(c: string): string[] {
  const out: string[] = [];
  for (const [re, alts] of SINONIMOS_SELLADO) {
    if (!re.test(c)) continue;
    for (const a of alts) {
      const v = c.replace(re, a);
      if (v !== c && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

// Campos que dependen del sufijo (sellado, juego): con la ficha de la
// referencia BASE no se pueden dar como si fueran de la pedida.
const CAMPOS_DEL_SUFIJO = ["vlim", "vref", "peso", "junta", "juntadesc", "tol", "toldesc"];

export function findTechnicalInfo(query: string): TechInfo[] {
  // Códigos internos de TL en la página ("3362012RSTL" = TL 6201 2RS).
  const q = String(query ?? "").replace(/\b33(\d{3,5}[A-Z0-9]*?)TL\b/gi, "$1");
  const candidates = extractQueryCandidates(q);
  if (!candidates.length) return [];
  // Soportes TL (catálogo Translink): van detrás de los NTN/SNR, que son la
  // marca principal; en "UCP205" salen las dos fichas.
  const tl = findTlSoporte(candidates);
  const data = loadTech();
  const pedida = candidates[0];

  // 1) La referencia tal cual, y la misma pieza con la nomenclatura NTN/SNR.
  for (const [c, coincidencia] of [[pedida, "exacta"], ...variantesSellado(pedida).map((v) => [v, "equivalente"])] as [string, "exacta" | "equivalente"][]) {
    const exact = data.filter((r) => r.refNorm === c);
    if (exact.length) {
      return [
        ...exact.slice(0, 4).map((r) => ({ ...labelTech(r), coincidencia, ...(coincidencia === "equivalente" ? { pedida } : {}) })),
        ...tl,
      ];
    }
  }
  // 2) Candidatos menos específicos (frases con varias referencias, o la
  //    referencia base sin sufijos).
  for (const c of candidates.slice(1)) {
    for (const v of [c, ...variantesSellado(c)]) {
      const exact = data.filter((r) => r.refNorm === v);
      if (!exact.length) continue;
      // Es la BASE de lo pedido (le faltan sufijos): no es la misma pieza.
      if (pedida.startsWith(c) && pedida.length > c.length && /^\d/.test(pedida.slice(c.length)) === false) {
        const faltan = pedida.slice(c.length);
        return [...exact.slice(0, 2).map((r) => fichaBase(r, pedida, faltan)), ...tl];
      }
      return [...exact.slice(0, 4).map((r) => ({ ...labelTech(r), coincidencia: "exacta" as const })), ...tl];
    }
  }
  if (tl.length) return tl;
  for (const c of candidates) {
    if (c.length < 4) continue;
    const pref = data.filter((r) => r.refNorm.startsWith(c));
    // La referencia del KB lleva MÁS sufijos que lo pedido ("3309" → 3309A):
    // es una variante concreta de lo que se pidió, con sus datos completos.
    if (pref.length) return pref.slice(0, 5).map((r) => ({ ...labelTech(r), coincidencia: r.refNorm === c ? ("exacta" as const) : ("variante" as const), pedida }));
  }
  return [];
}

/** Ficha de una referencia que NO es exactamente la pedida: sin los datos que dependen del sufijo. */
function fichaBase(row: TechEntry, pedida: string, faltan: string): TechInfo {
  const campos = { ...row.campos };
  for (const k of CAMPOS_DEL_SUFIJO) delete campos[k];
  const info = labelTech({ ...row, campos });
  return {
    ...info,
    coincidencia: "base",
    pedida,
    aviso:
      `${info.aviso ? info.aviso + " " : ""}ATENCIÓN: esta ficha es la del ${row.marca} ${row.ref}, NO la de ${pedida}` +
      `${faltan ? ` (le falta${faltan.length > 2 ? "n" : ""} ${faltan})` : ""}. Solo valen sus medidas y capacidades de carga, ` +
      `que fija la referencia base; la velocidad, el peso, la junta y el juego se han quitado porque cambian con el sufijo. ` +
      `No presentes esta ficha como la de ${pedida}.`,
  };
}

// ── Soportes TRANSLINK (TL) ─────────────────────────────────────────────────
// Catálogo "Soportes TL" del 14-10-2026. Datos que pidió el cliente: Ø de eje,
// medidas (cotas de la tabla de cada serie), rosca del perno, referencia del
// cuerpo, referencia del rodamiento y peso.

interface TlSoporteRow {
  ref: string;
  ref_base?: string;
  serie?: string;
  descripcion?: string;
  eje_mm?: number | null;
  eje_pulg?: string | number | null;
  medidas_mm?: Record<string, number | string>;
  perno?: string | number | null;
  perno_pulg?: string;
  ejes_pulg_compatibles?: string[];
  rodamiento?: string | null;
  /** Termoplásticos: el catálogo da la unidad de fundición equivalente, no el inserto. */
  unidad_equivalente?: string;
  cuerpo?: string | null;
  peso_kg?: number | null;
  pagina?: string;
}

let _tlSop: { row: TlSoporteRow; claves: string[] }[] | null = null;

function loadTlSoportes() {
  if (_tlSop !== null) return _tlSop;
  _tlSop = loadJson<TlSoporteRow>("data/kb/tl-soportes.json").map((row) => {
    const claves = new Set<string>([norm(row.ref)]);
    if (row.ref_base) claves.add(norm(row.ref_base));
    // En la página las TL llevan el prefijo de familia "33" y el sufijo "TL"
    // ("33UCP205TL"); se indexa también la forma pura.
    for (const k of [...claves]) claves.add(k.replace(/^TL-?/, "").replace(/-?TL$/, ""));
    return { row, claves: [...claves].filter(Boolean) };
  });
  return _tlSop;
}

function fmtMm(v: number | string): string {
  return typeof v === "number" ? String(v).replace(".", ",") : String(v);
}

function labelTlSoporte(r: TlSoporteRow): TechInfo {
  const datos: Record<string, string | number> = {};
  if (r.descripcion) datos["Clase de producto"] = r.descripcion;
  if (r.serie) datos["Serie"] = r.serie;
  if (r.eje_mm !== undefined && r.eje_mm !== null) datos["Diámetro del eje (mm)"] = fmtMm(r.eje_mm);
  if (r.eje_pulg) datos["Diámetro del eje (pulgadas)"] = String(r.eje_pulg);
  if (r.ejes_pulg_compatibles?.length) datos["Ejes en pulgadas compatibles"] = r.ejes_pulg_compatibles.join(", ");
  // Las letras son las cotas de la tabla del catálogo TL de esa serie (el
  // PDF no trae leyenda de su significado, así que no se interpreta).
  const medidas = Object.entries(r.medidas_mm ?? {}).filter(([, v]) => v !== null && v !== "");
  if (medidas.length) datos["Medidas (mm)"] = medidas.map(([letra, v]) => `${letra} ${fmtMm(v)}`).join(" · ");
  if (r.perno) datos["Tamaño de rosca (perno)"] = r.perno_pulg ? `${r.perno} / ${r.perno_pulg}` : String(r.perno);
  if (r.cuerpo) datos["Referencia del cuerpo del soporte"] = r.cuerpo;
  if (r.rodamiento) datos["Referencia del rodamiento"] = r.rodamiento;
  if (r.unidad_equivalente) datos["Unidad de fundición equivalente"] = r.unidad_equivalente;
  if (r.peso_kg !== undefined && r.peso_kg !== null) datos["Peso (kg)"] = fmtMm(r.peso_kg);
  // Visto en la preview: el bot copió la ficha del TL-UCP205 de FUNDICIÓN al
  // soporte TERMOPLÁSTICO "UCP 205" de la página (otra pieza, otro peso).
  const aviso =
    `Esta ficha es SOLO de la pieza ${r.ref} (${r.descripcion ?? "catálogo Translink"}). No la apliques a otras ` +
    "versiones con la misma numeración (termoplástico, inoxidable, chapa, otra serie): si el producto de la página " +
    "es de otro material o serie, sus datos NO son estos — dilo y ofrece el contacto para confirmarlos.";
  return { marca: "TL (Translink)", referencia: r.ref, ean: "", datos, aviso };
}

function findTlSoporte(candidates: string[]): TechInfo[] {
  const data = loadTlSoportes();
  if (!data.length) return [];
  for (const c of candidates) {
    const puro = c.replace(/^33(?=[A-Z])/, "").replace(/TL$/, "");
    const hit = data.filter((s) => s.claves.includes(c) || s.claves.includes(puro));
    if (hit.length) return hit.slice(0, 3).map((s) => labelTlSoporte(s.row));
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
  /\b(DIFERENCIA\w*|DISTIN\w+|QUE\s+SIGNIFICA|QUE\s+ES|QUE\s+SON|PARA\s+QUE\s+SIRVE|CUAL\s+ES\s+MEJOR|CUANDO\s+SE\s+USA|CUANDO\s+USAR|EXPLIC\w+|SIGNIFICADO|VENTAJA\w*|MEJOR\s+PARA|SE\s+DIFERENCIA\w*|COMO\s+SE\s+\w+|COMO\s+(SE\s+)?(MONTA|DESMONTA|INSTALA|ENGRASA|LUBRICA|ELIGE)\w*|CADA\s+CUANTO|QUE\s+PUEDE\s+SER|POR\s+QUE\s+SE|QUE\s+TIPO\s+DE|CUAL\s+(ELIJO|USO|PONGO)|CUANTA?\s+(VIDA|DURA))\b/i;
const CONCEPT_TERM =
  /\b(SELLAD\w+|SELLO|SELLOS|JUNTA|JUNTAS|ESTANQU\w+|DEFLECTOR\w*|OBTURA\w+|JUEGO\s+RADIAL|JUEGO\s+INTERNO|HOLGURA|JAULA|JAULAS|PRECISION|SUFIJO|SUFIJOS|2RS1?|2RZ|2Z|2ZR|ZZ|LLU|LLB|LLH|DDU|RSR|VV|C[2-5]|CN|P[456]|TVH|TN9|T2X|G15|RUIDO\w*|RUIDOS\w*|CALIENT\w+|CALENTAMIENTO|VIBRA\w+|SILBID\w+|CHIRRI\w+|ZUMBID\w+|GRIPAD\w+|AVERIA|SINTOMA\w*|DIAGNOSTIC\w+|MONTAJE|MONTAR|DESMONT\w+|EXTRACTOR|LUBRICA\w+|ENGRAS\w+|GRASA|NLGI|REENGRAS\w+|AJUSTE\w*|TOLERANCIA\w*|APRIETE|CARGA\s+(AXIAL|RADIAL|COMBINADA)|VIDA\s+UTIL|L10|ROTULA)\b/i;

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
        li: liSaneada(li, ld, codigo),
        ld,
      });
    }
  }
  return _belts;
}

/**
 * La Li parseada de la descripción del fabricante, salvo errata evidente.
 * Auditoría 22-10-2026: "C 91.5 222x 324Li 2383Ld" (le sobra un 2 al ancho y
 * le falta a la Li) daba Li 324 mm para una correa de 2383 de Ld. La Ld supera
 * a la Li en unas decenas de mm; si no, se recupera del código ("22.0X2324")
 * o se omite: mejor no dar el dato que darlo mal.
 */
function liSaneada(li: number | null, ld: number | null, codigo: string | undefined): number | null {
  if (li === null || ld === null) return li;
  const plausible = (x: number) => ld > x && ld - x <= 150;
  if (plausible(li)) return li;
  const m = /X(\d{3,5})$/i.exec(String(codigo ?? "").trim());
  const delCodigo = m ? Number(m[1]) : NaN;
  return Number.isFinite(delCodigo) && plausible(delCodigo) ? delCodigo : null;
}

export interface BeltInfo {
  nombre: string;
  tipo: string;
  perfil: string;
  descripcion: string;
  /** Se omite si el fabricante no lo da (1.606 correas vienen con peso 0). */
  peso_g?: number;
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
    disponibilidad_fabricante: b.estado,
  };
  if (b.pesoKg > 0) out.peso_g = Math.round(b.pesoKg * 1000);
  if (b.li !== null) out.longitud_interior_Li_mm = b.li;
  if (b.ld !== null) out.longitud_primitiva_Ld_mm = b.ld;
  return out;
}

/**
 * Palabras de relleno de una consulta de correa. Se quitan ANTES de extraer
 * los tokens, para que no contaminen la fusión perfil+longitud.
 */
const BELT_NOISE =
  /\b(CORREA|CORREAS|PERFIL|PERFILES|NECESITO|NECESITARIA|QUIERO|QUERIA|TENEIS|TIENES|TIENE|TENGO|HAY|DAME|DIME|BUSCO|BUSCAR|PONME|UNA|UNAS|UN|UNOS|EL|LA|LOS|LAS|DE|DEL|PARA|CON|POR|FAVOR|MM|MILIMETROS|TRAPECIAL|TRAPECIALES|TRAPEZOIDAL|TRAPEZOIDALES|DENTADA|DENTADAS|SINCRONA|SINCRONAS|ESTRECHA|ESTRECHAS|CLASICA|CLASICAS|CONTINENTAL|CONTI|MODELO|REFERENCIA|REF|QUE|CUAL|CUALES|COMO|CUANTO|CUANTOS|CUANTAS|CARACTERISTICA|CARACTERISTICAS|TECNICA|TECNICAS|TECNICO|TECNICOS|INFORMACION|INFO|DATOS|FICHA|MEDIDA|MEDIDAS|ES|SON|ME|MI|SU|LO|LE|SE|PUEDES|PODRIAS|DECIR|DECIRME|SABER|QUISIERA|HOLA|BUENAS|GRACIAS|AL|ESTA|ESTE|ESA|ESE|LLEVA|PRECIO|STOCK|DISPONIBLE|COMPRAR|DIENTES|DESARROLLO|LONGITUD|ANCHO|INTERIOR|PRIMITIVA|SOBRE|ACERCA|TRANSLINK)\b/gi;
// (Las palabras de pregunta del final se añadieron tras un fallo real: con
// "¿qué características tiene la 600-8M-30?" se colaban como tokens, fallaba
// la pasada de todos los tokens y la parcial devolvía correas de OTRA longitud.)

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
      // "600" está dentro de "1600": si alguna correa EMPIEZA por la longitud
      // pedida (600-H8M-30), las que solo la contienen (1600-H8M-30) sobran.
      const largos = tokens.map((t) => beltNorm(t)).filter((t) => /^\d{3,5}$/.test(t));
      const empiezan = hit.filter((b) => largos.some((n) => new RegExp(`^${n}(?!\\d)`).test(b.nombreNorm)));
      if (empiezan.length) hit.splice(0, hit.length, ...empiezan);
      // El nombre más corto es la designación más específica que encaja.
      return hit
        .sort((a, b) => a.nombreNorm.length - b.nombreNorm.length)
        .slice(0, limit)
        .map(labelBelt);
    }
  }

  // 4ª pasada — parcial sobre nombre y descripción, acotada. Toda longitud
  // que haya dado el cliente (número de 3+ cifras) tiene que estar en la
  // correa: una parcial por "8M30" no puede devolver una 288-H8M-30 cuando
  // se ha pedido la 600.
  const longitudes = tokens.map((t) => beltNorm(t)).filter((t) => /^\d{3,5}$/.test(t));
  for (const c of candidates) {
    if (c.length < 4) continue;
    const part = data.filter(
      (b) =>
        (b.nombreNorm.includes(c) || b.descNorm.includes(c)) &&
        longitudes.every((n) => `${b.nombreNorm} ${b.descNorm}`.includes(n))
    );
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
  /\b(CORREAS?|TRANSLINK|TRAPECIAL\w*|TRAPEZOIDAL\w*|POLY.?V|MULTIRIB|SYNCHRO\w*|SPZ|SPA|SPB|SPC|XPZ|XPA|XPB|XPC|HTD|STD|CTD|POLYFLAT|VARISPEED|TORQUE\s+TEAM)\b/i;

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

// ── Correas TRANSLINK (TL) ──────────────────────────────────────────────────
// Catálogos "Correas dentadas TL" y "Correas industriales TL" que pasó el
// cliente el 14-10-2026. Extraídos de los PDF por coordenadas y validados fila
// a fila (dientes × paso = desarrollo; Ld − Li constante por perfil); las
// filas con erratas del propio catálogo se dejaron fuera a propósito. El
// cliente pidió de cada uno exactamente estos datos:
//   dentadas     → nº de dientes (NO. TEETH) y desarrollo (PITCH LENGTH)
//   industriales → longitud interior (INSIDE LENGTH) y de paso (DATUM LENGTH)

interface TlDentadaRow {
  ref: string;
  perfil: string;
  familia: string;
  paso_mm: number;
  paso_pulg?: number | null;
  dientes: number;
  desarrollo_mm: number;
  desarrollo_pulg?: number | null;
  anchos?: string[];
  doble_cara?: boolean;
  doble_cara_disponible?: boolean;
  pagina?: string;
}

interface TlIndustrialRow {
  ref: string;
  perfil: string;
  familia: string;
  ld_mm: number | null;
  li_mm: number | null;
  pagina?: string;
}

export interface TlBeltInfo {
  marca: "TL (Translink)";
  referencia: string;
  tipo: string;
  perfil: string;
  datos: Record<string, string | number>;
}

interface TlBeltEntry {
  info: TlBeltInfo;
  /** Formas normalizadas por las que se puede encontrar ("6008M", "8M600", "A49"...). */
  claves: Set<string>;
  perfilTokens: string[];
  li: number | null;
  ld: number | null;
  dientes: number | null;
}

let _tlBelts: TlBeltEntry[] | null = null;

function fmtNum(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/** "TL-600-8M" → "6008M"; "TL-D-1040-8M" → "D10408M". */
function sinPrefijoTL(ref: string): string {
  return beltNorm(ref.replace(/^\s*TL[-\s]*/i, ""));
}

/**
 * Una clave solo numérica ("6300", que sale de perfil "6" de Y/6 + Li 300) es
 * indistinguible de una referencia de RODAMIENTO: "rodamiento 6300" devolvía
 * la correa TL-Y/6-300. Esas claves solo valen escritas con el prefijo TL.
 */
function claveSegura(k: string): string {
  return /[A-Z]/.test(k) ? k : `TL${k}`;
}

function loadTlBelts(): TlBeltEntry[] {
  if (_tlBelts !== null) return _tlBelts;
  _tlBelts = [];

  for (const r of loadJson<TlDentadaRow>("data/kb/tl-dentadas.json")) {
    const datos: Record<string, string | number> = {
      "Número de dientes": r.dientes,
      "Desarrollo (mm)": fmtNum(r.desarrollo_mm),
    };
    if (r.desarrollo_pulg) datos["Desarrollo (pulgadas)"] = fmtNum(r.desarrollo_pulg);
    datos["Paso (mm)"] = fmtNum(r.paso_mm);
    if (r.anchos?.length) datos["Anchos estándar"] = r.anchos.join(", ");
    if (r.doble_cara) datos["Doble cara"] = "Sí";
    else if (r.doble_cara_disponible) datos["Versión doble cara"] = "Disponible";

    const base = sinPrefijoTL(r.ref);
    const perfil = beltNorm(r.perfil.replace(/^D-/, ""));
    const largo = Math.round(r.desarrollo_mm);
    // Pulgadas: "TL-112XL-56" también se pide como "112XL" (sin los dientes).
    const sinDientes = r.ref.replace(new RegExp(`-${r.dientes}$`), "");
    // El cliente escribe tanto "600-8M" como "8M 600", "112XL" o "XL 112":
    // perfil + el número de la designación, en los dos órdenes.
    const num = r.ref.match(/^TL-(?:D-)?(\d+)/i)?.[1] ?? String(largo);
    const claves = new Set<string>(
      [base, sinPrefijoTL(sinDientes), `${perfil}${num}`, `${num}${perfil}`].map(claveSegura)
    );

    _tlBelts.push({
      info: {
        marca: "TL (Translink)",
        referencia: r.ref,
        tipo: `Correa dentada síncrona — ${r.familia}`,
        perfil: r.perfil,
        datos,
      },
      claves,
      perfilTokens: [perfil],
      li: null,
      ld: null,
      dientes: r.dientes,
    });
  }

  for (const r of loadJson<TlIndustrialRow>("data/kb/tl-industriales.json")) {
    const datos: Record<string, string | number> = {};
    if (r.li_mm !== null) datos["Longitud interior Li (mm)"] = r.li_mm;
    if (r.ld_mm !== null) datos["Longitud de paso Ld (mm)"] = r.ld_mm;
    const base = sinPrefijoTL(r.ref);
    // "A/13" → ["A","13"] · "W31,5" → ["W31,5"] · "22x8" → ["22X8"]
    const perfilTokens = r.perfil.split(/[/\s]+/).map((t) => beltNorm(t)).filter(Boolean);
    const claves = new Set<string>([claveSegura(base)]);
    for (const p of perfilTokens) {
      if (r.li_mm !== null) claves.add(claveSegura(`${p}${r.li_mm}`));
      if (r.ld_mm !== null) claves.add(claveSegura(`${p}${r.ld_mm}`));
    }
    _tlBelts.push({
      info: {
        marca: "TL (Translink)",
        referencia: r.ref,
        tipo: `Correa trapecial — ${r.familia}`,
        perfil: r.perfil,
        datos,
      },
      claves,
      perfilTokens,
      li: r.li_mm,
      ld: r.ld_mm,
      dientes: null,
    });
  }
  return _tlBelts;
}

/**
 * Busca correas Translink por designación en lenguaje natural ("600-8M-30",
 * "XL 112", "TL-A49", "SPZ 1250", "correa A 1250"). Mismo planteamiento que
 * findBelt (Continental): exacta por designación primero y, si no, perfil +
 * longitud en mm contra la Li y la Ld, devolviendo las dos lecturas.
 */
export function findTranslinkBelt(query: string, limit = 6): TlBeltInfo[] {
  const { candidates, tokens } = beltCandidates(String(query ?? "").replace(/\bTRANSLINK\b/gi, " "));
  if (!candidates.length) return [];
  // El catálogo repite referencias (TL-A112...) en la sección de correas de
  // banda múltiple, con datos distintos a los de la correa suelta. Solo se
  // ofrecen si el cliente las pide; si no, contestaría con la Li/Ld de otra pieza.
  const quiereBanda = /\b(BANDA|BANDAS|MULTIPLE|MULTIPLES|BANDED|UNIDAS|POWERBAND|POWER\s*BAND)\b/i.test(
    String(query ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  );
  const todas = loadTlBelts();
  const sueltas = quiereBanda ? todas : todas.filter((b) => !/banda m[uú]ltiple/i.test(b.info.tipo));
  // Si la referencia solo existe en banda múltiple, se da igualmente (con su tipo).
  return buscarTl(sueltas) ?? (sueltas === todas ? [] : buscarTl(todas) ?? []);

  function buscarTl(data: TlBeltEntry[]): TlBeltInfo[] | null {
    // "correa XL de 60 dientes": el número va con "dientes", así que es el nº
    // de dientes y NO la designación (60XL = 6", que tiene 30 dientes).
    const porDientes = String(query ?? "").match(/(\d{1,4})\s*dientes/i);
    if (porDientes) {
      const n = Number(porDientes[1]);
      const perfiles = tokens.map((t) => beltNorm(t)).filter((t) => /[A-Z]/.test(t) && !["TL", "DIENTES", "DIENTE"].includes(t));
      const hit = data.filter(
        (b) => b.dientes === n && (!perfiles.length || b.perfilTokens.some((p) => perfiles.includes(p)))
      );
      return perfiles.length && hit.length ? hit.slice(0, limit).map((b) => b.info) : null;
    }

    for (const c of candidates) {
      const sinTL = c.replace(/^TL/, "");
      if (sinTL.length < 2) continue;
      const exact = data.filter((b) => b.claves.has(c) || b.claves.has(sinTL));
      if (exact.length) return exact.slice(0, limit).map((b) => b.info);
    }

    const pares: [string, number][] = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = beltNorm(tokens[i]);
      const solo = tok.match(/^([A-Z]+)(\d{2,5})$/);
      if (solo) pares.push([solo[1], Number(solo[2])]);
      const sig = beltNorm(tokens[i + 1] ?? "");
      if (/^[A-Z]+$/.test(tok) && /^\d{2,5}$/.test(sig)) pares.push([tok, Number(sig)]);
    }
    for (const [perfil, largo] of pares) {
      const hit = data.filter((b) => b.perfilTokens.includes(perfil) && (b.li === largo || b.ld === largo));
      if (hit.length) return hit.slice(0, limit).map((b) => b.info);
    }
    return null;
  }
}

/** Correas TL a pre-inyectar para un mensaje (mismo disparador que Continental). */
export function findTranslinkBeltForMessage(message: string): TlBeltInfo[] {
  const m = String(message ?? "");
  const plain = m.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Una referencia TL escrita tal cual ("TL-1000PU-AT10") también es una
  // consulta de correa aunque no diga la palabra.
  if (!BELT_INTENT.test(plain) && !/\bTL-[A-Z0-9]*\d/i.test(plain)) return [];
  return findTranslinkBelt(m, 4);
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

// ── Salvaguardas de respuesta para CORREAS ──────────────────────────────────
// Probado contra la preview (14-10-2026): con los datos correctos delante, el
// modelo a veces (1) elegía él solo entre las dos lecturas de "A 1250" (A48
// por Ld o A49 por Li) afirmando que el cliente había dado la Ld, y (2) otras
// contestaba "no está disponible en la página" sin dar ni un dato. Las dos
// cosas se comprueban aquí, en código, sobre la respuesta ya redactada.

export interface AmbiguedadLiLd {
  largo: number;
  /** Correas cuya longitud INTERIOR es el número del cliente. */
  porLi: string[];
  /** Correas cuya longitud PRIMITIVA/de paso es el número del cliente. */
  porLd: string[];
}

const ACLARA_LONGITUD = /\b(interior|interna|primitiva|de\s+paso|exterior|li|ld|lp)\b/i;

/** Designación sin prefijo de marca, para buscarla en el texto: "TL-A48" → "A48". */
function nombreCorto(n: string): string {
  return n.replace(/^TL-/i, "").replace(/^CORREA\s+CONTINENTAL\s+/i, "").trim();
}

export function ambiguedadLiLd(message: string, conti: BeltInfo[], tl: TlBeltInfo[]): AmbiguedadLiLd | null {
  const plano = String(message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (ACLARA_LONGITUD.test(plano)) return null;
  const nums = (plano.match(/\b\d{3,5}\b/g) ?? []).map(Number);
  for (const n of nums) {
    const porLi = new Set<string>();
    const porLd = new Set<string>();
    for (const b of conti) {
      if (b.longitud_interior_Li_mm === n) porLi.add(nombreCorto(b.nombre));
      if (b.longitud_primitiva_Ld_mm === n) porLd.add(nombreCorto(b.nombre));
    }
    for (const b of tl) {
      if (b.datos["Longitud interior Li (mm)"] === n) porLi.add(nombreCorto(b.referencia));
      if (b.datos["Longitud de paso Ld (mm)"] === n) porLd.add(nombreCorto(b.referencia));
    }
    const li = [...porLi].filter((x) => !porLd.has(x));
    const ld = [...porLd].filter((x) => !porLi.has(x));
    if (li.length && ld.length) return { largo: n, porLi: li, porLd: ld };
  }
  return null;
}

const contiene = (texto: string, ref: string) =>
  texto.toUpperCase().replace(/[\s\-/.]/g, "").includes(ref.toUpperCase().replace(/[\s\-/.]/g, ""));

// Frases con las que el modelo "decide" por el cliente qué longitud dio.
const ATRIBUCION_FALSA =
  /[^.!?\n]*\b(que\s+es\s+la\s+(medida|longitud)\s+que\s+(mencionaste|indicaste|has\s+(indicado|dado|mencionado))|la\s+medida\s+que\s+(mencionaste|indicaste|has\s+indicado))[^.!?\n]*[.!]?/gi;

/**
 * Si había dos lecturas posibles (Li/Ld) y la respuesta no presenta las dos,
 * se quita la atribución falsa y se añade la aclaración con ambas.
 */
export function asegurarAmbiguedadLiLd(texto: string, amb: AmbiguedadLiLd | null): string {
  if (!amb) return texto;
  const tieneLi = amb.porLi.some((r) => contiene(texto, r));
  const tieneLd = amb.porLd.some((r) => contiene(texto, r));
  if (tieneLi && tieneLd) return texto;
  const limpio = texto.replace(ATRIBUCION_FALSA, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  return (
    `${limpio}\n\n**Importante, antes de pedirla:** con ${amb.largo} mm hay dos correas distintas: ` +
    `**${amb.porLd.join(" / ")}** si ${amb.largo} mm es su longitud primitiva o de paso (Ld), y ` +
    `**${amb.porLi.join(" / ")}** si es su longitud interior (Li). ¿Cuál de las dos medidas es la tuya, ` +
    `o qué pone grabado en el flanco de la correa?`
  );
}

/**
 * Si había correas encontradas en los catálogos y la respuesta no da los datos
 * de ninguna, se anteponen los datos en código: el cliente nunca puede
 * quedarse con un "no está disponible" teniendo el dato técnico.
 */
export function asegurarDatosCorrea(texto: string, conti: BeltInfo[], tl: TlBeltInfo[]): string {
  if (!conti.length && !tl.length) return texto;
  // "Da los datos" = nombra una designación COMPLETA del fabricante (600-H8M-30,
  // TL-600-8M) y además algún dato técnico. Que repita lo que escribió el
  // cliente ("la 600-8M-30 no está disponible") no cuenta.
  const nombra =
    conti.some((b) => contiene(texto, b.nombre)) || tl.some((b) => contiene(texto, b.referencia) || contiene(texto, `TL ${nombreCorto(b.referencia)}`));
  const daDato = /dientes|desarrollo|longitud|\bLi\b|\bLd\b|peso/i.test(texto);
  if (nombra && daDato) return texto;
  const lineas: string[] = [];
  for (const b of conti.slice(0, 3)) {
    const lon = [
      b.longitud_interior_Li_mm !== undefined ? `Li ${b.longitud_interior_Li_mm} mm` : "",
      b.longitud_primitiva_Ld_mm !== undefined ? `Ld ${b.longitud_primitiva_Ld_mm} mm` : "",
    ].filter(Boolean).join(" · ");
    lineas.push(`- **${b.nombre}** (Continental, ${b.tipo}, perfil ${b.perfil})${lon ? `: ${lon}` : ""}${b.peso_g ? `, ${b.peso_g} g` : ""}`);
  }
  for (const b of tl.slice(0, 3)) {
    const d = Object.entries(b.datos).map(([k, v]) => `${k.replace(/\s*\((mm|pulgadas)\)/, "")}: ${v}${/\(mm\)/.test(k) ? " mm" : ""}`).join(" · ");
    lineas.push(`- **${b.referencia}** (TL Translink, ${b.tipo.replace(/^Correa\s+/, "correa ")}): ${d}`);
  }
  return `Estos son los datos del fabricante para esa correa:\n\n${lineas.join("\n")}\n\n${texto}`;
}

// ── Búsqueda por MEDIDAS sobre la base técnica ─────────────────────────────
// "Necesito 20 rodamientos de 5 mm de diámetro interior con tapa en ambos
// lados" acababa en "he pasado tu consulta a un técnico": search_by_bore solo
// conocía ejes de 10 a 100 mm de las series 60/62/63/72/320/UC. Aquí se busca
// en las 22.000 fichas NTN/SNR por medidas reales, para cualquier eje
// (miniaturas 6xx incluidas: 625 = dØ5 × DØ16 × B5).

export type Proteccion = "deflector" | "junta" | "ambas" | "abierto";

export interface CriterioMedidas {
  di: number;
  de?: number;
  an?: number;
  /** "ambas" = el cliente dice "tapa/tapado/cerrado" sin precisar metálica o de goma. */
  proteccion?: Proteccion;
}

const esRadialDeBolas = (c: Record<string, string | number>) =>
  /contacto radial/i.test(String(c.clase ?? "")) && /1 hilera/i.test(String(c.clase2 ?? ""));
const tipoJunta = (c: Record<string, string | number>): Proteccion => {
  const j = `${c.junta ?? ""} ${c.juntadesc ?? ""}`;
  if (/deflect|ZZ|\bZ\b/i.test(j)) return "deflector";
  if (/estanq|EE|LLU|LLB|LLH|LL|2RS|junta/i.test(j)) return "junta";
  return "abierto";
};

/**
 * Rodamientos de la base técnica con esas medidas, de más a menos habitual:
 * primero los rígidos de bolas de una hilera (los "de toda la vida"), y entre
 * ellos de menor a mayor diámetro exterior. Sin las variantes de juego (C3...)
 * repetidas: una por referencia base y protección.
 */
export function findByDimensions(cr: CriterioMedidas, limite = 8): TechInfo[] {
  const cerca = (a: unknown, b?: number) => b === undefined || Math.abs(Number(a) - b) < 0.05;
  const filas = loadTech().filter((r) => {
    const c = r.campos;
    if (!cerca(c.di, cr.di) || !cerca(c.de, cr.de) || !cerca(c.an, cr.an)) return false;
    if (!cr.proteccion) return true;
    const t = tipoJunta(c);
    return cr.proteccion === "ambas" ? t !== "abierto" : t === cr.proteccion;
  });
  // Si hay rígidos de bolas de una hilera, solo esos: es lo que pide quien
  // da un eje y "con tapa"; agujas, lineales o unidades no vienen a cuento.
  if (filas.some((r) => esRadialDeBolas(r.campos))) {
    for (let i = filas.length - 1; i >= 0; i--) if (!esRadialDeBolas(filas[i].campos)) filas.splice(i, 1);
  }
  // Series de más a menos habituales: 62 (ligera), 60 (estrecha), 63 (media),
  // 69 y 68 (sección fina). Vale igual para miniaturas (625, 605, 635...).
  const serie = (ref: string) => {
    const r = ref.replace(/^[A-Z]+/, "");
    return r.startsWith("62") ? 0 : r.startsWith("60") ? 1 : r.startsWith("63") ? 2 : r.startsWith("69") ? 3 : r.startsWith("68") ? 4 : 5;
  };
  filas.sort((a, b) => {
    const ra = esRadialDeBolas(a.campos) ? 0 : 1;
    const rb = esRadialDeBolas(b.campos) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const sa = serie(a.ref), sb = serie(b.ref);
    if (sa !== sb) return sa - sb;
    const de = Number(a.campos.de) - Number(b.campos.de);
    if (de) return de;
    return a.ref.length - b.ref.length; // la designación más corta = la estándar (625ZZ antes que 625ZZC3)
  });
  const vistas = new Set<string>();
  const out: TechInfo[] = [];
  for (const r of filas) {
    // Una por base + protección (fuera las variantes de juego C2/C3/C4).
    const clave = `${r.refNorm.replace(/C\d$|CM$/, "")}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    out.push({ ...labelTech(r), coincidencia: "exacta" });
    if (out.length >= limite) break;
  }
  return out;
}

/**
 * Lee del mensaje del cliente las medidas que da en texto (sin referencia):
 * "diámetro interior de 5 mm", "eje de 25", "5 mm de eje", "exterior 16 mm",
 * "ancho 5", y si pide tapa/protección. null si no da diámetro interior.
 */
export function medidasDelMensaje(mensaje: string): CriterioMedidas | null {
  const m = String(mensaje ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const num = String.raw`(\d+(?:[.,]\d+)?)`;
  const mm = String.raw`\s*(?:mm|mms|milimetros)?`;
  // Primero "25 mm de eje" (número delante) y después "eje de 25": al revés,
  // "25 mm de eje y 52 de exterior" se leía como eje de 52.
  const interior =
    new RegExp(num + mm + String.raw`\s+(?:de\s+)?(?:eje|diametro\s+interior|interior)`).exec(m) ??
    new RegExp(String.raw`(?:diametro\s+(?:interior|interno|del?\s+eje)|\beje\b|agujero|\binterior\b|\bd[øo0])\D{0,20}?` + num + mm).exec(m);
  if (!interior) return null;
  const di = Number(interior[1].replace(",", "."));
  if (!Number.isFinite(di) || di <= 0 || di > 600) return null;
  const ext =
    new RegExp(num + mm + String.raw`\s+(?:de\s+)?(?:diametro\s+)?exterior`).exec(m) ??
    new RegExp(String.raw`(?:diametro\s+exterior|\bexterior\b)\D{0,20}?` + num + mm).exec(m);
  const anc = new RegExp(String.raw`(?:ancho|anchura|espesor|grosor)\D{0,15}?` + num + mm).exec(m);
  let proteccion: Proteccion | undefined;
  if (/(goma|caucho|2rs|estanc|sellad|junta)/.test(m)) proteccion = "junta";
  else if (/(metalic|chapa|\bzz\b|deflector)/.test(m)) proteccion = "deflector";
  else if (/(tapa|tapad|cerrad|blindad|protegid|proteccion)/.test(m)) proteccion = "ambas";
  else if (/(abierto|sin tapa|sin proteccion)/.test(m)) proteccion = "abierto";
  return {
    di,
    ...(ext ? { de: Number(ext[1].replace(",", ".")) } : {}),
    ...(anc ? { an: Number(anc[1].replace(",", ".")) } : {}),
    ...(proteccion ? { proteccion } : {}),
  };
}
