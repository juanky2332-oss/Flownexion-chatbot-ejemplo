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
  filtrarFueraDeFamilia,
  tarjetasParaRespuesta,
  direccionDeTamano,
  candidatosPorTamano,
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

section("RUIDO — el 22216 no puede salir en una busqueda del 6205");
const limpio = filtrarFueraDeFamilia("6205", catalogo6205);
ok(limpio.length === 2 && !limpio.some((p: any) => p.id === 3), "descarta el producto de otra familia", limpio.map((p: any) => p.reference).join(", "));
const soloRuido = filtrarFueraDeFamilia("6205", [P(3, "NTN 22216 EA W33", "NTN 22216 EA W33", 5)]);
ok(soloRuido.length === 1, "si NADA es de la familia, no vacia la lista (puede ser un acierto por nombre)");

section("TARJETAS — las del producto que el texto NOMBRA (fallo visto en produccion)");
// Caso real: el bot describia el SNR 6305 C3 pero las tarjetas mostraban tres
// productos de una busqueda por diametro anterior, por orden de llegada.
const recogidos = [
  P(20, "SNR 6005", "SNR 6005", 0),
  P(21, "NTN 22326 EA K W33 C3", "NTN 22326 EA K W33 C3", 0),
  P(22, "TL 33600 52RS", "3360052RSTL", 170),
  P(23, "SNR 6305 C3", "SNR 6305 C3", 9),
];
const respuestaReal = "Aqui tienes un rodamiento mas grande que el SNR 6205:\n\n**SNR 6305 C3**\n**Ref: SNR 6305 C3**\nMedidas: dO25 x DO62 x B17 mm";
const cards = tarjetasParaRespuesta(respuestaReal, recogidos).slice(0, 3).map((p: any) => p.id);
ok(cards[0] === 23, "la tarjeta del producto descrito va primera", String(cards));
ok(
  tarjetasParaRespuesta(respuestaReal, recogidos).length === 1,
  "y las de productos que el texto no nombra (6005, 22326, TL 33600) ya no salen"
);
ok(tarjetasParaRespuesta("Sin referencias en el texto", recogidos).length === 0, "si el texto no nombra ninguno, ninguna tarjeta (nada que no venga a cuento)");
// Si el texto nombra la referencia y su variante, delante la que se puede comprar.
const dosCitados = [P(30, "SNR 6305", "SNR 6305", 0), P(31, "SNR 6305 C3", "SNR 6305 C3", 9)];
const conC3 = tarjetasParaRespuesta("El SNR 6305 C3 es una opcion mas grande que el 6205", dosCitados);
ok(conC3[0].id === 31, "entre las citadas, primero la que tiene unidades", conC3.map((p: any) => p.reference).join(", "));

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

section("DIRECCION DE TAMANO — 'mas grande' no puede devolver algo mas pequeno");
// Fallo real visto en produccion: partiendo del 6205, ante "ensename uno mas
// grande" el bot ofrecio el SNR 6005, que es MAS PEQUENO (DO47 vs 52, B12 vs
// 15), contradiciendo su propia tabla de diferencias.
const ficha6205 = findTechnicalInfo("6205")[0];
ok(direccionDeTamano("ensename uno mas grande") === "mas_grande", "detecta 'mas grande'");
ok(direccionDeTamano("quiero uno mas pequeno") === "mas_pequeno", "detecta 'mas pequeno'");
ok(direccionDeTamano("que caracteristicas tiene el 6205") === null, "no detecta direccion donde no la hay");
const arriba = candidatosPorTamano(ficha6205, "mas_grande").map((c: any) => c.ref);
ok(arriba.includes("6305") && arriba.includes("6206"), "mas grande que el 6205 -> 6305 y 6206", String(arriba));
ok(!arriba.includes("6005") && !arriba.includes("6204"), "y NUNCA el 6005 ni el 6204", String(arriba));
const abajo = candidatosPorTamano(ficha6205, "mas_pequeno").map((c: any) => c.ref);
ok(abajo.includes("6005") && abajo.includes("6204"), "mas pequeno que el 6205 -> 6005 y 6204", String(abajo));
ok(!abajo.includes("6305"), "y nunca el 6305", String(abajo));
const bloqueDir = bloqueOtraMedida(ficha6205, "ensename uno mas grande");
ok(/6305/.test(bloqueDir), "el bloque inyecta los candidatos correctos");
ok(/COMPROBACI[OÓ]N OBLIGATORIA/.test(bloqueDir), "el bloque obliga a comprobar el signo de las diferencias");

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

