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
  findBeltForMessage,
  findEquivalence,
  findTechnicalInfo,
  getBeltProfiles,
  extractQueryCandidates,
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

section("PRE-INYECCION DE CORREA — dispara donde debe y NO donde no debe");
for (const q of [
  "necesito una correa A 1250",
  "correa SPZ 1600",
  "tienes correa trapecial B 2000",
  "correa AX 19",
  "una HTD 5M de 600",
]) {
  ok(findBeltForMessage(q).length > 0, `SI dispara: "${q}"`, findBeltForMessage(q).map((r) => r.nombre).join(", "));
}
for (const q of [
  "quiero comprar el 6205",
  "equivalencia del 3309 de skf",
  "hola buenos dias",
  "tienes stock del UC205",
  "diferencia entre 2RS y 2RZ",
]) {
  ok(findBeltForMessage(q).length === 0, `NO dispara: "${q}"`);
}

section("GLOSARIO AMPLIADO — montaje, lubricacion, diagnostico, ajustes, seleccion");
for (const [q, esperado] of [
  ["mi rodamiento hace ruido y se calienta, que puede ser", /lubricaci|exceso de grasa|desalinea|juego/i],
  ["como se monta un rodamiento correctamente", /nunca.*atraves|elementos rodantes|prensa|calent/i],
  ["cada cuanto hay que engrasar un rodamiento", /NLGI|30%|50%|temperatura|intervalo|grasa/i],
  ["que tolerancia debe tener el eje para un 6205", /k5|k6|m6|apriete|deslizante/i],
  ["que rodamiento aguanta carga axial y radial a la vez", /c[oó]nic|contacto angular/i],
  ["cuanta vida util tiene un rodamiento", /L10|fatiga|revoluciones|carga/i],
  ["que grasa uso para un rodamiento", /litio|NLGI/i],
  ["se me ha gripado el rodamiento", /lubricaci|grasa|juego|calent|desalinea/i],
] as Array<[string, RegExp]>) {
  const r = findGlossary(q);
  const texto = JSON.stringify(r);
  ok(r.length > 0 && esperado.test(texto), `"${q.slice(0, 46)}"`, r.length ? r[0].titulo.slice(0, 48) : "SIN RESULTADOS");
}

section("PRE-INYECCION del glosario ampliado");
for (const q of [
  "mi rodamiento hace ruido y se calienta",
  "como se monta un rodamiento",
  "cada cuanto hay que engrasar",
  "que tolerancia lleva el eje",
  "que rodamiento uso para carga axial",
]) {
  ok(findGlossaryForMessage(q).length > 0, `SI dispara: "${q}"`);
}
for (const q of ["quiero comprar el 6205", "hola buenas", "tienes stock del UC205"]) {
  ok(findGlossaryForMessage(q).length === 0, `NO dispara: "${q}"`);
}

section("REFERENCIA DETECTADA para la busqueda automatica en catalogo");
// Es la que decide si se dispara la busqueda determinista en Prestashop (ver
// agent.ts). Si extrae mal, el bot puede decir "no lo tenemos" teniendolo:
// paso de verdad con "6205 ZZ C3", que SI esta en la tienda.
function refDe(msg: string): string | null {
  return (
    extractQueryCandidates(msg).find(
      (c) =>
        (c.match(/\d/g) ?? []).length >= 3 &&
        c.length >= 4 &&
        c.length <= 20 &&
        !/[A-Z]{4,}/.test(c)
    ) ?? null
  );
}
for (const [msg, esperado] of [
  ["dime las caracteristicas del rodamiento 6205 zz c3", "6205ZZC3"],
  ["tienes el 6205 ZZ C3", "6205ZZC3"],
  ["6205ZZC3", "6205ZZC3"],
  ["quiero comprar el 6205", "6205"],
  ["necesito 200 unidades del 6205", "6205"],
  ["quiero comprar el rodamiento 3309", "3309"],
  ["tienes el UC205", "UC205"],
  ["hola buenas", null],
  ["que diferencia hay entre 2RS y 2RZ", null],
] as Array<[string, string | null]>) {
  const r = refDe(msg);
  ok(r === esperado, `ref de "${msg.slice(0, 44)}"`, `${r ?? "(ninguna)"}${r === esperado ? "" : " [esperado " + (esperado ?? "ninguna") + "]"}`);
}

