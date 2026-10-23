"use client";

// Comunicación del chat (iframe) con la página de la tienda (widget.js), y
// registro de eventos para el panel. Todo lo que toca el carrito real pasa
// por aquí para que la tarjeta suelta y el "añadir varios" hagan lo mismo.

// Configurable solo para probar en local con una tienda simulada.
export const PS_BASE = process.env.NEXT_PUBLIC_PS_BASE || "https://b2b.esgas.es";

/** ¿El chat está embebido en la propia tienda (mismo cliente, misma sesión)? */
export function enTienda(psBase = PS_BASE): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.top === window.self) return false;
  } catch {
    /* iframe de otro origen: seguimos comprobando */
  }
  try {
    const shop = new URL(psBase).origin;
    const anc = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
    if (anc && anc.length) return anc[0] === shop;
    return !!document.referrer && new URL(document.referrer).origin === shop;
  } catch {
    return false;
  }
}

export interface LineaCarrito {
  id_product: number;
  id_product_attribute: number;
  qty: number;
  name: string;
  reference: string;
  price: number;
}

/** Resumen del carrito REAL de la tienda, tal cual lo devuelve PrestaShop. */
export interface ResumenTienda {
  count?: number;
  total?: string;
  subtotal?: string;
}

export interface ResultadoCarrito {
  ok: boolean;
  /** Líneas que sí se añadieron. */
  anadidas: LineaCarrito[];
  /** Líneas que la tienda rechazó, con su motivo. */
  fallidas: { linea: LineaCarrito; error: string | null }[];
  needsLogin: boolean;
  cartUrl: string;
  orderUrl: string;
  resumen?: ResumenTienda;
  /** La tienda no contestó (página sin el widget actualizado). */
  sinRespuesta?: boolean;
}

/**
 * Pide a widget.js (en la página de la tienda) que añada las líneas con el
 * añadir nativo de PrestaShop, una detrás de otra, con la sesión del cliente.
 */
export function anadirEnTienda(lineas: LineaCarrito[], psBase = PS_BASE): Promise<ResultadoCarrito> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cartUrl = `${psBase}/carrito?action=show`;
  const orderUrl = `${psBase}/pedido`;
  return new Promise((resolve) => {
    let hecho = false;
    const terminar = (r: ResultadoCarrito) => {
      if (hecho) return;
      hecho = true;
      window.removeEventListener("message", alRecibir);
      clearTimeout(timer);
      resolve(r);
    };
    function alRecibir(ev: MessageEvent) {
      const d = ev.data || {};
      if (d.type !== "esgas-cart-result" || d.requestId !== requestId) return;
      // Respuesta por línea (widget.js nuevo) o una sola (widget.js antiguo).
      const resultados: { ok: boolean; error?: string | null }[] = Array.isArray(d.results)
        ? d.results
        : [{ ok: !!d.ok, error: d.error ?? null }];
      const anadidas: LineaCarrito[] = [];
      const fallidas: ResultadoCarrito["fallidas"] = [];
      lineas.forEach((l, i) => {
        const r = resultados[i];
        if (r?.ok) anadidas.push(l);
        else fallidas.push({ linea: l, error: r?.error ?? null });
      });
      terminar({
        ok: anadidas.length > 0,
        anadidas,
        fallidas,
        needsLogin: !!d.needsLogin,
        cartUrl: d.cartUrl || cartUrl,
        orderUrl: d.orderUrl || orderUrl,
        resumen: d.summary || undefined,
      });
    }
    const timer = setTimeout(
      () => terminar({ ok: false, anadidas: [], fallidas: [], needsLogin: false, cartUrl, orderUrl, sinRespuesta: true }),
      12000 + 4000 * lineas.length
    );
    window.addEventListener("message", alRecibir);
    window.parent.postMessage(
      {
        type: "esgas-add-to-cart",
        requestId,
        items: lineas.map((l) => ({
          id_product: l.id_product,
          id_product_attribute: l.id_product_attribute,
          qty: l.qty,
          name: l.name,
        })),
      },
      new URL(psBase).origin
    );
  });
}

// ── Eventos para el panel ───────────────────────────────────────────────
let sesion = "sin-sesion";
let destino = "/api/evento";
export function configurarEventos(sessionId: string, base = ""): void {
  sesion = sessionId || sesion;
  destino = `${base}/api/evento`;
}

