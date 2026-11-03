// Lo más parecido, con sus pros y sus contras (petición del cliente, 03-11-2026).
//
// Si lo que se pide no se puede comprar por la página, antes de mandar al
// teléfono se ofrece lo más parecido: "este artículo tiene lo mismo menos tal,
// y eso te da esto a favor y esto en contra". Y cuando varias piezas se parecen
// mucho o el cliente duda, nada de tres fichas enteras en el chat: un resumen
// corto y la comparativa en PDF.
//
// Las diferencias se calculan AQUÍ, desde las fichas, nunca las redacta el
// modelo. Visto el 03-11-2026 en una conversación real: el modelo dijo "1 g más
// ligero" (362 g frente a 388 g), "1,7 kN mayor" (eran 2,1) y "0,1 kN más de
// carga estática" (era menos). Los pros y contras salen de lo que dice el
// glosario de ESGAS (data/kb/glosario.json) sobre cada protección y cada juego.
//
// Fichero puro (sin server-only): lo prueba scripts/test-kb.ts.

import type { FichaTecnica } from "./ficha";

type Proteccion = "abierto" | "deflector" | "sin_contacto" | "contacto_ligero" | "contacto";

export interface DiferenciaPieza {
  /** Pieza propuesta. */
  titulo: string;
  /** Pieza con la que se compara (la del cliente, o la primera). */
  frenteA: string;
  cambios: string[];
  ventajas: string[];
  inconvenientes: string[];
}

interface Rasgos {
  d?: number;
  D?: number;
  B?: number;
  proteccion?: Proteccion;
  /** -1 = C2, 0 = normal, 1 = C3, 2 = C4, 3 = C5. */
  juego?: number;
  carga?: number;
  velocidad?: number;
}

const NOMBRE_PROTECCION: Record<Proteccion, string> = {
  abierto: "abierto, sin protección",
  deflector: "deflectores metálicos (ZZ)",
  sin_contacto: "juntas de goma sin contacto",
  contacto_ligero: "juntas de goma de contacto ligero",
  contacto: "juntas de goma de contacto (2RS/EE/LLU)",
};
const NOMBRE_JUEGO: Record<string, string> = { "-2": "juego C1", "-1": "juego C2", "0": "juego normal (CN)", "1": "juego C3", "2": "juego C4", "3": "juego C5" };

const ORDEN_JUEGO: Record<string, number> = { "1": -2, "2": -1, "3": 1, "4": 2, "5": 3 };

/** "31,9 kN", "31.9 kN", "12.000 rpm" o "12000 rpm" → número. */
export function numeroDe(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = /-?\d[\d.,]*/.exec(v)?.[0];
  if (!m) return undefined;
  const miles = /^\d{1,3}([.,]\d{3})+$/.test(m);
  const n = Number(miles ? m.replace(/[.,]/g, "") : m.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

const fmt = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });
const titulo = (f: FichaTecnica) => (f.titulo || f.referencia).replace(/\s*\([^)]*\)/g, "").trim();
const dato = (f: FichaTecnica, re: RegExp) => f.datos.find(([k]) => re.test(k))?.[1];

function proteccionDe(f: FichaTecnica): Proteccion | undefined {
  // Lo que va detrás de la cifra de la designación, junta o separada de ella:
  // la base técnica escribe "6011EEC3" y la página "6011 EE C3".
  const t = titulo(f).toUpperCase().replace(/[\s\-/.]/g, "");
  const sufijo = /\d{2,}(?=2RS|2RZ|2Z)|\d+/.exec(t);
  const s = sufijo ? t.slice(sufijo.index + sufijo[0].length) : "";
  if (/LLB|2RZ|VV|^LB|^RZ/.test(s)) return "sin_contacto";
  if (/LLH|^LH/.test(s)) return "contacto_ligero";
  if (/2RS|DDU|LLU|EE|^LU|^RS/.test(s)) return "contacto";
  if (/ZZ|2Z|^Z/.test(s)) return "deflector";
  const junta = dato(f, /^Junta$/i)?.trim();
  if (junta === undefined) return undefined;
  if (/^no\b/i.test(junta)) return "abierto";
  if (/deflect|^Z/i.test(junta)) return "deflector";
  return /EE|LLU|2RS|estanq/i.test(junta) ? "contacto" : undefined;
}

