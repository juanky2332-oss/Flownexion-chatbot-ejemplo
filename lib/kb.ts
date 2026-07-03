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

export function findEquivalence(
  query: string
): { ref_buscada: string; ref_ntn_snr: string; marca: string }[] {
  const q = norm(query);
  if (!q || q.length < 3) return [];
  const out: { ref_buscada: string; ref_ntn_snr: string; marca: string }[] = [];
  for (const row of loadEq()) {
    const [skf, fag, nsk, ref, marca] = row;
    if (
      (skf && norm(skf).includes(q)) ||
      (fag && norm(fag).includes(q)) ||
      (nsk && norm(nsk).includes(q))
    ) {
      out.push({ ref_buscada: query, ref_ntn_snr: ref, marca });
      if (out.length >= 3) break;
    }
  }
  return out;
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