section("CIERRE VACIO — se sustituye por uno accionable");
const { limpiarCierreVacio } = require("../lib/guardrails") as typeof import("../lib/guardrails");
{
  // Caso real de produccion: tras explicar un diagnostico cerraba asi.
  const real =
    "Las causas mas frecuentes son exceso de grasa y desalineacion.\n\n" +
    "Si necesitas mas ayuda, puedo ayudarte a buscar el rodamiento adecuado. ¿Te gustaria que busque un rodamiento especifico o necesitas mas informacion?";
  const r = limpiarCierreVacio(real);
  ok(!/¿Te gustar[ií]a que busque/i.test(r), "quita el cierre vacio");
  ok(/referencia|di[aá]metro/i.test(r), "lo sustituye por uno accionable", r.slice(-90));
  ok(/exceso de grasa/.test(r), "conserva el contenido tecnico anterior");

  // Si ya ofrece tecnico, esa es una salida concreta: no se anade nada.
  const conTecnico =
    "No puedo confirmarlo sin ver la pieza. ¿Quieres que lo busque? Puedes hablar con un tecnico de ESGAS.";
  const r2 = limpiarCierreVacio(conTecnico);
  ok(!/¿Quieres que lo busque/i.test(r2), "quita el cierre vacio tambien aqui");
  ok(!/di[aá]metro del eje/i.test(r2), "no anade cierre si ya ofrece tecnico", r2.slice(-70));

  // Lo que NO debe tocar.
  for (const intacto of [
    "Aqui tienes el SNR 6205. Precio: 1.93 EUR. Stock: 12 uds.",
    "¿Que diametro tiene el eje?",
    "¿Es la longitud interior o la primitiva?",
    "El 2RZ es una junta sin contacto, a diferencia del 2RS.",
  ]) {
    ok(limpiarCierreVacio(intacto) === intacto, `no toca: "${intacto.slice(0, 42)}"`);
  }
}

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

// ── VARIANTES Y COMPARATIVAS (lib/variantes.ts) ─────────────────────────────
// Cubre los dos fallos reportados por el cliente sobre la conversacion real
// del 6205: la variante C3 con stock que no se ofrecia, y la falta de
// diferencias al proponer otra medida.
const {
  partirReferencia,
  normalizarRef,
  analizarVariantes,
  compararTecnico,
  pideOtraMedida,
  bloqueVariantes,
  bloqueOtraMedida,
  refDeConversacion,
  ordenarParaTarjetas,
} = require("../lib/variantes") as typeof import("../lib/variantes");

section("VARIANTES — partir la referencia en base + sufijos");
for (const [entrada, base, sufijos] of [
  ["SNR 6205", "6205", ""],
  ["SNR 6205 C3", "6205", "C3"],
  ["6205ZZC3", "6205", "ZZ C3"],
  ["6205 2RS", "6205", "2RS"],
  ["NTN 6205 LLU", "6205", "LLU"],
  ["UC205", "UC205", ""],
  ["NTN 22216 EA W33", "22216", "EA W33"],
] as [string, string, string][]) {
  const r = partirReferencia(entrada);
  ok(
    r.base === base && r.sufijos.join(" ") === sufijos,
    `"${entrada}" -> base ${base} + [${sufijos}]`,
    `base ${r.base} + [${r.sufijos.join(" ")}]`
  );
}
ok(normalizarRef("SNR 6205 C3") === "6205C3", "normalizarRef quita marca y separadores");

section("VARIANTES — el caso real: 6205 sin stock, 6205 C3 con 12 uds");
const P = (id: number, name: string, reference: string, stock: number) =>
  ({
    id,
    name,
    reference,
    price: 1.93,
    link: "",
    cartLink: "",
    checkoutLink: "",
    stock,
  }) as any;

const catalogo6205 = [
  P(1, "SNR 6205", "SNR 6205", 0),
  P(2, "SNR 6205 C3", "SNR 6205 C3", 12),
  P(3, "NTN 22216 EA W33", "NTN 22216 EA W33", 0),
];
const a1 = analizarVariantes("6205", catalogo6205);
ok(a1.exactas.length === 1 && a1.exactas[0].producto.id === 1, "localiza la referencia exacta pedida");
ok(a1.exactaSinStock, "detecta que la exacta no se puede servir");
ok(
  a1.alternativasConStock.length === 1 && a1.alternativasConStock[0].producto.id === 2,
  "propone el 6205 C3 como variante disponible",
  a1.alternativasConStock.map((v) => v.producto.reference).join(", ")
);
ok(
  a1.alternativasConStock[0]?.anade.join(" ") === "C3",
  "identifica que la diferencia es el sufijo C3",
  a1.alternativasConStock[0]?.anade.join(" ")
);
ok(
  !a1.familia.some((v) => v.producto.id === 3),
  "descarta el 22216, que no es de la misma familia"
);

// El sufijo que cambia tiene que tener entrada en el glosario: es de donde
// sale la explicacion que se le inyecta al modelo (nunca de memoria).
ok(findGlossary("C3", 1).length > 0, "el glosario cubre el sufijo C3 (explicacion verificada)");

section("VARIANTES — NO dispara cuando la exacta si tiene stock");
const a2 = analizarVariantes("6205", [P(1, "SNR 6205", "SNR 6205", 30), P(2, "SNR 6205 C3", "SNR 6205 C3", 12)]);
ok(!a2.exactaSinStock, "con stock en la exacta no hay caso de sustitucion");

