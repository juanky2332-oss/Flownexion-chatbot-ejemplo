// Validador del glosario técnico. Ejecutar con: npm run check:glosario
//
// Existe para que ESGAS pueda editar data/kb/glosario.json con tranquilidad.
// El código ya falla de forma segura (si el fichero está roto, el bot se
// queda sin glosario en vez de caerse), pero eso degrada la calidad de las
// respuestas EN SILENCIO. Este script convierte ese fallo silencioso en un
// aviso claro y en lenguaje llano, y lo ejecuta GitHub automáticamente en
// cada cambio (.github/workflows/validar-glosario.yml).
/* eslint-disable @typescript-eslint/no-var-requires */
export {};
const fs = require("fs");
const path = require("path");

const RUTA = path.join(process.cwd(), "data", "kb", "glosario.json");

const errores: string[] = [];
const avisos: string[] = [];

function error(msg: string): void {
  errores.push(msg);
}
function aviso(msg: string): void {
  avisos.push(msg);
}

// ── 1. El fichero existe y es JSON válido ────────────────────────────────────
if (!fs.existsSync(RUTA)) {
  console.error("❌ No existe data/kb/glosario.json");
  process.exit(1);
}

let datos: any;
try {
  datos = JSON.parse(fs.readFileSync(RUTA, "utf-8"));
} catch (e) {
  console.error("❌ El fichero data/kb/glosario.json no es un JSON válido.\n");
  console.error("   " + (e instanceof Error ? e.message : String(e)) + "\n");
  console.error("   Causas habituales al editar a mano:");
  console.error("   · Una coma de más en la última entrada de una lista.");
  console.error("   · Falta una coma entre dos campos.");
  console.error('   · Comillas sin cerrar, o comillas " dentro del texto sin escapar como \\".');
  console.error("   · Se ha borrado una llave { } o un corchete [ ] de más.\n");
  console.error("   Consejo: en GitHub, deshaz el cambio y vuelve a editar con cuidado, o pega");
  console.error("   el contenido en jsonlint.com para ver la línea exacta del fallo.");
  process.exit(1);
}

// ── 2. Estructura general ────────────────────────────────────────────────────
if (!Array.isArray(datos?.entradas)) {
  console.error('❌ Falta la lista "entradas" (debe ser una lista de conceptos).');
  process.exit(1);
}

const entradas = datos.entradas as any[];
if (entradas.length === 0) error('La lista "entradas" está vacía: el bot se quedaría sin glosario.');

// ── 3. Cada entrada ──────────────────────────────────────────────────────────
const idsVistos = new Map<string, number>();
const terminosVistos = new Map<string, string[]>();

entradas.forEach((e: any, i: number) => {
  const dónde = `entrada ${i + 1}${e?.titulo ? ` ("${String(e.titulo).slice(0, 45)}")` : ""}`;

  for (const campo of ["id", "titulo", "texto"]) {
    if (typeof e?.[campo] !== "string" || !e[campo].trim()) {
      error(`${dónde}: falta el campo "${campo}" o está vacío.`);
    }
  }

  if (typeof e?.id === "string" && e.id.trim()) {
    const previa = idsVistos.get(e.id);
    if (previa !== undefined) {
      error(`${dónde}: el "id" "${e.id}" ya lo usa la entrada ${previa + 1}. Cada id debe ser único.`);
    }
    idsVistos.set(e.id, i);
  }

  if (!Array.isArray(e?.terminos) || e.terminos.length === 0) {
    error(`${dónde}: "terminos" debe ser una lista con al menos una palabra, o el bot nunca encontrará esta entrada.`);
  } else {
    e.terminos.forEach((t: any) => {
      if (typeof t !== "string" || !t.trim()) {
        error(`${dónde}: hay un término vacío o que no es texto dentro de "terminos".`);
        return;
      }
      const clave = t.trim().toUpperCase();
      const dueños = terminosVistos.get(clave) ?? [];
      dueños.push(e?.id ?? `entrada ${i + 1}`);
      terminosVistos.set(clave, dueños);
    });
  }

  if (typeof e?.texto === "string" && e.texto.trim().length < 40) {
    aviso(`${dónde}: el texto es muy corto (${e.texto.trim().length} caracteres). ¿Está completo?`);
  }
  if (e?.prioridad !== undefined && typeof e.prioridad !== "number") {
    error(`${dónde}: "prioridad" debe ser un número (por ejemplo 9), no texto.`);
  }
});

// Un mismo término en varias entradas no es un error (a veces interesa), pero
// conviene saberlo: el bot mostrará las dos y puede resultar redundante.
for (const [termino, dueños] of terminosVistos) {
  if (dueños.length > 1) {
    aviso(`El término "${termino}" aparece en ${dueños.length} entradas (${dueños.join(", ")}). El bot las mostrará todas.`);
  }
}

// ── 4. Resultado ─────────────────────────────────────────────────────────────
console.log(`\nGlosario: ${entradas.length} conceptos · versión ${datos.version ?? "(sin indicar)"}\n`);

if (avisos.length) {
  console.log("Avisos (no impiden publicar):");
  avisos.forEach((a) => console.log("  · " + a));
  console.log("");
}

if (errores.length) {
  console.error("❌ El glosario tiene errores que hay que corregir:\n");
  errores.forEach((e) => console.error("  · " + e));
  console.error("\nCorrígelos en data/kb/glosario.json y vuelve a guardar.\n");
  process.exit(1);
}

console.log("✅ El glosario es correcto. Se puede publicar.\n");
