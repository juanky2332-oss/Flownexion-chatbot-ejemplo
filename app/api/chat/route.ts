import { NextRequest, NextResponse } from "next/server";
import { runAgent, LIMITE_DURO_MS, type AgentResult, type EventoAgente } from "@/lib/agent";
import { corsHeaders, preflight, getClientIp, isRateLimited } from "@/lib/http";
import { verifyIdentityToken } from "@/lib/hmac";
import { psGetCustomer, psGetCustomerById } from "@/lib/prestashop";
import { isPromptExtractionAttempt, IDENTITY_DEFLECTION } from "@/lib/guardrails";
import { fichasParaPdf, pideComparar } from "@/lib/ficha";
import { piezasAComparar, fichasDeComparativa, rellenarCoincidencias } from "@/lib/comparar";
import { extractQueryCandidates, sinCantidades } from "@/lib/kb";
import { MODEL } from "@/lib/llm";
import { registrarMensaje, registrarError } from "@/lib/registro";
import type { ChatRequest, Message, CartItem, PSCustomer } from "@/lib/types";

const MAX_MESSAGE_LENGTH = 1500;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

// El cliente se busca en la Webservice en cada mensaje; se guarda 10 min para
// no pagar ese segundo extra en cada turno de la misma conversación.
const clientesCache = new Map<string, { c: PSCustomer | null; ts: number }>();
async function clienteCacheado(clave: string, buscar: () => Promise<PSCustomer | null>): Promise<PSCustomer | null> {
  const hit = clientesCache.get(clave);
  if (hit && Date.now() - hit.ts < 600_000) return hit.c;
  const c = await buscar();
  clientesCache.set(clave, { c, ts: Date.now() });
  if (clientesCache.size > 500) clientesCache.delete(clientesCache.keys().next().value as string);
  return c;
}

/**
 * Quién es el cliente, para aplicar SU descuento. Por orden de confianza:
 *  1. Token firmado por el módulo nexionchat de la tienda (HMAC): seguro.
 *  2. Mientras el módulo no esté instalado: el e-mail (o id) del cliente que
 *     la propia tienda publica en window.prestashop.customer, leído por
 *     widget.js. Va sin firmar, así que SOLO sirve para calcular el precio de
 *     su grupo: nunca da acceso a carritos ni a tokens de nadie. Con
 *     IDENTIDAD_FIRMADA_OBLIGATORIA=1 (cuando el módulo esté puesto) se ignora.
 *  3. Fuera de la tienda (web de pruebas): la cuenta de pruebas.
 */
async function resolverCliente(body: ChatRequest, origen: "tienda" | "web") {
  const claims = verifyIdentityToken(body?.identityToken ?? "");
  if (claims) return { customerId: claims.id_customer, groupId: claims.id_group, email: claims.email, firmado: true };

  if (process.env.IDENTIDAD_FIRMADA_OBLIGATORIA !== "1") {
    const email = typeof body?.customerEmail === "string" ? body.customerEmail.trim().toLowerCase() : "";
    const rawId = typeof body?.customerId === "number" && body.customerId > 0 ? body.customerId : 0;
    let c: PSCustomer | null = null;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) c = await clienteCacheado(`e:${email}`, () => psGetCustomer(email));
    else if (rawId) c = await clienteCacheado(`i:${rawId}`, () => psGetCustomerById(rawId));
    if (c) return { customerId: c.id, groupId: c.groupId, email: c.email, firmado: false };
  }

  // La cuenta de pruebas solo fuera de la tienda: dentro, un cliente sin
  // identificar ve el precio de tarifa, nunca el descuento de otra cuenta.
  if (origen === "web" && process.env.TEST_CUSTOMER_EMAIL?.trim()) {
    const email = process.env.TEST_CUSTOMER_EMAIL.trim();
    const c = await clienteCacheado(`e:${email}`, () => psGetCustomer(email));
    if (c) return { customerId: c.id, groupId: c.groupId, email: undefined, firmado: false };
  }
  return { customerId: undefined, groupId: undefined, email: undefined, firmado: false };
}

