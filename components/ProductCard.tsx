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
  isInIframe = false,
  psBase = "https://b2b.esgas.es",
}: ProductCardProps) {
  const [qty, setQty] = useState(Math.max(1, product.qty ?? 1));
  const [adding, setAdding] = useState(false);

  const changeQty = (delta: number) =>
    setQty((prev) => Math.max(1, prev + delta));
  const hasDiscount =
    product.discountPct != null && product.discountPct > 0;

  // Navegar al controlador de carrito de PS con el parámetro back apuntando
  // al controlador de carrito (URL raw, funciona siempre aunque fallen las
  // friendly URLs). En modo iframe usamos window.top para salir del iframe.
  const handleAdd = () => {
    if (adding) return;
    setAdding(true);
    const addUrl =
      `${psBase}/index.php?controller=cart&add=1` +
      `&id_product=${product.id}` +
      `&id_product_attribute=${product.idProductAttribute ?? 0}` +
      `&qty=${qty}` +
      `&action=add` +
      `&back=${encodeURIComponent("index.php?controller=cart&action=show")}`;

    if (isInIframe) {
      try {
        (window.top as Window).location.href = addUrl;
      } catch {
        window.location.href = addUrl;
      }
    } else {
      window.location.href = addUrl;
    }
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
              : "Sin stock — disponible en 24/48 h laborables"}
          </span>
        </div>
      )}

      {/* Qty + actions */}
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
            value={qty}
            onChange={(e) =>
              setQty(Math.max(1, parseInt(e.target.value) || 1))
            }
            className="w-10 border-x border-gray-200 bg-white py-0.5 text-center text-sm font-semibold outline-none"
          />
          <button
            onClick={() => changeQty(1)}
            className="flex h-7 w-7 items-center justify-center font-bold text-gray-500 transition hover:bg-gray-100"
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
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Yendo al carrito…
            </>
          ) : (
            `🛒 ${qty > 1 ? `Añadir ${qty} uds` : "Añadir al carrito"}`
          )}
        </button>

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
    </div>
  );
}