section("CORREAS TL (Translink) — datos de los catalogos del 14-10-2026");
{
  const { findTranslinkBelt, findTranslinkBeltForMessage } = require("../lib/kb") as typeof import("../lib/kb");
  const tl = (q: string) => findTranslinkBelt(q);
  const r1 = tl("correa dentada 600-8M-30");
  ok(r1[0]?.referencia === "TL-600-8M" && r1[0].datos["Número de dientes"] === 75 && r1[0].datos["Desarrollo (mm)"] === "600",
    "600-8M-30 -> TL-600-8M, 75 dientes, 600 mm", JSON.stringify(r1[0]?.datos));
  ok(tl("correa 8M 600")[0]?.referencia === "TL-600-8M", "orden inverso '8M 600'");
  const r2 = tl("correa XL 112");
  ok(r2[0]?.referencia === "TL-112XL-56" && r2[0].datos["Número de dientes"] === 56, "XL 112 -> TL-112XL-56 (56 dientes)", r2[0]?.referencia);
  ok(tl("TL-D-1040-8M")[0]?.datos["Doble cara"] === "Sí", "doble cara D-1040-8M");
  // Trapeciales: misma trampa Li/Ld que en Continental — devuelve las dos.
  const r3 = tl("correa A 1250").map((b) => b.referencia);
  ok(r3.includes("TL-A48") && r3.includes("TL-A49"), "A 1250 -> A48 (Ld 1250) y A49 (Li 1250)", String(r3));
  const a49 = tl("TL-A49")[0];
  ok(a49?.datos["Longitud interior Li (mm)"] === 1250 && a49?.datos["Longitud de paso Ld (mm)"] === 1280, "A49: Li 1250 / Ld 1280");
  ok(tl("SPZ 1250 translink")[0]?.datos["Longitud de paso Ld (mm)"] === 1250, "SPZ 1250 -> Ld 1250");
  ok(tl("6205 ZZ").length === 0, "un rodamiento no devuelve correas TL");
  ok(findTranslinkBeltForMessage("rodamiento 6205").length === 0, "sin intencion de correa no se inyecta nada");
  ok(findTranslinkBeltForMessage("necesito una correa A 1250").length === 2, "con intencion de correa si");
  // Fallo encontrado en revision: el perfil "Y/6" + Li 300 generaba la clave
  // "6300", que es un RODAMIENTO. Ninguna referencia de rodamiento puede
  // devolver una correa, ni siquiera con "correa" en el mismo mensaje.
  for (const r of ["6300", "6315", "6400", "6500", "6600", "6205", "22216"]) {
    ok(tl(r).length === 0, `"${r}" (rodamiento) no devuelve correas TL`, tl(r).map((b) => b.referencia).join(","));
  }
  ok(findTranslinkBeltForMessage("cambio la correa del motor y el rodamiento 6300").length === 0, "rodamiento 6300 junto a 'correa' tampoco");
  ok(tl("TL-Y/6-300")[0]?.referencia === "TL-Y/6-300", "pero TL-Y/6-300 escrita entera si se encuentra");
  // "60 dientes" es el numero de dientes, no la designacion 60XL (30 dientes).
  const d60 = tl("correa XL de 60 dientes");
  ok(d60.length > 0 && d60.every((b) => b.datos["Número de dientes"] === 60), "XL de 60 dientes -> correas de 60 dientes", d60.map((b) => b.referencia).join(","));
  ok(tl("correa 8M de 75 dientes")[0]?.referencia === "TL-600-8M", "8M de 75 dientes -> TL-600-8M");

  // EXHAUSTIVO: cada correa del catalogo se encuentra por su referencia y
  // devuelve exactamente su dato (dientes, o Li/Ld). Las de banda multiple
  // comparten referencia con la suelta: se piden diciendo "banda multiple".
  const dent = require("../data/kb/tl-dentadas.json") as { ref: string; dientes: number }[];
  const ind = require("../data/kb/tl-industriales.json") as { ref: string; familia: string; li_mm: number | null; ld_mm: number | null }[];
  const malas: string[] = [];
  for (const r of dent) {
    const x = findTranslinkBelt(r.ref, 50).find((b) => b.referencia === r.ref);
    if (!x || x.datos["Número de dientes"] !== r.dientes) malas.push(r.ref);
  }
  for (const r of ind) {
    const banda = /Banda/.test(r.familia);
    const x = findTranslinkBelt((banda ? "banda multiple " : "") + r.ref, 50).find((b) => b.referencia === r.ref && b.tipo.includes(r.familia));
    if (!x || (x.datos["Longitud interior Li (mm)"] ?? null) !== r.li_mm || (x.datos["Longitud de paso Ld (mm)"] ?? null) !== r.ld_mm) malas.push(r.ref);
  }
  ok(malas.length === 0, `las ${dent.length + ind.length} correas TL devuelven su dato exacto`, malas.slice(0, 8).join(","));
  ok(tl("TL-A112")[0]?.datos["Longitud de paso Ld (mm)"] === 2875 && tl("TL-A112").length === 1, "TL-A112 sin pedir banda -> solo la correa suelta");
  ok(tl("correa TL-B127")[0]?.tipo.includes("Banda"), "TL-B127 (solo existe en banda multiple) se da igualmente");

  // Fallo real en la preview: con "¿qué características tiene?" la busqueda
  // de Continental devolvia correas de OTRA longitud (288-H8M-30...).
  const msg = "necesito una correa dentada 600-8M-30, ¿qué características tiene?";
  const conti = findBelt(msg).map((b) => b.nombre);
  ok(conti.length > 0 && conti.every((n) => /^600-/.test(n)), "Continental 600-8M-30 con frase de pregunta -> solo correas de 600", String(conti));
  ok(findTranslinkBeltForMessage(msg)[0]?.referencia === "TL-600-8M", "y TL-600-8M por la parte de Translink");
}

