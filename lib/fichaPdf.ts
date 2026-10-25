// Genera en el navegador el PDF de la ficha técnica, con la maqueta que mandó
// el cliente ("Ejemplo PDF.pdf"): logo de ESGAS, FICHA DEL PRODUCTO / REF,
// RESUMEN (decodificación de la referencia + medidas), INFORMACIÓN TÉCNICA
// COMPLETA y la cláusula de responsabilidad al pie.
//
// jsPDF se importa de forma dinámica al pulsar el botón: el widget no carga
// ni un byte de esto hasta que alguien pide el PDF.

import type { FichaTecnica } from "./ficha";
import { nombreFicheroFicha } from "./ficha";

const LOGO_URL = "/esgas-logo-ficha.png";

// Texto literal del ejemplo del cliente.
const AVISO_LEGAL =
  "* Esta ficha técnica ha sido generada de forma informativa, no constituye un documento oficial y puede contener imprecisiones. " +
  "Esgas no se hace responsable de las decisiones tomadas sobre la base de esta información, ni de los fallos que puedan derivar " +
  "de una aplicación, selección o uso inadecuado del producto.";


// Medidas de página (A4 en puntos) y márgenes calcados del ejemplo.
const ANCHO = 595.3;
const ALTO = 841.9;
const MARGEN_X = 48.75;
const LOGO = { x: 48.75, y: 48.25, w: 140, h: 80.1 }; // logo oficial a color de esgas.es (900×515)
const CUERPO_Y = 165;
const LIMITE_Y = ALTO - 95; // por encima del aviso legal
const INTERLINEA = 14.5;
const TAM = 11;

/**
 * Las fuentes estándar de PDF (Helvetica) solo cubren Latin-1. Todo lo demás
 * saldría como basura en el documento, así que se traduce a un equivalente
 * legible. La flecha "→" NO se toca aquí: se dibuja aparte (ver linea()).
 */
