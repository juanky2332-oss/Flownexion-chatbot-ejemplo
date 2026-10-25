import "server-only";
import type { Product } from "./types";
import { findTechnicalInfo, findGlossary, extractQueryCandidates, type TechInfo } from "./kb";
import { boreCodeFor, nextStandardBore } from "./bearingSizes";

/**
 * Análisis de VARIANTES y COMPARATIVAS.
 *
 * Nace de dos fallos reportados por el cliente sobre una misma conversación
 * real (le preguntó por un 6205):
 *
 * 1. El catálogo devolvió el **SNR 6205 sin stock** y el **SNR 6205 C3 con 12
 *    uds**, y el bot presentó los dos sueltos: dijo "sin stock" de uno y a la
 *    vez "puedes añadirlo al carrito cuando haya stock", sin decir en ningún
 *    momento que la variante C3 SÍ está disponible ahora mismo ni en qué se
 *    diferencia. El cliente se va sin comprar algo que sí teníamos.
 * 2. Al ofrecer un rodamiento de otra medida ("uno más grande"), no daba la
 *    diferencia concreta entre el que traía el cliente y el propuesto, que es
 *    justo lo que hace falta para comprobar si encaja en su montaje.
 *
 * Este módulo resuelve las dos cosas de forma DETERMINISTA (el patrón ya
 * consolidado en el proyecto: no depender de que el modelo se acuerde):
 * separa una referencia en base + sufijos, empareja variantes de la misma
 * base y monta la tabla comparativa a partir de la ficha técnica del KB.
 *
 * IMPORTANTE — aquí NO se explica qué significa ningún sufijo. Esto es
 * análisis estructural (qué letras cambian). El SIGNIFICADO técnico sale
 * siempre del glosario editable (data/kb/glosario.json, vía findGlossary),
 * que es la fuente autorizada y la que ESGAS puede corregir sin tocar código.
 */

/** Marcas que preceden a la referencia en el catálogo ("SNR 6205 C3"). */
// También la palabra genérica con la que empiezan algunos nombres de la
// página ("RODAMIENTO TL 6205 2RS"): sin quitarla, ese producto no se
// reconocía como variante del 6205 y el bot mandaba al teléfono teniendo
// 1.660 uds a la venta (visto en producción el 23-10-2026).
const MARCA_INICIAL =
  /^(RODAMIENTOS?(?:\s+DE\s+(?:BOLAS|RODILLOS))?|NTN|SNR|TL|INA|FAG|SKF|NSK|TIMKEN|KOYO|NACHI|CONTINENTAL|CONTI|SEDIS|BONDIOLI|CORTECO)[\s\-/]*/;

/**
 * Sufijos estructurales reconocidos, de más largo a más corto: la
 * tokenización es voraz y "2RS1" tiene que ganarle a "2RS", y "LLU" a "LU".
 * Es una lista de FORMAS, no de significados.
 */
const SUFIJOS = [
  "2RSR", "2RS1", "2RSH", "2ZR", "2RS", "2RZ", "DDU", "LLU", "LLB", "LLH",
  "LLJ", "TN9", "TVH", "T2X", "W33", "AGR", "G15", "G14", "RS1", "2Z",
  "LU", "LB", "LH", "EE", "VV", "ZZ", "RS", "RZ", "NR", "TN", "T2", "JR",
  "L3", "L4", "E1", "E5", "D1", "C1", "C2", "C3", "C4", "C5", "CN", "CM",
  "C0", "P0", "P2", "P4", "P5", "P6",
  "Z", "E", "K", "M", "N", "W", "X", "U", "S", "G",
].sort((a, b) => b.length - a.length);

/** Sufijos que empiezan por dígito: el dígito es del sufijo, no de la base. */
const SUFIJOS_CON_DIGITO = SUFIJOS.filter((s) => /^\d/.test(s));

export interface ReferenciaPartida {
  /** Referencia normalizada completa, sin marca ni separadores. */
  completa: string;
  /** Parte base (serie + código de agujero), p.ej. "6205", "UC205", "22216". */
  base: string;
  /** Sufijos en el orden en que aparecen, p.ej. ["ZZ", "C3"]. */
  sufijos: string[];
}

/** Quita la marca y los separadores; deja la referencia comparable. */
export function normalizarRef(raw: string): string {
  let x = String(raw ?? "").toUpperCase().trim();
  for (;;) {
    const y = x.replace(MARCA_INICIAL, "");
    if (y === x) break;
    x = y;
  }
  return x.replace(/[\s\-/.]/g, "");
}

/**
 * Parte una referencia en base + sufijos.
 * "SNR 6205 C3" → base "6205", sufijos ["C3"]
 * "6205ZZC3"    → base "6205", sufijos ["ZZ", "C3"]
 * "UC205"       → base "UC205", sufijos []
 */
export function partirReferencia(raw: string): ReferenciaPartida {
  const completa = normalizarRef(raw);
  const m = completa.match(/^([A-Z]{0,4})(\d{2,5})/);
  if (!m) return { completa, base: completa, sufijos: [] };

  const letras = m[1];
  let digitos = m[2];
  let resto = completa.slice(letras.length + digitos.length);

  // Los sufijos que EMPIEZAN por dígito (2RS, 2RZ, 2Z...) se llevaban ese
  // dígito a la base: "6205 2RS" se partía como base "62052" + sufijo "RS", y
  // entonces no emparejaba con el 6205 C3 del catálogo. Si el último dígito
  // de la base, pegado al resto, forma uno de esos sufijos, ese dígito es
  // suyo, no de la referencia base.
  if (digitos.length > 2) {
    const conDigito = digitos.slice(-1) + resto;
    if (SUFIJOS_CON_DIGITO.some((s) => conDigito.startsWith(s))) {
      digitos = digitos.slice(0, -1);
      resto = conDigito;
    }
  }

  const base = letras + digitos;
  const sufijos: string[] = [];
  let desconocido = "";

  while (resto.length > 0) {
    let encontrado = SUFIJOS.find((s) => resto.startsWith(s));
    // Un sufijo de UNA sola letra solo vale si cierra la referencia o si lo
    // que viene detrás es otro sufijo conocido. Si no, es parte de un código
    // que no reconocemos ("22216 EA W33": la "E" no es un sellado, es el
    // principio de "EA") y se acumula como desconocido en vez de trocearlo.
    if (encontrado && encontrado.length === 1) {
      const siguiente = resto.slice(1);
      if (siguiente && !SUFIJOS.some((s) => siguiente.startsWith(s))) {
        encontrado = undefined;
      }
    }
    if (encontrado) {
      if (desconocido) {
        sufijos.push(desconocido);
        desconocido = "";
      }
      sufijos.push(encontrado);
      resto = resto.slice(encontrado.length);
    } else {
      desconocido += resto[0];
      resto = resto.slice(1);
    }
  }
  if (desconocido) sufijos.push(desconocido);

  return { completa, base, sufijos };
}

export interface VarianteProducto {
  producto: Product;
  /** true si la referencia coincide exactamente con la pedida. */
  exacta: boolean;
  /** Sufijos que la variante AÑADE respecto a la pedida. */
  anade: string[];
  /** Sufijos que la variante NO tiene y la pedida sí. */
  quita: string[];
  /** Unidades disponibles ahora mismo (undefined si no se pudo consultar). */
  stock?: number;
}

export interface AnalisisVariantes {
  /** Referencia pedida, ya partida. */
  pedida: ReferenciaPartida;
  /** Productos de la misma base que la pedida (incluye la exacta si existe). */
  familia: VarianteProducto[];
  /** Coincidencias exactas encontradas en el catálogo. */
  exactas: VarianteProducto[];
  /**
   * true cuando la referencia exacta existe en catálogo pero está a 0, o
   * cuando directamente no aparece: en ambos casos el cliente NO puede
   * comprar lo que pidió tal cual.
   */
  exactaSinStock: boolean;
  /** Variantes distintas de la pedida CON stock, de menor a mayor diferencia. */
  alternativasConStock: VarianteProducto[];
}

