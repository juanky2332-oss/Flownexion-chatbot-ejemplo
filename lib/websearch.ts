import "server-only";
import OpenAI from "openai";

// Modelo de OpenAI con búsqueda web integrada (usa la misma OPENAI_API_KEY,
// sin necesidad de una API key de búsqueda de terceros).
const SEARCH_MODEL = "gpt-4o-search-preview";

const OFFICIAL_DOMAINS = [
  "ntn-snr.com",
  "eshop.ntn-snr.com",
  "translinkpt.com",
  "sedis.com",
  "bondioli-pavesi.com",
];

// Herramienta oficial de intercambiabilidad de NTN-SNR: permite introducir la
// referencia de un competidor (SKF, FAG, NSK, Timken, Koyo...) y devuelve la
// referencia NTN/SNR equivalente publicada por el propio fabricante. Es la
// fuente que hay que agotar ANTES de aproximar por medidas cuando el KB local
// (find_equivalence) no tiene la referencia — el cliente pidió expresamente
// que las equivalencias que faltan en el KB se busquen ahí, no que se
// inventen ni se saquen de agregadores de terceros sin verificar.
const NTN_SNR_INTERCHANGE_TOOLS = [
  "https://www.ntn-snr.com/equivalences",
  "https://eshop.ntn-snr.com/en/Equivalences-Suffix-Prefix-3964225.html",
];

interface UrlCitation {
  type: "url_citation";
  url_citation: { url: string; title?: string };
}

export async function searchOfficialSource(query: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const q = query.trim().slice(0, 200);
  if (!apiKey || !q) {
    return JSON.stringify({ text: "", sources: [] });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: SEARCH_MODEL,
      web_search_options: { search_context_size: "medium" },
      messages: [
        {
          role: "user",
          content:
            `Eres un buscador técnico de datos de rodamientos y transmisión industrial. ` +
            `Busca información técnica verificable (medidas, equivalencias entre marcas, ` +
            `aplicaciones, tolerancias, características) sobre: "${q}". ` +
            `Prioriza SIEMPRE estas fuentes oficiales de fabricante si tienen el dato: ` +
            `${OFFICIAL_DOMAINS.join(", ")}. ` +
            `Si la consulta es sobre una EQUIVALENCIA o referencia cruzada entre marcas ` +
            `(p.ej. "equivalencia oficial NTN SNR para SKF 3309A"), usa específicamente la ` +
            `herramienta oficial de intercambiabilidad de NTN-SNR: ${NTN_SNR_INTERCHANGE_TOOLS.join(" o ")}. ` +
            `Introduce mentalmente la referencia de la marca externa en esa herramienta y ` +
            `devuelve la referencia NTN o SNR equivalente que publique — para equivalencias, ` +
            `NO uses agregadores de terceros no oficiales (cross-reference genéricos, foros, ` +
            `tiendas de recambios) como fuente de la equivalencia en sí, aunque aparezcan en ` +
            `la búsqueda; solo sirven como pista para saber qué buscar, nunca como fuente ` +
            `citable de un dato de equivalencia. Para otros datos técnicos (medidas, ` +
            `capacidad de carga, tolerancia) sí puedes usar catálogos de fabricante ` +
            `reconocidos y normativa ISO/DIN si el dominio oficial no lo tiene. Devuelve SOLO ` +
            `datos que aparezcan literalmente en las páginas encontradas, de forma breve y ` +
            `concreta. Si no encuentras nada fiable, responde exactamente: "No he encontrado ` +
            `ese dato en fuentes fiables." No inventes ni completes con suposiciones.`,
        },
      ],
    });

    const message = completion.choices[0]?.message;
    const text = message?.content ?? "";
    const annotations = (message?.annotations ?? []) as UrlCitation[];
    const sources = annotations
      .filter((a) => a.type === "url_citation")
      .map((a) => a.url_citation?.url)
      .filter((u): u is string => Boolean(u));

    return JSON.stringify({ text, sources });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Error en la búsqueda web",
      text: "",
      sources: [],
    });
  }
}