export function latin1(s: string): string {
  const traducido = s
    .replace(/[“”«»„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    // Guiones y, sobre todo, el signo MENOS tipográfico (U+2212): borrarlo
    // convertiría "−30 a +110 °C" en "30 a +110 °C", un dato falso.
    .replace(/[‐-―−]/g, "-")
    // Fracciones de un solo carácter: con espacio si van pegadas a un entero
    // ("1⅜" es 1 3/8 pulgadas; sin el espacio quedaría "13/8", otro dato).
    .replace(/(\d?)([⅛⅜⅝⅞⅓⅔])/g, (_, ent: string, fr: string) => {
      const f = ({ "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅓": "1/3", "⅔": "2/3" } as Record<string, string>)[fr];
      return ent ? `${ent} ${f}` : f;
    })
    .replace(/(\d)([½¼¾])/g, "$1 $2")
    .replace(/[⌀∅]/g, "Ø")
    .replace(/≈/g, "aprox. ")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≠/g, "!=")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ");
  const descartados = traducido.match(/[^\u0000-ÿ→]/gu);
  if (descartados?.length) {
    // Emojis de stock y similares: no son dato técnico, pero se deja rastro
    // por si algún día se cuela un carácter que sí lo sea.
    console.warn("[ficha pdf] caracteres sin equivalente omitidos:", [...new Set(descartados)].join(" "));
  }
  return traducido
    .replace(/[^\u0000-ÿ→]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

let _logo: Promise<string | null> | null = null;

function cargarLogo(): Promise<string | null> {
  if (_logo) return _logo;
  _logo = (async () => {
    try {
      const res = await fetch(LOGO_URL);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();
  _logo.then((l) => {
    if (!l) _logo = null; // reintentar en el siguiente clic
  });
  return _logo;
}

/**
 * Se llama al aparecer el botón: así, al pulsarlo, jsPDF y el logo ya están
 * cargados y la descarga sale en el acto (algunos navegadores solo permiten
 * descargar durante unos segundos después del clic).
 */
export function precargarFichaPdf(): void {
  void import("jspdf").catch(() => undefined);
  void cargarLogo();
}

export async function descargarFichaPdf(fichas: FichaTecnica[]): Promise<void> {
  if (!fichas.length) return;
  const doc = await construirFichaPdf(fichas, await cargarLogo());
  const nombre = nombreFicheroFicha(fichas);
  try {
    doc.save(nombre);
  } catch {
    // Si el navegador bloquea la descarga (p.ej. dentro del iframe en algún
    // móvil), se abre el PDF en una pestaña para que lo guarde desde ahí.
    window.open(doc.output("bloburl").toString(), "_blank", "noopener");
  }
}

/**
 * Monta el documento sin descargarlo (separado para poder generarlo en las
 * pruebas, fuera del navegador). logo = data URL del PNG o null.
 */
export async function construirFichaPdf(fichas: FichaTecnica[], logo: string | null) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const anchoUtil = ANCHO - MARGEN_X * 2;

  let y = CUERPO_Y;

  const pie = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(0);
    const lineas = doc.splitTextToSize(latin1(AVISO_LEGAL), anchoUtil);
    doc.text(lineas, MARGEN_X, ALTO - 70);
  };

  const nuevaPagina = (primera: boolean) => {
    if (!primera) doc.addPage();
    if (logo) doc.addImage(logo, "PNG", LOGO.x, LOGO.y, LOGO.w, LOGO.h);
    pie();
    doc.setFontSize(TAM);
    y = CUERPO_Y;
  };

  const sitio = (alto: number) => {
    if (y + alto > LIMITE_Y) nuevaPagina(false);
  };

  /** Flecha dibujada (Helvetica no tiene el carácter "→"). */
  const flecha = (x: number, base: number): number => {
    const largo = 10;
    const yc = base - TAM * 0.32;
    doc.setLineWidth(0.7);
    doc.line(x, yc, x + largo, yc);
    doc.line(x + largo, yc, x + largo - 3, yc - 2.2);
    doc.line(x + largo, yc, x + largo - 3, yc + 2.2);
    return x + largo + 4;
  };

  /**
   * Una línea de texto con ajuste de ancho. Si lleva "→", la parte izquierda
   * va tal cual, la flecha se dibuja y la derecha se ajusta al hueco que
   * queda, con las líneas de continuación alineadas bajo ella.
   */
  const linea = (texto: string, opts: { negrita?: string } = {}) => {
    doc.setFontSize(TAM);
    let x = MARGEN_X;

    if (opts.negrita) {
      doc.setFont("helvetica", "bold");
      const t = latin1(opts.negrita) + " ";
      sitio(INTERLINEA);
      doc.text(t, x, y);
      x += doc.getTextWidth(t);
    }
    doc.setFont("helvetica", "normal");

    const limpio = latin1(texto);
    const corte = limpio.indexOf("→");
    if (corte < 0) {
      const partes: string[] = doc.splitTextToSize(limpio, ANCHO - MARGEN_X - x);
      sitio(INTERLINEA * partes.length);
      partes.forEach((p, i) => doc.text(p, x, y + i * INTERLINEA));
      y += INTERLINEA * partes.length;
      return;
    }

    const izq = limpio.slice(0, corte).trim();
    const der = limpio.slice(corte + 1).replace(/→/g, "-").trim();
    if (doc.getTextWidth(izq) > (ANCHO - MARGEN_X - x) * 0.45) {
      // Parte izquierda demasiado larga para dejar la derecha al lado: se
      // escribe todo seguido con "->" y ajuste normal, sin salirse del margen.
      const partes: string[] = doc.splitTextToSize(`${izq} -> ${der}`, ANCHO - MARGEN_X - x);
      sitio(INTERLINEA * partes.length);
      partes.forEach((p, i) => doc.text(p, x, y + i * INTERLINEA));
      y += INTERLINEA * partes.length;
      return;
    }
    sitio(INTERLINEA);
    doc.text(izq, x, y);
    x = flecha(x + doc.getTextWidth(izq + " "), y);
    const partes: string[] = doc.splitTextToSize(der, ANCHO - MARGEN_X - x);
    sitio(INTERLINEA * partes.length);
    partes.forEach((p, i) => doc.text(p, x, y + i * INTERLINEA));
    y += INTERLINEA * partes.length;
  };

  const hueco = (n = 1) => {
    y += INTERLINEA * 0.9 * n;
  };

  const titulo = (t: string) => {
    sitio(INTERLINEA * 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(TAM);
    doc.text(latin1(t), MARGEN_X, y);
    y += INTERLINEA;
    hueco(0.6);
  };

  // Sin líneas de guiones entre secciones (petición del cliente, 14-10-2026):
  // las separa solo el espacio en blanco.
  const separador = () => {
    hueco(0.6);
  };

  fichas.forEach((f, idx) => {
    nuevaPagina(idx === 0);

    linea(f.titulo, { negrita: "FICHA DEL PRODUCTO:" });
    if (f.referencia) linea(f.referencia, { negrita: "REF:" });
    hueco();
    separador();

    if (f.resumen.length || f.medidas) {
      titulo("RESUMEN:");
      f.resumen.forEach((r) => linea(r));
      if (f.medidas) linea(`Medidas: ${f.medidas}`);
      hueco();
      separador();
    }

    titulo("INFORMACIÓN TÉCNICA COMPLETA:");
    f.datos.forEach(([k, v]) => linea(v ? `${k}: ${v}` : k));
    hueco();
    separador();
  });

  return doc;
}

// ── Comparativa de varios productos en un solo PDF ───────────────────────────
// Petición del cliente (14-10-2026): cuando el chat compara varios productos,
// además del PDF de cada ficha, una comparativa con el logo, el aviso legal al
// pie y una tabla limpia: una columna por producto y resaltadas las filas en
// las que difieren.

/** Valor comparable de una celda (sin espacios ni formato de decimales). */
const clave = (v: string) => v.toUpperCase().replace(/\s+/g, "").replace(/,/g, ".");

export interface FilaComparativa {
  etiqueta: string;
  valores: string[];
  difiere: boolean;
}

/** Filas de la comparativa: medidas + unión de todos los datos, en orden de aparición. */
export function filasComparativa(fichas: FichaTecnica[]): FilaComparativa[] {
  const etiquetas: string[] = [];
  const porFicha = fichas.map((f) => {
    const m = new Map<string, string>();
    if (f.medidas) m.set("Medidas", f.medidas);
    for (const [k, v] of f.datos) if (v) m.set(k, v);
    return m;
  });
  if (fichas.some((f) => f.medidas)) etiquetas.push("Medidas");
  for (const f of fichas) for (const [k, v] of f.datos) if (v && !etiquetas.includes(k)) etiquetas.push(k);
  return etiquetas.map((etiqueta) => {
    const valores = porFicha.map((m) => m.get(etiqueta) ?? "—");
    const distintos = new Set(valores.map(clave));
    return { etiqueta, valores, difiere: distintos.size > 1 };
  });
}

export function nombreFicheroComparativa(fichas: FichaTecnica[]): string {
  const refs = fichas
    .map((f) => (f.referencia || f.titulo).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, ""))
    .filter(Boolean)
    .slice(0, 4)
    .join("-vs-");
  return `Comparativa-${refs || "ESGAS"}.pdf`.slice(0, 120);
}

export async function descargarComparativaPdf(fichas: FichaTecnica[]): Promise<void> {
  if (fichas.length < 2) return;
  const doc = await construirComparativaPdf(fichas, await cargarLogo());
  const nombre = nombreFicheroComparativa(fichas);
  try {
    doc.save(nombre);
  } catch {
    window.open(doc.output("bloburl").toString(), "_blank", "noopener");
  }
}

export async function construirComparativaPdf(fichas: FichaTecnica[], logo: string | null) {
  const { jsPDF } = await import("jspdf");
  // Con más de 3 productos la tabla va en horizontal para que quepa holgada.
  const apaisado = fichas.length > 3;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: apaisado ? "landscape" : "portrait" });
  const W = apaisado ? ALTO : ANCHO;
  const H = apaisado ? ANCHO : ALTO;
  const anchoUtil = W - MARGEN_X * 2;
  const limite = H - 95;
  const filas = filasComparativa(fichas);

  const TAM_T = fichas.length > 3 ? 8 : 9;
  const LIN = TAM_T + 3;
  const PAD = 4;
  const colEtiqueta = Math.min(150, anchoUtil * 0.28);
  const colProducto = (anchoUtil - colEtiqueta) / fichas.length;

  // Colores sobrios: gris para la cabecera, azul muy claro para las diferencias.
  const GRIS: [number, number, number] = [235, 237, 240];
  const DIF: [number, number, number] = [222, 235, 252];
  const BORDE: [number, number, number] = [190, 195, 202];

  let y = 0;
  const pie = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(0);
    doc.text(doc.splitTextToSize(latin1(AVISO_LEGAL), anchoUtil), MARGEN_X, H - 70);
  };
  const cabeceraPagina = (primera: boolean) => {
    if (!primera) doc.addPage();
    if (logo) doc.addImage(logo, "PNG", LOGO.x, LOGO.y, LOGO.w, LOGO.h);
    pie();
    y = CUERPO_Y - 10;
    if (primera) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("COMPARATIVA TÉCNICA", MARGEN_X, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const lista = doc.splitTextToSize(latin1(fichas.map((f) => f.titulo).join("  ·  ")), anchoUtil);
      doc.text(lista, MARGEN_X, y);
      y += lista.length * 11 + 4;
      doc.setFontSize(8);
      doc.setTextColor(90);
      const nDif = filas.filter((f) => f.difiere).length;
      doc.text(
        latin1(`${nDif} características diferentes (resaltadas en azul) y ${filas.length - nDif} iguales. "—" = no consta en esa ficha.`),
        MARGEN_X,
        y
      );
      doc.setTextColor(0);
      y += 14;
    }
    filaCabecera();
  };

  const celda = (texto: string, x: number, ancho: number, alto: number, relleno: [number, number, number] | null, negrita: boolean) => {
    if (relleno) {
      doc.setFillColor(...relleno);
      doc.rect(x, y, ancho, alto, "F");
    }
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.5);
    doc.rect(x, y, ancho, alto, "S");
    doc.setFont("helvetica", negrita ? "bold" : "normal");
    doc.setFontSize(TAM_T);
    const lineas: string[] = doc.splitTextToSize(latin1(texto), ancho - PAD * 2);
    lineas.forEach((l, i) => doc.text(l, x + PAD, y + PAD + TAM_T + i * LIN - 1));
  };

  const altoFila = (textos: string[], anchos: number[]) => {
    doc.setFontSize(TAM_T);
    const n = Math.max(...textos.map((t, i) => (doc.splitTextToSize(latin1(t), anchos[i] - PAD * 2) as string[]).length));
    return n * LIN + PAD * 2;
  };

  const anchos = [colEtiqueta, ...fichas.map(() => colProducto)];

  const filaCabecera = () => {
    const textos = ["Característica", ...fichas.map((f) => f.titulo || f.referencia)];
    const alto = altoFila(textos, anchos);
    let x = MARGEN_X;
    textos.forEach((t, i) => {
      celda(t, x, anchos[i], alto, GRIS, true);
      x += anchos[i];
    });
    y += alto;
  };

  // Dos bloques, como pidió el cliente (25-10-2026): primero en qué se
  // DIFERENCIAN y después en qué COINCIDEN, cada uno con su rótulo.
  const seccion = (texto: string) => {
    const alto = LIN + PAD * 2;
    if (y + alto * 2 > limite) cabeceraPagina(false);
    celda(texto, MARGEN_X, anchoUtil, alto, GRIS, true);
    y += alto;
  };

  cabeceraPagina(true);
  const bloques: [string, FilaComparativa[]][] = [
    ["EN QUÉ SE DIFERENCIAN", filas.filter((f) => f.difiere)],
    ["EN QUÉ COINCIDEN", filas.filter((f) => !f.difiere)],
  ];
  for (const [titulo, grupo] of bloques) {
    if (!grupo.length) continue;
    seccion(`${titulo} (${grupo.length})`);
    for (const f of grupo) {
      const textos = [f.etiqueta, ...f.valores];
      const alto = altoFila(textos, anchos);
      if (y + alto > limite) cabeceraPagina(false);
      let x = MARGEN_X;
      textos.forEach((t, i) => {
        celda(t, x, anchos[i], alto, f.difiere ? DIF : null, i === 0);
        x += anchos[i];
      });
      y += alto;
    }
  }
  return doc;
}

