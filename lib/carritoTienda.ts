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
