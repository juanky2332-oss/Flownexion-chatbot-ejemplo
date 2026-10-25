import "server-only";
// Comparativa "sí o sí" (petición del cliente, 25-10-2026).
//
// Cuando el cliente pide comparar o pregunta por diferencias, tiene que salir
// SIEMPRE: el PDF de la ficha técnica de CADA artículo por separado + el PDF
// comparativo. Antes dependía de que el texto del bot trajera cada ficha con
// el formato del prompt o nombrara la referencia tal cual; cuando el bot ponía
// una en ficha y la otra en una tabla o una frase, solo salía un PDF y ninguna
// comparativa. Aquí las piezas comparadas se sacan del MENSAJE del cliente (y
// de la conversación, en "¿y qué diferencia tiene con el 6305?") y cada una se
// resuelve contra la base técnica verificada, diga lo que diga el texto.

import { extractQueryCandidates, findTechnicalInfo, sinCantidades } from "./kb";
import { refDeConversacion } from "./variantes";
import { fichaDesdeKb, textoNombraRef, type FichaKb, type FichaTecnica } from "./ficha";

export interface PiezaComparada {
  ref: string;
  marca?: string;
}

const MAX_PIEZAS = 4;
const normRef = (s: string) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const MARCA = /\b(NTN|SNR|TL)\b/i;

// Lo que separa una pieza de otra en "compara el 6205 2rs con el 6305 zz",
// "6205 zz c3 vs 6205 2rs c3", "NTN 6205 y SNR 6205", "¿el 22210 o el 22212?".
// Sin esto, extractQueryCandidates pega las dos en una ("6205ZZC3VS62052RSC3").
// La "/" NO separa: va dentro de referencias ("6812 LLU/5K").
const SEPARADOR = /\s*(?:[,;]|\bcon\b|\bfrente\s+a\b|\bvs\b\.?|\bversus\b|\by\b|\be\b|\bo\b|\bu\b|\bentre\b|\brespecto\s+(?:a|al|de)\b)\s*/i;

/** Una pieza por trozo del mensaje: la referencia más completa de ese trozo. */
export function piezasDelMensaje(mensaje: string): PiezaComparada[] {
  const piezas: PiezaComparada[] = [];
  for (const trozo of sinCantidades(mensaje).split(SEPARADOR)) {
    // extractQueryCandidates también da el trozo entero pegado ("COMPARA62052RS"):
    // vale el más largo SIN una palabra pegada, aunque no tenga ficha ("6205 ZZ
    // C2" no existe y es justo lo que pidió: quedarse con "6205ZZ" cambiaba la
    // pieza). Solo si todos llevan palabra pegada, el que tenga ficha.
    // La marca va aparte (si no, "TL 6201 2RS" daba la referencia "TL62012RS").
    const cands = extractQueryCandidates(trozo.replace(/\b(NTN|SNR|TL|SKF|FAG|INA|NSK|KOYO|TIMKEN)\b/gi, " "))
      .map((c) => c.replace(/[^A-Z0-9\-/.]/gi, ""))
      .filter((c) => (c.match(/\d/g) ?? []).length >= 2 && c.length <= 20);
    const ref =
      cands.find((c) => !/[A-Z]{5,}/i.test(c)) ??
      cands.find((c) => findTechnicalInfo(c).some((t) => t.coincidencia !== "base"));
    if (!ref) continue;
    const marca = MARCA.exec(trozo)?.[1]?.toUpperCase();
    piezas.push(marca ? { ref, marca } : { ref });
  }
  return piezas;
}

/** "Ref: X" del último mensaje del bot ("compara los dos", "¿en qué se diferencian?"). */
function piezasDelUltimoTurno(historial: { role?: string; content: string }[]): PiezaComparada[] {
  const ultimo = String([...historial].reverse().find((m) => m.role === "assistant")?.content ?? "");
  const out: PiezaComparada[] = [];
  const re = /\*\*([^*\n]{2,60})\*\*\s*\n+\s*\**\s*Ref:\s*\**\s*([A-Z0-9][A-Z0-9 \-/.]{2,24})/gi;
  for (const m of ultimo.matchAll(re)) {
    const marca = MARCA.exec(m[1])?.[1]?.toUpperCase();
    out.push(marca ? { ref: m[2].trim(), marca } : { ref: m[2].trim() });
  }
  return out;
}

/**
 * El producto del que se venía hablando ("¿y en qué se diferencia del 6206
 * zz?"): el primero que el bot puso en negrita con su marca ("**SNR 6205 ZZ**"),
 * con TODOS sus sufijos. refDeConversacion se queda en "SNR 6205" cuando el
 * bot no escribe "Ref:" (visto en producción el 25-10-2026), y eso es otra pieza.
 */
function piezaDelTurnoAnterior(historial: { role?: string; content: string }[]): PiezaComparada | null {
  const ultimo = String([...historial].reverse().find((m) => m.role === "assistant")?.content ?? "");
  for (const m of ultimo.matchAll(/\*\*([^*\n]{3,50})\*\*/g)) {
    if (!MARCA.test(m[1]) || (m[1].match(/\d/g) ?? []).length < 3) continue;
    const [p] = piezasDelMensaje(m[1].replace(/^\s*(RODAMIENTO|SOPORTE|CORREA)S?\s+/i, ""));
    if (p) return p;
  }
  const previa = refDeConversacion(historial);
  return previa ? { ref: previa.referencia, marca: marcaDe(previa.marca) } : null;
}

/**
 * Las piezas que el cliente quiere comparar, en orden (la del turno anterior
 * primero en "compáralo con…"). Máximo 4.
 */
