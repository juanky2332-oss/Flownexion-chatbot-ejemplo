// Listado de los datos imposibles de los Excel del cliente, con el FICHERO,
// la HOJA, la FILA y la COLUMNA exactas donde están, para que ESGAS los
// compruebe y los corrija en origen. El chat ya los tapa al vuelo (lib/kb.ts,
// sanearCampos), pero lo correcto es arreglarlos en el Excel.
//
// Uso: node scripts/listado-errores-excel.js [salida.xlsx]
// Lee data/source/*.xlsx (los originales del cliente, no se suben a git).
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const SRC = path.join(__dirname, "..", "data", "source");
const salida = process.argv[2] || path.join(__dirname, "..", "Errores en los Excel de ESGAS.xlsx");
const num = (v) => {
  const t = String(v ?? "").trim();
  if (!t || t === "-") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const col = (i) => XLSX.utils.encode_col(i);
const filas = [];
const anotar = (f) => filas.push(f);

// ── Informacion tecnica NTN.xlsx (hoja PRODUCTOS BD) ─────────────────────
{
  const fichero = "Informacion tecnica NTN.xlsx";
  const wb = XLSX.readFile(path.join(SRC, fichero));
  const hoja = "PRODUCTOS BD";
  const ws = wb.Sheets[hoja];
  const r0 = XLSX.utils.decode_range(ws["!ref"]);
  r0.e.c = Math.min(r0.e.c, 39);
  ws["!ref"] = XLSX.utils.encode_range(r0);
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const C = { clase: 3, clase2: 4, di: 5, de: 6, an: 7, peso: 8, aloj: 24 };
  const cab = (i) => String(raw[1]?.[i] || raw[0]?.[i] || "").trim();

  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    const ref = String(r[1] ?? "").trim();
    if (!ref) continue;
    const fila = i + 1; // fila tal como se ve en Excel
    const marca = String(r[0] ?? "").trim();
    const di = num(r[C.di]), de = num(r[C.de]), an = num(r[C.an]), peso = num(r[C.peso]);
    const aloj = String(r[C.aloj] ?? "").trim();
    const esSoporte = /soporte/i.test(`${r[C.clase]} ${r[C.clase2]}`) || (aloj !== "" && aloj !== "-");
    const base = { Fichero: fichero, Hoja: hoja, Fila: fila, Marca: marca, Referencia: ref };

    if (di !== null && de !== null && di >= de) {
      anotar({
        ...base,
        Problema: esSoporte ? "Soporte: diámetro de eje y exterior intercambiados" : "Diámetro interior mayor o igual que el exterior",
        Columnas: `${col(C.di)} (${cab(C.di)}) / ${col(C.de)} (${cab(C.de)})`,
        "Valor en el Excel": `dØ ${di} / DØ ${de}`,
        "Qué comprobar": esSoporte
          ? `Lo lógico es dØ ${de} (eje) y DØ ${di}`
          : "Revisar ambos diámetros con el catálogo del fabricante",
      });
    }
    for (const [k, idx] of [["Diámetro interior", C.di], ["Diámetro exterior", C.de], ["Anchura", C.an], ["Peso", C.peso]]) {
      const v = num(r[idx]);
      if (v !== null && v <= 0) {
        anotar({ ...base, Problema: `${k} a cero o negativo`, Columnas: `${col(idx)} (${cab(idx)})`, "Valor en el Excel": v, "Qué comprobar": "Poner el valor real o dejar la celda vacía" });
      }
    }
    if (!esSoporte && di !== null && de !== null && an !== null && peso !== null && di < de && peso > 0) {
      // Tope físico: anillo MACIZO de acero de esas medidas (+15 %). Un
      // rodamiento real pesa bastante menos que eso.
      const maxG = ((Math.PI / 4) * (de ** 2 - di ** 2) * an) / 1000 * 7.85 * 1.15;
      if (peso > maxG && peso > 5) {
        anotar({
          ...base,
          Problema: "Peso imposible para sus medidas",
          Columnas: `${col(C.peso)} (${cab(C.peso)})`,
          "Valor en el Excel": `${peso} g`,
          "Qué comprobar": `Con dØ${di}×DØ${de}×B${an} no puede pesar más de ~${Math.round(maxG)} g (sería acero macizo). ¿Está en otra unidad o es de otra referencia?`,
        });
      }
    }
  }
}