section("SOPORTES TL — ficha oficial del catalogo Translink");
{
  const tl = (q: string) => findTechnicalInfo(q).filter((t) => t.marca.startsWith("TL"));
  const u = tl("soporte UCP205")[0];
  ok(u?.referencia === "TL-UCP205", "UCP205 -> ficha TL", u?.referencia ?? "");
  ok(u?.datos["Diámetro del eje (mm)"] === "25" && u?.datos["Referencia del rodamiento"] === "UC205" &&
     u?.datos["Referencia del cuerpo del soporte"] === "P205" && u?.datos["Peso (kg)"] === "0,81",
     "eje 25 · UC205 · P205 · 0,81 kg (verificado a mano en L11)", JSON.stringify(u?.datos));
  ok(/h 36,5/.test(String(u?.datos["Medidas (mm)"])) && /M10/.test(String(u?.datos["Tamaño de rosca (perno)"])), "medidas y rosca");
  ok(findTechnicalInfo("soporte UCP205").some((t) => t.marca === "SNR"), "y sigue saliendo la ficha SNR delante");
  ok(tl("33UCP205TL")[0]?.referencia === "TL-UCP205", "referencia de la pagina 33UCP205TL");
  ok(tl("TL-UCFL207-22")[0]?.datos["Diámetro del eje (pulgadas)"] === '1 3/8"', "UCFL207-22 en pulgadas (1 3/8\")");
  ok(tl("FPL207")[0]?.datos["Unidad de fundición equivalente"] === "UCF207", "termoplastico: unidad equivalente, no rodamiento");
  ok(tl("6205").length === 0, "un rodamiento no devuelve soportes TL");
  // Fallo encontrado en revision: 20 UCHA tienen una cota vacia en el PDF.
  const ucha = tl("UCHA201")[0];
  ok(!!ucha && !/null|undefined/.test(JSON.stringify(ucha.datos)), "UCHA201 sin cotas 'null'", String(ucha?.datos["Medidas (mm)"]));
  const todos = require("../data/kb/tl-soportes.json") as { ref: string }[];
  const conNull = todos.filter((s) => /null|undefined|NaN/.test(JSON.stringify(findTechnicalInfo(s.ref).filter((t) => t.marca.startsWith("TL")).map((t) => t.datos))));
  ok(conNull.length === 0, `ninguna de las ${todos.length} fichas TL tiene null/NaN`, conNull.slice(0, 5).map((s) => s.ref).join(","));
  const sinFicha = todos.filter((s) => !findTechnicalInfo(s.ref).some((t) => t.marca.startsWith("TL") && t.referencia === s.ref));
  ok(sinFicha.length === 0, `las ${todos.length} referencias TL se encuentran por su propia referencia`, sinFicha.slice(0, 5).map((s) => s.ref).join(","));
}

