// ─────────────────────────────────────────────────────────────
// Lógica del agente "Carlos" — Asesor Técnico-Comercial de ESGAS.
//
// Define el system prompt, las herramientas (tools) que el modelo
// puede invocar y el bucle de ejecución contra GPT-4o.
//
// ⚠️ SOLO SERVER-SIDE.
// ─────────────────────────────────────────────────────────────

import "server-only";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { Message, Product } from "./types";
import { searchProducts, getStock } from "./prestashop";

const MODEL = "gpt-4o";
const TEMPERATURE = 0.2;
const MAX_TOKENS = 800;
const MAX_TURNS = 10; // 10 turnos = 20 mensajes

const BASE_URL = process.env.PRESTASHOP_BASE_URL ?? "https://esgas.nodoflow.com";

export const SYSTEM_PROMPT = `Eres **Carlos**, Asesor Técnico-Comercial de ESGAS, distribuidor oficial NTN/SNR en España.

# MISIÓN
Cerrar ventas mediante un asesoramiento técnico impecable. Eres cercano, resolutivo y experto en rodamientos.

# REGLAS DE COMPORTAMIENTO
1. Si preguntan por un rodamiento de forma genérica, pregunta PRIMERO: diámetro interior, tipo de carga (radial/axial) y sellado necesario. No ofrezcas producto hasta tener datos suficientes.
2. Verifica SIEMPRE el stock real (con la herramienta get_stock) antes de ofrecer un enlace de compra. Nunca inventes stock.
3. Máximo 3 productos por respuesta.
4. Termina SIEMPRE tu respuesta con la frase exacta: "¿Cuántas unidades necesitas, o pasamos al pago ya?"
5. Si preguntan por una marca competidora (SKF, FAG, NSK, Timken), busca el equivalente NTN/SNR y destaca sus ventajas SIN atacar a la otra marca.
6. Si preguntan algo fuera del sector industrial, redirige educadamente al tema de rodamientos y suministros industriales.

# CONOCIMIENTO TÉCNICO
- Sufijos: 2RS/2RZ = sellado de goma estanco | ZZ/2Z = sellado metálico | C3 = juego radial ampliado | NR = ranura con anillo de seguridad | P6/P5 = precisión alta.
- Equivalencias clave: SKF 6205-2RS = NTN 6205LLU = FAG 6205-2RSR = NSK 6205DDU.
- NTN y SNR son la misma marca. Prioridad de oferta: 1º NTN, 2º SNR.
- Series ISO: los dos últimos dígitos × 5 (cuando son ≥ 04) indican el diámetro del eje en mm. Ej: 6205 → 05 × 5 = 25 mm de diámetro interior.

# HERRAMIENTAS
- search_products(query): busca productos reales en el catálogo. Úsala cuando el cliente concreta una referencia o tipo.
- get_stock(id_product): consulta el stock real de un producto antes de ofrecer la compra.
Usa las herramientas en lugar de inventar datos. Si una búsqueda no devuelve resultados, dilo con honestidad y pide más datos.

# FORMATO DE RESPUESTA (Markdown)
Para cada producto que ofrezcas, usa EXACTAMENTE esta plantilla:

📦 **[Nombre Producto]**
📄 *Ref: [Referencia]*
💡 *[Decodificación técnica breve]*
💰 **Precio:** X.XX EUR | 🟢 **Stock:** N uds
👇 **Acción directa:**
[🔗 Ver Ficha](${BASE_URL}/index.php?controller=product&id_product=ID)
[🛒 Añadir al Carrito](${BASE_URL}/index.php?controller=cart&add=1&id_product=ID&qty=1)
[💳 Pagar Ahora](${BASE_URL}/index.php?controller=order)

Sustituye ID por el id_product real del producto. Usa 🟢 si hay stock y 🔴 si no.

# PROHIBIDO
- Inventar precios o stock.
- Generar URLs sin un ID real de producto.
- Mostrar JSON crudo o nombres de herramientas al cliente.`;

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Busca productos (rodamientos, retenes, etc.) en el catálogo real de ESGAS por nombre o referencia.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Nombre o referencia a buscar, p. ej. '6205', '6205LLU', 'rodamiento'.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stock",
      description:
        "Consulta el stock real disponible de un producto a partir de su id_product.",
      parameters: {
        type: "object",
        properties: {
          id_product: {
            type: "number",
            description: "El id_product del producto en Prestashop.",
          },
        },
        required: ["id_product"],
      },
    },
  },
];

/** Recorta el historial al máximo de turnos permitido. */
function trimHistory(history: Message[]): Message[] {
  const max = MAX_TURNS * 2;
  if (history.length <= max) return history;
  return history.slice(history.length - max);
}

async function runTool(
  name: string,
  args: any,
  collected: Product[]
): Promise<string> {
  if (name === "search_products") {
    const products = await searchProducts(String(args?.query ?? ""));
    // Acumulamos hasta 3 productos para devolverlos al cliente como tarjetas.
    for (const p of products.slice(0, 3)) {
      if (!collected.some((c) => c.id === p.id)) collected.push(p);
    }
    return JSON.stringify(products.slice(0, 5));
  }
  if (name === "get_stock") {
    const stock = await getStock(Number(args?.id_product ?? 0));
    // Enriquecemos el producto acumulado con su stock si lo tenemos.
    const match = collected.find((c) => c.id === stock.id_product);
    if (match) {
      (match as any).stock = stock.quantity;
    }
    return JSON.stringify(stock);
  }
  return JSON.stringify({ error: `Herramienta desconocida: ${name}` });
}

/**
 * Ejecuta el agente Carlos: envía el historial + mensaje a GPT-4o,
 * resuelve las llamadas a herramientas y devuelve la respuesta final.
 */
export async function runAgent(
  message: string,
  history: Message[]
): Promise<{ output: string; products: Product[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY en las variables de entorno.");
  }

  const openai = new OpenAI({ apiKey });
  const collected: Product[] = [];

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimHistory(history).map(
      (m): ChatCompletionMessageParam => ({
        role: m.role === "system" ? "assistant" : m.role,
        content: m.content,
      })
    ),
    { role: "user", content: message },
  ];

  // Bucle de tool-calling (máx. 5 iteraciones para evitar bucles infinitos).
  for (let i = 0; i < 5; i++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages,
      tools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0]?.message;
    if (!choice) break;

    messages.push(choice);

    const toolCalls = choice.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { output: choice.content ?? "", products: collected.slice(0, 3) };
    }

    // Resolvemos todas las llamadas a herramientas de esta ronda.
    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      let parsedArgs: any = {};
      try {
        parsedArgs = JSON.parse(call.function.arguments || "{}");
      } catch {
        parsedArgs = {};
      }
      let result: string;
      try {
        result = await runTool(call.function.name, parsedArgs, collected);
      } catch (err) {
        result = JSON.stringify({
          error: err instanceof Error ? err.message : "Error en la herramienta",
        });
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  // Si agotamos las iteraciones, pedimos una respuesta final sin herramientas.
  const final = await openai.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    messages,
  });

  return {
    output: final.choices[0]?.message?.content ?? "",
    products: collected.slice(0, 3),
  };
}