export type TipoEventoChat =
  | "anadir_carrito"
  | "anadir_error"
  | "tramitar"
  | "pdf"
  | "contacto_email"
  | "contacto_tel"
  | "contacto_datos"
  | "valoracion";

/** Como enviarEvento, pero diciendo si los datos le han llegado a alguien en el momento. */
export async function enviarContacto(datos: Record<string, unknown>): Promise<{ ok: boolean; avisado: boolean }> {
  try {
    const r = await fetch(destino, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sesion, tipo: "contacto_datos", datos }),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, avisado: !!d?.avisado };
  } catch {
    return { ok: false, avisado: false };
  }
}

export function enviarEvento(tipo: TipoEventoChat, datos: Record<string, unknown> = {}): Promise<boolean> {
  try {
    return fetch(destino, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sesion, tipo, datos }),
      keepalive: true,
    })
      .then((r) => r.ok)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

// ── Fuera de la tienda (la web del chat) ──────────────────────────────────
// El navegador no deja tocar el carrito de b2b.esgas.es desde otro dominio.
// Se usa una ventanita de la tienda (primer nivel: lleva la sesión del
// cliente) que pasa por addchat.php y se cierra sola, y se COMPRUEBA en la
// tienda (antes y después) que las unidades han subido de verdad.

/** Hay que llamarla DENTRO del clic, o el navegador bloquea la ventana. */
export function abrirVentanaCarrito(): Window | null {
  const w = window.open("", "esgas-carrito", "popup,width=380,height=180,left=80,top=80");
  if (!w) return null;
  try {
    w.document.title = "Añadiendo al carrito…";
    w.document.body.innerHTML =
      '<p style="font:14px system-ui,sans-serif;color:#334;padding:24px;text-align:center">Añadiendo al carrito de ESGAS…<br><small>Esta ventana se cierra sola.</small></p>';
  } catch {
    /* sin importancia */
  }
  return w;
}

function addchatUrl(l: LineaCarrito, psBase: string): string {
  return (
    `${psBase}/addchat.php?id_product=${encodeURIComponent(l.id_product)}` +
    `&id_product_attribute=${encodeURIComponent(l.id_product_attribute ?? 0)}&qty=${encodeURIComponent(l.qty)}`
  );
}

async function unidadesEnCarrito(l: LineaCarrito, identityToken?: string | null): Promise<number | null> {
  try {
    const r = await fetch("/api/carrito-estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_product: l.id_product, id_product_attribute: l.id_product_attribute ?? 0, ...(identityToken ? { identityToken } : {}) }),
    });
    const d = await r.json();
    return typeof d?.qty === "number" ? d.qty : null;
  } catch {
    return null;
  }
}

export interface ResultadoFuera {
  anadidas: LineaCarrito[];
  fallidas: LineaCarrito[];
  /** false = no se ha podido comprobar (cliente sin identificar en esta web). */
  comprobado: boolean;
}

export async function anadirConVentana(
  w: Window,
  lineas: LineaCarrito[],
  identityToken?: string | null,
  psBase = PS_BASE
): Promise<ResultadoFuera> {
  const antes = await Promise.all(lineas.map((l) => unidadesEnCarrito(l, identityToken)));
  for (const l of lineas) {
    try {
      w.location.href = addchatUrl(l, psBase);
    } catch {
      break; // el cliente cerró la ventana
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  try {
    w.close();
  } catch {
    /* ya cerrada */
  }
  if (antes.some((a) => a === null)) return { anadidas: [], fallidas: [], comprobado: false };
  const despues = await Promise.all(lineas.map((l) => unidadesEnCarrito(l, identityToken)));
  const anadidas: LineaCarrito[] = [];
  const fallidas: LineaCarrito[] = [];
  lineas.forEach((l, i) => {
    const a = antes[i] as number;
    const d = despues[i];
    if (d !== null && d >= a + l.qty) anadidas.push(l);
    else fallidas.push(l);
  });
  return { anadidas, fallidas, comprobado: true };
}

/** Lo que hay ahora en el carrito de la tienda (null = no se puede leer desde aquí). */
export async function leerCarritoTienda(identityToken?: string | null): Promise<LineaCarrito[] | null> {
  try {
    const r = await fetch("/api/carrito-estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "resumen", ...(identityToken ? { identityToken } : {}) }),
    });
    const d = await r.json();
    return Array.isArray(d?.lineas) ? (d.lineas as LineaCarrito[]) : null;
  } catch {
    return null;
  }
}
