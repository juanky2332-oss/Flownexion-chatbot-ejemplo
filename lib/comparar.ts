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
function piezasDelMensaje(mensaje: string): PiezaComparada[] {
  const piezas: PiezaComparada[] = [];
  for (const trozo of sinCantidades(mensaje).split(SEPARADOR)) {
    // extractQueryCandidates también da el trozo entero pegado ("COMPARA62052RS"):
    // vale el más largo que tenga ficha y, si ninguno la tiene, el que no lleva
    // una palabra pegada.
    const cands = extractQueryCandidates(trozo)
      .map((c) => c.replace(/[^A-Z0-9\-/.]/gi, ""))
      .filter((c) => (c.match(/\d/g) ?? []).length >= 2 && c.length <= 20);
    const ref =
      cands.find((c) => findTechnicalInfo(c).some((t) => t.coincidencia !== "base")) ??
      cands.find((c) => !/[A-Z]{5,}/i.test(c));
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
    const previa = refDeConversacion(historial);
    if (previa) meter({ ref: previa.referencia, marca: previa.marca.replace(/\s*\(.*\)/, "").toUpperCase() }, true);
  }
  return piezas.slice(0, MAX_PIEZAS);
}

const marcaDe = (s: string) => normRef(String(s ?? "").replace(/\(.*\)/, "")).replace(/^TL.*/, "TL");

/** ¿Esta ficha del texto es la de la pieza? (por referencia y, si la dijo, por marca). */
function fichaCubre(f: FichaTecnica, refs: string[], marca?: string): boolean {
  const ref = normRef(f.referencia);
  const titulo = normRef(f.titulo);
  if (marca && !titulo.startsWith(marca)) return false;
  return refs.some((r) => r.length >= 3 && (ref === r || titulo.endsWith(r) || titulo === `${marca ?? ""}${r}`));
}

/** La ficha verificada de la pieza: la que consultó el bot o, si no, la del KB. */
function fichaKbDe(p: PiezaComparada, consultadas: FichaKb[], texto: string): FichaKb | null {
  const r = normRef(p.ref);
  const deMarca = (k: FichaKb) => !p.marca || marcaDe(k.marca) === p.marca;
  const valida = (k: FichaKb) => !!k?.referencia && !!k.datos && k.coincidencia !== "base" && deMarca(k);
  const casa = (k: FichaKb) =>
    normRef(k.referencia) === r || (!!k.pedida && normRef(k.pedida) === r) || (r.length >= 3 && normRef(k.referencia).endsWith(r));
  const consultada = (consultadas ?? []).filter((k) => valida(k) && casa(k));
  const delKb = consultada.length ? consultada : (findTechnicalInfo(p.ref) as FichaKb[]).filter(valida);
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
  texto: string
): FichaTecnica[] {
  const out: FichaTecnica[] = [];
  const yaEsta = (f: FichaTecnica) => out.some((o) => normRef(o.titulo) === normRef(f.titulo));
  for (const p of piezas) {
    const kb = fichaKbDe(p, consultadas, texto);
    const refs = [normRef(p.ref), ...(kb ? [normRef(kb.referencia)] : [])];
    const delBot = delTexto.find((f) => !yaEsta(f) && fichaCubre(f, refs, p.marca));
    if (delBot) {
      out.push(delBot);
      continue;
    }
    if (!kb) continue;
    const f = fichaDesdeKb(kb);
    if (kb.coincidencia === "equivalente") {
      f.titulo = kb.pedida && /\s/.test(kb.pedida) ? `${kb.pedida} (datos de su equivalente ${f.titulo})` : `${f.titulo} (equivalente)`;
    }
    if (f.datos.length < 3 || yaEsta(f)) continue;
    out.push(f);
  }
  return out;
}
