// Tablas dimensionales ISO para rodamientos estándar (mismas que las
// TABLAS DIMENSIONALES del prompt de lib/agent.ts). Centralizadas aquí para
// que search_by_bore (lib/prestashop.ts) pueda generar candidatos reales de
// catálogo en código, sin depender de que el modelo encadene bien varias
// llamadas a search_products por su cuenta — es justo el paso que fallaba en
// conversaciones reales (preguntas de "mismo diámetro" o "siguiente medida").

/** Diámetros interiores (d, mm) estándar en progresión ISO. */
export const BORE_PROGRESSION_MM = [
  10, 12, 15, 17, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
];

const BORE_CODE_LOOKUP: Record<number, string> = {
  10: "00",
  12: "01",
  15: "02",
  17: "03",
};

/** Convierte un diámetro interior (mm) a su bore code de 2 dígitos, o null si no es una medida estándar. */
export function boreCodeFor(boreMm: number): string | null {
  if (BORE_CODE_LOOKUP[boreMm]) return BORE_CODE_LOOKUP[boreMm];
  if (boreMm >= 20 && boreMm <= 100 && boreMm % 5 === 0) {
    return String(boreMm / 5).padStart(2, "0");
  }
  return null;
}

/** Prefijos de referencia candidatos (una serie de catálogo real por entrada) para un bore code dado. */
export function seriesPrefixesForBoreCode(code: string): Array<{ series: string; prefix: string }> {
  return [
    { series: "60xx", prefix: `60${code}` },
    { series: "62xx", prefix: `62${code}` },
    { series: "63xx", prefix: `63${code}` },
    { series: "72xx", prefix: `72${code}` },
    { series: "320xx", prefix: `320${code}` },
    { series: "UC", prefix: `UC2${code}` },
  ];
}

/**
 * Siguiente medida estándar por encima o por debajo de boreMm en la
 * progresión ISO. Si boreMm no es un valor exacto de la tabla, se ubica
 * entre los dos valores vecinos más próximos.
 */
export function nextStandardBore(
  boreMm: number,
  direction: "up" | "down"
): number | null {
  const sorted = BORE_PROGRESSION_MM;
  if (direction === "up") {
    const next = sorted.find((v) => v > boreMm);
    return next ?? null;
  }
  const below = [...sorted].reverse().find((v) => v < boreMm);
  return below ?? null;
}
