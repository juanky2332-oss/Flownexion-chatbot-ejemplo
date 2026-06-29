import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

interface EquivalenciaRow {
  ref_skf: string;
  ref_fag_ina: string;
  ref_nsk: string;
  ref_ntn_snr: string;
  marca: string;
  ean: string;
}

interface AplicacionRow {
  marca: string;
  referencia: string;
  descripcion_producto: string;
  descripcion_gama: string;
  argumento_venta: string;
  aplicaciones: string;
  fortaleza: string;
}

function norm(s: unknown): string {
  return String(s ?? "").toUpperCase().replace(/\s+/g, "");
}

let _eq: EquivalenciaRow[] | null = null;
let _ap: AplicacionRow[] | null = null;

function loadEq(): EquivalenciaRow[] {
  if (_eq !== null) return _eq;
  try {
    _eq = JSON.parse(
      readFileSync(join(process.cwd(), "data", "kb", "equivalencias.json"), "utf-8")
    ) as EquivalenciaRow[];
  } catch {
    _eq = [];
  }
  return _eq;
}

function loadAp(): AplicacionRow[] {
  if (_ap !== null) return _ap;
  try {
    _ap = JSON.parse(
      readFileSync(join(process.cwd(), "data", "kb", "aplicaciones.json"), "utf-8")
    ) as AplicacionRow[];
  } catch {
    _ap = [];
  }
  return _ap;
}

export function findEquivalence(
  query: string
): { ref_buscada: string; ref_ntn_snr: string; marca: string }[] {
  const q = norm(query);
  if (!q || q.length < 3) return [];
  const results: { ref_buscada: string; ref_ntn_snr: string; marca: string }[] = [];
  for (const row of loadEq()) {
    if (
      (row.ref_skf && norm(row.ref_skf).includes(q)) ||
      (row.ref_fag_ina && norm(row.ref_fag_ina).includes(q)) ||
      (row.ref_nsk && norm(row.ref_nsk).includes(q))
    ) {
      results.push({ ref_buscada: query, ref_ntn_snr: row.ref_ntn_snr, marca: row.marca });
      if (results.length >= 3) break;
    }
  }
  return results;
}

export function findApplications(query: string): object[] {
  const q = norm(query);
  if (!q || q.length < 3) return [];
  const data = loadAp();

  // Búsqueda por referencia exacta
  const refMatch = data.find((r) => norm(r.referencia) === q);
  if (refMatch) {
    return [{
      referencia: refMatch.referencia,
      marca: refMatch.marca,
      descripcion_gama: refMatch.descripcion_gama,
      aplicaciones: refMatch.aplicaciones,
      fortaleza: refMatch.fortaleza,
    }];
  }

  // Búsqueda por palabras clave en aplicaciones y gama
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  const scored = data
    .map((r) => {
      const hay = `${r.aplicaciones} ${r.descripcion_gama}`.toLowerCase();
      const hits = words.filter((w) => hay.includes(w)).length;
      return { r, hits };
    })
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3);

  return scored.map(({ r }) => ({
    referencia: r.referencia,
    marca: r.marca,
    descripcion_producto: r.descripcion_producto,
    descripcion_gama: r.descripcion_gama,
    aplicaciones: r.aplicaciones,
    argumento_venta: r.argumento_venta,
  }));
}