section("SALVAGUARDAS DE CORREAS — sobre respuestas reales que fallaron en la preview");
{
  const k = require("../lib/kb") as typeof import("../lib/kb");
  const m = "busco una correa trapecial A 1250";
  const amb = k.ambiguedadLiLd(m, k.findBeltForMessage(m), k.findTranslinkBeltForMessage(m));
  ok(!!amb && amb.porLi.includes("A49") && amb.porLd.includes("A48"), "A 1250 -> ambigua: A49 por Li, A48 por Ld", JSON.stringify(amb));
  ok(k.ambiguedadLiLd("correa A 1250 de longitud interior", k.findBeltForMessage(m), k.findTranslinkBeltForMessage(m)) === null, "si el cliente ya dice 'interior', no hay ambiguedad");
  // Respuesta real: solo A48 y "que es la medida que mencionaste".
  const mala = "**Continental A48**\n- Ld 1250\n\n**TL (Translink) A48**\n- Ld 1250\n\nAmbas correas tienen la misma longitud primitiva (Ld) de 1250 mm, que es la medida que mencionaste. Puedes añadir cualquiera de ellas al carrito aquí mismo.";
  const arreglada = k.asegurarAmbiguedadLiLd(mala, amb);
  ok(/A49/.test(arreglada) && /A48/.test(arreglada) && /longitud interior \(Li\)/.test(arreglada), "se añade la aclaracion con A48 y A49", arreglada.slice(-160));
  ok(!/medida que mencionaste/.test(arreglada), "y se quita la atribucion falsa 'que es la medida que mencionaste'");
  const buena = "**A48** (Li 1220 / Ld 1250) y **A49** (Li 1250 / Ld 1280). ¿Tu 1250 es la Li o la Ld?";
  ok(k.asegurarAmbiguedadLiLd(buena, amb) === buena, "si ya presenta las dos, no se toca");

  // Respuesta real: "no está disponible" sin ningun dato.
  const msg = "necesito una correa dentada 600-8M-30, ¿qué características tiene?";
  const sinDatos = "Actualmente, ninguna de las correas dentadas 600-8M-30 está disponible en nuestra página para compra directa. Puedes contactarnos por teléfono o e-mail.";
  const conDatos = k.asegurarDatosCorrea(sinDatos, k.findBeltForMessage(msg), k.findTranslinkBeltForMessage(msg));
  ok(/600-H8M-30/.test(conDatos) && /TL-600-8M/.test(conDatos) && /dientes: 75/.test(conDatos), "se anteponen los datos (600-H8M-30, TL-600-8M, 75 dientes)", conDatos.slice(0, 260));
  ok(k.asegurarDatosCorrea("La **TL-600-8M** tiene 75 dientes.", [], k.findTranslinkBeltForMessage(msg)) === "La **TL-600-8M** tiene 75 dientes.", "si ya da los datos, no se toca");

  const { tarjetasParaRespuesta } = require("../lib/variantes") as typeof import("../lib/variantes");
  const prods = [{ reference: "33A49TL", name: "CORREA TL PRO SERIES A49", stock: 42 }, { reference: "NTN NA4903 LL/3AS", name: "NTN NA4903", stock: 5 }] as any[];
  const t = tarjetasParaRespuesta("**CORREA TL PRO SERIES A49**\n\n**Ref: 33A49TL**", prods);
  ok(t.length === 1 && t[0].reference === "33A49TL", "hablando de la A49 no salen tarjetas de rodamientos NA4903", t.map((p: any) => p.reference).join(","));
  const pA48 = [
    { reference: "175125031000A", name: "TUBO BONDIOLI HEMBRA G1 1000MM", stock: 0 },
    { reference: "33A48TL", name: "CORREA TL PRO SERIES A48", stock: 43 },
    { reference: "CORREA CONTINENTAL A48", name: "CORREA CONTINENTAL A48", stock: 6 },
  ] as any[];
  const tA48 = tarjetasParaRespuesta("**Continental A48** (Li 1220 / Ld 1250) y **TL-A48** (Li 1220 / Ld 1250)", pA48).map((p: any) => p.reference);
  ok(tA48.includes("33A48TL") && tA48.includes("CORREA CONTINENTAL A48") && !tA48.includes("175125031000A"),
    "A48: tarjetas TL (33A48TL) y Continental, nunca el tubo Bondioli", tA48.join(","));
  // Caso real del cliente: "necesito 40 rodamientos 6205 zz c3" -> el texto
  // hablaba solo del stock y la tarjeta (para añadir las 19 uds) no salia.
  const p6205 = [{ reference: "SNR 6205 ZZ C3", name: "SNR 6205 ZZ C3", stock: 19 }] as any[];
  const tStock = tarjetasParaRespuesta("**Stock:** 🔴 19 uds disponibles (has pedido 40)", p6205, "necesito 40 rodamientos 6205 zz c3");
  ok(tStock.length === 1, "sobre-pedido: sale la tarjeta del producto que nombro el cliente");
  const vv = require("../lib/variantes") as typeof import("../lib/variantes");
  ok(vv.cantidadPedida("necesito 40 rodamientos 6205 zz c3") === 40, "lee la cantidad pedida (40)");
  ok(vv.cantidadPedida("rodamiento 6205 zz c3") === null, "sin cantidad no inventa ninguna (6205 no es una cantidad)");
  const aj = vv.ajustarCantidad("**Stock:** 🔴 26 uds (has pedido 40)", [{ reference: "SNR 6205 ZZ C3", stock: 26 }] as any[], "necesito 40 rodamientos 6205 zz c3");
  ok(aj.productos[0].qty === 40, "la tarjeta recibe la cantidad (el selector la limita a las 26 de stock)");
  ok(/¿Quieres que te deje las \*\*26 uds\*\* en el carrito\?/.test(aj.texto), "y se pregunta si se dejan las 26 en el carrito", aj.texto.slice(-120));
}

