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
  const [added, setAdded] = useState(false);

  const changeQty = (delta: number) => setQty((prev) => Math.max(1, prev + delta));

  // URL real de PS con la cantidad seleccionada
  const cartUrl = product.cartLink.replace(/qty=\d+/, `qty=${qty}`);

  const hasDiscount = product.discountPct != null && product.discountPct > 0;

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

        {/* Precio — con o sin descuento B2B */}
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
        {/* Ficha técnica */}
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 transition"
          style={{ color: primaryColor, borderColor: primaryColor }}
        >
          🔗 Ficha
        </a>

        {/* Añadir al carrito: abre URL real de PS con qty correcto */}
        <a
          href={cartUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            onAddedToCart?.(product, qty);
            setAdded(true);
            setTimeout(() => setAdded(false), 2000);
          }}
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition"
          style={
            added
              ? { color: "#16a34a", borderColor: "#16a34a" }
              : { color: primaryColor, borderColor: primaryColor }
          }
        >
          {added ? "✓ Añadido" : `🛒 Añadir ${qty > 1 ? `${qty} uds` : "al carrito"}`}
        </a>

        {/* Tramitar pedido: crea carrito WS con todo lo del chat + este producto */}
        <button
          onClick={() => {
            onAddedToCart?.(product, qty);
            onCheckout?.(product, qty);
          }}
          className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          💳 Tramitar pedido
        </button>
      </div>
    </div>
  );
}
