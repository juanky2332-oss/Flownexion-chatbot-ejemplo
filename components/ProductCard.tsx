"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";

interface ProductCardProps {
  product: Product;
  primaryColor?: string;
  psBase?: string;
  identityToken?: string | null;
  customerId?: number | null;
}

function detectIframe(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

export default function ProductCard({
  product,
  primaryColor = "#0066cc",
  psBase = "https://b2b.esgas.es",
  identityToken,
  customerId,
}: ProductCardProps) {
  // El B2B nunca tramita más unidades de las que hay en stock real: es
  // política de negocio, no un límite técnico. maxQty acota tanto el
  // selector de cantidad como el botón de añadir; product.stock === 0 oculta
  // por completo el flujo de compra B2B y muestra el aviso de pedido
  // ordinario en su lugar.
  const stockKnown = product.stock !== undefined;
  const outOfStockForB2B = stockKnown && (product.stock as number) <= 0;
  const maxQty = stockKnown ? Math.max(product.stock as number, 1) : undefined;

  const [qty, setQty] = useState(() => {
    const initial = Math.max(1, product.qty ?? 1);
    return maxQty !== undefined ? Math.min(initial, maxQty) : initial;
  });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const changeQty = (delta: number) =>
    setQty((prev) => {
      const next = Math.max(1, prev + delta);
      return maxQty !== undefined ? Math.min(next, maxQty) : next;
    });
  const hasDiscount =
    product.discountPct != null && product.discountPct > 0;

  const cartPage = `${psBase}/carrito?action=show`;

  // Vía Webservice API (server-to-server): no depende de ninguna cookie del
  // navegador, así que funciona tanto de fallback (popup bloqueado) como en
  // pruebas standalone fuera de b2b.esgas.es. Resuelve el cliente igual que
  // /api/chat: identityToken > customerId sin firmar > TEST_CUSTOMER_EMAIL.
  const addViaApi = (qtyToAdd: number) => {
    fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{
          productId: product.id,
          qty: qtyToAdd,
          idProductAttribute: product.idProductAttribute ?? 0,
        }],
        ...(identityToken ? { identityToken } : {}),
        ...(!identityToken && customerId ? { customerId } : {}),
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // El servidor vuelve a comprobar el stock real (puede haber
          // cambiado desde que se cargó la tarjeta): si lo rechaza, no
          // abrimos el carrito y explicamos el motivo con el stock actual.
          if (data?.error === "stock_insuficiente" && typeof data?.available === "number") {
            setAddError(
              data.available > 0
                ? `Solo quedan ${data.available} uds disponibles por el B2B ahora mismo. Para pedir más, contacta por teléfono o e-mail (ver aviso del chat).`
                : `Ya no quedan unidades disponibles por el B2B para este producto. Contacta por teléfono o e-mail para tramitar el pedido de forma ordinaria.`
            );
          } else {
            setAddError("No se pudo añadir al carrito. Por favor, inténtalo de nuevo.");
          }
          setAdding(false);
          return;
        }
        window.open((data as { cartUrl?: string }).cartUrl || cartPage, "_blank", "noopener,noreferrer");
        setAdding(false);
      })
      .catch(() => {
        setAddError("No se pudo añadir al carrito. Por favor, inténtalo de nuevo.");
        setAdding(false);
      });
  };

  // Mecanismo confirmado funcionando embebido en b2b.esgas.es (tag
  // carrito-funciona-2026-07-01): abrir addchat.php como navegación de
  // pestaña nueva de verdad (no un fetch dentro del iframe) hace que el
  // navegador SÍ envíe las cookies de sesión reales de Prestashop
  // (SameSite=Lax las permite en navegaciones de nivel superior). Esto
  // SOLO puede funcionar si el navegador ya tiene esa sesión real, es
  // decir, embebido de verdad en la tienda — por eso se usa solo dentro
  // de un iframe; fuera (pruebas standalone) no hay ninguna sesión que
  // enviar y se usa addViaApi() directamente.
  //
  // Para saber cuándo Prestashop ya procesó el Cart::updateQty() del popup
  // (y así navegarlo al carrito sin que se vea el JSON), lanzamos en
  // paralelo un fetch de solo-señal (mode:no-cors) al mismo endpoint: no
  // necesita leer la respuesta, solo que el servidor haya contestado ya.
  const handleAdd = () => {
    if (adding || outOfStockForB2B) return;
    setAdding(true);
    setAddError(null);

    // Nunca se debería llegar aquí con qty > stock (el selector ya lo acota),
    // pero se vuelve a acotar aquí por si product.stock cambió tras el
    // primer render — safeQty es lo único que se usa a partir de este punto,
    // nunca el estado qty directamente (evita usar un valor stale).
    const safeQty = maxQty !== undefined ? Math.min(qty, maxQty) : qty;
    if (safeQty !== qty) setQty(safeQty);

    if (!detectIframe()) {
      addViaApi(safeQty);
      return;
    }

    const addchatUrl =
      `${psBase}/addchat.php` +
      `?id_product=${encodeURIComponent(product.id)}` +
      `&id_product_attribute=${encodeURIComponent(product.idProductAttribute ?? 0)}` +
      `&qty=${encodeURIComponent(safeQty)}`;

    const popup = window.open(addchatUrl, "_blank");

    if (!popup) {
      // Popup bloqueado por el navegador: mejor esfuerzo vía Webservice API.
      addViaApi(safeQty);
      return;
    }

    const goToCart = () => {
      try {
        if (!popup.closed) popup.location.href = cartPage;
        else window.open(cartPage, "_blank");
      } catch {
        window.open(cartPage, "_blank");
      }
      setAdding(false);
    };

    fetch(addchatUrl, { mode: "no-cors", cache: "no-store" })
      .then(goToCart)
      .catch(() => setTimeout(goToCart, 600));
  };

  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      {/* Name + price */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {product.isEquivalent ? "Equivalente" : "NTN / SNR"}
          </p>
          <p className="mt-0.5 text-sm font-bold leading-snug text-gray-900">
            {product.name}
          </p>
          {product.reference && (
            <p className="font-mono text-[11px] text-gray-500">
              Ref. {product.reference}
            </p>
          )}
          {product.isEquivalent && product.originalBrand && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              ↔ Equiv. a {product.originalBrand}
            </span>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {hasDiscount && product.originalPrice != null ? (
            <>
              <span className="text-[10px] text-gray-400 line-through">
                {product.originalPrice.toFixed(2)} €
              </span>
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  -{Math.round(product.discountPct! * 100)}%
                </span>
                <span
                  className="rounded-full px-2.5 py-1 text-sm font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {product.price.toFixed(2)} €
                </span>
              </div>
            </>
          ) : (
            <span
              className="rounded-full px-2.5 py-1 text-sm font-bold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {product.price.toFixed(2)} €
            </span>
          )}
        </div>
      </div>

      {/* Stock */}
      {product.stock !== undefined && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              product.stock > 0 ? "bg-green-500" : "bg-red-400"
            }`}
          />
          <span
            className={`text-xs font-medium ${
              product.stock > 0 ? "text-green-700" : "text-red-600"
            }`}
          >
            {product.stock > 0
              ? `${product.stock} ud${product.stock === 1 ? "." : "s."} en stock`
              : "Sin stock disponible por B2B ahora mismo"}
          </span>
        </div>
      )}

      {/* Sin stock: el B2B nunca tramita este producto ahora mismo (regla de
          negocio, no un fallo). Se sustituye el selector de cantidad y el
          botón de añadir por el aviso de pedido ordinario, coherente con el
          mensaje que ya da el chat. */}
      {outOfStockForB2B && (
        <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
          No podemos tramitar este producto por el B2B hasta que haya stock. Si lo necesitas ahora, pide un pedido ordinario por teléfono o e-mail.
        </p>
      )}

      {/* Qty + actions */}
      {!outOfStockForB2B && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            <button
              onClick={() => changeQty(-1)}
              className="flex h-7 w-7 items-center justify-center font-bold text-gray-500 transition hover:bg-gray-100"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={maxQty}
              value={qty}
              onChange={(e) => {
                const parsed = Math.max(1, parseInt(e.target.value) || 1);
                setQty(maxQty !== undefined ? Math.min(parsed, maxQty) : parsed);
              }}
              className="w-10 border-x border-gray-200 bg-white py-0.5 text-center text-sm font-semibold outline-none"
            />
            <button
              onClick={() => changeQty(1)}
              disabled={maxQty !== undefined && qty >= maxQty}
              className="flex h-7 w-7 items-center justify-center font-bold text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>

          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold text-white transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: primaryColor }}
          >
            {adding ? (
              <>
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Añadiendo…
              </>
            ) : (
              `🛒 ${qty > 1 ? `Añadir ${qty} uds` : "Añadir al carrito"}`
            )}
          </button>
        </div>
      )}

      <div className={outOfStockForB2B ? "mt-1.5" : "mt-2.5 flex items-center gap-2"}>
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-gray-50"
          style={{ color: primaryColor, borderColor: primaryColor }}
        >
          Ver ficha →
        </a>
      </div>

      {addError && (
        <p className="mt-1.5 text-xs text-red-600">{addError}</p>
      )}
    </div>
  );
}
