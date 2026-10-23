// Recupera las correas TL de perfil AT10 (página E35 del PDF de dentadas).
// dentadas_extract.py las descarta todas: en esa tabla la columna "mm" que
// lee es la del nº de dientes (impresa a su lado), así que "37 mm" no cuadra
// con TL-370PU-AT10. El dato bueno está en la propia referencia: 37 dientes ×
// paso 10 mm = 370 mm. Solo se acepta la fila si ese cálculo cuadra EXACTO.
// Anchos estándar AT10 según la misma página: 10, 12, 16, 20, 25, 32, 50, 75 mm.
// Uso: node scripts/translink/recuperar_at10.js   (tras dentadas_extract.py)
const fs = require("fs");
const path = require("path");
const informe = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "tl-dentadas-informe.json"), "utf8"));
const kbPath = path.join(__dirname, "..", "..", "data", "kb", "tl-dentadas.json");
const kb = JSON.parse(fs.readFileSync(kbPath, "utf8"));
const ya = new Set(kb.map((c) => c.ref));
let n = 0;
for (const d of informe.descartadas) {
  const m = /^TL-(\d+)PU-AT10-?$/.exec(d.ref);
  if (!m) continue;
  const largo = Number(m[1]);
  const dientes = Number(String(d.tabla?.z ?? "").replace(",", "."));
  if (!Number.isInteger(dientes) || dientes * 10 !== largo) continue;
  const ref = `TL-${largo}PU-AT10`;
  if (ya.has(ref)) continue;
  kb.push({
    ref,
    perfil: "AT10",
    familia: "Poliuretano AT (métrico)",
    paso_mm: 10,
    dientes,
    desarrollo_mm: largo,
    desarrollo_pulg: null,
    anchos: ["10", "12", "16", "20", "25", "32", "50", "75"],
    pagina: d.pagina,
  });
  ya.add(ref);
  n++;
}
fs.writeFileSync(kbPath, JSON.stringify(kb));
console.log(`AT10 añadidas: ${n} (total dentadas: ${kb.length})`);