/**
 * Empareja lo que pidió el cliente con lo que devolvió el catálogo y detecta
 * el caso clave: la exacta no se puede servir pero una variante sí.
 */
export function analizarVariantes(
  refPedida: string,
  productos: Product[]
): AnalisisVariantes {
  const pedida = partirReferencia(refPedida);
  const familia: VarianteProducto[] = [];

  for (const p of productos) {
    // La referencia del catálogo es lo fiable; el nombre solo como respaldo
    // cuando el producto no trae reference (pasa en algunas altas).
    const partida = partidaDelProducto(p, pedida.base);
    if (partida.base !== pedida.base) continue;

    const exacta = partida.completa === pedida.completa;
    const anade = partida.sufijos.filter((s) => !pedida.sufijos.includes(s));
    const quita = pedida.sufijos.filter((s) => !partida.sufijos.includes(s));
    familia.push({ producto: p, exacta, anade, quita, stock: p.stock });
  }

  const exactas = familia.filter((v) => v.exacta);
  const hayExactaConStock = exactas.some((v) => (v.stock ?? 0) > 0);

  const alternativasConStock = familia
    .filter((v) => !v.exacta && (v.stock ?? 0) > 0)
    // Menos diferencias primero: la variante más parecida es la mejor
    // propuesta de sustitución.
    .sort(
      (a, b) =>
        a.anade.length + a.quita.length - (b.anade.length + b.quita.length)
    );

  return {
    pedida,
    familia,
    exactas,
    exactaSinStock: !hayExactaConStock,
    alternativasConStock,
  };
}

/**
 * Ordena los productos encontrados para decidir cuáles se llevan las (máx. 3)
 * tarjetas del chat: primero la referencia exacta que pidió el cliente, luego
 * las variantes que SÍ tienen unidades, y al final el resto.
 *
 * Sin esto, con una familia numerosa (6205, 6205 ZZ, 6205 LLU, 6205 C3...) la
 * única variante con stock podía quedarse fuera de las tarjetas justo cuando
 * es la que se puede comprar — que es el fallo que se está corrigiendo.
 */
export function ordenarParaTarjetas(refPedida: string, productos: Product[]): Product[] {
  const pedida = partirReferencia(refPedida);
  const peso = (p: Product): number => {
    const partida = partirReferencia(p.reference || p.name);
    const conStock = (p.stock ?? 0) > 0;
    if (partida.completa === pedida.completa) return 0;
    if (partida.base === pedida.base && conStock) return 1;
    if (conStock) return 2;
    if (partida.base === pedida.base) return 3;
    return 4;
  };
  return [...productos].sort((a, b) => peso(a) - peso(b));
}

/**
 * Quita del resultado de una búsqueda POR REFERENCIA los productos que no son
 * de esa familia.
 *
 * Caso real: preguntando por el 6205 salía como tercera tarjeta un "NTN 22216
 * EA W33" de 77 € y sin stock, que no tiene nada que ver (lo cuela la búsqueda
 * del Webservice por supplier_reference). Al cliente le desconcierta y ocupa
 * el sitio de una variante que sí le sirve.
 *
 * Solo se aplica cuando la búsqueda venía de una referencia detectada: si
 * NINGÚN resultado es de la familia, se devuelve la lista intacta (puede ser
 * un acierto legítimo por nombre o descripción y no queremos perderlo).
 */
/**
 * La referencia de un producto partida, probando primero su referencia de la
 * tienda y, si esa no es de la familia buscada, su nombre. Los códigos
 * internos de TL ("3362052RSTL" = TL 6205 2RS) no se parecen a la designación,
 * pero el nombre sí ("RODAMIENTO TL 6205 2RS").
 */
function partidaDelProducto(p: Product, baseBuscada: string): ReferenciaPartida {
  const porRef = partirReferencia(p.reference || p.name);
  if (porRef.base === baseBuscada || !p.name) return porRef;
  const porNombre = partirReferencia(p.name);
  return porNombre.base === baseBuscada ? porNombre : porRef;
}

export function filtrarFueraDeFamilia(refPedida: string, productos: Product[]): Product[] {
  const pedida = partirReferencia(refPedida);
  const familia = productos.filter((p) => partidaDelProducto(p, pedida.base).base === pedida.base);
  return familia.length > 0 ? familia : productos;
}

/**
 * Elige qué productos se llevan las (máx. 3) tarjetas del chat: los que el bot
 * ha nombrado DE VERDAD en su respuesta van primero.
 *
 * Fallo real visto en producción: ante "enséñame uno más grande", el modelo
 * describía el SNR 6305 C3 pero las tarjetas mostraban un SNR 6005, un NTN
 * 22326 y un TL — productos de una búsqueda por diámetro anterior que habían
 * entrado antes en la lista. Las tarjetas se cogían por orden de llegada, así
 * que el producto del que hablaba el texto se quedaba fuera y el cliente veía
 * tres fichas que no eran la suya.
 */
export function tarjetasParaRespuesta(respuesta: string, productos: Product[], mensajeCliente = ""): Product[] {
  // El producto que el CLIENTE ha nombrado también es relevante aunque el
  // texto del bot no lo repita: "necesito 40 rodamientos 6205 zz c3" tiene
  // que acabar con la tarjeta del 6205 ZZ C3 para poder añadir las uds.
  const bruto = `${String(respuesta ?? "")}\n${String(mensajeCliente ?? "")}`.toUpperCase();
  const texto = bruto.replace(/[\s\-/.]/g, "");
  // Tokens del texto ("TL-A48" → "TLA48"... y también "A48" suelto).
  const tokensTexto = new Set(
    bruto
      .split(/[^0-9A-ZÁÉÍÓÚÑ\-/.]+/)
      .flatMap((t) => [t, ...t.split(/[-/.]/)])
      .map((t) => t.replace(/[\-/.]/g, ""))
      .filter(Boolean)
  );
  const nombrado = (p: Product): boolean => {
    const ref = normalizarRef(p.reference || p.name);
    if (ref.length >= 3 && texto.includes(ref)) return true;
    // Referencias de la página con la equivalencia entre paréntesis
    // ("SNR 5309 EE G15 (3309 2RS TVH)"): vale la parte de fuera.
    const sinParentesis = normalizarRef(String(p.reference || p.name).replace(/\([^)]*\)/g, ""));
    if (sinParentesis !== ref && sinParentesis.length >= 4 && /\d/.test(sinParentesis) && texto.includes(sinParentesis)) return true;
    // Códigos internos de TL ("3362052RSTL"): vale el nombre ("RODAMIENTO TL 6205 2RS" → 62052RS).
    const porNombre = normalizarRef(String(p.name ?? "").replace(/\([^)]*\)/g, ""));
    if (porNombre !== ref && porNombre.length >= 4 && /\d/.test(porNombre) && /[A-Z]/.test(porNombre) && texto.includes(porNombre)) return true;
    // Referencias de la página con prefijo/sufijo de familia ("33A48TL") o
    // nombres largos ("CORREA CONTINENTAL A48"): vale la designación núcleo
    // (A48) si aparece como palabra suelta en el texto y lleva algún dígito.
    const nucleos = [
      String(p.reference ?? "").toUpperCase().replace(/[\s\-/.]/g, "").replace(/^33(?=[A-Z])/, "").replace(/TL$/, ""),
      String(p.name ?? "").toUpperCase().trim().split(/\s+/).pop() ?? "",
    ].map((n) => n.replace(/[\-/.]/g, ""));
    return nucleos.some((n) => n.length >= 3 && /\d/.test(n) && /[A-Z]/.test(n) && tokensTexto.has(n));
  };
  // Entre los que el texto nombra, delante el que se puede comprar: si el bot
  // habla del 6305 y del 6305 C3 y solo el C3 tiene unidades, esa es la ficha
  // que el cliente necesita tener a mano.
  const citados = productos.filter(nombrado);
  const conStock = citados.filter((p) => (p.stock ?? 0) > 0);
  const sinStock = citados.filter((p) => (p.stock ?? 0) <= 0);
  // Si el texto nombra algún producto, las tarjetas son SOLO esas: visto en la
  // preview, hablando de la correa A49 salían también los rodamientos NTN
  // NA4903/NA4909 (la búsqueda por "A49" los había traído); y en "correa A
  // 1250", sin nombrar ningún producto, salía un tubo Bondioli de 1000 mm
  // traído por el número. Tarjeta que el texto no nombra = tarjeta que confunde.
  return [...conStock, ...sinStock];
}

