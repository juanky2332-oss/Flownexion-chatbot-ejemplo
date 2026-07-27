// Pruebas del KB contra los datos reales de data/kb/*.json.
// Ejecutar con: npm run test:kb
//
// No sustituye a probar el bot en real (eso necesita OPENAI_API_KEY y el
// catálogo de PrestaShop), pero sí garantiza que la capa de datos —la que
// alimenta las respuestas técnicas— devuelve lo correcto para las consultas
// que el cliente escribe de verdad, en lenguaje natural y con sus erratas.
/* eslint-disable @typescript-eslint/no-var-requires */
// export {} convierte el fichero en modulo: sin esto, sus const de nivel
// superior son globales y chocan con las de cualquier otro script suelto.
export {};
// lib/kb.ts empieza con import "server-only", que lanza un error a propósito
// cuando se carga fuera de un React Server Component. Este script corre en
// Node puro, así que se neutraliza ese módulo ANTES de cargar el KB. Se usa
// require (y no import) precisamente para garantizar ese orden: TypeScript
// eleva todos los import al principio del fichero y el parche llegaría tarde.
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]): unknown {
  if (request === "server-only") return {};
  return origLoad.call(this, request, ...rest);
};

const {
  findGlossary,
  findGlossaryForMessage,
  findBelt,
  findEquivalence,
  findTechnicalInfo,
  getBeltProfiles,
} = require("../lib/kb") as typeof import("../lib/kb");

let fails = 0;
function ok(cond: boolean, label: string, extra = ""): void {
  if (!cond) fails++;
  console.log(`${cond ? "  ok  " : "  FALLA"} ${label}${extra ? "  ->  " + extra : ""}`);
}
function section(t: string): void {
  console.log(`\n=== ${t} ===`);
}

section("GLOSARIO — sellado (el fallo reportado por el cliente)");
for (const q of [
  "cual es la diferencia entre un rodamiento ZZ y uno 2RS?",
  "que diferencia hay entre 2RS y 2RZ",
  "diferencia entre LLU y LLB",
  "explicame los tipos de sellado que hay",
  "el 6205 LLU que sellado lleva?",
  "que significa ZZ en un rodamiento",
  "¿qué es un rodamiento sellado?",
]) {
  const r = findGlossary(q);
  ok(r.length > 0, `"${q}"`, r.map((x) => x.titulo.slice(0, 44)).join(" | "));
}

section("GLOSARIO — el contenido es TÉCNICAMENTE CORRECTO");
const rz = JSON.stringify(findGlossary("diferencia entre 2RS y 2RZ"));
ok(/2RZ/.test(rz) && /SIN CONTACTO|NO llega a rozar/i.test(rz), "2RZ figura como junta SIN contacto");
ok(/2RS/.test(rz) && /CON contacto|ROZA/i.test(rz), "2RS figura como junta CON contacto");
const zz = JSON.stringify(findGlossary("que es un rodamiento ZZ"));
ok(/deflector/i.test(zz), "ZZ figura como deflector metalico");
ok(/NO es estanco|no impide la entrada de agua/i.test(zz), "ZZ advierte de que no es estanco");
const llb = JSON.stringify(findGlossary("que es LLB"));
ok(/NO llega a rozar|SIN contacto/i.test(llb), "LLB figura como junta SIN contacto");

section("GLOSARIO — juego, jaula, precision");
ok(findGlossary("para que sirve el C3").length > 0, "juego C3");
ok(/superior al normal/i.test(JSON.stringify(findGlossary("diferencia entre C3 y CN"))), "C3 = juego superior al normal");
ok(findGlossary("que es una jaula de poliamida TVH").length > 0, "jaula TVH");
ok(findGlossary("que significa P5 de precision").length > 0, "precision P5");

section("PRE-INYECCION — dispara donde debe y NO donde no debe");
for (const q of [
  "cual es la diferencia entre 2RS y ZZ",
  "que significa el sufijo C3",
  "explicame los tipos de sellado",
  "¿qué diferencia hay entre un LLU y un LLB?",
]) {
  ok(findGlossaryForMessage(q).length > 0, `SI dispara: "${q}"`);
}
for (const q of [
  "quiero comprar 25 unidades del 6205",
  "hola buenos dias",
  "necesito una equivalencia del 3309 de skf",
  "tienes stock del UC205",
  "cuanto cuesta el 6205",
]) {
  ok(findGlossaryForMessage(q).length === 0, `NO dispara: "${q}"`);
}

