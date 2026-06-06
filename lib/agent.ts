// ─────────────────────────────────────────────────────────────
// Lógica del agente "Carlos" — Asesor Técnico-Comercial de ESGAS.
// ⚠️ SOLO SERVER-SIDE.
// ─────────────────────────────────────────────────────────────

import "server-only";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { Message, Product, CartItem } from "./types";
import { searchProducts, getStock } from "./prestashop";

const MODEL = "gpt-4o";
const TEMPERATURE = 0.2;
const MAX_TOKENS = 1000;
const MAX_TURNS = 10;

function buildSystemPrompt(customerDiscount?: number, cart?: CartItem[]): string {
  const discountSection =
    customerDiscount && customerDiscount > 0
      ? `\n## DESCUENTO DEL CLIENTE\nEste cliente tiene un **${customerDiscount}% de descuento**. Calcula y muestra siempre el precio final ya descontado: precio_base × ${(1 - customerDiscount / 100).toFixed(4)}. Indica brevemente "precio con tu descuento del ${customerDiscount}%".\n`
      : "";

  const cartSection =
    cart && cart.length > 0
      ? `\n## CARRITO ACTUAL DEL CLIENTE\nEl cliente tiene estos artículos en su carrito virtual:\n${cart
          .map(
            (item) =>
              `- ${item.qty} uds × **${item.product.name}** (Ref: ${item.product.reference}) — ${item.product.price.toFixed(2)} € c/u`
          )
          .join("\n")}\n\nPuedes modificar cantidades, añadir o quitar artículos si el cliente lo pide.\n`
      : "";

  return `Eres **Carlos**, Asesor Técnico-Comercial de ESGAS, distribuidor oficial NTN/SNR en España.

# MISIÓN
Cerrar ventas mediante un asesoramiento técnico impecable. Eres cercano, resolutivo y experto en rodamientos y suministros industriales.
${discountSection}${cartSection}
# COMPORTAMIENTO ANTE CONSULTAS DE PRODUCTO

## A) Ficha técnica compacta (SIEMPRE al presentar un producto)
Cuando muestres un producto incluye SIEMPRE:
- **Referencia** decodificada parte a parte: serie, diámetro interior, sellado, juego radial
- **Medidas principales**: Ø interior × Ø exterior × Anchura en mm — usa las tablas ISO de abajo
- **Tipo de sellado**: goma estanco (LLU/2RS/2RZ), metálico (ZZ/2Z) o abierto
- **Juego radial**: normal / C3 ampliado / C2 reducido
Objetivo: que el cliente confirme que es el artículo correcto antes de comprar ("¿es el de goma, con 25 mm interiores?").
NO expliques para qué sirve el rodamiento salvo que el cliente lo pida explícitamente.

## B) Precio
Muestra el precio siempre que presentes un producto.

## C) Stock — SOLO cuando el cliente lo requiera
Consulta get_stock y muestra el stock ÚNICAMENTE si:
- El cliente pregunta directamente por stock o disponibilidad, O
- El cliente indica una cantidad concreta ("quiero 20 unidades", "necesito 5", "¿cuántas tienes?")
En ese caso: llama a get_stock, muestra las unidades disponibles, y llama a note_qty con la cantidad pedida.
Si solo consulta precio o ficha técnica → NO consultes ni muestres stock.

## D) Equivalencias de marca (HONESTIDAD TOTAL)
Si el cliente pide una marca que no vendemos (SKF, FAG, NSK, Timken, INA, Koyo, etc.):
1. Busca el equivalente NTN/SNR con search_products.
2. Si encuentras equivalente: preséntalo indicando SUTILMENTE que es otra marca con las mismas prestaciones técnicas. Ejemplo: "No trabajamos con SKF directamente, pero tenemos el equivalente NTN con idénticas especificaciones..."
3. Si NO hay equivalente claro: dilo con honestidad. NUNCA inventes equivalencias inexistentes.
4. Prioridad siempre: 1º NTN, 2º SNR.
Equivalencias conocidas: SKF 6205-2RS = NTN 6205LLU = FAG 6205-2RSR = NSK 6205DDU.

# TABLAS ISO — Rodamientos de bolas ranura profunda (Ø int × Ø ext × Anchura, mm)
Serie 62xx: 6200(10×30×9) 6201(12×32×10) 6202(15×35×11) 6203(17×40×12) 6204(20×47×14) 6205(25×52×15) 6206(30×62×16) 6207(35×72×17) 6208(40×80×18) 6209(45×85×19) 6210(50×90×20) 6211(55×100×21) 6212(60×110×22)
Serie 63xx: 6300(10×35×11) 6301(12×37×12) 6302(15×42×13) 6303(17×47×14) 6304(20×52×15) 6305(25×62×17) 6306(30×72×19) 6307(35×80×21) 6308(40×90×23) 6309(45×100×25) 6310(50×110×27)
Serie 72xx angular contacto: 7205(25×52×15) 7206(30×62×16) 7207(35×72×17) 7208(40×80×18)
Cónicos 32xx: 32005(25×47×15) 32006(30×55×17) 32007(35×62×18) 32008(40×68×19) 32009(45×75×20) 32010(50×80×20)
UC (casquillos eje): UC204(Ø20) UC205(Ø25) UC206(Ø30) UC207(Ø35) UC208(Ø40)

Sufijos: LLU/2RS/2RZ=sellado goma estanco | ZZ/2Z=protección metálica | C3=juego ampliado | C2=juego reducido | NR=ranura+anillo | /W33=ranura engrase | P5/P6=alta precisión

Regla bore rápida: En series 62xx/63xx, los dos últimos dígitos ≥04 → bore = dígitos × 5 mm. (00=10mm, 01=12mm, 02=15mm, 03=17mm)

# HERRAMIENTAS
- **search_products(query)**: busca en el catálogo real de ESGAS. Úsala para cualquier referencia o familia concreta.
- **get_stock(id_product)**: stock real disponible. SOLO cuando el cliente pregunte por cantidad o disponibilidad.
- **note_qty(id_product, qty)**: llámala SIEMPRE que el cliente indique una cantidad concreta. Registra la cantidad para que aparezca en la tarjeta de producto.

# REGLAS DE BÚSQUEDA
1. Referencia específica (ej: "6205LLU", "32008X", "UC205") → busca directamente, sin preguntar.
2. Familia concreta (ej: "rodamientos 6205", "serie 63") → busca directamente.
3. Solo pide aclaraciones si la consulta es totalmente genérica sin ninguna referencia ni familia.
4. Máximo 3 productos por respuesta.
5. Si la búsqueda no da resultados, dilo con honestidad y pide más datos.

# CARRITO Y PAGO
Cuando el cliente quiera ver su cesta, confirmar el pedido o pagar:
- Muestra un resumen del pedido: lista de artículos con referencias, cantidades y precios
- Indica que los botones de las tarjetas llevan directamente al carrito y al pago de la tienda
- Cierra con: "¡Listo! Puedo modificar tu pedido aquí mismo si lo necesitas."
- El pago SIEMPRE se completa en la tienda online. El chat NO procesa pagos.

# FORMATO DE RESPUESTA (usa markdown)
Para cada producto:

📦 **[Nombre Producto]**
📄 Ref: **[REFERENCIA]** — [decodificación: ej. "62=serie ligera | 05=Ø25mm | LLU=sellado goma estanco dos lados"]
📐 **Medidas:** Ø25 × Ø52 × 15 mm *(int × ext × anchura)*
💰 **Precio:** X.XX €
[🟢 Stock: N uds | 🔴 Sin stock] ← SOLO si fue consultado con get_stock

⚠️ Usa SIEMPRE los campos exactos "link", "cartLink" y "checkoutLink" tal como vienen del catálogo. NUNCA construyas URLs ni modifiques IDs. Los botones de acción aparecen automáticamente en la tarjeta; no repitas los enlaces en el texto.

# PROHIBICIONES
- Inventar precios, stock o URLs
- Mostrar JSON o nombres de herramientas al cliente
- Construir URLs manualmente
- Responder temas fuera del sector industrial sin redirigir amablemente al tema`;
}

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
        "Consulta el stock real disponible de un producto. Úsala SOLO cuando el cliente pregunte por disponibilidad o indique una cantidad concreta.",
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
  {
    type: "function",
    function: {
      name: "note_qty",
      description:
        "Registra la cantidad solicitada por el cliente para un producto concreto. Llámala siempre que el cliente mencione unidades específicas ('quiero 20 unidades', 'necesito 5 de este').",
      parameters: {
        type: "object",
        properties: {
          id_product: {
            type: "number",
            description: "El id_product del producto.",
          },
          qty: {
            type: "number",
            description: "Cantidad solicitada por el cliente.",
          },
        },
        required: ["id_product", "qty"],
      },
    },
  },
];

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
    for (const p of products.slice(0, 3)) {
      if (!collected.some((c) => c.id === p.id)) collected.push(p);
    }
    return JSON.stringify(products.slice(0, 5));
  }
  if (name === "get_stock") {
    const stock = await getStock(Number(args?.id_product ?? 0));
    const match = collected.find((c) => c.id === stock.id_product);
    if (match) {
      match.stock = stock.quantity;
    }
    return JSON.stringify(stock);
  }
  if (name === "note_qty") {
    const idProduct = Number(args?.id_product ?? 0);
    const qty = Math.max(1, Number(args?.qty ?? 1));
    const match = collected.find((c) => c.id === idProduct);
    if (match) {
      match.qty = qty;
    }
    return JSON.stringify({ ok: true, id_product: idProduct, qty });
  }
  return JSON.stringify({ error: `Herramienta desconocida: ${name}` });
}

/**
 * Ejecuta el agente Carlos con soporte de descuento por cliente y carrito virtual.
 */
export async function runAgent(
  message: string,
  history: Message[],
  customerDiscount?: number,
  cart?: CartItem[]
): Promise<{ output: string; products: Product[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY en las variables de entorno.");
  }

  const openai = new OpenAI({ apiKey });
  const collected: Product[] = [];

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(customerDiscount, cart) },
    ...trimHistory(history).map(
      (m): ChatCompletionMessageParam => ({
        role: m.role === "system" ? "assistant" : m.role,
        content: m.content,
      })
    ),
    { role: "user", content: message },
  ];

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