// ── Comparativa técnica entre dos o más referencias ──────────────────────────

/**
 * Orden de presentación de la tabla comparativa: primero lo que decide si la
 * pieza encaja físicamente en el montaje del cliente, después lo que decide
 * si aguanta el trabajo.
 */
const ORDEN_CAMPOS = [
  "Diámetro interior dØ (mm)",
  "Diámetro exterior DØ (mm)",
  "Ancho B (mm)",
  "Ancho del anillo exterior (mm)",
  "Peso (g)",
  "Capacidad de carga dinámica (kN)",
  "Capacidad de carga estática (kN)",
  "Velocidad de referencia (rpm)",
  "Velocidad límite (rpm)",
  "Tolerancia",
  "Junta",
  "Material de la jaula",
  "Ángulo de contacto (°)",
  "Número de hileras",
  "Clase de producto",
  "Tipo",
];

export interface FilaComparativa {
  campo: string;
  /** Un valor por referencia, en el mismo orden que "referencias". */
  valores: (string | number | null)[];
  /**
   * Diferencia de la 2ª referencia en adelante respecto a la 1ª, ya calculada
   * para los campos numéricos ("+8 mm", "−2,1 kN"). null si no aplica.
   */
  diferencia: (string | null)[];
  /** true si no todos los valores son iguales. */
  cambia: boolean;
}

export interface Comparativa {
  referencias: { marca: string; referencia: string }[];
  filas: FilaComparativa[];
  /** Referencias pedidas de las que el KB no tiene ficha técnica. */
  sinFicha: string[];
}

function aNumero(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // El Excel del cliente usa coma decimal en algunos campos.
  const n = Number(String(v).replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatearDelta(delta: number, campo: string): string {
  const signo = delta > 0 ? "+" : "−";
  const abs = Math.abs(delta);
  const num = Number.isInteger(abs) ? String(abs) : abs.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  const unidad = campo.match(/\(([^)]+)\)\s*$/)?.[1] ?? "";
  return `${signo}${num}${unidad ? " " + unidad : ""}`;
}

/**
 * Tabla comparativa campo a campo entre varias referencias, con la diferencia
 * numérica ya calculada respecto a la primera (que es la del cliente).
 *
 * Es lo que pidió el cliente: al proponer otra medida, poder COMPROBAR de un
 * vistazo en qué cambia respecto a la que tiene montada.
 */
export function compararTecnico(refs: string[]): Comparativa {
  const limpias = refs.map((r) => String(r ?? "").trim()).filter(Boolean).slice(0, 4);
  const fichas: { marca: string; referencia: string; datos: Record<string, string | number> }[] = [];
  const sinFicha: string[] = [];

  for (const ref of limpias) {
    const hit = findTechnicalInfo(ref)[0];
    if (!hit) {
      sinFicha.push(ref);
      continue;
    }
    fichas.push({ marca: hit.marca, referencia: hit.referencia, datos: hit.datos });
  }

  if (fichas.length === 0) {
    return { referencias: [], filas: [], sinFicha };
  }

  // Campos presentes en alguna ficha, en el orden preferente y con el resto
  // detrás (el documento del cliente trae campos propios de soportes que solo
  // aparecen en algunas referencias).
  const presentes = new Set<string>();
  for (const f of fichas) for (const k of Object.keys(f.datos)) presentes.add(k);
  const campos = [
    ...ORDEN_CAMPOS.filter((c) => presentes.has(c)),
    ...[...presentes].filter((c) => !ORDEN_CAMPOS.includes(c)).sort(),
  ];

  const filas: FilaComparativa[] = [];
  for (const campo of campos) {
    const valores = fichas.map((f) => f.datos[campo] ?? null);
    // La resta solo se calcula en campos con unidad real (mm, g, kN, rpm, °).
    // En los demás no significa nada: "Serie: 6200 → 6300 (+100)" es ruido.
    const tieneUnidad = /\([^)]+\)\s*$/.test(campo);
    const base = tieneUnidad ? aNumero(valores[0]) : null;
    const diferencia = valores.map((v, i) => {
      if (i === 0) return null;
      const n = aNumero(v);
      if (base === null || n === null) return null;
      const delta = n - base;
      return delta === 0 ? "=" : formatearDelta(delta, campo);
    });
    const cambia = valores.some((v) => String(v ?? "") !== String(valores[0] ?? ""));
    filas.push({ campo, valores, diferencia, cambia });
  }

  return {
    referencias: fichas.map((f) => ({ marca: f.marca, referencia: f.referencia })),
    filas,
    sinFicha,
  };
}

/**
 * Detecta que el cliente pide otra medida tomando como referencia lo último
 * que se le ha enseñado ("uno más grande", "el siguiente por encima", "algo
 * más estrecho"). Sirve para inyectar en código la ficha del producto de
 * referencia y exigir la comparativa: sin el producto de partida delante, el
 * modelo compara contra lo que cree recordar.
 */
const INTENCION_TAMANO =
  /\b(m[aá]s\s+(grande|peque[nñ]o|ancho|estrecho|fino|gordo|largo|corto|resistente)|mayor|menor|siguiente\s+(medida|di[aá]metro|talla)|una\s+talla|un\s+tama[nñ]o|superior|inferior|por\s+(encima|debajo)|otra\s+medida|otro\s+tama[nñ]o|equivalente|en\s+lugar\s+del?|en\s+vez\s+del?|sustitu\w+|cambiar\s+por|me\s+vale\s+el)\b/i;

export function pideOtraMedida(mensaje: string): boolean {
  return INTENCION_TAMANO.test(String(mensaje ?? ""));
}

/**
 * Localiza el producto del que viene hablando la conversación, para poder
 * interpretar "uno más grande" contra medidas REALES y no contra lo que el
 * modelo crea recordar del turno anterior.
 *
 * El formato de producto del prompt siempre escribe "**Ref: [REFERENCIA]**",
 * así que esa es la pista fiable; los candidatos sueltos solo como respaldo
 * (una ficha técnica está llena de números que no son referencias).
 */
export function refDeConversacion(
  historial: { content: string }[]
): TechInfo | null {
  for (const m of [...historial].slice(-6).reverse()) {
    const texto = String(m?.content ?? "");
    const explicitas = [...texto.matchAll(/Ref:\s*\**\s*([A-Z0-9][A-Z0-9 \-/.]{2,24})/gi)].map((x) =>
      x[1].trim()
    );
    // "la referencia es la NTN 1AS08-7/8": marca delante, sin "Ref:". Visto el
    // 24-10-2026: sin esto "¿y qué temperatura aguanta este rodamiento?" no
    // encontraba la pieza y el bot rehacía la búsqueda contradiciéndose.
    const conMarca = [...texto.matchAll(/\b(?:NTN|SNR|TL)\s+([A-Z0-9][A-Z0-9\-/.]{2,24})/gi)]
      .map((x) => x[1].replace(/[.,]+$/, ""))
      .filter((c) => (c.match(/\d/g) ?? []).length >= 3);
    // Respaldo: candidatos con pinta de referencia (la frase entera pegada no lo es).
    const sueltas = extractQueryCandidates(texto)
      .filter((c) => (c.match(/\d/g) ?? []).length >= 3 && c.length <= 20 && !/[A-Z]{4,}/.test(c))
      .slice(0, 4);
    const candidatas = explicitas.length ? explicitas : conMarca.length ? conMarca : sueltas;
    for (const cand of candidatas) {
      const hit = findTechnicalInfo(cand)[0];
      if (hit) return hit;
    }
  }
  return null;
}

