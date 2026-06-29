// Ejecutar con: npm run build:kb
// Requiere los xlsx en scripts/ (no subidos al repo, ver .gitignore)
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const dataDir = path.join(process.cwd(), "data", "kb");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function norm(s: unknown): string {
  return String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

// ── Equivalencias ─────────────────────────────────────────────────────────────
const eqPath = path.join(process.cwd(), "scripts", "Equivalencias_entre_productos.xlsx");
if (!fs.existsSync(eqPath)) {
  console.warn("⚠️  No encontrado: scripts/Equivalencias_entre_productos.xlsx");
  if (!fs.existsSync(path.join(dataDir, "equivalencias.json"))) {
    fs.writeFileSync(path.join(dataDir, "equivalencias.json"), "[]");
  }
} else {
  const wb = XLSX.readFile(eqPath);
  const ws = wb.Sheets["PRODUCTOS BD"] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
  const result = rows
    .map((r) => ({
      ref_skf:     norm(r["Referencia SKF"] ?? r["Referencia skf"] ?? ""),
      ref_fag_ina: norm(r["Referencia FAG/INA"] ?? r["Referencia FAG"] ?? ""),
      ref_nsk:     norm(r["Referencia NSK"] ?? ""),
      ref_ntn_snr: norm(r["Referencia"] ?? ""),
      marca:       String(r["Marca"] ?? "").trim(),
      ean:         String(r["EAN"] ?? "").trim(),
    }))
    .filter((r) => r.ref_ntn_snr.length > 0);
  fs.writeFileSync(path.join(dataDir, "equivalencias.json"), JSON.stringify(result, null, 2));
  console.log(`✅ equivalencias.json — ${result.length} filas`);
}

// ── Aplicaciones ──────────────────────────────────────────────────────────────
const apPath = path.join(process.cwd(), "scripts", "Tipos_de_aplicaciones.xlsx");
if (!fs.existsSync(apPath)) {
  console.warn("⚠️  No encontrado: scripts/Tipos_de_aplicaciones.xlsx");
  if (!fs.existsSync(path.join(dataDir, "aplicaciones.json"))) {
    fs.writeFileSync(path.join(dataDir, "aplicaciones.json"), "[]");
  }
} else {
  const wb = XLSX.readFile(apPath);
  const ws = wb.Sheets["PRODUCTOS BD"] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
  const result = rows
    .map((r) => ({
      marca:                String(r["Marca"] ?? "").trim(),
      referencia:           norm(r["Referencia"] ?? ""),
      ean:                  String(r["EAN"] ?? "").trim(),
      descripcion_producto: String(r["Descripción del producto"] ?? r["Descripcion del producto"] ?? "").trim(),
      descripcion_gama:     String(r["Descripción de gama"] ?? r["Descripcion de gama"] ?? "").trim(),
      argumento_venta:      String(r["Argumento de venta"] ?? "").trim(),
      aplicaciones:         String(r["Aplicaciones de la gama"] ?? r["Aplicaciones"] ?? "").trim(),
      fortaleza:            String(r["Fortaleza de la gama"] ?? r["Fortaleza"] ?? "").trim(),
    }))
    .filter((r) => r.descripcion_producto.length > 0 || r.aplicaciones.length > 0);
  fs.writeFileSync(path.join(dataDir, "aplicaciones.json"), JSON.stringify(result, null, 2));
  console.log(`✅ aplicaciones.json — ${result.length} filas`);
}