section("SEGUIMIENTO SIN REFERENCIA — la ficha del producto de la conversacion");
{
  const v = require("../lib/variantes") as typeof import("../lib/variantes");
  // Caso real de la preview: "¿y cuánto pesa?" -> el bot invento 1,3 kg.
  ok(v.esPreguntaTecnicaSinRef("¿y qué rodamiento lleva y cuánto pesa?"), "detecta pregunta tecnica sin referencia");
  ok(!v.esPreguntaTecnicaSinRef("¿cuánto pesa el UCP206?"), "con referencia nueva no aplica");
  ok(!v.esPreguntaTecnicaSinRef("vale, gracias"), "sin pregunta tecnica no aplica");
  const hist = [
    { role: "user", content: "¿puedes facilitarme las características de un soporte UCP205?" },
    { role: "assistant", content: "**TL (Translink) UCP205**\n\n**Ref: TL-UCP205**\n- **Diámetro del eje:** 25 mm" },
  ];
  const f = v.fichasDeConversacion(hist);
  const tlF = f.find((x) => x.referencia === "TL-UCP205");
  ok(!!tlF && tlF.datos["Peso (kg)"] === "0,81" && tlF.datos["Referencia del rodamiento"] === "UC205", "ficha TL-UCP205: 0,81 kg y UC205", JSON.stringify(tlF?.datos));
  const b = v.bloqueFichaConversacion(f) ?? "";
  ok(/0,81/.test(b) && /PROHIBIDO dar cualquier valor/.test(b), "el bloque lleva el dato y la prohibicion de inventar");
  ok(/termopl[aá]stico/i.test(tlF?.aviso ?? ""), "la ficha TL avisa de que no vale para la version termoplastica");
}

section("FICHA DE OTRA PIEZA — fundicion copiada a un termoplastico (real, preview)");
{
  const v = require("../lib/variantes") as typeof import("../lib/variantes");
  const { readFileSync } = require("fs");
  const { join } = require("path");
  const real = readFileSync(join(__dirname, "fixtures", "soporte-termoplastico-con-ficha-de-fundicion.md"), "utf-8").replace(/\r\n/g, "\n");
  const arreglado = v.quitarFichaDeOtraPieza(real);
  const [fund, termo] = arreglado.split(/\n-{3,}\n/).slice(1, 3);
  ok(/0,81 kg/.test(fund) && /P205/.test(fund), "el de fundicion conserva su ficha (P205, 0,81 kg)");
  ok(!/0,81 kg|cuerpo del soporte|Referencia del rodamiento|h 36,5|M10/.test(termo), "el termoplastico ya no lleva los datos de fundicion", termo.slice(0, 200));
  ok(/no la tengo en la base de datos/.test(termo), "y explica que su ficha no esta y ofrece confirmarla");
  ok(v.quitarFichaDeOtraPieza("**SOPORTE FUNDICION TL UCP 205**\n\n**Ref: 33UCP205TL**\n- **Peso:** 0,81 kg") ===
    "**SOPORTE FUNDICION TL UCP 205**\n\n**Ref: 33UCP205TL**\n- **Peso:** 0,81 kg", "misma pieza y material: no se toca");
}

section("FICHA REESCRITA DESDE LA BASE DE DATOS — respuesta REAL de produccion con datos inventados");
{
  const v = require("../lib/variantes") as typeof import("../lib/variantes");
  const { readFileSync } = require("fs");
  const { join } = require("path");
  const mala = readFileSync(join(__dirname, "fixtures", "6205zzc3-datos-inventados.md"), "utf-8").replace(/\r\n/g, "\n");
  const buena = v.corregirFichasConKB(mala);
  ok(/Tolerancia:\*\* C3 \(Juego radial superior al normal\)/.test(buena), "tolerancia C3 (el modelo puso 'Normal')");
  ok(/Velocidad límite:\*\* 17000 rpm/.test(buena) && !/15,000/.test(buena), "velocidad limite 17000 rpm (el modelo puso 15.000)");
  ok(/estática:\*\* 7\.9 kN/.test(buena) && !/7,8 kN/.test(buena), "carga estatica 7.9 kN (el modelo puso 7,8)");
  ok(/Peso:\*\* 128 g/.test(buena) && !/0\.13 kg/.test(buena), "peso 128 g");
  ok(!/Chapa de acero/.test(buena), "fuera la jaula inventada");
  ok(/Precio:/.test(buena) && /26 uds/.test(buena), "precio y stock intactos");
  const { extraerFichas } = require("../lib/ficha") as typeof import("../lib/ficha");
  const pdf = extraerFichas(buena)[0];
  ok(!!pdf && pdf.datos.some(([k, val]) => k === "Velocidad límite" && val === "17000 rpm"), "y el PDF lleva el dato oficial");
  // Sin bloque tecnico: se inserta antes del precio.
  const sinFicha = "**SNR 6205 ZZ C3**\n\n**Ref: SNR 6205 ZZ C3**\n- **62** → serie\n\n**Precio:** 1 EUR\n\n**Stock:** 🟢 2 uds";
  const conFicha = v.corregirFichasConKB(sinFicha);
  ok(/Información técnica completa/.test(conFicha) && conFicha.indexOf("Información técnica") < conFicha.indexOf("Precio"), "si falta la ficha, se inserta antes del precio");
  // Referencia que no esta exacta en la base de datos: no se toca.
  const otra = "**XYZ 999**\n\n**Ref: XYZ 999**\n\n**Información técnica completa:**\n- **Peso:** 5 g";
  ok(v.corregirFichasConKB(otra) === otra, "referencia sin ficha exacta: intacta");
}

