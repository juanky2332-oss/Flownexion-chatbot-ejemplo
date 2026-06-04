"use client";

// ─────────────────────────────────────────────────────────────
// Tarjeta de producto embebible dentro de un mensaje del chat.
// NO importa nada de lib/prestashop (la API key vive solo en server).
// ─────────────────────────────────────────────────────────────

import type { Product } from "@/lib/types";

interface ProductCardProps {
  product: Product & { stock?: number };
  primaryColor?: string;
}

export default function ProductCard({
  product,
  primaryColor = "#0066cc",
}: ProductCardProps) {
  const hasStock = product.stock === undefined ? true : product.stock > 0;

  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            📦 {product.name}
          </p>
          {product.reference && (
            <p className="truncate text-xs text-gray-500">
              Ref: {product.reference}
            </p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {product.price.toFixed(2)} €
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1 text-xs">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            hasStock ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className={hasStock ? "text-green-700" : "text-red-600"}>
          {product.stock !== undefined
            ? hasStock
              ? `${product.stock} uds en stock`
              : "Sin stock"
            : "Consultar stock"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border px-2.5 py-1 text-xs font-medium transition hover:bg-gray-50"
          style={{ color: primaryColor, borderColor: primaryColor }}
        >
          🔗 Ver ficha
        </a>
        <a
          href={product.cartLink}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          🛒 Añadir al carrito
        </a>
      </div>
    </div>
  );
}
