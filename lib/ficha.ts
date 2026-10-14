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
      if (actual && modo === "datos") cerrar();
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
      a.resumen.push(limpiar(sinViñeta(t)));
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