section("COMPARATIVA EN PDF — filas y diferencias");
{
  const { filasComparativa, nombreFicheroComparativa } = require("../lib/fichaPdf") as typeof import("../lib/fichaPdf");
  const fA = { titulo: "SNR 6205", referencia: "6205", resumen: [], medidas: "dØ25 × DØ52 × B15 mm", datos: [["Peso", "125 g"], ["Tolerancia", "CN"], ["Velocidad límite", "22000 rpm"]] as [string, string][] };
  const fB = { titulo: "SNR 6205 ZZ C3", referencia: "6205 ZZ C3", resumen: [], medidas: "dØ25 × DØ52 × B15 mm", datos: [["Peso", "128 g"], ["Tolerancia", "C3"], ["Junta", "ZZ"]] as [string, string][] };
  const filas = filasComparativa([fA, fB]);
  const fila = (e: string) => filas.find((f) => f.etiqueta === e);
  ok(fila("Medidas")?.difiere === false, "mismas medidas -> no resaltada");
  ok(fila("Peso")?.difiere === true && fila("Tolerancia")?.difiere === true, "peso y tolerancia distintos -> resaltadas");
  ok(JSON.stringify(fila("Junta")?.valores) === JSON.stringify(["—", "ZZ"]), "dato que solo tiene uno -> '—' en el otro y resaltada", JSON.stringify(fila("Junta")));
  ok(nombreFicheroComparativa([fA, fB]) === "Comparativa-6205-vs-6205ZZC3.pdf", "nombre del fichero", nombreFicheroComparativa([fA, fB]));
}

section("CIERRES PASIVOS — se sustituyen por una salida concreta");
{
  const { limpiarCierreVacio } = require("../lib/guardrails") as typeof import("../lib/guardrails");
  const base = "**TL-UCFL207**\n- **Peso:** 1,2 kg";
  const r1 = limpiarCierreVacio(`${base}\n\nSi necesitas más información o quieres saber si está disponible para compra, házmelo saber.`);
  ok(!/h[aá]zmelo/.test(r1) && /tel[eé]fono o e-mail/.test(r1), "'házmelo saber' -> contacto", r1.slice(-90));
  const r2 = limpiarCierreVacio(`${base}\n\nSi necesitas adquirirla, puedo ayudarte a buscarla.`, true);
  ok(!/buscarla/.test(r2) && !/tel[eé]fono/.test(r2), "con tarjeta comprable: se quita y no se añade nada", r2.slice(-60));
  const li = "Para confirmar cuál es la correcta, necesito saber si el número que tienes es la longitud interior (Li) o la primitiva (Ld). Con ese dato, puedo indicarte cuál es la opción adecuada.";
  ok(limpiarCierreVacio(li) === li, "la pregunta Li/Ld (necesaria) NO se toca");
  ok(limpiarCierreVacio(base) === base, "texto sin coletilla, intacto");
}

