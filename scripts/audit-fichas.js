// Auditoría de TODAS las fichas técnicas del KB (npm run audit:fichas).
// Busca datos imposibles o incoherentes que harían que el bot diera una
// ficha errónea con total seguridad: medidas al revés, cargas o pesos
// absurdos, referencias duplicadas con datos distintos, correas cuyo
// desarrollo no cuadra con dientes × paso, soportes sin cuerpo/rodamiento...
// No corrige nada: lista los casos para revisarlos con el cliente.
const fs = require("fs");
const path = require("path");

const KB = path.join(__dirname, "..", "data", "kb");
const leer = (f) => JSON.parse(fs.readFileSync(path.join(KB, f), "utf8"));
// Igual que lib/kb.ts: la barra se conserva ("62/32" no es "6232").
const norm = (s) => String(s ?? "").toUpperCase().replace(/\s+/g, "");
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const problemas = {};
const anotar = (tipo, detalle) => (problemas[tipo] ??= []).push(detalle);

// ── Rodamientos NTN/SNR (Informacion tecnica NTN.xlsx) ─────────────────────
const tech = [];
for (let i = 1; i <= 20; i++) {
  const f = `tech-${i}.json`;
  if (!fs.existsSync(path.join(KB, f))) break;
  for (const [marca, ref, ean, campos] of leer(f)) tech.push({ marca, ref, ean, c: campos });
}

const porRef = new Map();
for (const t of tech) {
  const k = `${t.marca}|${norm(t.ref)}`;
  if (!porRef.has(k)) porRef.set(k, []);
  porRef.get(k).push(t);
}
for (const [k, filas] of porRef) {
  if (filas.length < 2) continue;
  const distintos = new Set(filas.map((f) => JSON.stringify(f.c)));
  if (distintos.size > 1) anotar("Referencia repetida con datos DISTINTOS (el bot daría solo una)", `${k.replace("|", " ")} ×${filas.length}`);
}

for (const t of tech) {
  const id = `${t.marca} ${t.ref}`;
  const di = num(t.c.di), de = num(t.c.de), an = num(t.c.an);
  const peso = num(t.c.peso), cest = num(t.c.cest), cdin = num(t.c.cdin);
  const vref = num(t.c.vref), vlim = num(t.c.vlim);
  const esSoporte = /soporte|alojamiento|unidad/i.test(`${t.c.clase} ${t.c.clase2}`) || t.c.aloj;

  if (di !== null && de !== null && !esSoporte && di >= de) anotar("Diámetro interior ≥ exterior", `${id}: dØ${di} DØ${de}`);
  for (const [k, v] of [["di", di], ["de", de], ["an", an], ["peso", peso], ["cest", cest], ["cdin", cdin]]) {
    if (v !== null && v <= 0) anotar("Valor cero o negativo", `${id}: ${k}=${v}`);
  }
  if (vref !== null && vlim !== null && vlim < vref * 0.5) anotar("Velocidad límite muy por debajo de la de referencia", `${id}: vref ${vref} vlim ${vlim}`);
  if (di !== null && de !== null && an !== null && peso !== null && !esSoporte) {
    // Peso máximo físico: anillo macizo de acero (7,85 g/cm³) del tamaño
    // dado. Si la ficha pesa más que eso, la unidad del peso está mal.
    const vol = (Math.PI / 4) * (de ** 2 - di ** 2) * an / 1000; // cm³
    const maxG = vol * 7.85 * 1.15;
    if (peso > maxG && peso > 5) anotar("Peso imposible para sus medidas (¿kg en vez de g?)", `${id}: ${peso} g, máx ~${Math.round(maxG)} g`);
    if (peso < vol * 7.85 * 0.08 && vol > 1) anotar("Peso sospechosamente bajo para sus medidas", `${id}: ${peso} g para ${Math.round(vol)} cm³`);
  }
  // Serie 62xx/63xx/60xx: el bore code fija el diámetro interior (04→20 ... ×5).
  const m = /^(60|62|63|160|618|619)(\d{2})(?![\d])/.exec(norm(t.ref));
  if (m && di !== null) {
    const code = Number(m[2]);
    const esperado = code === 0 ? 10 : code === 1 ? 12 : code === 2 ? 15 : code === 3 ? 17 : code * 5;
    if (code < 96 && Math.abs(di - esperado) > 0.01 && !/\/\d/.test(t.ref)) anotar("dØ no coincide con el código de la referencia", `${id}: dØ${di}, por código ${esperado}`);
  }
}