// ── CORREAS CONTINENTAL.xlsx (una hoja por gama) ──────────────────────────
{
  const fichero = "CORREAS CONTINENTAL.xlsx";
  const wb = XLSX.readFile(path.join(SRC, fichero));
  const SKIP = new Set(["Content_Inhalt", "Upload_Pricelist (LIST VIEW)", "Service_program", "Performance_Level", "Optional_Service", "NEWS"]);
  const lenOf = (d, m) => {
    const x = String(d).match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${m}`, "i"));
    return x ? Number(x[1].replace(",", ".")) : null;
  };
  const porPerfil = new Map();
  const registros = [];
  for (const hoja of wb.SheetNames) {
    if (SKIP.has(hoja)) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: "" });
    let perfil = "";
    rows.forEach((r, i) => {
      const a = String(r[0] ?? "").trim(), c = String(r[2] ?? "").trim(), d = String(r[3] ?? "").trim();
      if (d.toLowerCase().includes("discount")) { if (a) perfil = a; return; }
      if (d.startsWith("Description") || !c || !d) return;
      const nombre = String(r[12] ?? "").trim() || c;
      const li = lenOf(d, "Li"), ld = lenOf(d, "Ld");
      const reg = { hoja, fila: i + 1, nombre, codigo: c, desc: d, perfil, li, ld };
      registros.push(reg);
      if (li != null && ld != null) {
        if (!porPerfil.has(perfil)) porPerfil.set(perfil, new Map());
        const m = porPerfil.get(perfil);
        m.set(ld - li, (m.get(ld - li) || []).concat(reg));
      }
      if (li != null && ld != null && ld <= li) {
        anotar({ Fichero: fichero, Hoja: hoja, Fila: i + 1, Marca: "Continental", Referencia: nombre, Problema: "Longitud primitiva (Ld) menor o igual que la interior (Li)", Columnas: "D (Description)", "Valor en el Excel": d, "Qué comprobar": "La Ld siempre es mayor que la Li" });
      }
    });
  }
  // Ld − Li es casi constante dentro de un perfil: una fila muy distinta del
  // resto de su perfil es una errata en una de las dos longitudes.
  for (const [perfil, m] of porPerfil) {
    if (m.size < 2) continue;
    const [dominante, comunes] = [...m.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (comunes.length < 5) continue;
    for (const [dif, regs] of m) {
      if (Math.abs(dif - dominante) <= 5 || regs.length > 3) continue;
      for (const g of regs) {
        anotar({
          Fichero: fichero, Hoja: g.hoja, Fila: g.fila, Marca: "Continental", Referencia: g.nombre,
          Problema: "Longitud Li o Ld con errata (no cuadra con su perfil)",
          Columnas: "D (Description)", "Valor en el Excel": g.desc,
          "Qué comprobar": `En el perfil ${perfil} la Ld es la Li + ${dominante} mm; aquí Li ${g.li} y Ld ${g.ld} (diferencia ${dif} mm)`,
        });
      }
    }
  }
}

// ── Informe ────────────────────────────────────────────────────────────────
const resumen = new Map();
for (const f of filas) resumen.set(`${f.Fichero} · ${f.Problema}`, (resumen.get(`${f.Fichero} · ${f.Problema}`) || 0) + 1);
const wbOut = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wbOut,
  XLSX.utils.json_to_sheet([...resumen].map(([k, n]) => ({ "Fichero · Problema": k, Casos: n }))),
  "Resumen"
);
const hojaDet = XLSX.utils.json_to_sheet(filas, {
  header: ["Fichero", "Hoja", "Fila", "Marca", "Referencia", "Problema", "Columnas", "Valor en el Excel", "Qué comprobar"],
});
hojaDet["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 7 }, { wch: 12 }, { wch: 20 }, { wch: 48 }, { wch: 34 }, { wch: 40 }, { wch: 80 }];
hojaDet["!autofilter"] = { ref: hojaDet["!ref"] };
XLSX.utils.book_append_sheet(wbOut, hojaDet, "Detalle");
XLSX.writeFile(wbOut, salida);
for (const [k, n] of resumen) console.log(`${String(n).padStart(5)}  ${k}`);
console.log(`\n${filas.length} casos → ${salida}`);
