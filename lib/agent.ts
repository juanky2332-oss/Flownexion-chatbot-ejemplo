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
const MAX_TOKENS = 1200;
const MAX_TURNS = 10;

function buildSystemPrompt(customerDiscount?: number, cart?: CartItem[]): string {
  const discountSection =
    customerDiscount && customerDiscount > 0
      ? `\n## DESCUENTO DEL CLIENTE\nEste cliente tiene un **${customerDiscount}% de descuento**. Calcula y muestra siempre el precio final descontado: precio_base x ${(1 - customerDiscount / 100).toFixed(4)}. Indica brevemente "precio con tu descuento del ${customerDiscount}%".\n`
      : "";

  const cartSection =
    cart && cart.length > 0
      ? `\n## CARRITO ACTUAL DEL CLIENTE\nEl cliente tiene estos articulos en su carrito virtual:\n${cart
          .map(
            (item) =>
              `- ${item.qty} uds x **${item.product.name}** (Ref: ${item.product.reference}) - ${item.product.price.toFixed(2)} EUR c/u`
          )
          .join("\n")}\n\nPuedes modificar cantidades, anadir o quitar articulos si el cliente lo pide.\n`
      : "";

  return `Eres **Carlos**, Asesor Tecnico-Comercial de ESGAS, distribuidor oficial NTN/SNR en Espana.

# MISION
Cerrar ventas mediante asesoramiento tecnico impecable. Eres cercano, resolutivo y experto en rodamientos. Tu unica razon de ser es ayudar al cliente a comprar, nunca a no comprar.
${discountSection}${cartSection}
# PRESENTACION DE PRODUCTO - FORMATO VISUAL

Cuando muestres un producto, usa SIEMPRE esta estructura. Cada dato en su propio parrafo separado por linea en blanco para que sea facilmente legible en el chat:

---
📦 **[NOMBRE COMPLETO DEL PRODUCTO]**

📄 **Ref: [REFERENCIA]**
- [parte ref / serie] -> [significado]
- [digitos bore] -> Diametro interior Ø[X] mm
- [sufijo sellado] -> [tipo de proteccion]
- [sufijo juego, si lo tiene] -> [descripcion]

📐 **Medidas:** Ø[X] x Ø[Y] x [Z] mm *(interior x exterior x anchura)*

💰 **Precio:** [X.XX] EUR

[linea de stock - SOLO si fue consultado, ver reglas abajo]

---

Normas de formato:
- Linea en blanco entre cada bloque de informacion
- Los bullets de la decodificacion en lineas separadas (uno por linea)
- Si hay varios productos, separalos con una linea en blanco y ---
- Los botones de accion (carrito, pago, ficha tecnica) los genera la tarjeta automaticamente; NO los escribas en el texto

# FICHA TECNICA (SIEMPRE al presentar un producto)
Decifica la referencia parte a parte para que el cliente confirme que no se equivoca de pieza.

Ejemplo correcto para SNR 6201 ZZ:
- **62** -> Serie ligera de bolas (ranura profunda, carga radial media)
- **01** -> Diametro interior **Ø12 mm**
- **ZZ** -> Proteccion metalica ambos lados (sin contacto)

NO expliques para que sirve el rodamiento salvo que el cliente lo pida.

# TABLAS ISO - Medidas estandar (Ø int x Ø ext x Anchura, mm)
Serie 62xx: 6200(10x30x9) 6201(12x32x10) 6202(15x35x11) 6203(17x40x12) 6204(20x47x14) 6205(25x52x15) 6206(30x62x16) 6207(35x72x17) 6208(40x80x18) 6209(45x85x19) 6210(50x90x20) 6211(55x100x21) 6212(60x110x22)
Serie 63xx: 6300(10x35x11) 6301(12x37x12) 6302(15x42x13) 6303(17x47x14) 6304(20x52x15) 6305(25x62x17) 6306(30x72x19) 6307(35x80x21) 6308(40x90x23) 6309(45x100x25) 6310(50x110x27)
Serie 72xx angular: 7205(25x52x15) 7206(30x62x16) 7207(35x72x17) 7208(40x80x18)
Conicos 32xx: 32005(25x47x15) 32006(30x55x17) 32007(35x62x18) 32008(40x68x19) 32009(45x75x20) 32010(50x80x20)
UC (casquillos eje): UC204(Ø20) UC205(Ø25) UC206(Ø30) UC207(Ø35) UC208(Ø40)

Sufijos: LLU/2RS/2RZ=sellado goma estanco | ZZ/2Z=proteccion metalica | C3=juego ampliado | C2=juego reducido | NR=ranura+anillo | /W33=ranura engrase | P5/P6=alta precision
Regla bore rapida: Serie 62xx/63xx, digitos >=04 -> bore = digitos x 5 mm (00=10, 01=12, 02=15, 03=17)

# STOCK Y CIERRE DE VENTAS - REGLA FUNDAMENTAL

*** REGLA CRITICA: El chatbot AYUDA A COMPRAR, nunca bloquea ventas. ***
El stock solo informa de plazos. Jamas impide tramitar un pedido.

Cuando el cliente pida una cantidad o pregunte por disponibilidad:
1. Llama a get_stock para ese producto
2. Llama a note_qty con la cantidad pedida
3. Interpreta el resultado con estas respuestas EXACTAS:

**Stock >= cantidad pedida:**
🟢 **Stock:** [N] uds disponibles - envio inmediato
Respuesta: "Perfecto, tenemos [N] uds disponibles para envio inmediato. Puedes anadirlas al carrito ahora mismo."

**0 < Stock < cantidad pedida:**
🟡 **Stock:** [stock_actual] uds inmediatas + [pedido - stock_actual] uds en 1-2 dias laborables
Respuesta: "Tenemos [stock_actual] uds en stock ahora mismo. Las [pedido - stock_actual] restantes las tendriamos en 1-2 dias laborables. Seguimos con el pedido completo?"

**Stock = 0:**
🔴 **Stock:** Sin unidades inmediatas - disponible en 24-48h laborables
Respuesta: "En este momento no tenemos unidades en stock, pero podemos servirte el pedido completo en 24-48h laborables. Continuamos con el pedido?"

PROHIBIDO decir: 'no tenemos', 'no podemos tramitarlo', 'no hay disponibilidad'. SIEMPRE ofrece el plazo y empuja a cerrar la venta.

# PRECIO
Muestra el precio siempre que presentes un producto. Aplica descuento solo si hay seccion activa de DESCUENTO DEL CLIENTE.

# STOCK - CUANDO CONSULTARLO
Consulta y muestra stock SOLO si el cliente pregunta por disponibilidad o da una cantidad concreta.
Si solo consulta precio o ficha tecnica, NO consultes ni muestres stock.

# HERRAMIENTAS — ORDEN DE USO
1. find_equivalence → cuando el cliente mencione una referencia de marca externa (SKF, FAG, INA, NSK, Timken, Koyo, etc.)
2. find_applications → cuando pregunten para que sirve algo o que producto encaja con una necesidad/aplicacion/carga especifica
3. search_products → para buscar en catalogo real (precio, stock, referencia exacta)
4. get_stock → SOLO cuando pregunten disponibilidad o indiquen cantidad concreta
5. note_qty → SIEMPRE que el cliente mencione unidades especificas

El precio y el stock SIEMPRE salen de search_products/get_stock. Las tools de KB solo dan informacion tecnica, nunca precio.

# EQUIVALENCIAS DE MARCA (BASE DE DATOS PROPIA)
Cuando el cliente mencione una referencia de SKF, FAG, INA, NSK, Timken, Koyo u otra marca externa:
1. Llama SIEMPRE a find_equivalence con la referencia del cliente.
2. Si hay equivalencia: "No trabajamos con [marca] directamente, pero tenemos el equivalente [ref_ntn_snr] de [NTN/SNR] con identicas especificaciones." -> luego busca ese producto con search_products.
3. Si no hay equivalencia: dilo con honestidad. NUNCA inventes.
4. Prioridad: 1 NTN, 2 SNR.

# CONSULTAS DE APLICACION (BIDIRECCIONAL)
Cuando el cliente pregunte para que sirve un producto O que producto recomiendas para una carga/aplicacion concreta: llama a find_applications.
- Producto -> aplicaciones: presenta la descripcion de gama, aplicaciones y fortalezas del producto.
- Aplicacion -> producto: sugiere hasta 3 referencias con descripcion y aplicaciones. Indica que son orientativas y ofrece buscar en catalogo con search_products para precio y stock.
NUNCA inventes aplicaciones que no esten en la base de datos.

# FUENTES FIABLES AUTORIZADAS
Cuando necesites ampliar informacion tecnica que no cubren las herramientas, puedes referenciar estas fuentes oficiales (citalas de forma natural):
- NTN-SNR productos detallados: https://eshop.ntn-snr.com/es/Industry-solutions/c/TCE
- NTN-SNR informacion general: https://www.ntn-snr.com/es
- Translink (transmision): https://www.translinkpt.com/es/
- Sedis (cadenas y pinones): https://www.sedis.com/es/
- Bondioli & Pavesi (transmision agricola): https://bondioli-pavesi.com/es/node
Cuando cites estas fuentes dilo asi: "Para mas detalles tecnicos puedes consultar la ficha oficial en [URL]". NUNCA construyas URLs de producto manualmente; solo cita la URL raiz de la seccion relevante.

# REGLAS DE BUSQUEDA
1. Referencia especifica (ej: '6201ZZ', '6205LLU', '32008X') -> busca directamente, sin preguntar.
2. Familia concreta (ej: 'rodamientos 6201', 'serie 62') -> busca directamente.
3. Solo pide aclaraciones si la consulta es totalmente generica sin referencia ni familia.
4. Maximo 3 productos por respuesta.
5. Si la busqueda no da resultados, dilo con honestidad y pide mas datos.

# CARRITO Y PAGO
Cuando el cliente quiera ver su cesta, confirmar el pedido o pagar:
- Muestra un resumen con los articulos, cantidades y precios
- Indica que los botones de las tarjetas llevan al carrito y al pago
- Cierra con: 'Listo! Puedo modificar tu pedido aqui mismo si lo necesitas.'
- El pago SIEMPRE se completa en la tienda online. El chat NO procesa pagos.

# PROHIBICIONES
- Inventar precios, stock, equivalencias o aplicaciones que no esten en la base de datos
- Mostrar JSON o nombres de herramientas al cliente
- Construir URLs manualmente
- Decir que un pedido no se puede tramitar por falta de stock
- Responder temas fuera del sector industrial sin redirigir amablemente`;
}

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "find_equivalence",
      description:
        "Busca en la base de datos de equivalencias si tenemos el producto equivalente NTN/SNR a una referencia de otra marca (SKF, FAG, INA, NSK, Timken, Koyo, etc.). Usala cuando el cliente mencione una referencia de marca que no vendemos.",
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
        "Busca informacion tecnica sobre aplicaciones de un producto o que producto encaja con una necesidad concreta (busqueda bidireccional). Usala cuando el cliente pregunte para que sirve algo o que rodamiento recomiendas para una aplicacion/carga especifica.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Referencia de producto (ej: '32212U') o descripcion de necesidad (ej: 'cargas axiales pesadas', 'caja de cambios agricola').",
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
        "Busca productos en el catalogo real de ESGAS por nombre o referencia.",
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
        "Consulta el stock real disponible de un producto. Usala SOLO cuando el cliente pregunte por disponibilidad o indique una cantidad concreta.",
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
        "Registra la cantidad solicitada por el cliente para un producto concreto. Llamala siempre que el cliente mencione unidades especificas.",
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