function juegoDe(f: FichaTecnica): number | undefined {
  const t = titulo(f).toUpperCase();
  const m = /(?:^|[^A-Z0-9]|ZZ|EE|LLU|2RS|LLB)C([1-5])(?![A-Z0-9])/.exec(t);
  if (m) return ORDEN_JUEGO[m[1]];
  const tol = dato(f, /^Tolerancia$/i)?.toUpperCase() ?? "";
  const c = /\bC([1-5])\b/.exec(tol);
  if (c) return ORDEN_JUEGO[c[1]];
  return /\bCN\b|NORMAL/.test(tol) ? 0 : undefined;
}

export function rasgosDe(f: FichaTecnica): Rasgos {
  return {
    d: numeroDe(dato(f, /^Diámetro interior/i)),
    D: numeroDe(dato(f, /^Diámetro exterior/i)),
    B: numeroDe(dato(f, /^Ancho B/i)),
    proteccion: proteccionDe(f),
    juego: juegoDe(f),
    carga: numeroDe(dato(f, /carga din[aá]mica/i)),
    velocidad: numeroDe(dato(f, /^Velocidad l[ií]mite/i)),
  };
}

/**
 * Ficha mínima de una referencia que no tiene datos ("6205 ZZ C2", que no
 * existe): lo único que se sabe de ella es lo que dice su nombre.
 */
export function fichaDeReferencia(nombre: string): FichaTecnica {
  const f: FichaTecnica = { titulo: nombre, referencia: nombre, resumen: [], datos: [] };
  if (!proteccionDe(f)) f.datos.push(["Junta", "No"]);
  if (juegoDe(f) === undefined) f.datos.push(["Tolerancia", "CN"]);
  return f;
}

/** Explica en la ficha del PDF qué significa la designación, si no viene ya explicada. */
export function conResumen(f: FichaTecnica): FichaTecnica {
  if (f.resumen.length) return f;
  const r = rasgosDe(f);
  const resumen: string[] = [];
  if (r.proteccion) resumen.push(`Protección → ${NOMBRE_PROTECCION[r.proteccion]}`);
  if (r.juego !== undefined) resumen.push(`Juego radial → ${NOMBRE_JUEGO[String(r.juego)].replace(/^juego /, "")}`);
  return resumen.length ? { ...f, resumen } : f;
}

/** Por debajo de esto, una diferencia de prestaciones no decide nada. */
const UMBRAL = 0.03;
const relevante = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) >= UMBRAL;

function prosContrasProteccion(a: Proteccion, b: Proteccion, d: DiferenciaPieza): void {
  if (a === b) return;
  d.cambios.push(`${NOMBRE_PROTECCION[b]} en lugar de ${NOMBRE_PROTECCION[a].replace(", sin protección", "")}`);
  const nivel: Record<Proteccion, number> = { abierto: 0, deflector: 1, sin_contacto: 2, contacto_ligero: 3, contacto: 4 };
  const mejora = nivel[b] > nivel[a];
  if (mejora) {
    if (b === "deflector") d.ventajas.push("frena partículas gruesas y protege la grasa");
    if (b === "sin_contacto") d.ventajas.push("sella mejor que un deflector, retiene la grasa y apenas roza");
    if (b === "contacto_ligero") d.ventajas.push("casi tan estanco como una junta de contacto, con mucho menos roce");
    if (b === "contacto") d.ventajas.push("estanco al agua, la humedad y el polvo fino, y retiene la grasa");
    if (b === "deflector") d.inconvenientes.push("no es estanco: no para el agua, la humedad ni el polvo fino");
    if (b === "contacto") d.inconvenientes.push("el roce de la junta genera calor y limita la velocidad");
    return;
  }
  if (b === "abierto") {
    d.ventajas.push("sin tapas que rocen, se puede lubricar desde la máquina");
    d.inconvenientes.push("sin protección: depende del sellado y la lubricación del montaje");
    return;
  }
  d.ventajas.push("menos roce: calienta menos y admite más velocidad");
  d.inconvenientes.push(
    b === "deflector"
      ? "no es estanco: no vale si hay agua, humedad o polvo fino"
      : "sella algo menos que la junta de contacto, sobre todo con agua o lavados"
  );
}