// Escalados que NO son "el bot no supo": el cliente lo pidió, o es un pedido
// que hay que ampliar por teléfono. El resto se cuenta como consulta sin
// respuesta en el panel, que es la lista para mejorar el bot.
const ESCALADOS_NORMALES = /peticion_cliente|stock_insuficiente|condiciones_comerciales/i;
const NEGATIVA = /no (he podido|he encontrado|tengo (informaci|datos|esa)|dispongo|consta|puedo confirmar)/i;

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  const inicio = Date.now();

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { output: "Has hecho demasiadas peticiones. Espera un momento, por favor." },
      { status: 429, headers }
    );
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ output: "Petición inválida." }, { status: 400, headers });
  }

  const message = (body?.message ?? "").toString().trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!message) {
    return NextResponse.json(
      { output: "Cuéntame qué necesitas y te ayudo a encontrarlo." },
      { status: 400, headers }
    );
  }
  const sessionId = typeof body?.sessionId === "string" && body.sessionId ? body.sessionId : "sin-sesion";
  const origen: "tienda" | "web" = body?.origen === "tienda" ? "tienda" : "web";
  const quiereStream = body?.stream === true;

  // Defensa en profundidad: intercepta los intentos más obvios de extraer
  // el system prompt/identidad del modelo sin gastar una llamada a OpenAI.
  if (isPromptExtractionAttempt(message)) {
    return NextResponse.json({ output: IDENTITY_DEFLECTION, products: [] }, { headers });
  }

  const history: Message[] = Array.isArray(body?.history)
    ? body.history
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
        .slice(-20)
    : [];

  const cart: CartItem[] | undefined = Array.isArray(body?.cart)
    ? (body.cart as CartItem[]).slice(0, 20)
    : undefined;

  const cliente = await resolverCliente(body, origen);

  // Límite DURO: esta ruta SIEMPRE tiene que contestar. Si la conversación se
  // pasara de tiempo, sería Vercel quien cortase (maxDuration = 60 s) con su
  // propia página de error, y el cliente se quedaría sin respuesta y sin
  // contacto. runAgent tiene además su propio presupuesto interno (más corto)
  // para cerrar bien la respuesta; esto es solo la red de seguridad final.
  const responder = async (onEvento?: (e: EventoAgente) => void) => {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let cortado = false;
    const porTiempo = new Promise<AgentResult>((resolve) => {
      temporizador = setTimeout(() => {
        cortado = true;
        resolve({
          output:
            "Esta consulta me está llevando más de lo normal. Dime la referencia o la medida exacta y lo miro enseguida; " +
            "y si prefieres resolverlo ya, escríbenos por teléfono o e-mail y te atendemos al momento.",
          products: [],
          needsHuman: true,
          humanContext: message.slice(0, 150),
          motivo: "limite_de_tiempo",
        });
      }, LIMITE_DURO_MS);
    });
    const r = await Promise.race([
      runAgent(message, history, cart, cliente.groupId, cliente.customerId, onEvento),
      porTiempo,
    ]).finally(() => {
      if (temporizador) clearTimeout(temporizador);
    });

    // Ficha técnica descargable en PDF: la que trae la respuesta y, si el bot
    // no respetó el formato, la ficha verificada del KB de cada referencia que
    // consultó y nombra (ver fichasParaPdf en lib/ficha.ts).
    // Comparativa en PDF solo si el cliente ha pedido comparar (o ha nombrado
    // dos referencias); si no, cada ficha por separado.
    const refsMensaje = extractQueryCandidates(sinCantidades(message)).filter((c) => (c.match(/\d/g) ?? []).length >= 3 && c.length <= 20 && !/[A-Z]{4,}/.test(c));
    const pideCompararMsg = pideComparar(message, refsMensaje.filter((c, i, a) => !a.some((o, j) => j !== i && o.length > c.length && o.includes(c))));
    let fichas = fichasParaPdf(r.output, r.tecnicas ?? [], pideCompararMsg);
    // Al comparar, una ficha por CADA pieza comparada (sacadas del mensaje y de
    // la conversación, resueltas contra el KB), aunque el texto solo traiga una:
    // el cliente exige su PDF por separado y el comparativo (lib/comparar.ts).
    if (pideCompararMsg) {
      const deLaComparativa = fichasDeComparativa(piezasAComparar(message, history), fichas, r.tecnicas ?? [], r.output, r.products);
      if (deLaComparativa.length >= 2) fichas = deLaComparativa;
    }
    const comparar = fichas.length >= 2 && pideCompararMsg;
    if (comparar) r.output = rellenarCoincidencias(r.output, fichas);
    const sinRespuesta =
      cortado ||
      (!!r.needsHuman && !ESCALADOS_NORMALES.test(r.motivo ?? "")) ||
      (!r.products.length && NEGATIVA.test(r.output));

    // Las baterías de prueba (sessionId "prueba-…") no cuentan en el panel.
    if (!sessionId.startsWith("prueba-")) await registrarMensaje({
      sessionId,
      origen,
      cliente: cliente.email,
      pregunta: message,
      respuesta: r.output,
      productos: r.products.map((p) => ({ id: p.id, ref: p.reference, nombre: p.name, precio: p.price, stock: p.stock })),
      escalado: !!r.needsHuman,
      motivo: r.motivo,
      sinRespuesta,
      ms: Date.now() - inicio,
      modelo: MODEL,
      uso: r.uso,
    });

    return {
      output: r.output,
      products: r.products,
      needsHuman: r.needsHuman,
      humanContext: r.humanContext,
      ...(fichas.length ? { fichas } : {}),
      ...(comparar ? { comparar: true } : {}),
    };
  };

  const fallo = async (err: unknown) => {
    // El detalle (clave de OpenAI ausente/inválida, sin cuota, etc.) es
    // información interna: se queda en los logs y en el panel, nunca se le
    // enseña al cliente.
    const msg = err instanceof Error ? err.message : "";
    let category = "error_generico";
    if (/OPENAI_API_KEY/i.test(msg)) category = "falta_openai_api_key";
    else if (/401|invalid.*api key|incorrect api key/i.test(msg)) category = "openai_api_key_invalida";
    else if (/429|quota|insufficient|credit/i.test(msg)) category = "openai_sin_cuota";
    console.error("[/api/chat] error:", category, err);
    await registrarError("/api/chat", category, msg);
    return {
      output:
        "Ups, ha habido un problema técnico procesando tu consulta. Vuelve a intentarlo en un momento y, si te corre prisa, escríbenos por teléfono o e-mail.",
      products: [],
      needsHuman: true,
      humanContext: message.slice(0, 150),
    };
  };

  if (!quiereStream) {
    try {
      return NextResponse.json(await responder(), { headers });
    } catch (err) {
      return NextResponse.json(await fallo(err), { status: 500, headers });
    }
  }

  // Streaming: una línea JSON por evento (estado / texto / reinicio) y una
  // última {tipo:"fin", ...} con la respuesta definitiva, que es la que manda.
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (obj: unknown) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* el cliente cerró la conexión */
        }
      };
      try {
        const final = await responder(enviar);
        enviar({ tipo: "fin", ...final });
      } catch (err) {
        enviar({ tipo: "fin", ...(await fallo(err)) });
      } finally {
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      ...headers,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