// ── Presupuesto con varias líneas ────────────────────────────────────────────

export interface LineaPresupuesto {
  referencia: string;
  descripcion: string;
  uds: number;
  precio: number;
  stock?: number;
}

const AVISO_PRESUPUESTO =
  "* Presupuesto orientativo generado desde el asistente de la página con los precios y el stock del momento de la consulta. " +
  "No constituye una oferta en firme: el precio y la disponibilidad definitivos son los que figuren al tramitar el pedido.";

const eurPdf = (n: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";

export async function descargarPresupuestoPdf(lineas: LineaPresupuesto[], cliente?: string | null): Promise<void> {
  if (!lineas.length) return;
  const doc = await construirPresupuestoPdf(lineas, await cargarLogo(), cliente ?? null, new Date());
  const nombre = `Presupuesto ESGAS ${new Date().toISOString().slice(0, 10)}.pdf`;
  try {
    doc.save(nombre);
  } catch {
    window.open(doc.output("bloburl").toString(), "_blank", "noopener");
  }
}

export async function construirPresupuestoPdf(lineas: LineaPresupuesto[], logo: string | null, cliente: string | null, fecha: Date) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const anchoUtil = ANCHO - MARGEN_X * 2;
  const TAM_T = 9;
  const LIN = TAM_T + 3;
  const PAD = 4;
  const GRIS: [number, number, number] = [235, 237, 240];
  const BORDE: [number, number, number] = [190, 195, 202];
  // Referencia · Descripción · Uds · Precio ud. · Importe
  const anchos = [95, anchoUtil - 95 - 40 - 80 - 85, 40, 80, 85];
  const derecha = [false, false, true, true, true];
  let y = 0;

  const pie = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(0);
    doc.text(doc.splitTextToSize(latin1(AVISO_PRESUPUESTO), anchoUtil), MARGEN_X, ALTO - 70);
  };
  const celda = (texto: string, x: number, ancho: number, alto: number, relleno: boolean, negrita: boolean, alDerecha: boolean) => {
    if (relleno) {
      doc.setFillColor(...GRIS);
      doc.rect(x, y, ancho, alto, "F");
    }
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.5);
    doc.rect(x, y, ancho, alto, "S");
    doc.setFont("helvetica", negrita ? "bold" : "normal");
    doc.setFontSize(TAM_T);
    const ls: string[] = doc.splitTextToSize(latin1(texto), ancho - PAD * 2);
    ls.forEach((l, i) =>
      alDerecha
        ? doc.text(l, x + ancho - PAD, y + PAD + TAM_T + i * LIN - 1, { align: "right" })
        : doc.text(l, x + PAD, y + PAD + TAM_T + i * LIN - 1)
    );
  };
  const fila = (textos: string[], cabecera: boolean) => {
    doc.setFontSize(TAM_T);
    const n = Math.max(...textos.map((t, i) => (doc.splitTextToSize(latin1(t), anchos[i] - PAD * 2) as string[]).length));
    const alto = n * LIN + PAD * 2;
    if (y + alto > LIMITE_Y - 40) nuevaPagina(false);
    let x = MARGEN_X;
    textos.forEach((t, i) => {
      celda(t, x, anchos[i], alto, cabecera, cabecera, !cabecera && derecha[i]);
      x += anchos[i];
    });
    y += alto;
  };
  const CABECERA = ["Referencia", "Descripción", "Uds", "Precio ud.", "Importe"];
  function nuevaPagina(primera: boolean) {
    if (!primera) doc.addPage();
    if (logo) doc.addImage(logo, "PNG", LOGO.x, LOGO.y, LOGO.w, LOGO.h);
    pie();
    y = CUERPO_Y - 10;
    if (primera) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("PRESUPUESTO", MARGEN_X, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(latin1(fecha.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })), ANCHO - MARGEN_X, y, { align: "right" });
      y += 14;
      if (cliente) {
        doc.text(latin1(`Cliente: ${cliente}`), MARGEN_X, y);
        y += 14;
      }
      y += 4;
    }
    fila(CABECERA, true);
  }

  nuevaPagina(true);
  let total = 0;
  for (const l of lineas) {
    const importe = l.uds * l.precio;
    total += importe;
    fila([l.referencia, l.descripcion, String(l.uds), eurPdf(l.precio), eurPdf(importe)], false);
  }
  // Total
  const xTotal = MARGEN_X + anchos[0] + anchos[1] + anchos[2];
  const alto = LIN + PAD * 2;
  celda("Total", xTotal, anchos[3], alto, true, true, false);
  celda(eurPdf(total), xTotal + anchos[3], anchos[4], alto, true, true, true);
  y += alto + 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90);
  doc.text(
    latin1(
      cliente
        ? "Precios por unidad con las condiciones de su cuenta en la página en el momento de la consulta."
        : "Precios por unidad de la página en el momento de la consulta. Inicie sesión para ver los de su cuenta."
    ),
    MARGEN_X,
    y
  );
  doc.setTextColor(0);
  return doc;
}
