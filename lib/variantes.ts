import "server-only";
import type { Product } from "./types";
import { findTechnicalInfo, findGlossary, extractQueryCandidates, type TechInfo } from "./kb";

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
const MARCA_INICIAL =
  /^(NTN|SNR|TL|INA|FAG|SKF|NSK|TIMKEN|KOYO|NACHI|CONTINENTAL|CONTI|SEDIS|BONDIOLI|CORTECO)[\s\-/]*/;

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
    const partida = partirReferencia(p.reference || p.name);
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
    const candidatas = explicitas.length ? explicitas : extractQueryCandidates(texto).slice(0, 3);
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
    `Llama además a compare_products con las dos referencias para dar las diferencias técnicas exactas.`
  );
}

/** Bloque de OTRA MEDIDA: ancla la comparación al producto ya mostrado. */
export function bloqueOtraMedida(refPrevia: TechInfo): string {
  const ficha = Object.entries(refPrevia.datos)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  return (
    `🔒 PRODUCTO DE REFERENCIA DE ESTA CONVERSACIÓN — el cliente pide otra medida/variante partiendo de:\n` +
    `${refPrevia.marca} ${refPrevia.referencia} → ${ficha}\n\n` +
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
