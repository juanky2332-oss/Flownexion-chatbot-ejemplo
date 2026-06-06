"use client";

// ─────────────────────────────────────────────────────────────
// Tarjeta de producto con selector de cantidad editable y
// tres acciones: ficha técnica, añadir al carrito, añadir y pagar.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import type { Product } from "@/lib/types";

interface ProductCardProps {
  product: Product;
  primaryColor?: string;
  /** Callback cuando el cliente pulsa Añadir al carrito o Añadir y pagar. */
  onAddedToCart?: (product: Product, qty: number, isCheckout: boolean) => void;
}

export default function ProductCard({
  product,
  primaryColor = "#0066cc",
  onAddedToCart,
}: ProductCardProps) {
  const [qty, setQty] = useState(Math.max(1, product.qty ?? 1));

  // Reemplaza qty=N en la URL del carrito con la cantidad seleccionada.
  const cartUrl = product.cartLink.replace(/qty=\d+/, `qty=${qty}`);

  const showStock = product.stock !== undefined;
  const hasStock = showStock && product.stock! > 0;

  const changeQty = (delta: number) =>
    setQty((prev) => Math.max(1, prev + delta));

  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      {/* Cabecera: nombre + precio */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {product.isEquivalent ? "🔄" : "📦"} {product.name}
          </p>
          {product.reference && (
            <p className="truncate text-xs text-gray-500">
              Ref: {product.reference}
            </p>
          )}
          {product.isEquivalent && product.originalBrand && (
            <p className="mt-0.5 text-xs font-medium text-amber-600">
              ≡ Equivalente a {product.originalBrand}
            </p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {product.price.toFixed(2)} €
        </span>
      </div>

      {/* Stock — solo si fue consultado con get_stock */}
      {showStock && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              hasStock ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className={hasStock ? "text-green-700" : "text-red-600"}>
            {hasStock ? `${product.stock} uds en stock` : "Sin stock"}
          </span>
        </div>
      )}

      {/* Selector de cantidad */}
      <div className="mt-2.5 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Cantidad:</span>
        <div className="flex items-center overflow-hidden rounded-lg border border-gray-300">
          <button
            onClick={() => changeQty(-1)}
            className="flex h-7 w-7 items-center justify-center text-sm font-bold text-gray-600 transition hover:bg-gray-100"
            aria-label="Reducir cantidad"
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
            className="w-11 border-x border-gray-300 py-0.5 text-center text-sm font-semibold outline-none"
            aria-label="Cantidad"
          />
          <button
            onClick={() => changeQty(1)}
            className="flex h-7 w-7 items-center justify-center text-sm font-bold text-gray-600 transition hover:bg-gray-100"
            aria-label="Aumentar cantidad"
          >
            +
          </button>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-gray-50"
          style={{ color: primaryColor, borderColor: primaryColor }}
        >
          🔗 Ficha técnica
        </a>
        <a
          href={cartUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onAddedToCart?.(product, qty, false)}
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-gray-50"
          style={{ color: primaryColor, borderColor: primaryColor }}
        >
          🛒 Añadir {qty > 1 ? `${qty} uds` : "al carrito"}
        </a>
        <a
          href={cartUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onAddedToCart?.(product, qty, true)}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          💳 Añadir y pagar
        </a>
      </div>
    </div>
  );
}