section("VARIANTES — la exacta ni aparece, pero hay variante con stock");
const a3 = analizarVariantes("6205 2RS", [P(2, "SNR 6205 C3", "SNR 6205 C3", 12)]);
ok(a3.exactaSinStock && a3.alternativasConStock.length === 1, "ofrece la variante que si esta");
ok(
  a3.alternativasConStock[0].quita.join(" ") === "2RS" &&
    a3.alternativasConStock[0].anade.join(" ") === "C3",
  "dice que le falta el 2RS y que anade C3",
  `quita [${a3.alternativasConStock[0].quita}] anade [${a3.alternativasConStock[0].anade}]`
);

section("COMPARATIVA — diferencias reales entre dos referencias del KB");
const c1 = compararTecnico(["6205", "6305"]);
ok(c1.referencias.length === 2, "encuentra ficha de las dos", c1.referencias.map((r) => r.marca + " " + r.referencia).join(" vs "));
const di = c1.filas.find((f) => /Di[aá]metro interior/.test(f.campo));
const de = c1.filas.find((f) => /Di[aá]metro exterior/.test(f.campo));
ok(di !== undefined && !di.cambia, "6205 y 6305 comparten diametro interior (25 mm)", di ? String(di.valores) : "");
ok(
  de !== undefined && de.cambia && /^\+/.test(String(de.diferencia[1])),
  "el 6305 es mayor por fuera y la diferencia sale calculada",
  de ? `${de.valores.join(" -> ")} (${de.diferencia[1]})` : ""
);
const c2 = compararTecnico(["6205", "no-existe-9999"]);
ok(c2.sinFicha.includes("no-existe-9999"), "avisa de la referencia sin ficha en vez de inventarla");

section("COMPARATIVA — detector de 'otra medida'");
for (const q of [
  "dame uno mas grande",
  "necesito uno más pequeño que este",
  "el siguiente diametro por encima",
  "¿me vale el ZZ en vez del 2RS?",
  "quiero algo mas ancho",
]) {
  ok(pideOtraMedida(q), `dispara: "${q}"`);
}
for (const q of [
  "que caracteristicas tiene un rodamiento 6205",
  "quiero comprar 10 uds del 6205",
  "hola buenas",
]) {
  ok(!pideOtraMedida(q), `NO dispara: "${q}"`);
}

section("TARJETAS — la variante con stock no se queda fuera de las 3");
const familiaLarga = [
  P(10, "SNR 6205 ZZ", "SNR 6205 ZZ", 0),
  P(11, "SNR 6205 LLU", "SNR 6205 LLU", 0),
  P(12, "SNR 6205", "SNR 6205", 0),
  P(13, "SNR 6205 C3", "SNR 6205 C3", 12),
  P(14, "NTN 6305", "NTN 6305", 4),
];
const tarjetas = ordenarParaTarjetas("6205", familiaLarga).slice(0, 3).map((p: any) => p.id);
ok(tarjetas[0] === 12, "la referencia exacta va primera", String(tarjetas));
ok(tarjetas.includes(13), "la variante CON stock entra en las 3 tarjetas", String(tarjetas));

section("BLOQUE INYECTADO — variantes (el texto real que ve el modelo)");
const bloque = bloqueVariantes(a1);
ok(bloque !== null, "genera el bloque en el caso del cliente");
if (bloque) {
  ok(/SNR 6205 C3/.test(bloque) && /12 uds/.test(bloque), "nombra la variante disponible y sus unidades");
  ok(/🔴 0 uds/.test(bloque), "deja claro que la pedida esta a cero");
  ok(/AÑADE el\/los sufijo\(s\): C3/.test(bloque), "dice cual es el sufijo que cambia");
  ok(/juego/i.test(bloque), "incluye la explicacion VERIFICADA del glosario, no una de memoria");
  ok(/PROHIBIDO.*a.adir al carrito la referencia sin stock/s.test(bloque), "prohibe ofrecer la que no hay");
  ok(/compare_products/.test(bloque), "pide la comparativa de diferencias");
}
ok(bloqueVariantes(a2) === null, "NO genera bloque cuando la exacta si tiene stock");

section("BLOQUE INYECTADO — otra medida ancla contra el producto ya mostrado");
const historialFalso = [
  { role: "user", content: "que caracteristicas tiene un rodamiento 6205" },
  { role: "assistant", content: "**SNR 6205**\n\n**Ref: SNR 6205**\n- 62 -> serie ligera\n\n**Medidas:** dO25 x DO52 x B15 mm\n**Precio:** 1.93 EUR\n**Stock:** 12 uds" },
];
const previa = refDeConversacion(historialFalso);
ok(previa !== null && /6205/.test(previa.referencia), "localiza el 6205 del turno anterior", previa ? previa.marca + " " + previa.referencia : "");
if (previa) {
  const b2 = bloqueOtraMedida(previa);
  ok(/compare_products/.test(b2), "obliga a comparar");
  ok(/Diferencias frente al/.test(b2), "pide el bloque de diferencias");
  ok(/52/.test(b2), "lleva las medidas reales del producto de partida");
}
ok(refDeConversacion([{ role: "user", content: "hola buenas" }] as any) === null, "sin producto previo no inventa ninguno");

console.log(`\n${fails === 0 ? "TODO OK" : fails + " FALLOS"}\n`);
process.exit(fails === 0 ? 0 : 1);
