// Ejecutar con: npm run build:kb
// Los xlsx deben estar en data/source/ (ver README)
import * as XLSXNS from "xlsx";
// Node moderno ejecuta este script como ESM nativo y deja el módulo CJS de
// xlsx colgando de .default; ts-node clásico (CJS) lo da directo. Cubre ambos.
const XLSX: typeof XLSXNS = (XLSXNS as unknown as { default?: typeof XLSXNS }).default ?? XLSXNS;
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

// ── Información técnica: [marca, ref, ean, {clave: valor}] ──────────────────
const techPath = path.join(srcDir, "Informacion tecnica NTN.xlsx");
if (!fs.existsSync(techPath)) {
  console.warn("⚠️  No encontrado:", techPath);
} else {
  const wb = XLSX.readFile(techPath);
  const ws = wb.Sheets["PRODUCTOS BD"];
  // La hoja declara ~16.000 columnas (rango A1:XEK...), casi todas vacías —
  // sin acotar el rango a las 40 columnas reales, sheet_to_json intenta
  // materializar cientos de millones de celdas y el proceso se cuelga.
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  range.e.c = Math.min(range.e.c, 39); // hasta la columna AN
  ws["!ref"] = XLSX.utils.encode_range(range);
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  // [índice de columna, clave corta] — las etiquetas legibles para el modelo
  // viven en TECH_LABELS de lib/kb.ts; aquí solo se compacta el JSON.
  const TECH_COLS: [number, string][] = [
    [3, "clase"], [4, "clase2"], [5, "di"], [6, "de"], [7, "an"], [8, "peso"],
    [9, "anext"], [10, "ang"], [11, "sist"], [12, "tol"], [13, "toldesc"],
    [14, "junta"], [15, "juntadesc"], [16, "matani"], [17, "serie"],
    [18, "matjaula"], [19, "aguj"], [20, "brida"], [21, "anillo"],
    [22, "hileras"], [23, "tipoej"], [24, "aloj"], [25, "nfij"], [26, "fijeje"],
    [27, "reengr"], [28, "laloj"], [29, "haloj"], [30, "waloj"], [31, "dmont"],
    [32, "dbase"], [33, "mataloj"], [34, "rosca"], [35, "cest"], [36, "cdin"],
    [37, "vref"], [38, "vlim"], [39, "iso"],
  ];
  // Columnas con notación x = Sí / o = No: solo se guarda el "Sí" (la
  // ausencia de la clave ya significa "No" y el JSON queda mucho menor).
  const XO = new Set(["brida", "anillo", "reengr"]);

  const tech: [string, string, string, Record<string, string | number>][] = [];
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    const ref = String(r[1] ?? "").trim();
    if (!ref) continue;
    const campos: Record<string, string | number> = {};
    for (const [col, key] of TECH_COLS) {
      const v = String(r[col] ?? "").trim();
      if (!v || v === "-") continue;
      if (XO.has(key)) {
        if (v.toLowerCase() === "x") campos[key] = "Sí";
        continue;
      }
      const num = Number(v.replace(",", "."));
      campos[key] = /^[\d.,]+$/.test(v) && !Number.isNaN(num) ? num : v;
    }
    tech.push([String(r[0] ?? "").trim(), ref, String(r[2] ?? "").trim(), campos]);
  }
  const parts = writeChunks("tech", tech, Math.ceil(tech.length / 12));
  console.log(`✅ tech-1..${parts}.json — ${tech.length} referencias con ficha técnica`);
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