section("CORREAS CONTINENTAL");
for (const [q, desc] of [
  ["correa A 1250", "trapecial clasica pedida en mm"],
  ["SPZ 1600", "estrecha, designacion ya en mm"],
  ["necesito una correa SPB 2360", "estrecha SPB con ruido de lenguaje"],
  ["8PJ356", "multicostilla Poly-V por codigo de material"],
  ["correa AX 19", "trapecial dentada"],
  ["600-8M-30", "dentada sincrona, separadores distintos"],
  ["correa Z 425", "clasica perfil Z por longitud interior"],
  ["XPB 2360", "estrecha dentada"],
] as [string, string][]) {
  const r = findBelt(q);
  ok(
    r.length > 0,
    `"${q}" (${desc})`,
    r.length ? `${r[0].nombre} | ${r[0].perfil} | ${r[0].tipo} | ${r[0].peso_g}g` : "SIN RESULTADOS"
  );
}

// El perfil devuelto tiene que ser el pedido, no otro que comparta el numero.
// Bug real: "correa A 1250" devolvia una correa de perfil Z cuya descripcion
// contenia "1250", porque el extractor de candidatos de rodamientos nunca
// fusionaba el perfil alfabetico "A" con la longitud.
// La comprobacion se hace contra el PERFIL EXACTO ("13/A"), no con includes("A"):
// "SPA" y "XPZ / 3VX ADV" tambien contienen una "A" y la asercion pasaria por
// casualidad aunque el matcher devolviera el perfil equivocado.
const a1250 = findBelt("correa A 1250");
ok(
  a1250.length > 0 && a1250.every((r) => r.perfil === "13/A"),
  "A 1250 devuelve EXCLUSIVAMENTE perfil 13/A",
  a1250.map((r) => r.nombre + ":" + r.perfil).join(" ")
);
ok(
  a1250.some((r) => r.longitud_interior_Li_mm === 1250) && a1250.some((r) => r.longitud_primitiva_Ld_mm === 1250),
  "A 1250 devuelve las DOS lecturas posibles (Li y Ld) para que el bot pregunte",
  a1250.map((r) => `${r.nombre}(Li${r.longitud_interior_Li_mm}/Ld${r.longitud_primitiva_Ld_mm})`).join(" ")
);
const z425 = findBelt("correa Z 425");
ok(z425.length > 0 && z425.every((r) => r.perfil === "10/Z"), "Z 425 devuelve EXCLUSIVAMENTE perfil 10/Z", z425.map((r) => r.nombre + ":" + r.perfil).join(" "));
const spb = findBelt("necesito una correa SPB 2360");
ok(spb[0]?.nombre === "SPB2360", "SPB 2360 resuelve por nombre exacto", spb[0]?.nombre);
ok(getBeltProfiles().length > 100, "lista de perfiles Continental cargada", String(getBeltProfiles().length));
ok(findBelt("6205").length === 0 || findBelt("6205")[0] !== undefined, "una referencia de rodamiento no rompe find_belt");

section("REGRESIONES — equivalencias y ficha tecnica ya existentes");
const eq1 = findEquivalence("puedes decirme que equivalencia hay para el 3309 a de skf en ntn o snr?");
ok(
  eq1.some((r) => r.ref_ntn_snr === "3309S") && eq1.some((r) => r.ref_ntn_snr === "3309A"),
  "3309 A de SKF -> NTN 3309S + SNR 3309A",
  eq1.map((r) => r.marca + " " + r.ref_ntn_snr).join(", ")
);
const eq2 = findEquivalence("equivalencia del 3309 de skf");
ok(eq2.some((r) => r.ref_ntn_snr === "3309S"), "3309 sin sufijo sigue dando NTN 3309S", eq2.map((r) => r.marca + " " + r.ref_ntn_snr).join(", "));
const t1 = findTechnicalInfo("que caracteristicas tiene un rodamiento 6205?");
ok(t1.length > 0, "ficha tecnica 6205", t1[0] ? `${t1[0].marca} ${t1[0].referencia} (${Object.keys(t1[0].datos).length} campos)` : "");
const t2 = findTechnicalInfo("6205 ZZ C3");
ok(t2.length > 0, "ficha tecnica 6205 ZZ C3", t2[0] ? `${t2[0].marca} ${t2[0].referencia}` : "");

console.log(`\n${fails === 0 ? "TODO OK" : fails + " FALLOS"}\n`);
process.exit(fails === 0 ? 0 : 1);