// ── Soportes TL ────────────────────────────────────────────────────────────
const sop = leer("tl-soportes.json");
const vistosSop = new Map();
for (const s of sop) {
  const k = norm(s.ref);
  if (vistosSop.has(k) && JSON.stringify(vistosSop.get(k)) !== JSON.stringify(s)) anotar("Soporte TL repetido con datos distintos", s.ref);
  vistosSop.set(k, s);
  if (!s.eje_mm && !s.eje_pulg) anotar("Soporte TL sin diámetro de eje", s.ref);
  if (!s.medidas_mm || !Object.keys(s.medidas_mm).length) anotar("Soporte TL sin medidas", s.ref);
  if (s.peso_kg !== null && s.peso_kg !== undefined && (s.peso_kg <= 0 || s.peso_kg > 200)) anotar("Soporte TL con peso imposible", `${s.ref}: ${s.peso_kg} kg`);
  // Coherencia unidad: UCP205 → cuerpo P205 y rodamiento UC205.
  const mm = /^(?:TL-)?(UC|UK|UCX|UCS|SA|SB|NA|HC)?([A-Z]+?)(\d{3,4})(?:-(\d+))?/.exec(s.ref);
  if (mm && s.rodamiento && !s.unidad_equivalente) {
    const num3 = mm[3];
    if (!norm(s.rodamiento).includes(num3)) anotar("Soporte TL: rodamiento no casa con la unidad", `${s.ref}: rodamiento ${s.rodamiento}`);
  }
  if (s.eje_mm && s.rodamiento) {
    const b = /(\d{3})(?:-(\d+))?$/.exec(String(s.rodamiento).toUpperCase().replace(/[A-Z]+$/, ""));
    if (b && !b[2]) {
      const code = Number(b[1].slice(-2));
      const esperado = code === 0 ? 10 : code === 1 ? 12 : code === 2 ? 15 : code === 3 ? 17 : code * 5;
      if (code >= 4 && Math.abs(s.eje_mm - esperado) > 0.01) anotar("Soporte TL: Ø eje no coincide con el rodamiento", `${s.ref}: eje ${s.eje_mm}, ${s.rodamiento} → ${esperado}`);
    }
  }
}

// ── Correas dentadas TL: desarrollo = dientes × paso ───────────────────────
for (const c of leer("tl-dentadas.json")) {
  if (c.dientes && c.paso_mm && c.desarrollo_mm) {
    const calc = c.dientes * c.paso_mm;
    if (Math.abs(calc - c.desarrollo_mm) / c.desarrollo_mm > 0.01) anotar("Correa dentada TL: desarrollo ≠ dientes × paso", `${c.ref}: ${c.dientes}×${c.paso_mm}=${calc.toFixed(1)} vs ${c.desarrollo_mm}`);
  } else anotar("Correa dentada TL incompleta", c.ref);
}

// ── Correas industriales TL: Ld − Li constante por perfil ──────────────────
const difPorPerfil = new Map();
for (const c of leer("tl-industriales.json")) {
  if (c.ld_mm == null || c.li_mm == null) continue;
  if (c.ld_mm < c.li_mm) anotar("Correa industrial TL con Ld < Li", `${c.ref}: Li ${c.li_mm} Ld ${c.ld_mm}`);
  const d = c.ld_mm - c.li_mm;
  if (!difPorPerfil.has(c.perfil)) difPorPerfil.set(c.perfil, new Map());
  const m = difPorPerfil.get(c.perfil);
  m.set(d, (m.get(d) || []).concat(c.ref));
}
for (const [perfil, m] of difPorPerfil) {
  if (m.size < 2) continue;
  const [dominante] = [...m.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  for (const [d, refs] of m) if (d !== dominante && refs.length <= 3) anotar("Correa industrial TL: Ld−Li fuera de lo normal del perfil", `${perfil}: ${refs.join(", ")} (${d} mm, lo normal ${dominante})`);
}

// ── Correas Continental: Ld > Li y diferencia estable por perfil ───────────
// Fila: [ref, descripción, peso kg, perfil, gama, disponibilidad, Li, Ld, ...]
const contiDif = new Map();
let conti = 0;
for (let i = 1; i <= 20; i++) {
  const f = `belts-${i}.json`;
  if (!fs.existsSync(path.join(KB, f))) break;
  for (const r of leer(f)) {
    conti++;
    const [ref, , peso, perfil, , , li, ld] = r;
    if (peso !== null && peso !== undefined && peso <= 0) anotar("Correa Continental con peso 0", ref);
    if (li == null || ld == null) continue;
    if (ld <= li) anotar("Correa Continental con Ld ≤ Li", `${ref}: Li ${li} Ld ${ld}`);
    if (!contiDif.has(perfil)) contiDif.set(perfil, new Map());
    const m = contiDif.get(perfil);
    m.set(ld - li, (m.get(ld - li) || []).concat(ref));
  }
}
for (const [perfil, m] of contiDif) {
  if (m.size < 2) continue;
  const [dominante] = [...m.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  for (const [d, refs] of m) if (Math.abs(d - dominante) > 5 && refs.length <= 3) anotar("Correa Continental: Ld−Li fuera de lo normal del perfil", `${perfil}: ${refs.join(", ")} (${d} mm, lo normal ${dominante})`);
}
console.log(`Correas Continental: ${conti}`);

// ── Informe ────────────────────────────────────────────────────────────────
console.log(`Rodamientos/soportes NTN-SNR: ${tech.length} · Soportes TL: ${sop.length}`);
const tipos = Object.keys(problemas);
if (!tipos.length) console.log("\nSin problemas.");
for (const t of tipos) {
  console.log(`\n■ ${t}: ${problemas[t].length}`);
  for (const d of problemas[t].slice(0, Number(process.env.MAX ?? 15))) console.log("   - " + d);
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(problemas, null, 2));