// ── Correas Continental ───────────────────────────────────────────────────────
// Lista de precios oficial de Continental. Estructura confirmada con el
// cliente: la información útil está en la columna D (descripción + longitud),
// la M (nombre/marcaje real de la correa) y la N (peso en kg). El TIPO de
// correa no vive en ninguna columna: es la cabecera de grupo que hay ENCIMA
// de cada bloque dentro de cada pestaña (fila con "Your discount" en D y el
// perfil en A, p.ej. "10/Z", "SPZ / 3V / 9N", "HTD 5M"), y la gama comercial
// está en A2 de cada pestaña ("Conti V", "Conti Synchrobelt/-force"...).
//
// NO se importa el precio a propósito: son tarifas de lista de Continental,
// no los precios de venta de ESGAS. El precio que ve el cliente sale siempre
// de PrestaShop vía search_products — meter aquí un precio distinto sería la
// forma más rápida de que el bot cotice mal.
const beltPath = path.join(srcDir, "CORREAS CONTINENTAL.xlsx");
if (!fs.existsSync(beltPath)) {
  console.warn("⚠️  No encontrado:", beltPath);
} else {
  const wb = XLSX.readFile(beltPath);
  // Pestañas que no son de producto (índice, tarifa cruda, servicios, notas).
  const SKIP = new Set([
    "Content_Inhalt", "Upload_Pricelist (LIST VIEW)", "Service_program",
    "Performance_Level", "Optional_Service", "NEWS",
  ]);

  // Limpia el marcador de marca registrada y los espacios raros (NBSP,
  // zero-width) que trae el fichero original en los nombres de gama. El (R)
  // se sustituye por un ESPACIO, no por vacio: en el original va pegado
  // ("Conti(R)V Multirib") y quitarlo a secas dejaria "ContiV Multirib".
  function clean(s: unknown): string {
    return String(s ?? "")
      .replace(/[\u00ae\u2122]/g, " ")
      .replace(/[\u00a0\u200b]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function estadoOf(raw: string): string {
    const s = raw.toLowerCase();
    if (s.includes("stock item")) return "stock";
    if (s.includes("on request")) return "bajo pedido";
    if (s.includes("discontinued")) return "descatalogado";
    return "";
  }

  // Longitudes en mm dentro de la descripción: "A 18  13x 457Li  487Ld".
  // Li = longitud interior, Ld/Lp = longitud primitiva. En las trapeciales
  // clásicas el NOMBRE va en pulgadas ("A18" = 18") pero el cliente español
  // pide siempre los mm ("una correa A 1250"), así que hay que indexar los
  // mm de la descripción o esas referencias serían imposibles de encontrar.
  function lenOf(desc: string, marker: "Li" | "Ld"): number | null {
    const m = desc.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${marker}`, "i"));
    if (!m) return null;
    const n = Number(m[1].replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  // [nombre(M), descripcion(D), pesoKg(N), perfil(grupo), gama, estado, li, ld, codigo(C)]
  type BeltRow = [string, string, number, string, string, string, number | null, number | null, string];
  const belts: BeltRow[] = [];
  const perfiles = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    if (SKIP.has(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

    // A2 = gama comercial de la pestaña. Si falta, el nombre de la pestaña.
    const gama = clean((rows[1] as unknown[])?.[0]) || sheetName.replace(/_/g, " ");
    let perfil = "";

    for (const raw of rows) {
      const r = raw as unknown[];
      const colA = clean(r[0]);
      const colC = clean(r[2]);
      const colD = clean(r[3]);

      // Cabecera de grupo: fija el perfil vigente para las filas siguientes.
      if (colD.toLowerCase().includes("discount")) {
        if (colA) perfil = colA;
        continue;
      }
      // Fila de cabecera de columnas.
      if (colD.startsWith("Description")) continue;
      // Fila de producto: material code + descripción.
      if (!colC || !colD) continue;

      const nombre = clean(r[12]) || colC;
      const peso = Number(String(r[13] ?? "").replace(",", ".")) || 0;
      belts.push([
        nombre,
        colD,
        peso,
        perfil,
        gama,
        estadoOf(String(r[5] ?? "")),
        lenOf(colD, "Li"),
        lenOf(colD, "Ld"),
        colC,
      ]);
      if (perfil) perfiles.add(`${gama} :: ${perfil}`);
    }
  }

  const parts = writeChunks("belts", belts, Math.ceil(belts.length / 8));
  fs.writeFileSync(
    path.join(dataDir, "belts-perfiles.json"),
    JSON.stringify([...perfiles].sort(), null, 2)
  );
  console.log(
    `✅ belts-1..${parts}.json — ${belts.length} correas Continental en ${perfiles.size} perfiles`
  );
}