// ── Bloques 🔒 que se inyectan en la conversación ────────────────────────────
// Viven aquí, junto a la lógica que los decide, para poder probarlos con el
// código real (misma razón por la que findGlossaryForMessage vive en kb.ts):
// si el texto se escribe suelto dentro de runAgent, no hay forma de verificar
// que se genera cuando debe y con el contenido que debe.

/**
 * Bloque de VARIANTES: la referencia pedida no se puede servir y otra de la
 * misma familia sí. Devuelve null cuando no aplica (que es lo normal).
 */
export function bloqueVariantes(analisis: AnalisisVariantes): string | null {
  if (!analisis.exactaSinStock || analisis.alternativasConStock.length === 0) {
    return null;
  }

  const pedidaTxt = analisis.exactas.length
    ? analisis.exactas
        .map(
          (v) =>
            `- Referencia pedida: ${v.producto.name} (Ref: ${v.producto.reference}) — 🔴 ${v.stock ?? 0} uds`
        )
        .join("\n")
    : `- La referencia exacta pedida (${analisis.pedida.completa}) NO aparece en el catálogo de la página.`;

  const alternativas = analisis.alternativasConStock.slice(0, 3);
  const altTxt = alternativas
    .map((v) => {
      const dif = [
        v.anade.length ? `AÑADE el/los sufijo(s): ${v.anade.join(" ")}` : "",
        v.quita.length ? `NO lleva: ${v.quita.join(" ")}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `- DISPONIBLE: ${v.producto.name} (Ref: ${v.producto.reference}) — 🟢 ${v.stock} uds — respecto a la pedida ${dif || "misma referencia base"}`;
    })
    .join("\n");

  // La explicación del sufijo NO se escribe aquí: sale del glosario editable,
  // que es la fuente autorizada y la que ESGAS puede corregir sin tocar código.
  const sufijosDif = [
    ...new Set(alternativas.flatMap((v) => [...v.anade, ...v.quita])),
  ].slice(0, 3);
  const glosarioDif = sufijosDif
    .flatMap((s) => findGlossary(s, 1).map((g) => `### ${g.titulo}\n${g.explicacion}`))
    .join("\n\n");

  return (
    `🔒 VARIANTES DE LA MISMA REFERENCIA — comprobado en el catálogo real ahora mismo:\n` +
    `${pedidaTxt}\n${altTxt}\n\n` +
    (glosarioDif
      ? `Glosario verificado del sufijo que cambia (úsalo para explicar la diferencia, no la expliques de memoria):\n${glosarioDif}\n\n`
      : "") +
    `OBLIGATORIO en esta respuesta, siguiendo VARIANTES DE LA MISMA REFERENCIA: (1) di en UNA frase que la ` +
    `referencia pedida no se puede servir por la página ahora mismo y que la variante de arriba SÍ está ` +
    `disponible, con sus unidades; (2) explica en qué se diferencian nombrando el sufijo concreto y qué ` +
    `implica en el montaje; (3) di si le sirve, o haz UNA sola pregunta que lo decida; (4) cierra ofreciendo ` +
    `la compra de la variante DISPONIBLE. ` +
    `Tienes PROHIBIDO presentarlas como dos productos sueltos sin relacionarlas, PROHIBIDO invitar a comprar ` +
    `o a añadir al carrito la referencia sin stock, y PROHIBIDO decir "puedes añadirlo al carrito cuando haya ` +
    `stock" o cualquier variante de esa frase. ` +
    `Llama además a compare_products con las dos referencias para dar las diferencias técnicas exactas.` +
    (analisis.exactas.length
      ? ""
      : ` La referencia pedida NO existe en la página (puede ser una errata del cliente): dilo en una frase y ` +
        `pregunta si la que necesita es la DISPONIBLE. Toda la información (ficha, precio, stock y, si te ha pedido ` +
        `comparar, la comparativa) va de la DISPONIBLE, nunca de la que no existe: PROHIBIDO dar datos técnicos de ` +
        `la referencia pedida como si existiera.`)
  );
}

/** Dirección del cambio de tamaño que pide el cliente, si es que la pide. */
export function direccionDeTamano(mensaje: string): "mas_grande" | "mas_pequeno" | null {
  const m = String(mensaje ?? "");
  if (/\b(m[aá]s\s+(grande|ancho|gordo|resistente)|mayor|superior|por\s+encima|siguiente\s+(medida|di[aá]metro|talla))\b/i.test(m)) {
    return "mas_grande";
  }
  if (/\b(m[aá]s\s+(peque[nñ]o|estrecho|fino|corto)|menor|inferior|por\s+debajo)\b/i.test(m)) {
    return "mas_pequeno";
  }
  return null;
}

const SERIES_POR_TAMANO = ["60", "62", "63"];

/**
 * Candidatos REALES que de verdad son más grandes (o más pequeños) que la
 * referencia de partida, calculados en código y comprobados contra la ficha
 * técnica del KB.
 *
 * Hace falta porque el modelo se equivocaba de dirección: ante "enséñame uno
 * más grande" partiendo de un 6205 ofrecía el 6005, que es MÁS PEQUEÑO
 * (DØ47 frente a 52, B12 frente a 15), y lo hacía contradiciendo su propia
 * tabla de diferencias, que ya mostraba los signos negativos.
 */
export function candidatosPorTamano(
  refPrevia: TechInfo,
  direccion: "mas_grande" | "mas_pequeno"
): { ref: string; motivo: string }[] {
  const partida = partirReferencia(refPrevia.referencia);
  const m = partida.base.match(/^(6[023])(\d{2})$/);
  if (!m) return [];
  const [, serie, code] = m;

  const dePartida = Number(
    String(refPrevia.datos["Diámetro exterior DØ (mm)"] ?? "").replace(",", ".")
  );
  const arriba = direccion === "mas_grande";

  const propuestas: { ref: string; motivo: string }[] = [];

  // 1) Mismo eje (mismo bore), serie más pesada o más ligera: cambia el
  //    diámetro exterior y la anchura sin tocar el eje del cliente.
  const i = SERIES_POR_TAMANO.indexOf(serie);
  const serieNueva = i >= 0 ? SERIES_POR_TAMANO[i + (arriba ? 1 : -1)] : undefined;
  if (serieNueva) {
    propuestas.push({
      ref: `${serieNueva}${code}`,
      motivo: `mismo eje dØ, serie ${arriba ? "más pesada" : "más ligera"} (cambia DØ y B)`,
    });
  }

  // 2) Misma serie, siguiente diámetro de eje en la progresión ISO.
  const boreMm = Number(code) >= 4 ? Number(code) * 5 : null;
  if (boreMm) {
    const nuevo = nextStandardBore(boreMm, arriba ? "up" : "down");
    const codeNuevo = nuevo ? boreCodeFor(nuevo) : null;
    if (codeNuevo) {
      propuestas.push({
        ref: `${serie}${codeNuevo}`,
        motivo: `misma serie, eje dØ${nuevo} mm (${arriba ? "mayor" : "menor"} que el actual)`,
      });
    }
  }

  // Solo se proponen las que existen en la ficha técnica Y que de verdad van
  // en la dirección pedida: la comprobación se hace aquí, no se le pide al
  // modelo que la haga de cabeza.
  return propuestas.filter((p) => {
    const ficha = findTechnicalInfo(p.ref)[0];
    if (!ficha) return false;
    const de = Number(String(ficha.datos["Diámetro exterior DØ (mm)"] ?? "").replace(",", "."));
    if (!Number.isFinite(de) || !Number.isFinite(dePartida)) return true;
    return arriba ? de > dePartida : de < dePartida;
  });
}

/** Bloque de OTRA MEDIDA: ancla la comparación al producto ya mostrado. */
export function bloqueOtraMedida(refPrevia: TechInfo, mensaje = ""): string {
  const ficha = Object.entries(refPrevia.datos)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");

  const direccion = direccionDeTamano(mensaje);
  const candidatos = direccion ? candidatosPorTamano(refPrevia, direccion) : [];
  const bloqueDireccion = direccion
    ? `El cliente pide algo ${direccion === "mas_grande" ? "MÁS GRANDE" : "MÁS PEQUEÑO"} que esta referencia.` +
      (candidatos.length
        ? ` Estas opciones SÍ van en esa dirección (comprobado contra la ficha técnica, no las descartes por otras que ` +
          `no lo estén):\n${candidatos.map((c) => `- ${c.ref} — ${c.motivo}`).join("\n")}\n` +
          `Búscalas con search_products y ofrece la que encaje.`
        : "") +
      ` COMPROBACIÓN OBLIGATORIA antes de enviar la respuesta: si tu tabla de diferencias sale con signo ` +
      `${direccion === "mas_grande" ? "NEGATIVO (−) en el diámetro exterior o en la anchura, lo que has elegido es MÁS PEQUEÑO" : "POSITIVO (+) en el diámetro exterior o en la anchura, lo que has elegido es MÁS GRANDE"} ` +
      `y NO es lo que te han pedido: cambia de referencia antes de contestar. Presentar una pieza diciendo que es ` +
      `más grande cuando tus propios números dicen lo contrario es un fallo grave.\n\n`
    : "";

  return (
    `🔒 PRODUCTO DE REFERENCIA DE ESTA CONVERSACIÓN — el cliente pide otra medida/variante partiendo de:\n` +
    `${refPrevia.marca} ${refPrevia.referencia} → ${ficha}\n\n` +
    bloqueDireccion +
    `Toma ESTAS medidas como punto de partida para interpretar "más grande", "más pequeño", "el siguiente" ` +
    `o "en vez de este" — nunca un criterio o una unidad que el cliente no haya mencionado. ` +
    `OBLIGATORIO en esta respuesta: llama a compare_products con ["${refPrevia.referencia}", "<la que propongas>"] ` +
    `e incluye el bloque **Diferencias frente al ${refPrevia.referencia}:** con la diferencia exacta en mm/kN/rpm ` +
    `de cada campo que cambie, siguiendo COMPARATIVA OBLIGATORIA. Sin esas diferencias el cliente no puede ` +
    `comprobar si le encaja en el montaje, y es justo lo que ha pedido. ` +
    `Si hay ambigüedad real sobre qué medida quiere cambiar (diámetro interior, exterior o anchura), pregunta ` +
    `UNA sola cosa concreta en vez de asumir.`
  );
}

// ── Preguntas de seguimiento sin referencia ──────────────────────────────────
// Visto en la preview (14-10-2026): tras la ficha del TL-UCP205, a "¿y qué
// rodamiento lleva y cuánto pesa?" el bot contestó "1,3 kg" sin consultar
// nada (son 0,81 kg). Cuando la pregunta es técnica y no trae referencia, la
// ficha del producto de la conversación se resuelve aquí y se le da hecha.

const PREGUNTA_TECNICA =
  /\b(pesa|peso|mide|medidas?|dimensi\w+|di[aá]metro|ancho|alto|altura|rodamiento\s+lleva|qu[eé]\s+rodamiento|inserto|rosca|perno|tornillo|cuerpo|carga|velocidad|rpm|tolerancia|juego|junta|sellad\w+|material|jaula|caracter[ií]sticas?|ficha|datos|dientes|desarrollo|longitud|temperaturas?|grados|calor|fr[ií]o|aguanta\w*|soporta\w*|resiste\w*|grasa|lubric\w*|engras\w*|reengras\w*|vida|duraci[oó]n|dura)\b/i;

export function esPreguntaTecnicaSinRef(message: string): boolean {
  const m = String(message ?? "");
  if (!PREGUNTA_TECNICA.test(m.normalize("NFC"))) return false;
  return !extractQueryCandidates(m).some((c) => (/\d/.test(c) && /[A-Z]/i.test(c)) || /^\d{3,}$/.test(c));
}

/** Todas las fichas (NTN/SNR y TL) de la última referencia de la conversación. */
export function fichasDeConversacion(historial: { content: string }[]): TechInfo[] {
  const previa = refDeConversacion(historial);
  if (!previa) return [];
  const todas = findTechnicalInfo(previa.referencia);
  return todas.length ? todas : [previa];
}

export function bloqueFichaConversacion(fichas: TechInfo[]): string | null {
  if (!fichas.length) return null;
  return (
    `🔒 FICHA VERIFICADA DEL PRODUCTO DEL QUE SE ESTÁ HABLANDO (base de datos técnica):\n${JSON.stringify(fichas)}\n` +
    `El cliente pregunta por un dato de ESTE producto sin repetir la referencia ("este rodamiento", "¿y cuánto pesa?"). ` +
    `Es una pregunta de seguimiento: NO vuelvas a buscar por medidas, NO cambies de pieza y NO contradigas lo que ya le ` +
    `dijiste en el turno anterior. Empieza la respuesta contestando a lo que pregunta, nombrando la referencia.\n` +
    `- Si el dato está en este bloque: dalo copiado tal cual (con su unidad).\n` +
    `- Si el dato NO está en este bloque (p.ej. la temperatura de trabajo, que la ficha no trae): llama UNA vez a ` +
    `search_official_source con la marca, la referencia y el dato concreto (p.ej. "NTN 1AS08-7/8 temperatura de ` +
    `funcionamiento"). Si la fuente oficial lo da, dalo diciendo de dónde sale. Si no lo da, dilo claro en una frase ` +
    `("la ficha técnica de NTN de esta referencia no indica la temperatura de trabajo") y añade solo lo que SÍ consta ` +
    `en este bloque y tiene relación (tipo de junta, material de jaula, si es reengrasable), sin convertirlo en una ` +
    `cifra. PROHIBIDO inventar o estimar un valor. Cierra ofreciendo el contacto para confirmarlo.\n` +
    `Si hay fichas de dos marcas (p.ej. SNR y TL) con valores distintos, da cada uno con su marca.`
  );
}

// ── Ficha de una pieza trasladada a otra de distinto material ────────────────
// Visto 3 veces seguidas en la preview, con la prohibición ya en el prompt: el
// bot copiaba la ficha del TL-UCP205 de FUNDICIÓN (P205, UC205, 0,81 kg) al
// "SOPORTE TERMOPLASTICO TL UCP 205" de la página. Se corrige en código.

type Material = "fundicion" | "termoplastico" | "inox" | "chapa";

function materialDe(texto: string): Material | null {
  const t = String(texto ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/TERMOPLAST|\bPLAS\w*|\bPBT\b|POLIAMIDA/.test(t)) return "termoplastico";
  if (/INOX|STAINLESS/.test(t)) return "inox";
  if (/CHAPA|ESTAMPAD|PRESSED/.test(t)) return "chapa";
  if (/FUNDICI|CAST\s+IRON/.test(t)) return "fundicion";
  return null;
}

const normValor = (v: unknown) => String(v ?? "").toUpperCase().replace(/[\s"]/g, "").replace(/,/g, ".");

export function quitarFichaDeOtraPieza(texto: string): string {
  const partes = String(texto ?? "").split(/(\n-{3,}\n)/);
  let cambiado = false;
  const out = partes.map((bloque) => {
    if (/^\n-{3,}\n$/.test(bloque)) return bloque;
    const lineas = bloque.split("\n");
    const cabecera = lineas.slice(0, 5).join(" ");
    const matBloque = materialDe(cabecera);
    if (!matBloque) return bloque;
    // Fichas TL de las designaciones que aparecen en el bloque (UCP205, UCFL207...).
    const designaciones = [...new Set([...bloque.toUpperCase().matchAll(/\b([A-Z]{2,5})\s?(\d{3}(?:-\d{1,2})?)\b/g)].map((m) => m[1] + m[2]))];
    const ajenas = designaciones
      .flatMap((d) => findTechnicalInfo(d).filter((f) => f.marca.startsWith("TL")))
      .filter((f) => {
        const matFicha = materialDe(String(f.datos["Clase de producto"] ?? ""));
        return matFicha !== null && matFicha !== matBloque;
      });
    if (!ajenas.length) return bloque;
    const valores = new Set(ajenas.flatMap((f) => Object.values(f.datos).map(normValor)).filter((v) => v.length >= 2));
    let quitadas = 0;
    const filtradas = lineas.filter((l) => {
      const m = l.match(/^\s*[-*•]\s+\**([^:*]+?)\**\s*:\s*\**\s*(.+?)\s*$/);
      if (!m) return true;
      const v = normValor(m[2].replace(/\*\*/g, "").replace(/\s*mm$/i, "").replace(/\s*kg$/i, ""));
      const vCompleto = normValor(m[2].replace(/\*\*/g, ""));
      const copiado = [...valores].some((x) => x === v || x === vCompleto || x === v.replace(/MM$/, ""));
      if (copiado) quitadas++;
      return !copiado;
    });
    if (!quitadas) return bloque;
    cambiado = true;
    // La nota va justo después de la línea de Ref (o del título si no hay Ref).
    const iRef = filtradas.findIndex((l) => /Ref:/i.test(l));
    const nota =
      "- **Ficha técnica:** la de esta versión no la tengo en la base de datos (no es la misma pieza que la de " +
      "fundición). Si la necesitas, te la confirmamos por teléfono o e-mail.";
    filtradas.splice(iRef >= 0 ? iRef + 1 : Math.min(2, filtradas.length), 0, nota);
    return filtradas.join("\n");
  });
  return cambiado ? out.join("") : texto;
}

// ── Cantidad pedida por el cliente ───────────────────────────────────────────
// Caso real (14-10-2026): "necesito 40 rodamientos 6205 zz c3" con 26 en
// stock. La tarjeta salía con 1 ud y el texto no preguntaba si dejar las 26.

export function cantidadPedida(message: string): number | null {
  const m = String(message ?? "").match(
    /\b(\d{1,5})\s*(?:uds?\.?|unidades|piezas|pzs?|rodamientos?|correas?|soportes?|retenes|cadenas?)\b/i
  );
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}

type TipoPieza = "correa" | "soporte" | "reten" | "cadena" | "rodamiento";

function tipoDe(palabra: string): TipoPieza {
  const t = palabra.toLowerCase();
  if (t.startsWith("correa")) return "correa";
  if (t.startsWith("soporte")) return "soporte";
  if (t.startsWith("reten")) return "reten";
  if (t.startsWith("cadena")) return "cadena";
  return "rodamiento";
}

/**
 * Cantidad por tipo de pieza. Visto el 24-10-2026: "quiero 5 correas y 2
 * rodamientos 6205 zz c3" dejó la tarjeta del rodamiento en "Añadir 5 uds".
 */
export function cantidadesPorTipo(message: string): Partial<Record<TipoPieza, number>> {
  const out: Partial<Record<TipoPieza, number>> = {};
  for (const m of String(message ?? "").matchAll(/\b(\d{1,5})\s*(rodamientos?|correas?|soportes?|retenes|cadenas?)\b/gi)) {
    const n = Number(m[1]);
    if (n > 0 && n < 100000) out[tipoDe(m[2])] ??= n;
  }
  return out;
}

export function ajustarCantidad(
  texto: string,
  productos: Product[],
  message: string
): { texto: string; productos: Product[] } {
  const general = cantidadPedida(message);
  if (!general || !productos.length) return { texto, productos };
  const porTipo = cantidadesPorTipo(message);
  const varios = Object.keys(porTipo).length > 1;
  const ajustados = productos.map((p) => {
    if (p.qty) return p;
    const tipo = tipoDe(/CORREA/i.test(p.name) ? "correa" : /SOPORTE/i.test(p.name) ? "soporte" : /RETEN|RETÉN/i.test(p.name) ? "reten" : /CADENA/i.test(p.name) ? "cadena" : "rodamiento");
    // Con varias piezas, cada tarjeta lleva la suya; si de su tipo no dijo nada, se queda en 1.
    const qty = varios ? porTipo[tipo] : general;
    return qty ? { ...p, qty } : p;
  });
  const p = ajustados[0];
  const qty = p.qty ?? general;
  const stock = p.stock ?? 0;
  let t = texto;
  if (stock > 0 && stock < qty && !/¿\s*quieres que te deje/i.test(t)) {
    t =
      `${t.trimEnd()}\n\n¿Quieres que te deje las **${stock} uds** en el carrito? En la tarjeta ya tienes ` +
      `seleccionadas las ${stock} uds: solo tienes que pulsar "Añadir al carrito".`;
  }
  return { texto: t, productos: ajustados };
}

// ── Stock SIEMPRE el real de la tienda ───────────────────────────────────────
// Visto en producción (25-10-2026): "necesito 5000 unidades del 6205 zz c3"
// → el bot escribió "solo tenemos 19 unidades" y "Stock: 🔴 19 uds", con 24 en
// la tienda (las 24 las puso bien ajustarCantidad). El stock no se deja al
// modelo: la línea "Stock:" de cada producto se reescribe con el de su tarjeta
// y, si solo hay un producto, cualquier "N uds disponibles" que no cuadre.

const sinTipo = (s: string) =>
  String(s ?? "").toUpperCase().replace(/\*/g, "").replace(/^\s*#*\s*(RODAMIENTO|SOPORTE|CORREA)S?\s+/, "").replace(/[^A-Z0-9]/g, "");

/** La línea de stock con el formato del prompt, a partir del stock real. */
export function lineaStock(real: number, qty: number | null): string {
  if (real <= 0) return "🔴 Sin stock disponible en la página ahora mismo";
  if (qty && qty > real) return `🔴 ${real} uds disponibles en la página ahora mismo (has pedido ${qty})`;
  return `🟢 ${real} uds disponibles`;
}

// Un número de unidades en stock dentro de una frase: "19 uds", "19 unidades
// en stock", "las 19 disponibles". No toca medidas, pesos ni precios.
const NUM_STOCK = /\b(\d{1,6})(?=\s*(?:uds?\.?|unidades)?\s*(?:disponibles?\b|en\s+stock\b|uds?\b|unidades\b))/gi;

/**
 * Precio con el formato del prompt, desde la tarjeta. Visto el 25-10-2026:
 * "Precio: Consultar en la página" con la tarjeta debajo en 3,19 € (-78 %).
 */
export function lineaPrecio(p: Product): string {
  const orig = p.originalPrice ?? 0;
  if (orig > p.price + 0.005) {
    const pct = Math.round(((p.discountPct ?? 1 - p.price / orig) as number) * 100);
    return `~~${orig.toFixed(2)} EUR~~ → **${p.price.toFixed(2)} EUR** (descuento del ${pct}% de tu cuenta ya aplicado)`;
  }
  return `${p.price.toFixed(2)} EUR`;
}

export function corregirStock(texto: string, productos: Product[], message: string): string {
  // Precio y stock de cada producto presentado = los de su tarjeta, siempre.
  const conStock = productos.filter((p) => typeof p.price === "number");
  if (!conStock.length || !texto) return texto;
  const qty = cantidadPedida(message);
  const porNombre = (t: string) => {
    const n = sinTipo(t);
    return conStock.find((p) => sinTipo(p.name).length >= 4 && n.endsWith(sinTipo(p.name)));
  };
  const porRef = (r: string) => {
    const n = sinTipo(r);
    return conStock.find((p) => n.length >= 3 && (sinTipo(p.reference) === n || sinTipo(p.name).endsWith(n)));
  };
  const salida: string[] = [];
  let actual: Product | undefined;
  let conPrecio = false;
  let conLineaStock = false;
  // Producto presentado sin precio ni stock (visto en "20 rodamientos de 5 mm
  // con tapa": SNR 625 EE / 625 ZZ con tarjeta, pero sin precio ni stock en el
  // texto): se añaden los de su tarjeta al cerrar su bloque.
  const cerrar = () => {
    if (actual && !conLineaStock) {
      while (salida.length && !salida[salida.length - 1].trim()) salida.pop();
      if (!conPrecio) salida.push("", `**Precio:** ${lineaPrecio(actual)}`);
      if (typeof actual.stock === "number") salida.push("", `**Stock:** ${lineaStock(actual.stock, qty)}`);
      salida.push("");
    }
    actual = undefined;
    conPrecio = false;
    conLineaStock = false;
  };
  for (const l of texto.split("\n")) {
    const t = l.trim();
    if (/^-{3,}$/.test(t)) {
      cerrar();
      salida.push(l);
      continue;
    }
    const titulo = /^(?:\d{1,2}[.)]\s*)?\*\*([^*]+)\*\*\s*$/.exec(t) ?? /^#{1,4}\s+(\S.*)$/.exec(t);
    if (titulo && !/:\s*$/.test(titulo[1])) {
      const p = porNombre(titulo[1]);
      // Otro producto (con tarjeta o sin ella) cierra el anterior: visto el
      // 25-10-2026, el precio/stock del 625 ZZ acababa pegado al 635 ZZ.
      if (p !== actual || /\d{3}/.test(titulo[1])) {
        cerrar();
        actual = p;
      }
      salida.push(l);
      continue;
    }
    const ref = t.match(/^(?:[-*•]\s+)?\**\s*Ref(?:erencia)?\s*:\s*\**\s*([^*]+?)\s*\**$/i);
    if (ref) {
      const p = porRef(ref[1]);
      if (p && p !== actual) {
        if (actual) cerrar();
        actual = p;
      }
      salida.push(l);
      continue;
    }
    const pr = l.match(/^(\s*(?:[-*•]\s+)?\**\s*Precio\s*:\s*\**)/i);
    if (pr) {
      conPrecio = true;
      if (actual) {
        salida.push(`${pr[1].replace(/\s*$/, "")} ${lineaPrecio(actual)}`);
        continue;
      }
    }
    const st = l.match(/^(\s*(?:[-*•]\s+)?\**\s*Stock\s*:\s*\**)/i);
    if (st && actual && typeof actual.stock === "number") {
      conLineaStock = true;
      salida.push(`${st[1].replace(/\s*$/, "")} ${lineaStock(actual.stock, qty)}`);
      continue;
    }
    if (st) conLineaStock = true;
    salida.push(l);
  }
  // El cierre (final de la respuesta) no es parte del último producto: si le
  // falta la línea de stock, se inserta antes del párrafo de cierre.
  if (actual && !conLineaStock) {
    const cola: string[] = [];
    while (salida.length && !/^\s*([-*•]|\d{1,2}[.)]|\*\*)/.test(salida[salida.length - 1]) ) {
      const x = salida.pop() as string;
      if (x.trim() && !/^\s*$/.test(x) && cola.length > 8) break;
      cola.unshift(x);
    }
    cerrar();
    salida.push(...cola);
  }
  let out = salida.join("\n").replace(/\n{3,}/g, "\n\n");
  // Con un solo producto, las cifras de stock en el texto tienen que ser la suya.
  const ids = new Set(conStock.map((p) => p.id));
  if (ids.size === 1 && typeof conStock[0].stock === "number") {
    const real = conStock[0].stock as number;
    out = out
      .split("\n")
      .map((l) => {
        if (/^\s*[-*•]\s+\**[^:]*:/.test(l) || /^\s*\**\s*(Precio|Medidas)\s*:/i.test(l)) return l;
        let x = l.replace(NUM_STOCK, (n) => (Number(n) === qty || Number(n) === real || real <= 0 ? n : String(real)));
        // "no hay unidades en stock" con unidades en la tienda.
        if (real > 0) x = x.replace(/\bno\s+hay\s+unidades(\s+en\s+stock|\s+disponibles)?/gi, qty && qty > real ? `solo hay ${real} uds` : `hay ${real} uds`);
        return x;
      })
      .join("\n");
  }
  return out;
}

// "No tengo confirmación de que estén disponibles en la página" con las
// tarjetas (stock real) debajo: visto el 25-10-2026 en "20 rodamientos de 5
// mm de interior con tapa". Es falso y le quita la confianza al cliente: la
// tarjeta ES la confirmación. Se quita la frase (y el "contáctanos para
// gestionar el pedido" que la acompaña) si hay producto con stock.
const DUDA_DISPONIBILIDAD =
  /[^.!?\n]*\b(no\s+tengo\s+confirmaci[oó]n|no\s+(puedo|podemos)\s+confirmar\s+(la\s+|su\s+)?disponibilidad|no\s+s[eé]\s+si\s+(est[aá]n?|hay)\s+disponibles?|no\s+(tengo|tenemos|hay)\s+stock\s+(disponible\s+)?(para\s+)?(estas|ninguna\s+de\s+estas)\s+referencias)[^.!?\n]*[.!]?/gi;
const CONTACTO_TRAS_DUDA =
  /[^.!?\n]*\b(te\s+recomiendo\s+que\s+nos\s+contactes|puedes\s+consultarnos\s+por\s+tel[eé]fono)[^.!?\n]*gestionar\s+el\s+pedido[^.!?\n]*[.!]?/gi;

export function quitarDudaDisponibilidad(texto: string, productos: Product[]): string {
  if (!productos.some((p) => (p.stock ?? 0) > 0) || !DUDA_DISPONIBILIDAD.test(texto)) return texto;
  DUDA_DISPONIBILIDAD.lastIndex = 0;
  return texto
    .replace(DUDA_DISPONIBILIDAD, "")
    .replace(CONTACTO_TRAS_DUDA, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Fichas técnicas reescritas desde la base de datos ────────────────────────
// Visto EN PRODUCCIÓN (14-10-2026) con "quiero 25 rodamientos 6205 zz c3": el
// modelo escribió la ficha de memoria — tolerancia "Normal" (es C3), velocidad
// límite 15.000 (son 17.000 rpm), carga estática 7,8 (son 7,9 kN), jaula de
// chapa. Ninguna instrucción de prompt garantiza que copie bien. Por eso, antes
// de enviar la respuesta, cada producto cuya referencia está EXACTA en la base
// de datos lleva su bloque "Información técnica completa" y su línea de
// Medidas generados aquí, desde el dato oficial. Si el modelo se saltó la
// ficha, se inserta. El PDF sale de este texto, así que también es exacto.

/** "Peso (g)": 128 → ["Peso", "128 g"]; une Tolerancia/Junta con su descripción. */
function lineasFichaKB(ficha: TechInfo): string[] {
  const d = ficha.datos;
  const out: string[] = [];
  const omitir = new Set(["Descripción de la tolerancia", "Descripción de la junta"]);
  for (const [k, v] of Object.entries(d)) {
    if (omitir.has(k) || v === null || v === undefined || v === "") continue;
    // La "Serie" numérica de NTN (6200) es ruido; la de los soportes TL (UCP200) informa.
    if (k === "Serie" && typeof v === "number") continue;
    let etiqueta = k;
    let valor = String(v);
    const unidad = k.match(/\((mm|g|kg|kN|rpm|°)\)\s*$/);
    if (unidad) {
      etiqueta = k.replace(/\s*\([^)]+\)\s*$/, "");
      valor = `${valor} ${unidad[1]}`.replace(/ °$/, "°");
    }
    const desc = (x: unknown) => (x && String(x) !== valor ? ` (${x})` : "");
    if (k === "Tolerancia") valor += desc(d["Descripción de la tolerancia"]);
    if (k === "Junta") valor += desc(d["Descripción de la junta"]);
    out.push(`- **${etiqueta}:** ${valor}`);
  }
  return out;
}

function medidasKB(ficha: TechInfo): string | null {
  const d = ficha.datos;
  const di = d["Diámetro interior dØ (mm)"];
  const de = d["Diámetro exterior DØ (mm)"];
  const an = d["Ancho B (mm)"];
  if (di === undefined || de === undefined || an === undefined) return null;
  return `**Medidas:** dØ${di} × DØ${de} × B${an} mm`;
}

const normR = (s: string) => String(s ?? "").toUpperCase().replace(/[\s\-/.]/g, "");

/** Ficha de la base de datos cuya referencia coincide EXACTAMENTE (y la marca, si la hay). */
function fichaExacta(ref: string, titulo: string): TechInfo | null {
  const r = normR(ref);
  if (r.length < 3) return null;
  const marcaTitulo = (titulo.toUpperCase().match(/\b(NTN|SNR|TL|INA|FAG)\b/) ?? [])[1];
  const sinMarca = normalizarRef(ref);
  const pagTL = r.replace(/^33(?=[A-Z])/, "").replace(/TL$/, "");
  const fichas = findTechnicalInfo(ref).filter((f) => {
    const fr = normR(f.referencia);
    const frSinTL = fr.replace(/^TL/, "");
    return fr === r || fr === sinMarca || frSinTL === sinMarca || frSinTL === pagTL;
  });
  if (!fichas.length) {
    // Pieza TL sin ficha propia ("TL 6205 2RS", Ref 3362052RSTL): su ficha es
    // la de su equivalente NTN/SNR (misma pieza: 2RS = EE/LLU). Visto el
    // 25-10-2026: sin esto el bot rellenaba "Velocidad límite: No especificada",
    // "Peso: No especificado"... teniendo el dato oficial del equivalente.
    if (marcaTitulo !== "TL" && !/^33.*TL$/.test(r)) return null;
    const equivalente = findTechnicalInfo(ref).find((f) => f.coincidencia === "equivalente");
    return equivalente ? { ...equivalente, pedida: equivalente.pedida ?? sinMarca } : null;
  }
  if (marcaTitulo) {
    const deMarca = fichas.find((f) => f.marca.toUpperCase().startsWith(marcaTitulo));
    if (deMarca) return deMarca;
    if (fichas.length > 1) return null; // ambigua: no se toca
  }
  return fichas[0];
}

const CABECERA_FICHA = /^\s*\**\s*informaci[oó]n t[eé]cnica completa\s*:?\s*\**\s*:?\s*$/i;

export function corregirFichasConKB(texto: string): string {
  const lineas = String(texto ?? "").split("\n");
  const salida: string[] = [];
  let titulo = "";
  let ficha: TechInfo | null = null;
  let puesta = false; // ya se escribió el bloque técnico de este producto
  let saltandoVinetas = false;

  const insertarFicha = () => {
    if (!ficha || puesta) return;
    if (ficha.coincidencia === "equivalente") {
      salida.push(`Datos técnicos oficiales de su equivalente **${ficha.marca.replace(/\s*\(.*\)/, "")} ${ficha.referencia}** (misma pieza):`, "");
    }
    salida.push("**Información técnica completa:**", ...lineasFichaKB(ficha), "");
    puesta = true;
  };

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const t = l.trim();

    if (saltandoVinetas) {
      if (/^\s*[-*•]\s+/.test(l) || (!t && /^\s*[-*•]\s+/.test(lineas[i + 1] ?? ""))) continue;
      saltandoVinetas = false;
    }

    if (/^\*\*[^*]+\*\*$/.test(t) && /^\s*\**\s*Ref\s*:/i.test((lineas.slice(i + 1).find((x) => x.trim()) ?? ""))) {
      titulo = t.replace(/\*/g, "");
      ficha = null;
      puesta = false;
      salida.push(l);
      continue;
    }
    const ref = t.match(/^\**\s*Ref\s*:\s*([^*]+?)\s*\**$/i);
    if (ref) {
      ficha = fichaExacta(ref[1], titulo);
      puesta = false;
      salida.push(l);
      continue;
    }
    // Datos sueltos bajo "Ref:" ("- Peso: 810 g", sin flecha): con ficha de la
    // base de datos se sustituyen por el bloque oficial (no se fían).
    if (ficha && !puesta && /^\s*[-*•]\s+/.test(l) && !t.includes("→") && /:\**\s*\S/.test(t)) {
      continue;
    }
    if (ficha && /^\**\s*Medidas\s*:/i.test(t)) {
      salida.push(medidasKB(ficha) ?? l);
      continue;
    }
    if (ficha && CABECERA_FICHA.test(t)) {
      if (!puesta) insertarFicha();
      saltandoVinetas = true;
      continue;
    }
    // Sin bloque técnico: se inserta justo antes del precio.
    if (ficha && !puesta && /^\**\s*Precio\s*:/i.test(t)) {
      insertarFicha();
    }
    if (/^-{3,}$/.test(t)) {
      if (ficha && !puesta) insertarFicha();
      ficha = null;
      puesta = false;
    }
    salida.push(l);
  }
  if (ficha && !puesta) {
    salida.push("");
    insertarFicha();
  }
  // Nunca un dato "No especificado / no consta" en una ficha: resta fiabilidad
  // (cliente, 25-10-2026). Si el dato no está, la línea no se pone.
  return salida
    .filter((l) => !DATO_VACIO.test(l) && !SUFIJO_DE_RELLENO.test(l) && !codigoSinSignificadoOficial(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Decodificación de relleno: "- **5K** → Sufijo específico de la serie". No
 * dice nada y suena a inventado; si el significado no está en el glosario, la
 * línea no se pone (visto el 25-10-2026 con NTN 6205 LLU CM/5K).
 */
export const SUFIJO_DE_RELLENO =
  /^\s*[-*•]\s+.*→\s*\**\s*(sufijo\s+(espec[ií]fico|propio|particular|interno|adicional)|c[oó]digo\s+(interno|espec[ií]fico|del\s+fabricante)|designaci[oó]n\s+(interna|espec[ií]fica))\b[^\n]*$/i;

/**
 * "- **5K** → Especificación de embalaje y calidad": los códigos del
 * fabricante tipo /5K, /1K, /2A, /L627 (grasa, ejecución especial...) no están
 * en el glosario oficial y el modelo les inventa un significado distinto cada
 * vez (25-10-2026: "sufijo específico de la serie", "embalaje y calidad"). Si
 * el glosario no lo explica, la línea no se pone.
 */
function codigoSinSignificadoOficial(l: string): boolean {
  const m = /^\s*[-*•]\s+\**\/?\s*([0-9][A-Z]{1,2}|L\d{3})\**\s*→/i.exec(l);
  return !!m && !findGlossary(m[1]).length;
}

/** Viñeta "- **Etiqueta:** No especificada" (o no disponible, no consta, N/D...). */
export const DATO_VACIO =
  /^\s*[-*•]\s+\**[^:\n]{1,60}:\**\s*\**\s*(no\s+(especificad[oa]s?|disponibles?|consta|indicad[oa]|aplica)|desconocid[oa]|sin\s+datos?|n\/?d|-|—)\s*\**\.?\s*$/i;
