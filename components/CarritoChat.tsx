"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { enviarEvento, type LineaCarrito, type ResumenTienda } from "@/lib/carritoTienda";

// Lo que el cliente ha añadido al carrito DESDE EL CHAT en esta conversación,
// para el mini-carrito de arriba. Si la tienda devuelve su propio resumen
// (embebido), se muestra el total real del carrito; si no, el subtotal de lo
// añadido aquí con los precios de las tarjetas.

interface Estado {
  lineas: LineaCarrito[];
  resumen?: ResumenTienda;
  cartUrl: string;
  orderUrl: string;
  /** Contador que cambia en cada añadido (para avisar en el mini-carrito). */
  version: number;
  registrar: (anadidas: LineaCarrito[], extra: { resumen?: ResumenTienda; cartUrl?: string; orderUrl?: string }) => void;
}

const Ctx = createContext<Estado | null>(null);

export function useCarritoChat(): Estado | null {
  return useContext(Ctx);
}

export function CarritoChatProvider({ children, psBase }: { children: ReactNode; psBase: string }) {
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [resumen, setResumen] = useState<ResumenTienda | undefined>();
  const [cartUrl, setCartUrl] = useState(`${psBase}/carrito?action=show`);
  const [orderUrl, setOrderUrl] = useState(`${psBase}/pedido`);
  const [version, setVersion] = useState(0);

  const registrar = useCallback<Estado["registrar"]>((anadidas, extra) => {
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
    setVersion((v) => v + 1);
  }, []);

  const valor = useMemo(() => ({ lineas, resumen, cartUrl, orderUrl, version, registrar }), [lineas, resumen, cartUrl, orderUrl, version, registrar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

const eur = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** Franja compacta bajo la cabecera del chat: se lee de un vistazo y se despliega al pulsar. */
export function MiniCarrito({ primaryColor, enLaTienda, cliente }: { primaryColor: string; enLaTienda: boolean; cliente?: string | null }) {
  const c = useCarritoChat();
  const [abierto, setAbierto] = useState(false);
  if (!c || !c.lineas.length) return null;

  const uds = c.lineas.reduce((s, l) => s + l.qty, 0);
  const subtotal = c.lineas.reduce((s, l) => s + l.qty * l.price, 0);
  const destino = enLaTienda ? "_top" : "_blank";

  return (
    <div className="border-b border-gray-200 bg-white text-xs" key={c.version}>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full animate-fade-in-up items-center gap-2 px-3 py-2 text-left"
        aria-expanded={abierto}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">✓</span>
        <span className="min-w-0 flex-1 truncate text-gray-700">
          <strong className="text-gray-900">{uds} ud{uds === 1 ? "." : "s."}</strong> añadida{uds === 1 ? "" : "s"} desde el chat
          {" · "}
          <strong className="text-gray-900">{eur(subtotal)}</strong>
        </span>
        <span className="text-gray-400">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto && (
        <div className="px-3 pb-2.5">
          <ul className="max-h-28 space-y-1 overflow-y-auto">
            {c.lineas.map((l) => (
              <li key={`${l.id_product}-${l.id_product_attribute}`} className="flex justify-between gap-2 text-gray-600">
                <span className="truncate">
                  {l.qty} × {l.name}
                </span>
                <span className="shrink-0 font-semibold text-gray-800">{eur(l.qty * l.price)}</span>
              </li>
            ))}
          </ul>
          {c.resumen?.total && (
            <p className="mt-1.5 flex justify-between border-t border-gray-100 pt-1.5 text-gray-700">
              <span>Total de tu carrito{c.resumen.count ? ` (${c.resumen.count} uds.)` : ""}</span>
              <strong className="text-gray-900">{c.resumen.total}</strong>
            </p>
          )}
          <button
            type="button"
            onClick={async () => {
              const { descargarPresupuestoPdf } = await import("@/lib/fichaPdf");
              await descargarPresupuestoPdf(
                c.lineas.map((l) => ({ referencia: l.reference, descripcion: l.name, uds: l.qty, precio: l.price })),
                cliente
              );
              enviarEvento("pdf", { tipo: "presupuesto", refs: c.lineas.map((l) => l.reference) });
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
