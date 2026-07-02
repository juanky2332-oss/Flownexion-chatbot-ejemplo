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
            `${OFFICIAL_DOMAINS.join(", ")}. Si no está ahí, busca en otras fuentes técnicas ` +
            `del sector de rodamientos/transmisión industrial reconocidas (catálogos de ` +
            `fabricantes, normativa ISO/DIN). Devuelve SOLO datos que aparezcan literalmente ` +
            `en las páginas encontradas, de forma breve y concreta. Si no encuentras nada ` +
            `fiable, responde exactamente: "No he encontrado ese dato en fuentes fiables." ` +
            `No inventes ni completes con suposiciones.`,
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