function prosContrasJuego(a: number, b: number, d: DiferenciaPieza): void {
  if (a === b) return;
  d.cambios.push(`${NOMBRE_JUEGO[String(b)]} en lugar de ${NOMBRE_JUEGO[String(a)]}`);
  if (b > a) {
    d.ventajas.push("más holgura interna: mejor con calor o con ajustes apretados");
    d.inconvenientes.push("más juego del necesario si la máquina trabaja fría y con ajuste normal");
  } else {
    d.ventajas.push("menos holgura interna: giro más preciso");
    d.inconvenientes.push("menos margen si la máquina se calienta o el ajuste es apretado");
  }
}

// Campos que ya cuentan arriba o que no ayudan a decidir: no se repiten como
// "cambio" genérico (siguen estando en el PDF).
const NO_GENERICO =
  /^(Diámetro interior|Diámetro exterior|Ancho B|Junta|Tolerancia|Capacidad de carga|Velocidad|Peso|Serie|Clase de producto|Criterio|Sistema|EAN|Descripción)/i;

/** Qué cambia la pieza `alt` frente a `base`, con sus pros y contras. */
export function diferenciaFrente(base: FichaTecnica, alt: FichaTecnica): DiferenciaPieza {
  const a = rasgosDe(base);
  const b = rasgosDe(alt);
  const d: DiferenciaPieza = { titulo: titulo(alt), frenteA: titulo(base), cambios: [], ventajas: [], inconvenientes: [] };

  if (a.d !== undefined && b.d !== undefined && a.d !== b.d) {
    d.inconvenientes.push(`agujero de ${fmt(b.d)} mm frente a ${fmt(a.d)} mm: no monta en el mismo eje`);
  }
  if (a.D !== undefined && b.D !== undefined && a.D !== b.D) {
    d.inconvenientes.push(`diámetro exterior de ${fmt(b.D)} mm frente a ${fmt(a.D)} mm: no entra en el mismo alojamiento`);
  }
  if (a.B !== undefined && b.B !== undefined && a.B !== b.B) {
    d.inconvenientes.push(`ancho de ${fmt(b.B)} mm frente a ${fmt(a.B)} mm: comprueba que cabe en el montaje`);
  }
  if (a.proteccion && b.proteccion) prosContrasProteccion(a.proteccion, b.proteccion, d);
  if (a.juego !== undefined && b.juego !== undefined) prosContrasJuego(a.juego, b.juego, d);

  if (a.carga !== undefined && b.carga !== undefined && relevante(a.carga, b.carga)) {
    (b.carga > a.carga ? d.ventajas : d.inconvenientes).push(
      `${b.carga > a.carga ? "más" : "menos"} carga dinámica: ${fmt(b.carga)} kN frente a ${fmt(a.carga)} kN`
    );
  }
  if (a.velocidad !== undefined && b.velocidad !== undefined && relevante(a.velocidad, b.velocidad)) {
    (b.velocidad > a.velocidad ? d.ventajas : d.inconvenientes).push(
      `${b.velocidad > a.velocidad ? "más" : "menos"} velocidad límite: ${fmt(b.velocidad)} rpm frente a ${fmt(a.velocidad)} rpm`
    );
  }

  // Cualquier otro dato distinto (correas, soportes, retenes…): sin juzgarlo.
  const clave = (v: string) => v.toUpperCase().replace(/\s+/g, "").replace(/,/g, ".");
  const otros = alt.datos
    .filter(([k, v]) => !NO_GENERICO.test(k) && v)
    .map(([k, v]) => ({ k, v, previo: base.datos.find(([kb]) => kb === k)?.[1] }))
    .filter((x) => x.previo && clave(x.previo) !== clave(x.v));
  for (const x of otros.slice(0, 3)) d.cambios.push(`${x.k.toLowerCase()}: ${x.v} en lugar de ${x.previo}`);
  return d;
}

