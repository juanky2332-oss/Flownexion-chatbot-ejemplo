"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { enviarEvento, leerCarritoTienda, type LineaCarrito, type ResumenTienda } from "@/lib/carritoTienda";

// Resumen del carrito dentro del chat. Muestra lo que el cliente TIENE en el
// carrito de la tienda cuando se puede leer (cliente identificado), y si no,
// lo que ha añadido desde el chat en esta conversación. Tras cada añadido
// enseña un "✓ Añadido" bien visible.

interface Estado {
  /** Lo añadido desde el chat en esta conversación. */
  lineas: LineaCarrito[];
  /** El carrito real de la tienda, si se ha podido leer. */
  lineasTienda: LineaCarrito[] | null;
  resumen?: ResumenTienda;
  cartUrl: string;
  orderUrl: string;
  /** Último añadido, para el aviso "✓ Añadido". */
  ultimo: { texto: string; ts: number } | null;
  registrar: (anadidas: LineaCarrito[], extra: { resumen?: ResumenTienda; cartUrl?: string; orderUrl?: string }) => void;
  refrescar: () => void;
}

const Ctx = createContext<Estado | null>(null);

export function useCarritoChat(): Estado | null {
  return useContext(Ctx);
}

export function CarritoChatProvider({
  children,
  psBase,
  identityToken,
  activo,
}: {
  children: ReactNode;
  psBase: string;
  identityToken?: string | null;
  /** El chat está abierto: es cuando merece la pena leer el carrito. */
  activo: boolean;
}) {
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [lineasTienda, setLineasTienda] = useState<LineaCarrito[] | null>(null);
  const [resumen, setResumen] = useState<ResumenTienda | undefined>();
  const [cartUrl, setCartUrl] = useState(`${psBase}/carrito?action=show`);
  const [orderUrl, setOrderUrl] = useState(`${psBase}/pedido`);
  const [ultimo, setUltimo] = useState<Estado["ultimo"]>(null);
  const token = useRef(identityToken);
  token.current = identityToken;

  const refrescar = useCallback(() => {
    leerCarritoTienda(token.current).then((l) => {
      if (l) setLineasTienda(l);
    });
  }, []);

  // Al abrir el chat (y si cambia la identidad), lo que ya hay en el carrito.
  useEffect(() => {
    if (activo) refrescar();
  }, [activo, identityToken, refrescar]);

  const registrar = useCallback<Estado["registrar"]>(
    (anadidas, extra) => {
      if (!anadidas.length) return;
      setLineas((prev) => {
        const next = [...prev];
        for (const a of anadidas) {
          const i = next.findIndex((l) => l.id_product === a.id_product && l.id_product_attribute === a.id_product_attribute);
          if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + a.qty };
          else next.push(a);
        }
        return next;
      });
      if (extra.resumen) setResumen(extra.resumen);
      if (extra.cartUrl) setCartUrl(extra.cartUrl);
      if (extra.orderUrl) setOrderUrl(extra.orderUrl);
      const uds = anadidas.reduce((s, l) => s + l.qty, 0);
      setUltimo({
        texto:
          anadidas.length === 1
            ? `Añadido: ${anadidas[0].qty} × ${anadidas[0].name}`
            : `Añadidos ${anadidas.length} productos (${uds} uds.)`,
        ts: Date.now(),
      });
      refrescar();
    },
    [refrescar]
  );

  const valor = useMemo(
    () => ({ lineas, lineasTienda, resumen, cartUrl, orderUrl, ultimo, registrar, refrescar }),
    [lineas, lineasTienda, resumen, cartUrl, orderUrl, ultimo, registrar, refrescar]
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

const eur = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** Franja compacta bajo la cabecera del chat: se lee de un vistazo y se despliega al pulsar. */
export function MiniCarrito({ primaryColor, enLaTienda, cliente }: { primaryColor: string; enLaTienda: boolean; cliente?: string | null }) {
  const c = useCarritoChat();
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // "✓ Añadido" visible unos segundos tras cada añadido.
  useEffect(() => {
    if (!c?.ultimo) return;
    setAviso(c.ultimo.texto);
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [c?.ultimo]);

  if (!c) return null;
  // El carrito real si se ha podido leer; si no, lo añadido desde el chat.
  const lista = c.lineasTienda && c.lineasTienda.length ? c.lineasTienda : c.lineas;
  if (!lista.length) return null;

  const uds = lista.reduce((s, l) => s + l.qty, 0);
  const subtotal = lista.reduce((s, l) => s + l.qty * l.price, 0);
  const real = !!(c.lineasTienda && c.lineasTienda.length);
  const destino = enLaTienda ? "_top" : "_blank";

  return (
    <div className="border-b border-gray-200 bg-white text-xs">
      {aviso && (
        <p className="flex animate-fade-in-up items-center gap-2 bg-green-50 px-3 py-1.5 font-semibold text-green-800" role="status">
          ✓ {aviso}
        </p>
      )}
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={abierto}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100">🛒</span>
        <span className="min-w-0 flex-1 truncate text-gray-700">
          {real ? "Tu carrito" : "Añadido desde el chat"}: <strong className="text-gray-900">{uds} ud{uds === 1 ? "." : "s."}</strong>
          {" · "}
          <span className="text-gray-500">subtotal</span> <strong className="text-gray-900">{c.resumen?.total && !real ? c.resumen.total : eur(subtotal)}</strong>
        </span>
        <span className="text-gray-400">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto && (
        <div className="px-3 pb-2.5">
          <ul className="max-h-32 space-y-1 overflow-y-auto">
            {lista.map((l) => (
              <li key={`${l.id_product}-${l.id_product_attribute}`} className="flex justify-between gap-2 text-gray-600">
                <span className="truncate">
                  {l.qty} × {l.name}
                </span>
                <span className="shrink-0 font-semibold text-gray-800">{eur(l.qty * l.price)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 flex justify-between border-t border-gray-100 pt-1.5 text-gray-700">
            <span>Subtotal ({uds} uds.)</span>
            <strong className="text-gray-900">{eur(subtotal)}</strong>
          </p>
          <button
            type="button"
            onClick={async () => {
              const { descargarPresupuestoPdf } = await import("@/lib/fichaPdf");
              await descargarPresupuestoPdf(
                lista.map((l) => ({ referencia: l.reference, descripcion: l.name, uds: l.qty, precio: l.price })),
                cliente
              );
              enviarEvento("pdf", { tipo: "presupuesto", refs: lista.map((l) => l.reference) });
            }}
            className="mt-1.5 text-[11px] font-semibold underline underline-offset-2"
            style={{ color: primaryColor }}
          >
            📄 Descargar presupuesto en PDF
          </button>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="flex-1 rounded-lg border px-2 py-1.5 font-semibold transition hover:bg-gray-50"
              style={{ borderColor: primaryColor, color: primaryColor }}
            >
              Seguir comprando
            </button>
            <a
              href={c.orderUrl}
              target={destino}
              rel="noopener"
              onClick={() => enviarEvento("tramitar", { uds, subtotal: Number(subtotal.toFixed(2)) })}
              className="flex-1 rounded-lg px-2 py-1.5 text-center font-bold text-white transition hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              Tramitar pedido →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
