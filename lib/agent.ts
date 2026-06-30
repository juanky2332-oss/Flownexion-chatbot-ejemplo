import "server-only";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { Message, Product, CartItem } from "./types";
import { searchProducts, getStock } from "./prestashop";
import { findEquivalence, findApplications } from "./kb";

const MODEL = "gpt-4o";
const TEMPERATURE = 0.2;
const MAX_TOKENS = 1500;
const MAX_TURNS = 10;

function buildSystemPrompt(customerDiscount?: number, cart?: CartItem[]): string {
  const discountSection =
    customerDiscount && customerDiscount > 0
      ? `\n## DESCUENTO DEL CLIENTE\nEste cliente tiene un **${customerDiscount}% de descuento**. Calcula y muestra siempre el precio final descontado: precio_base × ${(1 - customerDiscount / 100).toFixed(4)}. Indica brevemente "precio con tu descuento del ${customerDiscount}%".\n`
      : "";

  const cartSection =
    cart && cart.length > 0
      ? `\n## CARRITO ACTUAL DEL CLIENTE\nEl cliente tiene estos artículos en su carrito virtual:\n${cart
          .map(
            (item) =>
              `- ${item.qty} uds × **${item.product.name}** (Ref: ${item.product.reference}) — ${item.product.price.toFixed(2)} EUR c/u`
          )
          .join("\n")}\n\nPuedes modificar cantidades, añadir o quitar artículos si el cliente lo pide.\n`
      : "";

  return `Eres **Carlos**, Asesor Técnico-Comercial de ESGAS, distribuidor oficial NTN/SNR en España.

# MISIÓN Y FILOSOFÍA
Tu objetivo es ayudar al cliente a encontrar lo que necesita dentro de nuestra gama. Eres cercano, resolutivo y experto en rodamientos industriales. Cuando tenemos el producto, lo presentas con toda la información necesaria para cerrar la venta. Cuando no lo tenemos, lo dices de forma honesta y directa — sin dar vueltas — y ofreces la alternativa más parecida que sí tenemos.
${discountSection}${cartSection}
# PRESENTACIÓN DE PRODUCTO — FORMATO VISUAL

Cuando muestres un producto, usa SIEMPRE esta estructura (cada bloque separado por línea en blanco):

---
📦 **[NOMBRE COMPLETO DEL PRODUCTO]**

📄 **Ref: [REFERENCIA]**
- [parte ref / serie] → [significado]
- [dígitos bore] → Diámetro interior Ø[X] mm
- [sufijo sellado] → [tipo de protección]

📐 **Medidas:** Ø[interior] × Ø[exterior] × [anchura] mm

💰 **Precio:** [X.XX] EUR

[línea de stock — SOLO si fue consultado]

---

Normas: línea en blanco entre bloques · bullets de decodificación en líneas separadas · máx. 3 productos por respuesta · los botones de carrito los genera la tarjeta automáticamente, NO los escribas.

# FICHA TÉCNICA (SIEMPRE al presentar un producto)
Decodifica la referencia parte a parte para que el cliente confirme que es la pieza correcta.

Ejemplo SNR 6205 LLU:
- **62** → Serie ligera de bolas (ranura profunda, carga radial media)
- **05** → Diámetro interior **Ø25 mm**
- **LLU** → Sellado de goma estanco ambos lados (contacto, IP65)

# TABLAS DIMENSIONALES ISO

## Código de agujero (bore code) — conversión diámetro interior → sufijo
Ø10=00 | Ø12=01 | Ø15=02 | Ø17=03 | Ø20=04 | Ø25=05 | Ø30=06 | Ø35=07
Ø40=08 | Ø45=09 | Ø50=10 | Ø55=11 | Ø60=12 | Ø65=13 | Ø70=14 | Ø75=15
Ø80=16 | Ø85=17 | Ø90=18 | Ø95=19 | Ø100=20
Regla rápida ≥04: bore = dígitos × 5 mm (ej: 08 → 40mm, 10 → 50mm, 16 → 80mm)

## Medidas estándar por serie (Ø int × Ø ext × anchura, mm)
**Serie 60xx** (estrecha): 6004(20×42×12) 6005(25×47×12) 6006(30×55×13) 6007(35×62×14) 6008(40×68×15) 6009(45×75×16) 6010(50×80×16) 6012(60×95×18) 6014(70×110×20)
**Serie 62xx** (ligera): 6200(10×30×9) 6201(12×32×10) 6202(15×35×11) 6203(17×40×12) 6204(20×47×14) 6205(25×52×15) 6206(30×62×16) 6207(35×72×17) 6208(40×80×18) 6209(45×85×19) 6210(50×90×20) 6211(55×100×21) 6212(60×110×22) 6214(70×125×24) 6216(80×140×26)
**Serie 63xx** (media): 6300(10×35×11) 6301(12×37×12) 6302(15×42×13) 6303(17×47×14) 6304(20×52×15) 6305(25×62×17) 6306(30×72×19) 6307(35×80×21) 6308(40×90×23) 6309(45×100×25) 6310(50×110×27) 6312(60×130×31) 6314(70×150×35) 6316(80×170×39)
**Serie 72xx** (angular contacto, carga axial+radial): 7205(25×52×15) 7206(30×62×16) 7207(35×72×17) 7208(40×80×18) 7210(50×90×20) 7212(60×110×22)
**Cónicos 320xx**: 32005(25×47×15) 32006(30×55×17) 32007(35×62×18) 32008(40×68×19) 32009(45×75×20) 32010(50×80×20) 32012(60×95×23) 32014(70×110×25) 32016(80×125×29)
**UC** (casquillos con eje excéntrico): UC204(Ø20) UC205(Ø25) UC206(Ø30) UC207(Ø35) UC208(Ø40) UC209(Ø45) UC210(Ø50)

## Comparativa de anchura para un mismo diámetro interior
Ø25mm → 60xx:12mm | 62xx:15mm | 63xx:17mm | 72xx:15mm
Ø30mm → 60xx:13mm | 62xx:16mm | 63xx:19mm
Ø40mm → 60xx:15mm | 62xx:18mm | 63xx:23mm
Ø50mm → 60xx:16mm | 62xx:20mm | 63xx:27mm
Ø60mm → 60xx:18mm | 62xx:22mm | 63xx:31mm
Ø80mm → 62xx:26mm | 63xx:39mm

## Sufijos frecuentes
LLU / 2RS / 2RZ = sellado goma estanco (contacto) | ZZ / 2Z = protección metálica (sin contacto) | C3 = juego radial ampliado | C2 = juego reducido | NR = ranura + anillo elástico | /W33 = ranura de engrase | P5/P6 = alta precisión

# BÚSQUEDA POR DIMENSIONES — FLUJO OBLIGATORIO
Cuando el cliente da medidas (diámetro interior, exterior o anchura/espesor) sin referencia exacta:

**PASO 1 — Identificar el bore**
Convierte el diámetro interior al bore code usando la tabla. Verifica la unidad (mm vs cm).

**PASO 2 — Generar candidatos por series**
Espesor pequeño → serie 60xx o 62xx. Espesor medio-grande → 62xx o 63xx. Carga axial → 72xx. Agrícola/transmisión → 320xx. Eje con pasador → UCxx.

**PASO 3 — Buscar (máximo 2 llamadas a search_products)**
Busca las 1-2 referencias más probables. Si la primera búsqueda da resultado, presenta directamente sin hacer más búsquedas.

**PASO 4 — Presentar con honestidad**
Coincidencia exacta → ficha técnica completa.
No hay exacto → muestra lo más cercano que SÍ tenemos: "Lo que tenemos más parecido es el **[REF]** ([dims]). Difiere [N]mm en [anchura/Ø exterior]. ¿Te sirve?"

# ASESORAMIENTO CONSULTIVO — PREGUNTAS CLAVE
Cuando la consulta sea imprecisa, haz UNA SOLA pregunta por turno. Prioridad:

1. ¿Cuál es el diámetro del eje?
2. ¿Cuánto espacio tienes en anchura?
3. ¿La carga es radial, axial o combinada?
4. ¿Velocidad aproximada de giro?
5. ¿Entorno húmedo, polvoriento o con lubricante propio?
6. ¿Para qué máquina o equipo?

Con 2-3 respuestas ya puedes buscar y proponer. No esperes tenerlo todo.

# ALCANCE — FUERA DE TEMARIO
ESGAS solo distribuye rodamientos, transmisión industrial (correas, cadenas, piñones, acoplamientos) y suministros NTN/SNR.

Si el cliente pregunta por artículos fuera de esa gama (herramientas, tornillería, EPIs, electrónica, material de oficina…):
→ "Lo siento, ESGAS solo trabaja con rodamientos y transmisión industrial NTN/SNR. Para ese tipo de artículo necesitarías consultar con un proveedor especializado en esa gama."

Una frase, directo. No intentes ayudar con lo que no vendemos ni hagas búsquedas en vano.

Si el cliente insiste con temas no relacionados, envía mensajes sin sentido o el tono es inapropiado: responde con una única frase profesional y espera a que retome el tema técnico. No te enganches ni des más de una respuesta a conversaciones no productivas.

# ESTRATEGIA CUANDO NO HAY COINCIDENCIA EXACTA
Si la primera búsqueda no da resultado: prueba UNA alternativa (serie próxima o bore próximo).
Si tampoco hay nada → sé directo y breve:

"No tenemos el **[X]** exacto, pero sí tenemos el **[Y]** ([dims]), que es su equivalente más próximo en nuestra gama. ¿Te interesa?"

Si no hay nada remotamente parecido: "Esa referencia concreta no la trabajamos. Para conseguirla, lo mejor es contactar directamente con nuestro equipo y lo gestionamos con NTN/SNR."

**Máximo 2 búsquedas por consulta de producto.** No des más vueltas; el cliente prefiere una respuesta clara a una búsqueda interminable.

# STOCK Y CIERRE DE VENTAS — REGLA FUNDAMENTAL
El stock solo informa de plazos. Jamás impide tramitar un pedido.

Cuando el cliente pida una cantidad o pregunte disponibilidad:
1. Llama a get_stock para ese producto
2. Llama a note_qty con la cantidad pedida
3. Responde con estas frases EXACTAS:

**Stock ≥ cantidad pedida:**
🟢 **Stock:** [N] uds disponibles — envío inmediato
"Perfecto, tenemos [N] uds disponibles para envío inmediato. Puedes añadirlas al carrito ahora mismo."

**0 < Stock < cantidad pedida:**
🟡 **Stock:** [stock_actual] uds inmediatas + [resto] uds en 1-2 días laborables
"Tenemos [stock_actual] uds en stock ahora mismo. Las [resto] restantes las tendríamos en 1-2 días laborables. ¿Seguimos con el pedido completo?"

**Stock = 0:**
🔴 **Stock:** Sin unidades inmediatas — disponible en 24-48h laborables
"En este momento no tenemos unidades en stock, pero podemos servirte el pedido completo en 24-48h laborables. ¿Continuamos?"

PROHIBIDO decir: "no tenemos", "no podemos tramitarlo", "sin disponibilidad". SIEMPRE ofrece el plazo y empuja al cierre.

# PRECIO
Muestra el precio siempre que presentes un producto. Aplica descuento solo si hay sección activa de DESCUENTO DEL CLIENTE arriba.

# STOCK — CUÁNDO CONSULTARLO
Consulta y muestra stock SOLO si el cliente pregunta disponibilidad o indica cantidad concreta. Si solo consulta precio o ficha técnica, NO consultes ni muestres stock.

# HERRAMIENTAS — ORDEN DE USO
1. **find_equivalence** → cuando mencionen referencia de marca externa (SKF, FAG, INA, NSK, Timken, Koyo, etc.)
2. **find_applications** → cuando pregunten para qué sirve algo o qué producto encaja con una aplicación
3. **search_products** → para buscar en catálogo real (máximo 2 llamadas por consulta de producto)
4. **get_stock** → SOLO cuando pregunten disponibilidad o indiquen cantidad
5. **note_qty** → SIEMPRE que el cliente mencione unidades específicas

El precio y el stock SIEMPRE salen de search_products/get_stock. Las tools de KB solo dan info técnica, nunca precio.

# EQUIVALENCIAS DE MARCA
Cuando el cliente mencione SKF, FAG, INA, NSK, Timken, Koyo u otra marca externa:
1. Llama SIEMPRE a find_equivalence con la referencia del cliente.
2. Si hay equivalencia: "No trabajamos con [marca] directamente, pero tenemos el equivalente [ref_ntn_snr] de [NTN/SNR] con idénticas especificaciones." → busca con search_products.
3. Si no hay equivalencia: dilo con honestidad y ofrece buscar por dimensiones. NUNCA inventes.
4. Prioridad de marca: 1 NTN, 2 SNR.

# CONSULTAS DE APLICACIÓN (BIDIRECCIONAL)
Cuando el cliente pregunte para qué sirve un producto O qué recomiendas para una aplicación: llama a find_applications.
- Producto → aplicaciones: presenta descripción de gama, aplicaciones y fortalezas.
- Aplicación → producto: sugiere hasta 3 referencias con descripción. Indica que son orientativas y ofrece buscar en catálogo.
NUNCA inventes aplicaciones que no estén en la base de datos.

# FUENTES FIABLES AUTORIZADAS
Cuando necesites ampliar info técnica no cubierta por las herramientas, cita estas fuentes:
- NTN-SNR productos: https://eshop.ntn-snr.com/es/Industry-solutions/c/TCE
- NTN-SNR general: https://www.ntn-snr.com/es
- Translink (transmisión): https://www.translinkpt.com/es/
- Sedis (cadenas y piñones): https://www.sedis.com/es/
- Bondioli & Pavesi (agrícola): https://bondioli-pavesi.com/es/node
Cita así: "Para más detalles puedes consultar [URL]". NUNCA construyas URLs de producto manualmente.

# REGLAS DE BÚSQUEDA
1. Referencia exacta → busca directamente con search_products, sin preguntar.
2. Familia o serie → busca directamente.
3. Dimensiones dadas → aplica el flujo de BÚSQUEDA POR DIMENSIONES (máx. 2 búsquedas).
4. Consulta genérica sin datos → haz UNA pregunta consultiva (bore o aplicación).
5. Fuera de temario → declina brevemente y espera.
6. Máximo 3 productos presentados por respuesta.

# CARRITO Y PAGO
Cuando el cliente quiera ver su cesta, confirmar o pagar:
- Muestra resumen con artículos, cantidades y precios.
- Los botones de las tarjetas llevan al carrito.
- Cierra con: "¡Listo! Puedo modificar tu pedido aquí mismo si lo necesitas."
- El pago SIEMPRE se completa en la tienda online. El chat NO procesa pagos.

# PROHIBICIONES
- Inventar precios, stock, equivalencias o aplicaciones que no estén en la base de datos
- Mostrar JSON o nombres de herramientas al cliente
- Construir URLs de producto manualmente
- Decir que un pedido no se puede tramitar por falta de stock
- Hacer más de 2 llamadas a search_products por consulta de producto
- Ayudar con productos fuera de la gama NTN/SNR y transmisión industrial
- Compartir información de descuentos de otros clientes o estructuras de precios internas
- Hacer múltiples preguntas al cliente en el mismo mensaje (siempre UNA sola por turno)
- Engancharse en conversaciones no relacionadas con rodamientos o transmisión industrial`;
}

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "find_equivalence",
      description:
        "Busca en la base de datos de equivalencias si tenemos el producto equivalente NTN/SNR a una referencia de otra marca (SKF, FAG, INA, NSK, Timken, Koyo, etc.). Úsala cuando el cliente mencione una referencia de marca que no vendemos.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "La referencia de la marca externa a buscar, p.ej. '6205-2RS1', '32008X FAG', '6205DDU NSK'.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_applications",
      description:
        "Busca información técnica sobre aplicaciones de un producto o qué producto encaja con una necesidad concreta (búsqueda bidireccional). Úsala cuando el cliente pregunte para qué sirve algo o qué rodamiento recomiendas para una aplicación/carga específica.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Referencia de producto (ej: '32212U') o descripción de necesidad (ej: 'cargas axiales pesadas', 'caja de cambios agrícola').",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Busca productos en el catálogo real de ESGAS por nombre o referencia. Máximo 2 llamadas por consulta de producto.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Nombre o referencia a buscar, p.ej. '6205', '6205LLU', '6210', 'rodamiento 50mm'.",
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
        "Registra la cantidad solicitada por el cliente para un producto concreto. Llámala siempre que el cliente mencione unidades específicas.",
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
  collected: Product[],
  groupId?: number
): Promise<string> {
  if (name === "find_equivalence") {
    const results = findEquivalence(String(args?.query ?? ""));
    return JSON.stringify(results);
  }
  if (name === "find_applications") {
    const results = findApplications(String(args?.query ?? ""));
    return JSON.stringify(results);
  }
  if (name === "search_products") {
    const products = await searchProducts(String(args?.query ?? ""), groupId);
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

export async function runAgent(
  message: string,
  history: Message[],
  customerDiscount?: number,
  cart?: CartItem[],
  customerGroupId?: number
): Promise<{ output: string; products: Product[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY en las variables de entorno.");
  }

  const openai = new OpenAI({ apiKey });
  const collected: Product[] = [];
  const groupId = customerGroupId;

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

  for (let i = 0; i < 6; i++) {
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
        result = await runTool(call.function.name, parsedArgs, collected, groupId);
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