/** Lo que todas comparten y sirve para decidir (lo demás está en el PDF). */
function enQueCoinciden(fichas: FichaTecnica[]): string[] {
  const r = fichas.map(rasgosDe);
  const igual = <T,>(f: (x: Rasgos) => T | undefined) => {
    const v = f(r[0]);
    return v !== undefined && r.every((x) => f(x) === v);
  };
  const out: string[] = [];
  if (igual((x) => x.d) && igual((x) => x.D) && igual((x) => x.B)) {
    out.push(`medidas dØ${fmt(r[0].d as number)} × DØ${fmt(r[0].D as number)} × B${fmt(r[0].B as number)} mm`);
  } else if (igual((x) => x.d)) {
    out.push(`agujero de ${fmt(r[0].d as number)} mm`);
  }
  if (igual((x) => x.juego)) out.push(NOMBRE_JUEGO[String(r[0].juego)]);
  if (igual((x) => x.proteccion)) out.push(NOMBRE_PROTECCION[r[0].proteccion as Proteccion]);
  return out;
}

/** ¿Merece comparativa? Dos o más piezas del mismo eje y con algo que las distinga. */
export function sonParecidas(fichas: FichaTecnica[]): boolean {
  if (fichas.length < 2) return false;
  const r = fichas.map(rasgosDe);
  if (r[0].d === undefined || !r.every((x) => x.d === r[0].d)) return false;
  return fichas.slice(1).some((f) => {
    const d = diferenciaFrente(fichas[0], f);
    return d.cambios.length + d.ventajas.length + d.inconvenientes.length > 0;
  });
}

export function diferenciasDe(fichas: FichaTecnica[]): DiferenciaPieza[] {
  return fichas.slice(1, 4).map((f) => diferenciaFrente(fichas[0], f));
}

/** Bloque corto para el chat; el detalle va en el PDF comparativo. */
export function textoComparativa(fichas: FichaTecnica[], diferencias: DiferenciaPieza[], hayPdf: boolean): string {
  const lineas: string[] = [];
  const iguales = fichas.length >= 2 ? enQueCoinciden(fichas) : [];
  if (iguales.length) lineas.push(`**${fichas.length > 2 ? "Todas coinciden" : "Coinciden"} en:** ${iguales.join(", ")}.`, "");
  for (const d of diferencias) {
    lineas.push(`**${d.titulo}** frente a **${d.frenteA}**:`);
    if (d.cambios.length) lineas.push(`- **Cambia:** ${d.cambios.join("; ")}.`);
    if (d.ventajas.length) lineas.push(`- **A favor:** ${d.ventajas.join("; ")}.`);
    if (d.inconvenientes.length) lineas.push(`- **En contra:** ${d.inconvenientes.join("; ")}.`);
    if (!d.cambios.length && !d.ventajas.length && !d.inconvenientes.length) lineas.push("- Es la misma pieza con otra nomenclatura: en su ficha no hay diferencias técnicas.");
    lineas.push("");
  }
  if (hayPdf) lineas.push("Tienes la comparativa completa y la ficha de cada una en los PDF de aquí abajo.");
  return lineas.join("\n").trim();
}

/** Mete el bloque tras el primer párrafo del modelo, con la nota de confirmar al final. */
export function componerRespuesta(texto: string, bloque: string, nota?: string | null): string {
  const limpio = nota ? texto.replace(nota, "") : texto;
  const parrafos = limpio.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  // Solo la entrada del modelo: visto el 03-11-2026, detrás del resumen seguía
  // escribiendo otra explicación y frases sueltas de la ficha que se le quitó.
  return [parrafos[0] ?? "Aquí tienes la comparación:", bloque, nota].filter(Boolean).join("\n\n");
}

/** Instrucción común: lo que escribe el modelo cuando la comparación la pone el código. */
export const MODO_BREVE =
  `FORMATO DE ESTA RESPUESTA (manda sobre cualquier otra regla de formato): escribe SOLO una o dos frases, en un único párrafo. ` +
  `NADA de fichas técnicas, ni "Ref:", ni "Información técnica completa", ni líneas de precio o stock, ni listas de diferencias o coincidencias, ` +
  `ni ventajas o inconvenientes, ni cifras técnicas: justo debajo de tu texto el sistema añade la comparación calculada y los PDF, y las tarjetas ya llevan precio y stock. ` +
  `No llames a compare_products. No digas que son "iguales" ni "equivalentes".`;
