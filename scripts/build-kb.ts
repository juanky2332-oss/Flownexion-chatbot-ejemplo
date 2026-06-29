// Ejecutar con: npm run build:kb
// Los xlsx deben estar en data/source/ (ver README)
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const dataDir = path.join(process.cwd(), "data", "kb");
const srcDir  = path.join(process.cwd(), "data", "source");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function norm(s: unknown): string {
  return String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");
}
function t(s: unknown, n: number): string {
  return String(s ?? "").trim().slice(0, n);
}
function writeChunks(prefix: string, rows: unknown[], chunkSize: number) {
  const total = Math.ceil(rows.length / chunkSize);
  for (let p = 0; p < total; p++) {
    const chunk = rows.slice(p * chunkSize, (p + 1) * chunkSize);
    fs.writeFileSync(path.join(dataDir, `${prefix}-${p + 1}.json`), JSON.stringify(chunk));
  }
  return total;
}

// ── Equivalencias: [skf, fag, nsk, ref_ntn, marca, ean] ──────────────────────
const eqPath = path.join(srcDir, "Equivalencias entre productos.xlsx");
if (!fs.existsSync(eqPath)) {
  console.warn("⚠️  No encontrado:", eqPath);
} else {
  const wb = XLSX.readFile(eqPath);
  const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["PRODUCTOS BD"], { header: 1, defval: "" });
  // Row 0 = group header, Row 1 = col headers, data from Row 2
  const eq: [string, string, string, string, string, string][] = [];
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    const ref = norm(r[3]);
    if (!ref) continue;
    eq.push([norm(r[0]), norm(r[1]), norm(r[2]), ref, String(r[4] ?? "").trim(), String(r[5] ?? "").trim()]);
  }
  const parts = writeChunks("eq", eq, Math.ceil(eq.length / 3));
  console.log(`✅ eq-1..${parts}.json — ${eq.length} referencias`);
}

// ── Aplicaciones: [ref, text] ─────────────────────────────────────────────────
const apPath = path.join(srcDir, "Tipos de aplicaciones.xlsx");
if (!fs.existsSync(apPath)) {
  console.warn("⚠️  No encontrado:", apPath);
} else {
  const wb = XLSX.readFile(apPath);
  const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["PRODUCTOS BD"], { header: 1, defval: "" });
  const ap: [string, string][] = [];
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    const ref = norm(r[1]);
    if (!ref) continue;
    const apps = String(r[6] ?? "").trim();
    if (!apps || apps === "-" || apps.length < 15) continue;
    const parts = [t(r[3], 60), t(r[4], 80), t(apps, 200)].filter((s) => s && s !== "-");
    ap.push([ref, parts.join(" | ").slice(0, 280)]);
  }
  const parts = writeChunks("ap", ap, Math.ceil(ap.length / 10));
  console.log(`✅ ap-1..${parts}.json — ${ap.length} referencias con aplicaciones`);
}

// ── Precios ───────────────────────────────────────────────────────────────────
const prPath = path.join(srcDir, "Reglas de precio del catálogo (1).xlsx");
if (!fs.existsSync(prPath)) {
  console.warn("⚠️  No encontrado:", prPath);
} else {
  const wb = XLSX.readFile(prPath);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Sheet1"], { defval: "" });
  const precios = rows
    .filter((r) => r["NOMBRE DE LA REGLA DE PRECIO"] && r["% DE DESCUENTO QUE SE APLICA"])
    .map((r) => ({
      regla:     String(r["NOMBRE DE LA REGLA DE PRECIO"]).trim(),
      condicion: String(r["CONDICIÓN"]).trim(),
      pct:       parseFloat(String(r["% DE DESCUENTO QUE SE APLICA"])),
    }));
  fs.writeFileSync(path.join(dataDir, "precios.json"), JSON.stringify(precios, null, 2));
  console.log(`✅ precios.json — ${precios.length} reglas`);
}
