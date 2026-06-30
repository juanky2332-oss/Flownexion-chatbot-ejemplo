"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";

interface ProductCardProps {
  product: Product;
  primaryColor?: string;
  onCheckout?: (product?: Product, qty?: number) => void;
  isInIframe?: boolean;
  psBase?: string;
}

export default function ProductCard({
  product,
  primaryColor = "#0066cc",
  onCheckout,
  isInIframe = false,
  psBase = "https://b2b.esgas.es",
}: ProductCardProps) {
  const [qty, setQty] = useState(Math.max(1, product.qty ?? 1));
  const [adding, setAdding] = useState(false);

  const changeQty = (delta: number) => setQty((prev) => Math.max(1, prev + delta));

  const hasDiscount = product.discountPct != null && product.discountPct > 0;

  // Iframe mode: delega al padre (widget.js) via postMessage.
  // widget.js corre en b2b.esgas.es y hace fetch same-origin con cookies.
  const handleAddIframe = () => {
    if (adding) return;
    setAdding(true);
    onCheckout?.(product, qty);
    setTimeout(() => setAdding(false), 1500);
  };

  // Standalone mode: abre addchat.php en una NUEVA PESTAÑA.
  // - Chatbot permanece en la pestaña original (no desaparece).
  // - window.open('_blank') desde un click directo nunca es bloqueado en móvil
  //   (los bloqueadores solo actúan sobre popups con tamaño o llamadas async).
  // - Navegación top-level a b2b.esgas.es → cookies SameSite=Lax enviadas → PS añade al carrito.
  // - Con ?redirect=1 y addchat.php actualizado: la nueva pestaña redirige al carrito.
  // - Sin redirect: la nueva pestaña muestra {"ok":true} pero el artículo SÍ queda añadido.
  const handleAddStandalone = () => {
    if (adding) return;
    setAdding(true);
    const addUrl =
      `${psBase}/addchat.php` +
      `?id_product=${product.id}` +
      `&id_product_attribute=${product.idProductAttribute ?? 0}` +
      `&qty=${qty}` +
      `&redirect=1`;
    window.open(addUrl, "_blank");
    setTimeout(() => setAdding(false), 1500);
  };

  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      {/* Nombre + precio */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {product.isEquivalent ? "🔄" : "📦"} {product.name}
          </p>
          {product.reference && (
            <p className="truncate text-xs text-gray-500">Ref: {product.reference}</p>
          )}
          {product.isEquivalent && product.originalBrand && (
            <p className="mt-0.5 text-xs font-medium text-amber-600">
              ≡ Equivalente a {product.originalBrand}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {hasDiscount && product.originalPrice ? (
            <>
              <span className="text-[10px] text-gray-400 line-through">
                {product.originalPrice.toFixed(2)} €
              </span>
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  -{Math.round(product.discountPct! * 100)}%
                </span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {product.price.toFixed(2)} €
                </span>
              </div>
            </>
          ) : (
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {product.price.toFixed(2)} €
            </span>
          )}
        </div>
      </div>

      {/* Stock */}
      {product.stock !== undefined && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              product.stock > 0 ? "bg-green-500" : "bg-red-400"
            }`}
          />
          <span className={product.stock > 0 ? "text-green-700" : "text-red-600"}>
            {product.stock > 0 ? `${product.stock} uds en stock` : "Sin stock inmediato"}
          </span>
        </div>
      )}

      {/* Selector de cantidad */}
      <div className="mt-2.5 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Cantidad:</span>
        <div className="flex items-center overflow-hidden rounded-lg border border-gray-300">
          <button
            onClick={() => changeQty(-1)}
            className="flex h-7 w-7 items-center justify-center text-sm font-bold text-gray-600 hover:bg-gray-100"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-11 border-x border-gray-300 py-0.5 text-center text-sm font-semibold outline-none"
          />
          <button
            onClick={() => changeQty(1)}
            className="flex h-7 w-7 items-center justify-center text-sm font-bold text-gray-600 hover:bg-gray-100"
          >
            +
          </button>
        </div>
      </div>

      {/* Botones */}
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 transition"
          style={{ color: primaryColor, borderColor: primaryColor }}
        >
          🔗 Ficha
        </a>

        {isInIframe ? (
          <button
            onClick={handleAddIframe}
            disabled={adding}
            className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: primaryColor }}
          >
            {adding ? "⏳ Añadiendo…" : `🛒 Añadir ${qty > 1 ? `${qty} uds` : "al carrito"}`}
          </button>
        ) : (
          <button
            onClick={handleAddStandalone}
            disabled={adding}
            className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: primaryColor }}
          >
            {adding ? "⏳ Añadiendo…" : `🛒 Añadir ${qty > 1 ? `${qty} uds` : "al carrito"}`}
          </button>
        )}
      </div>
    </div>
  );
}
