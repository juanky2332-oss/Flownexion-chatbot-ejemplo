// Búsquedas que el modelo no hace bien por sí solo y que se resuelven en
// código antes de que redacte (mismo patrón que equivalencias, glosario y
// correas). Visto en la auditoría del 26-10-2026 contra la tienda real:
// - "soportes de acero inoxidable con eje de 30" → "no tenemos", con el
//   SOPORTE TERMOPLASTICO TL UCF 206 + ROD INOX en stock (el nombre lleva la
//   serie 206, no los 30 mm);
// - "transmisión cardan Bondioli de serie 4" → "no encuentro", con la
//   TRANSMISION BONDIOLI G4 ... en stock (la serie va como "G4");
// - "¿puedo usar un 6205 2RS a 12000 rpm?" → contestaba bien que no, pero
//   decía "busca uno ZZ" en vez de enseñarlo;
// - "¿lleva IVA?" → no lo contestaba.
// Aquí solo hay lógica pura (sin red) para poder probarla en npm run test:kb.

export interface BusquedaFamilia {
  /** Consultas a search_products, en orden. */
  consultas: string[];
  /** Si está, solo valen los productos cuyo nombre case. */
  filtro?: RegExp;
  /** Delante los que casen con esto. */
  preferir?: RegExp;
  /** Qué se ha entendido, para el bloque que se le pasa al modelo. */
  descripcion: string;
}

const sinTildes = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Diámetro de eje en mm dicho por el cliente ("eje de 30", "eje 30 mm", "para un eje de 25mm"). */
function ejeMm(plano: string): number | null {
  const m =
    plano.match(/\beje\s+(?:de\s+)?(\d{2,3})\s*(?:mm|milimetros)?\b/i) ??
    plano.match(/\b(\d{2,3})\s*(?:mm|milimetros)\s+de\s+eje\b/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 12 && n <= 140 ? n : null;
}

export function busquedaDeFamilia(message: string): BusquedaFamilia | null {
  const plano = sinTildes(message).toLowerCase();

  // SOPORTES por diámetro de eje → serie UC2xx (eje ÷ 5).
  if (/\bsoportes?\b|\bchumacer/.test(plano)) {
    const eje = ejeMm(plano);
    if (eje && eje % 5 === 0 && eje >= 20 && eje <= 90) {
      const serie = `2${String(eje / 5).padStart(2, "0")}`;
      const formas = (["ucp", "ucf", "ucfl", "uct", "ucfc"] as const).filter((f) => new RegExp(`\\b${f}\\b`).test(plano));
      const pared = /\bpared|vertical|brida\b/.test(plano);
      const lista = formas.length ? formas : pared ? ["ucf", "ucfl"] : ["ucp", "ucf", "ucfl"];
      const inox = /\binox|inoxidable|alimentari|humed|agua\b/.test(plano);
      return {
        consultas: lista.map((f) => `${f.toUpperCase()} ${serie}`),
        filtro: inox ? /INOX|TERMOPL/i : undefined,
        preferir: /INOX/i,
        descripcion: `soporte para eje de ${eje} mm = serie ${serie}${inox ? ", inoxidable o termoplástico con rodamiento inox (apto para alimentaria o humedad)" : ""}`,
      };
    }
  }

  // BONDIOLI / cardanes: la serie va como "G4" en el nombre de la tienda.
  if (/\bbondioli|\bcardan|\bcruceta|toma de fuerza/.test(plano)) {
    const serie = plano.match(/\bserie\s*g?(\d{1,2})\b/)?.[1] ?? plano.match(/\bg(\d{1,2})\b/)?.[1];
    const pide = /\btransmisi|\bcardan/.test(plano) ? /^TRANSMISION/i : /\bcruceta/.test(plano) ? /^CRUCETA/i : undefined;
    return {
      consultas: serie ? [`BONDIOLI G${serie}`] : ["BONDIOLI"],
      preferir: pide,
      descripcion: serie ? `Bondioli serie ${serie} (en la página: "G${serie}")` : "productos Bondioli de la página",
    };
  }
  return null;
}

/** rpm que pide el cliente ("a 12000 rpm", "12.000 r.p.m.", "12000 revoluciones"). */
export function rpmDelMensaje(message: string): number | null {
  const m = sinTildes(message).match(/\b(\d{1,3}(?:[.\s]\d{3})+|\d{3,6})\s*(?:rpm|r\.?p\.?m\.?|revoluciones|vueltas)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[.\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Variantes del mismo tamaño que pueden girar más rápido, de más a menos parecida. */
export function variantesMasRapidas(base: string): string[] {
  return [`${base}ZZC3`, `${base}ZZ`, `${base}LLB`, `${base}2RZ`, `${base}C3`, base];
}

/** ¿Pregunta por el IVA? */
export function preguntaIva(message: string): boolean {
  return /\biva\b|impuestos?\b|con\s+iva|sin\s+iva/i.test(sinTildes(message));
}

/** Añade la respuesta del IVA al principio si el texto no la da pronto. */
export function asegurarRespuestaIva(texto: string, message: string): string {
  if (!preguntaIva(message)) return texto;
  if (/\bIVA\b/.test(String(texto ?? "").slice(0, 220))) return texto;
  return `Los precios de la página son **sin IVA** (en España se añade el 21 %).\n\n${texto}`;
}
