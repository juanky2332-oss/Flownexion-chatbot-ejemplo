"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";

interface ProductCardProps {
  product: Product;
  primaryColor?: string;
  onAddedToCart?: (product: Product, qty: number) => void;
  onCheckout?: (product?: Product, qty?: number) => void;
}

export default function ProductCard({
  product,
  primaryColor = "#0066cc",
  onAddedToCart,
  onCheckout,
}: ProductCardProps) {
  const [qty, setQty] = useState(Math.max(1, product.qty ?? 1));
  const [addedFeedback, setAddedFeedback] = useState(false);

  const showStock = product.stock !== undefined;
  const hasStock = showStock && product.stock! > 0;

  const changeQty = (delta: number) => setQty((prev) => Math.max(1, prev + delta));

  const handleAddToCart = () => {
    onAddedToCart?.(product, qty);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 1800);
  };

  const handleCheckout = () => {
    onAddedToCart?.(product, qty);
    onCheckout?.(product, qty);
  };

  const hasDiscount = product.discountPct != null && product.discountPct > 0;
  const discountLabel = hasDiscount
    ? `-${Math.round(product.discountPct! * 100)}%`
    : null;

  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      {/* Cabecera: nombre + precio */}
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

        {/* Precio con descuento B2B */}
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {hasDiscount && product.originalPrice ? (
            <>
              <span className="text-[10px] text-gray-400 line-through">
                {product.originalPrice.toFixed(2)} €
              </span>
              <div className="flex items-center gap-1">
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: "#16a34a" }}
                >
                  {discountLabel}
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
      {showStock && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${hasStock ? "bg-green-500" : "bg-red-500"}`}
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
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
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

        <button
          onClick={handleAddToCart}
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-gray-50"
          style={{ color: addedFeedback ? "#16a34a" : primaryColor, borderColor: addedFeedback ? "#16a34a" : primaryColor }}
        >
          {addedFeedback ? "✓ Añadido" : `🛒 Añadir ${qty > 1 ? `${qty} uds` : "al carrito"}`}
        </button>

        <button
          onClick={handleCheckout}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          💳 Tramitar pedido
        </button>
      </div>
    </div>
  );
}