section("FICHA TECNICA EN PDF — se extrae de respuestas REALES del bot");
// Las fixtures son respuestas literales de produccion (14-10-2026) a las
// preguntas del documento del cliente. El PDF tiene que llevar exactamente
// lo que el cliente acaba de leer en el chat, sin precio ni stock.
{
  const { readFileSync } = require("fs");
  const { join } = require("path");
  const { extraerFichas, nombreFicheroFicha } = require("../lib/ficha") as typeof import("../lib/ficha");
  // Git en Windows puede dejar las fixtures con CRLF; el bot responde en LF.
  const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf-8").replace(/\r\n/g, "\n");

  const f1 = extraerFichas(fx("ficha-ntn-6812llu5k.md"));
  ok(f1.length === 1, "6812 LLU/5K -> una ficha", String(f1.length));
  ok(f1[0]?.titulo === "NTN 6812 LLU/5K" && f1[0]?.referencia === "6812 LLU/5K", "titulo y referencia", f1[0] ? f1[0].titulo + " / " + f1[0].referencia : "");
  ok(f1[0]?.resumen.length === 3 && /^68 → /.test(f1[0].resumen[0]), "resumen con la decodificacion (68 → ...)", String(f1[0]?.resumen));
  ok(f1[0]?.medidas === "dØ60 × DØ78 × B10 mm", "medidas", String(f1[0]?.medidas));
  ok(f1[0]?.datos.length === 12, "12 datos tecnicos (como el ejemplo del cliente)", String(f1[0]?.datos.length));
  ok(f1[0]?.datos.some(([k, v]) => k === "Capacidad de carga dinámica" && v === "12.7 kN"), "carga dinamica 12.7 kN");
  ok(!/precio|stock|EUR/i.test(JSON.stringify(f1)), "sin precio ni stock en la ficha");
  ok(nombreFicheroFicha(f1) === "Ficha-tecnica-NTN-6812-LLU-5K.pdf", "nombre del fichero", nombreFicheroFicha(f1));

  // Soporte: la respuesta trae 3 productos, pero solo uno con informacion
  // tecnica completa; las dos tarjetas TL sin ficha no deben generar PDF.
  const f2 = extraerFichas(fx("ficha-soporte-ucp205.md"));
  ok(f2.length === 1 && f2[0].referencia === "UCP205", "soporte UCP205 -> solo la ficha con datos", f2.map((f) => f.referencia).join(","));
  ok((f2[0]?.datos.length ?? 0) >= 20, "con todos sus datos de alojamiento", String(f2[0]?.datos.length));

  const f3 = extraerFichas(fx("ficha-ntn-4t-jm612910pk.md"));
  ok(f3.length === 1 && f3[0].titulo === "NTN 4T-JM612910PK", "4T-JM612910PK (la captura del cliente)", f3[0]?.titulo ?? "");

  ok(extraerFichas("Hola, soy el **técnico de ESGAS**. ¿Qué rodamiento necesitas?").length === 0, "saludo -> sin PDF");

  // Respuesta real de la preview (14-10-2026): ficha SNR + ficha TL con los
  // datos directamente bajo "Ref:", sin encabezado. Tienen que salir las dos.
  const sop = extraerFichas(fx("ficha-soporte-ucp205-snr-y-tl.md"));
  ok(sop.length === 2, "UCP205 SNR + TL sin encabezado -> dos fichas", sop.map((f) => f.titulo).join(" | "));
  const tlf = sop.find((f) => /TL/.test(f.titulo));
  ok(!!tlf && tlf.datos.some(([k, v]) => /cuerpo/i.test(k) && v === "P205") && tlf.datos.some(([k, v]) => /rodamiento/i.test(k) && v === "UC205"),
    "la ficha TL lleva cuerpo P205 y rodamiento UC205", JSON.stringify(tlf?.datos));
  ok(tlf?.datos.length === 8 && !/EUR|33UCP205/.test(JSON.stringify(sop)), "y NADA de la lista de productos/precios de la pagina", String(tlf?.datos.length));

  // Fallos encontrados en revision.
  const datos3 = "**Información técnica completa:**\n- **Peso:** 125 g\n- **Tolerancia:** CN\n- **Junta:** No\n";
  const dos = extraerFichas(`**NTN 6205**\n\n**Ref: 6205**\n- 62 → serie\n\n${datos3}\n---\n\n**SNR 6205**\n\n**Ref: 6205**\n- 62 → serie\n\n${datos3}`);
  ok(dos.length === 2, "NTN 6205 y SNR 6205 (misma Ref) -> dos fichas en el PDF", dos.map((f) => f.titulo).join(" | "));
  const h3 = extraerFichas(`### NTN 6205\n\n**Ref: 6205**\n\n${datos3}`);
  ok(h3.length === 1 && h3[0].titulo === "NTN 6205", "titulo con ### tambien vale", h3[0]?.titulo ?? "");
  const sinRef = extraerFichas(`**SOPORTE TL UCP205**\n\n${datos3}`);
  ok(sinRef.length === 1, "ficha sin linea Ref tambien da PDF");
  const anid = extraerFichas(`**TL-UCP205**\n\n**Ref: TL-UCP205**\n\n**Información técnica completa:**\n- **Peso:** 0,81 kg\n- **Medidas:**\n  - h: 36,5\n  - a: 140\n- **Rosca:** M10\n`);
  ok(JSON.stringify(anid[0]?.datos) === JSON.stringify([["Peso", "0,81 kg"], ["Medidas h", "36,5"], ["Medidas a", "140"], ["Rosca", "M10"]]),
    "vinetas anidadas conservan la etiqueta padre", JSON.stringify(anid[0]?.datos));
  const stockMin = extraerFichas(`**X 1**\n\n**Ref: X1**\n\n**Información técnica completa:**\n- **Stock mínimo de grasa:** 2 g\n- **Peso:** 1 g\n- **Junta:** No\n- **Precio:** 3 EUR\n`);
  ok(stockMin[0]?.datos.length === 3 && stockMin[0].datos[0][0] === "Stock mínimo de grasa", "solo se quita Precio/Stock exactos", JSON.stringify(stockMin[0]?.datos));

  const { latin1 } = require("../lib/fichaPdf") as typeof import("../lib/fichaPdf");
  ok(latin1("Temperatura: −30 a +110 °C") === "Temperatura: -30 a +110 °C", "el signo menos (U+2212) no se pierde en el PDF");
  ok(latin1("Eje 1⅜\"") === "Eje 1 3/8\"", "1⅜ -> 1 3/8 (nunca 13/8)", latin1("Eje 1⅜\""));
  ok(latin1("dØ25 × DØ52 mm") === "dØ25 × DØ52 mm", "Ø y × se conservan");
  ok(
    extraerFichas("**SNR 6205**\n\n**Ref: 6205**\n- 62 → serie\n\n**Precio:** 1.93 EUR\n\n**Stock:** 🟢 12 uds").length === 0,
    "producto sin ficha tecnica -> sin PDF"
  );

  // PDF "si o si" (22-10-2026): si el bot no respeta el formato pero consulto
  // la ficha verificada y nombra la referencia, el PDF sale del KB.
  const { fichasParaPdf, textoNombraRef } = require("../lib/ficha") as typeof import("../lib/ficha");
  const kb6205 = findTechnicalInfo("6205").filter((t) => t.referencia.replace(/\s/g, "") === "6205");
  ok(kb6205.length > 0, "KB tiene la ficha del 6205", kb6205.map((t) => t.marca + " " + t.referencia).join(", "));
  const prosa = "El SNR 6205 es un rodamiento rígido de bolas de una hilera, con 25 mm de diámetro interior, 52 mm de exterior y 15 mm de ancho. Pesa 125 g.";
  const pdfProsa = fichasParaPdf(prosa, kb6205);
  ok(pdfProsa.length >= 1 && pdfProsa[0].datos.length >= 5, "respuesta en prosa (sin formato) -> PDF desde el KB", JSON.stringify(pdfProsa[0]?.datos?.slice(0, 4)));
  ok(pdfProsa[0]?.medidas === "dØ25 × DØ52 × B15 mm", "medidas montadas desde el KB", pdfProsa[0]?.medidas ?? "");
  ok(pdfProsa[0]?.datos.some(([k, v]) => k === "Peso" && v === "125 g"), "la unidad pasa de la etiqueta al valor (Peso: 125 g)", JSON.stringify(pdfProsa[0]?.datos));
  ok(fichasParaPdf("Hola, ¿qué rodamiento necesitas?", kb6205).length === 0, "si la respuesta no nombra la referencia, no hay PDF del KB");
  ok(!textoNombraRef("el 6205ZZ va con deflectores", "6205"), "6205 no se confunde con 6205ZZ");
  ok(textoNombraRef("el SNR 6205 ZZ C3 tiene", "6205ZZC3"), "6205ZZC3 se reconoce escrito con espacios");
  const conFormato = fichasParaPdf(fx("ficha-ntn-6812llu5k.md"), findTechnicalInfo("6812LLU/5K"));
  ok(conFormato.length === extraerFichas(fx("ficha-ntn-6812llu5k.md")).length, "con formato correcto no se duplica la ficha con la del KB", conFormato.map((f) => f.titulo).join(" | "));
  const comp = fichasParaPdf("Diferencias entre el SNR 6205 y el SNR 6305: el 6305 es más grande.", [...findTechnicalInfo("6205").slice(0, 1), ...findTechnicalInfo("6305").slice(0, 1)]);
  ok(comp.length === 2, "comparativa en prosa -> dos fichas -> boton de comparativa PDF", comp.map((f) => f.titulo).join(" | "));

  // Saneado de datos del Excel del cliente (auditoria 22-10-2026).
  const esc = findTechnicalInfo("ESC201")[0];
  ok(esc?.datos["Diámetro interior dØ (mm)"] === 12 && esc?.datos["Diámetro exterior DØ (mm)"] === 40,
    "soporte ESC201: eje y exterior ya no salen intercambiados (dØ12 × DØ40)", JSON.stringify([esc?.datos["Diámetro interior dØ (mm)"], esc?.datos["Diámetro exterior DØ (mm)"]]));
  const copa = findTechnicalInfo("4T-03162")[0];
  ok(!!copa && copa.datos["Diámetro interior dØ (mm)"] === undefined && /incoherentes/.test(copa.aviso ?? ""),
    "4T-03162 (dØ180 > DØ41 en el Excel): no se dan los diametros y el bot recibe aviso");
  const ft150 = findTechnicalInfo("6001FT150ZZ")[0];
  ok(!!ft150 && ft150.datos["Peso (g)"] === undefined, "6001FT150ZZ: peso imposible (210 g para 12x28x8) omitido");
  const nj = findTechnicalInfo("NJ209EAT2XC3")[0];
  ok(!!nj && nj.datos["Peso (g)"] === undefined, "peso 0 no se da como dato");
  const sano = findTechnicalInfo("6205")[0];
  ok(sano?.datos["Peso (g)"] === 125 && !sano.aviso, "una ficha correcta queda intacta y sin aviso");
  const c915 = findBelt("C91.5")[0];
  ok(c915?.longitud_interior_Li_mm === 2324, "correa C91.5: Li recuperada del codigo (2324, no 324)", String(c915?.longitud_interior_Li_mm));
}

console.log(`\n${fails === 0 ? "TODO OK" : fails + " FALLOS"}\n`);
process.exit(fails === 0 ? 0 : 1);
