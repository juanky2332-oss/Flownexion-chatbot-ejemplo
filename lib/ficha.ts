// Ficha técnica descargable en PDF (petición del cliente, 14-10-2026).
//
// Cuando el bot responde con las características técnicas de un producto,
// debajo de la tarjeta aparece "Descargar en formato PDF". El PDF lleva
// EXACTAMENTE la información que el cliente acaba de leer en el chat — por eso
// se saca de la propia respuesta y no se vuelve a consultar nada: si el texto
// y el PDF pudieran diferir, el PDF dejaría de ser "esta información".
//
// Fichero puro (sin server-only): lo usa la ruta /api/chat para decidir si hay
// ficha y lo prueba scripts/test-kb.ts con respuestas reales del bot.

export interface FichaTecnica {
  /** Línea de cabecera: "NTN 6812 LLU/5K". */
  titulo: string;
  /** "6812 LLU/5K". */
  referencia: string;
  /** Decodificación de la referencia: "68 → Serie extra delgada…". */
  resumen: string[];
  /** "dØ60 × DØ78 × B10 mm". */
  medidas?: string;
  /** Pares etiqueta → valor de la información técnica completa ("" si la viñeta no tenía valor). */
  datos: [string, string][];
}

// Una respuesta solo cuenta como ficha técnica si trae este bloque. Es el
// encabezado que fija el prompt (INFORMACIÓN TÉCNICA COMPLETA); se aceptan
// también las variantes con las que el modelo a veces lo titula.
const CABECERA_TECNICA =
  /^(informaci[oó]n t[eé]cnica( completa)?|caracter[ií]sticas( t[eé]cnicas)?( completas)?|ficha t[eé]cnica( completa)?|datos t[eé]cnicos|especificaciones( t[eé]cnicas)?)\s*:?$/i;

// Etiquetas que NO son técnicas y no van al PDF (el ejemplo del cliente no
// lleva precio ni stock: es un documento técnico, no una oferta). Se compara
// la etiqueta ENTERA, para no perder datos como "Stock mínimo de grasa".
const ETIQUETA_COMERCIAL = /^(precio|stock|disponibilidad|descuento)$/i;

// Mínimo de datos para considerarlo ficha técnica y no una mención de pasada.
const MIN_DATOS = 3;

/** Quita el marcado markdown de una línea, conservando el texto. */
function limpiar(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // enlaces → texto
    .replace(/~~([^~]*)~~/g, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/(^|\s)\*(\S[^*]*\S|\S)\*(?=\s|$)/g, "$1$2")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "**Clase de producto:** Rodamiento" → ["Clase de producto", "Rodamiento"]. */
function partirEtiqueta(linea: string): [string, string] | null {
  const t = limpiar(linea);
  const i = t.indexOf(":");
  if (i <= 0 || i > 70) return null;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!k || !v) return null;
  return [k, v];
}

// Viñeta: "- ", "* ", "• " o numerada "1. " / "1) ".
const VIÑETA = /^\s*([-*•]|\d{1,2}[.)])\s+/;
const esViñeta = (l: string) => VIÑETA.test(l);
const sinViñeta = (l: string) => l.replace(VIÑETA, "");
const sangria = (l: string) => l.match(/^\s*/)?.[0].length ?? 0;
const esSeparador = (l: string) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
/**
 * Línea de título de producto: solo texto en negrita ("**NTN 6812 LLU/5K**")
 * o un encabezado markdown ("### NTN 6812 LLU/5K").
 */
const esTitulo = (l: string) => /^\s*\*\*[^*]+\*\*\s*$/.test(l) || /^\s*#{1,4}\s+\S/.test(l);
const esLineaRef = (l: string) => /^\s*\*\*\s*ref(erencia)?\s*:/i.test(l) || /^\s*ref(erencia)?\s*:/i.test(limpiar(l));
const esLineaMedidas = (l: string) => /^medidas\s*:/i.test(limpiar(l));

/**
 * Extrae las fichas técnicas de una respuesta del bot. Devuelve [] si la
 * respuesta no contiene ninguna (saludo, equivalencia sin ficha, escalado...).
 */