export function piezasAComparar(mensaje: string, historial: { role?: string; content: string }[] = []): PiezaComparada[] {
  const piezas: PiezaComparada[] = [];
  const meter = (p: PiezaComparada, delante = false) => {
    const k = `${p.marca ?? ""}|${normRef(p.ref)}`;
    if (piezas.some((o) => `${o.marca ?? ""}|${normRef(o.ref)}` === k)) return;
    if (delante) piezas.unshift(p);
    else piezas.push(p);
  };
  for (const p of piezasDelMensaje(mensaje)) meter(p);
  if (piezas.length === 0) for (const p of piezasDelUltimoTurno(historial)) meter(p);
  if (piezas.length === 1) {
    const previa = piezaDelTurnoAnterior(historial);
    if (previa) meter(previa, true);
  }
  return piezas.slice(0, MAX_PIEZAS);
}

const marcaDe = (s: string) => normRef(String(s ?? "").replace(/\(.*\)/, "")).replace(/^TL.*/, "TL");

/** ¿Esta ficha del texto es la de la pieza? (por referencia y, si la dijo, por marca). */
function fichaCubre(f: FichaTecnica, refs: string[], marca?: string): boolean {
  const ref = normRef(f.referencia);
  // "RODAMIENTO TL 6201 2RS" es de marca TL: el tipo de pieza delante no cuenta.
  const titulo = normRef(f.titulo.replace(/^\s*(RODAMIENTO|SOPORTE|CORREA)S?\s+/i, ""));
  if (marca && !titulo.startsWith(marca)) return false;
  return refs.some((r) => r.length >= 3 && (ref === r || titulo.endsWith(r) || titulo === `${marca ?? ""}${r}`));
}

/** La ficha verificada de la pieza: la que consultó el bot o, si no, la del KB. */
function fichaKbDe(p: PiezaComparada, consultadas: FichaKb[], texto: string, productos: { name?: string }[] = []): FichaKb | null {
  const r = normRef(p.ref);
  // Una pieza TL sin ficha propia usa la de su equivalente NTN/SNR (misma pieza).
  const deMarca = (k: FichaKb) => !p.marca || marcaDe(k.marca) === p.marca || (p.marca === "TL" && k.coincidencia === "equivalente");
  const valida = (k: FichaKb) => !!k?.referencia && !!k.datos && k.coincidencia !== "base" && deMarca(k);
  const casa = (k: FichaKb) =>
    normRef(k.referencia) === r || (!!k.pedida && normRef(k.pedida) === r) || (r.length >= 3 && normRef(k.referencia).endsWith(r));
  const consultada = (consultadas ?? []).filter((k) => valida(k) && casa(k));
  const delKb = consultada.length ? consultada : (findTechnicalInfo(p.ref) as FichaKb[]).filter(valida);
  // La pedida no existe tal cual ("6205 ZZ C2"): la comparativa va con la que
  // SÍ se le ofrece, la de la tarjeta de la misma base ("SNR 6205 ZZ C3"), no
  // con otra variante cualquiera del KB (salía el 6205 ZZ, juego normal).
  if (!delKb.some((k) => k.coincidencia === "exacta" || k.coincidencia === "equivalente")) {
    const base = /^\d{3,6}/.exec(r)?.[0];
    for (const prod of productos) {
      const nombre = String(prod.name ?? "").replace(/^\s*(RODAMIENTO|SOPORTE|CORREA)S?\s+/i, "");
      if (!base || !normRef(nombre).includes(base)) continue;
      const hit = (findTechnicalInfo(nombre) as FichaKb[]).find((k) => (k.coincidencia === "exacta" || k.coincidencia === "equivalente") && deMarca(k));
      if (hit) return hit;
    }
  }
  if (!delKb.length) return null;
  // Con varias (NTN y SNR, o variantes 22210 EAKW33 / …C3), la que nombra la respuesta.
  return delKb.find((k) => textoNombraRef(texto, k.referencia, k.marca)) ?? delKb[0];
}

/**
 * Una ficha por pieza comparada, en el orden en que las nombró el cliente. Si
 * la respuesta ya trae la ficha de esa pieza, se usa esa (es lo que el cliente
 * acaba de leer); si no, la verificada del KB.
 */
export function fichasDeComparativa(
  piezas: PiezaComparada[],
  delTexto: FichaTecnica[],
  consultadas: FichaKb[],
  texto: string,
  productos: { name?: string }[] = []
): FichaTecnica[] {
  const out: FichaTecnica[] = [];
  const yaEsta = (f: FichaTecnica) => out.some((o) => normRef(o.titulo) === normRef(f.titulo));
  for (const p of piezas) {
    const kb = fichaKbDe(p, consultadas, texto, productos);
    const refs = [normRef(p.ref), ...(kb ? [normRef(kb.referencia)] : [])];
    const delBot = delTexto.find((f) => !yaEsta(f) && fichaCubre(f, refs, p.marca));
    if (delBot) {
      out.push(delBot);
      continue;
    }
    if (!kb) continue;
    const f = fichaDesdeKb(kb);
    if (kb.coincidencia === "equivalente") {
      // Con el nombre del producto de la página que es esa pieza ("TL 6205
      // 2RS"), que es el que el cliente ve y compra.
      const r = normRef(p.ref);
      const enPagina = productos.find((x) => normRef(String(x.name ?? "")).endsWith(r));
      const nombre = enPagina ? String(enPagina.name).replace(/^(RODAMIENTO|SOPORTE)S?\s+/i, "") : kb.pedida && /\s/.test(kb.pedida) ? kb.pedida : "";
      f.titulo = nombre ? `${nombre} (datos de su equivalente ${f.titulo})` : `${f.titulo} (equivalente)`;
    }
    if (f.datos.length < 3 || yaEsta(f)) continue;
    out.push(f);
  }
  return out;
}