export function extraerFichas(texto: string): FichaTecnica[] {
  const lineas = String(texto ?? "").replace(/\r/g, "").split("\n");
  const fichas: FichaTecnica[] = [];

  let actual: FichaTecnica | null = null;
  // Qué se está leyendo dentro del bloque de producto actual.
  let modo: "nada" | "resumen" | "datos" = "nada";
  // Viñeta "Etiqueta:" sin valor cuyas sub-viñetas son sus datos
  // ("- Medidas:" con "  - h: 36" debajo → "Medidas h: 36").
  let padre: { etiqueta: string; sangria: number } | null = null;

  const cerrar = () => {
    if (actual && actual.datos.length >= MIN_DATOS) fichas.push(actual);
    actual = null;
    modo = "nada";
    padre = null;
  };

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const t = l.trim();
    if (!t) continue;

    if (esSeparador(t)) {
      // El "---" cierra un producto solo cuando ya se ha leído su ficha; el
      // formato del prompt también abre cada producto con "---".
      if (actual && (modo === "datos" || actual.datos.length)) cerrar();
      continue;
    }

    // Comienzo de producto: un título seguido (en la siguiente línea no
    // vacía) de "Ref: …" — o, si el bot se saltó la Ref, de la línea de
    // Medidas o directamente del bloque de información técnica.
    if (esTitulo(t) && !esLineaRef(t) && !CABECERA_TECNICA.test(limpiar(t))) {
      const sig = lineas.slice(i + 1).find((x) => x.trim());
      if (sig && (esLineaRef(sig) || esLineaMedidas(sig) || CABECERA_TECNICA.test(limpiar(sig)))) {
        cerrar();
        actual = { titulo: limpiar(t.replace(/^\s*#+\s*/, "")), referencia: "", resumen: [], datos: [] };
        continue;
      }
    }

    if (!actual) continue;
    const a: FichaTecnica = actual;

    if (esLineaRef(t)) {
      a.referencia = limpiar(t).replace(/^ref(erencia)?\s*:\s*/i, "");
      modo = "resumen";
      continue;
    }

    const plano = limpiar(t.replace(/^#+\s*/, ""));
    if (modo !== "datos" && esLineaMedidas(t)) {
      a.medidas = plano.replace(/^medidas\s*:\s*/i, "");
      modo = "nada";
      continue;
    }
    if (CABECERA_TECNICA.test(plano)) {
      modo = "datos";
      padre = null;
      continue;
    }

    if (modo === "resumen" && esViñeta(l)) {
      const contenido = limpiar(sinViñeta(t));
      const par = contenido.includes("→") ? null : partirEtiqueta(sinViñeta(t));
      // Visto en producción con soportes: el bot pone la ficha ("- Peso: 810 g")
      // directamente bajo "Ref:", sin el encabezado de información técnica.
      // Las viñetas "etiqueta: valor" son datos; las de "parte → significado",
      // la decodificación del resumen.
      if (par && !ETIQUETA_COMERCIAL.test(par[0])) a.datos.push(par);
      else a.resumen.push(contenido);
      continue;
    }
    // Un párrafo suelto (cierre, "En nuestra página tenemos…") termina la
    // parte técnica: lo que venga después ya no es de esta ficha.
    if (modo === "resumen" && !esViñeta(l) && a.datos.length) {
      modo = "nada";
      continue;
    }

    if (modo === "datos") {
      if (esViñeta(l)) {
        const nivel = sangria(l);
        if (padre && nivel <= padre.sangria) padre = null;
        const contenido = limpiar(sinViñeta(t));
        const par = partirEtiqueta(sinViñeta(t));
        if (!par && /:$/.test(contenido)) {
          // "- Medidas:" sin valor: sus datos vienen en las sub-viñetas.
          padre = { etiqueta: contenido.replace(/:$/, "").trim(), sangria: nivel };
          continue;
        }
        if (par && ETIQUETA_COMERCIAL.test(par[0])) continue;
        const [k, v] = par ?? [contenido, ""];
        a.datos.push([padre ? `${padre.etiqueta} ${k}` : k, v]);
        continue;
      }
      // Primera línea que no es viñeta (precio, stock, cierre): se acabó la
      // lista técnica.
      modo = "nada";
      padre = null;
    }
  }
  cerrar();

  // Si el bot repite el mismo producto (p.ej. en una comparativa), una ficha.
  // Se compara título Y referencia: "NTN 6205" y "SNR 6205" comparten
  // "Ref: 6205" pero son fichas distintas y las dos tienen que ir al PDF.
  const vistos = new Set<string>();
  return fichas.filter((f) => {
    const k = `${f.titulo}|${f.referencia}`.toUpperCase().replace(/\s+/g, "");
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// ── Red de seguridad: ficha desde la base de datos técnica ──────────────────
// El cliente pidió (22-10-2026) que el PDF salga "sí o sí" en cada consulta
// de ficha técnica. extraerFichas depende de que el bot respete el formato
// del prompt al pie de la letra; cuando no lo hace (otro encabezado, datos en
// una frase, tabla...) no salía ningún botón. Si el bot ha consultado la
// ficha verificada de una referencia (get_technical_info, compare_products o
// la ficha del producto de la conversación) y la NOMBRA en su respuesta, se
// monta el PDF con esos mismos datos verificados, que son los que el bot tenía
// delante al redactar.

/** Forma mínima de la ficha del KB (TechInfo en lib/kb.ts, que es server-only). */
export interface FichaKb {
  marca: string;
  referencia: string;
  datos: Record<string, string | number>;
  /** Ver TechInfo.coincidencia: "base" NO es la pieza pedida y no va al PDF. */
  coincidencia?: "exacta" | "equivalente" | "variante" | "base";
  /** Referencia que se pidió cuando la ficha es de su equivalente NTN/SNR. */
  pedida?: string;
}

/**
 * ¿Ha pedido el cliente una comparación? Solo entonces sale el PDF
 * comparativo: si pide UN rodamiento, se le da la ficha de ese y punto.
 * Cuenta pedirlo con palabras ("compáralo", "diferencias", "cuál es mejor",
 * "frente a", "vs") o nombrar dos referencias distintas en el mismo mensaje.
 */
export function pideComparar(mensaje: string, referenciasEnMensaje: string[] = []): boolean {
  const m = String(mensaje ?? "");
  if (/\b(compar\w*|diferencia\w*|diferencian|frente\s+a|vs\.?|versus|cu[aá]l\s+(es\s+)?mejor|en\s+qu[eé]\s+se\s+diferencian)\b/i.test(m)) return true;
  // Dos lecturas de la misma referencia ("62012RS" y "1062012RS", con la
  // cantidad pegada) no son dos referencias: solo cuentan las que no están una
  // dentro de otra.
  const norm = Array.from(new Set(referenciasEnMensaje.map((r) => String(r).toUpperCase().replace(/[^A-Z0-9]/g, "")).filter((r) => r.length >= 3)));
  const maximas = norm.filter((r) => !norm.some((o) => o !== r && o.includes(r)));
  return maximas.length >= 2;
}

const MAX_FICHAS_KB = 4;

const normRef = (s: string) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * ¿Nombra el texto esta referencia, como pieza entera (no dentro de otra más
 * larga)? Con marca, además exige que la marca vaya justo delante: visto en
 * producción, "TL 6205 2RS" colaba la ficha del "SNR 6205" (el 6205 suelto
 * está en el texto, pero es otra pieza).
 */
export function textoNombraRef(texto: string, referencia: string, marca?: string): boolean {
  const ref = normRef(referencia);
  if (ref.length < 3) return false;
  // ref ya solo tiene [A-Z0-9]: no hay nada que escapar. Entre carácter y
  // carácter se admite el separador con que lo escribe el bot ("6205 ZZ C3").
  const patron = ref.split("").join("[\\s\\-/.]*");
  const t = String(texto ?? "").toUpperCase();
  // Con marca: "SNR 6205" o "el 6205" a secas valen; "TL 6205" no es la
  // ficha del SNR 6205 (otra marca justo delante).
  const m = marca ? normRef(marca.replace(/\(.*\)/, "")) : "";
  const re = new RegExp(`(^|[^A-Z0-9])${patron}(?=$|[^A-Z0-9])`, "gi");
  for (let hit = re.exec(t); hit; hit = re.exec(t)) {
    // Detrás no puede seguir un sufijo: "6205 2RS" o "6205 ZZ" son otra pieza.
    const siguiente = /^[\s*]*([A-Z0-9]+)/.exec(t.slice(hit.index + hit[0].length))?.[1] ?? "";
    if (SUFIJO_SUELTO.test(siguiente)) continue;
    if (m) {
      const anterior = /([A-Z0-9]+)[\s*]*$/.exec(t.slice(0, hit.index + hit[1].length))?.[1] ?? "";
      if (MARCAS.test(anterior) && anterior !== m) continue;
    }
    return true;
  }
  return false;
}

const MARCAS = /^(NTN|SNR|TL|SKF|FAG|INA|NSK|KOYO|TIMKEN|NACHI|ZKL|FBJ|CONTINENTAL)$/;

// Sufijos de rodamiento que el bot escribe separados de la base ("6205 2RS",
// "6205 ZZ C3", "6305 LLU"). Lista cerrada a propósito: una palabra cualquiera
// detrás ("6205 ES", "6205 TIENE") no debe tomarse por sufijo.
const SUFIJO_SUELTO =
  /^(2RS\w*|2RZ|2Z\w*|ZZ\w*|Z|LL[UBHJ]\w*|L[UBH]|C[2-5]|CM|EE|E|RS\w*|RZ|NR|N|K|TVH|TN9|J|M|P[0-6]|DDU|VV|AGR|W33|G15|SH|ZNR|L3|L4)$/;

function valorPlano(v: string | number): string {
  return typeof v === "number" ? String(v).replace(".", ",") : String(v).trim();
}

/** Convierte la ficha del KB al formato del PDF ("Peso (g)" → "Peso: 125 g"). */
export function fichaDesdeKb(kb: FichaKb): FichaTecnica {
  const marca = /^TL\b/i.test(kb.marca) ? "TL" : kb.marca.trim();
  const datos: [string, string][] = [];
  let di = "", de = "", an = "";
  for (const [k, v] of Object.entries(kb.datos ?? {})) {
    if (v === null || v === undefined || String(v).trim() === "") continue;
    if (typeof v === "object") continue;
    const unidad = /\(([^)]+)\)\s*$/.exec(k)?.[1];
    const etiqueta = unidad ? k.replace(/\s*\([^)]+\)\s*$/, "") : k;
    const val = valorPlano(v as string | number);
    if (/^Diámetro interior/i.test(k)) di = val;
    if (/^Diámetro exterior/i.test(k)) de = val;
    if (/^Ancho B/i.test(k)) an = val;
    datos.push([etiqueta, unidad && unidad !== "°" ? `${val} ${unidad}` : unidad === "°" ? `${val}°` : val]);
  }
  const medidas = di || de || an
    ? [di && `dØ${di}`, de && `DØ${de}`, an && `B${an}`].filter(Boolean).join(" × ") + " mm"
    : undefined;
  return {
    titulo: `${marca} ${kb.referencia}`.trim(),
    referencia: kb.referencia,
    resumen: [],
    ...(medidas ? { medidas } : {}),
    datos,
  };
}

/**
 * Fichas para el PDF de una respuesta: las que trae el propio texto y, para
 * cada referencia con ficha verificada que el texto nombra y que no salió ya
 * del texto, la ficha del KB.
 */
export function fichasParaPdf(texto: string, consultadas: FichaKb[], comparando = false): FichaTecnica[] {
  const delTexto = extraerFichas(texto);
  const cubiertas = new Set(delTexto.map((f) => normRef(f.referencia || f.titulo)));
  const yaTitulos = delTexto.map((f) => normRef(f.titulo));
  const extra: FichaTecnica[] = [];
  const vistas = new Set<string>();
  for (const kb of consultadas ?? []) {
    if (!kb || !kb.referencia || !kb.datos) continue;
    // La ficha de la referencia BASE no es la de la pieza pedida (le faltan
    // sufijos): nunca va a un PDF con el nombre de lo que se pidió.
    if (kb.coincidencia === "base") continue;
    // La ficha de la equivalente NTN/SNR es la MISMA pieza que una que ya trae
    // el texto ("TL 6201 2RS ... equivalente SNR 6201 EE"): sin comparación de
    // por medio, no es un segundo producto ni un segundo PDF.
    if (!comparando && kb.coincidencia === "equivalente" && delTexto.length) continue;
    const clave = normRef(`${kb.marca}${kb.referencia}`);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const ref = normRef(kb.referencia);
    const pedida = kb.pedida ? normRef(kb.pedida) : "";
    if (cubiertas.has(ref) || yaTitulos.some((t) => t.endsWith(ref))) continue;
    // La referencia BASE de una pieza cuya ficha ya trae el texto (6201 frente
    // a "TL 6201 2RS"): es otra pieza (sin el sellado) y no se cuela en el PDF.
    if (!comparando && yaTitulos.some((t) => {
      const i = t.lastIndexOf(ref);
      return i >= 0 && i + ref.length < t.length;
    })) continue;
    // Equivalente NTN/SNR de lo pedido (6201 2RS → SNR 6201 EE): si el texto ya
    // trae la ficha de lo pedido, no se duplica; si no, entra con su nombre real.
    if (pedida && (cubiertas.has(pedida) || yaTitulos.some((t) => t.endsWith(pedida)))) continue;
    const nombrada = textoNombraRef(texto, kb.referencia, kb.marca) || (!!pedida && textoNombraRef(texto, kb.pedida as string));
    if (!nombrada) continue;
    const f = fichaDesdeKb(kb);
    if (kb.coincidencia === "equivalente") {
      f.titulo = kb.pedida && /\s/.test(kb.pedida) ? `${kb.pedida} (datos de su equivalente ${f.titulo})` : `${f.titulo} (equivalente)`;
    }
    if (f.datos.length < MIN_DATOS) continue;
    extra.push(f);
    if (delTexto.length + extra.length >= MAX_FICHAS_KB) break;
  }
  return [...delTexto, ...extra];
}

/** Nombre del fichero: "Ficha-tecnica-NTN-6812-LLU-5K.pdf". */
export function nombreFicheroFicha(fichas: FichaTecnica[]): string {
  const base = fichas.length === 1 ? fichas[0].titulo || fichas[0].referencia : "varios-productos";
  const limpio = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `Ficha-tecnica-${limpio || "ESGAS"}.pdf`;
}
