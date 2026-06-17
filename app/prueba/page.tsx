"use client";

import { useEffect, useState } from "react";

type CartItem = {
  id_product: number;
  qty: number;
  id_product_attribute: number;
  name?: string;
};

const TEST_EMAIL = "juancarlos@flownexion.com";
const PS_CART = "https://b2b.esgas.es/carrito?action=show";

export default function PruebaPage() {
  const [addedItems, setAddedItems] = useState<CartItem[]>([]);
  const [embedEmail, setEmbedEmail] = useState(TEST_EMAIL);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("email");
    if (e && e.includes("@")) setEmbedEmail(e);
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "esgas-add-to-cart" && Array.isArray(e.data.items)) {
        // Acumula todos los productos añadidos en la sesión de prueba
        setAddedItems((prev) => {
          const next = [...prev];
          for (const item of e.data.items as CartItem[]) {
            const existing = next.findIndex((i) => i.id_product === item.id_product);
            if (existing >= 0) {
              next[existing] = { ...next[existing], qty: next[existing].qty + item.qty };
            } else {
              next.push(item);
            }
          }
          return next;
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const embedSrc = `/embed?email=${encodeURIComponent(embedEmail)}`;
  const totalUnits = addedItems.reduce((s, i) => s + i.qty, 0);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        🧪 Página de prueba — Chatbot ESGAS
      </h1>
      <p style={{ color: "#555", fontSize: "0.85rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
        Simula el entorno de producción: el chatbot corre en un iframe igual que en b2b.esgas.es.
        Cada <strong>«Añadir al carrito»</strong> envía el producto al carrito PS vía postMessage
        y navega a la página del carrito.
      </p>

      <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "1.5rem", fontSize: "0.8rem", color: "#475569" }}>
        <strong>Email de prueba:</strong>{" "}
        <code style={{ background: "#e2e8f0", padding: "1px 5px", borderRadius: 4 }}>{embedEmail}</code>
        <span style={{ marginLeft: 12 }}>·</span>
        <span style={{ marginLeft: 12 }}>Cambia con{" "}
          <code style={{ background: "#e2e8f0", padding: "1px 5px", borderRadius: 4 }}>?email=otro@correo.com</code>
        </span>
      </div>

      {/* Instrucciones */}
      {addedItems.length === 0 && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.5rem", fontSize: "0.85rem", color: "#475569", lineHeight: 1.6 }}>
          <strong style={{ color: "#1e293b" }}>Pasos para probar:</strong>
          <ol style={{ margin: "0.5rem 0 0 1.25rem", padding: 0 }}>
            <li>Abre el chat (botón abajo a la derecha)</li>
            <li>Pide un rodamiento → ej: <em>«necesito rodamiento 6205»</em></li>
            <li>Ajusta la cantidad y pulsa <strong>🛒 Añadir al carrito</strong></li>
            <li>Aquí aparecerá la confirmación ✅ y podrías seguir añadiendo más</li>
          </ol>
        </div>
      )}

      {/* Panel de confirmación — se actualiza con cada "Añadir" */}
      {addedItems.length > 0 && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "1.25rem", marginBottom: "1.5rem" }}>
          <p style={{ fontWeight: 700, color: "#15803d", margin: "0 0 0.5rem", fontSize: "1rem" }}>
            ✅ postMessage recibido — {totalUnits} ud{totalUnits !== 1 ? "s" : ""} añadida{totalUnits !== 1 ? "s" : ""}
          </p>
          <p style={{ color: "#166534", fontSize: "0.8rem", margin: "0 0 0.5rem" }}>
            Artículos que se añadirían al carrito de PrestaShop:
          </p>
          <ul style={{ margin: "0 0 0.75rem 1.25rem", padding: 0, fontSize: "0.875rem", color: "#166534" }}>
            {addedItems.map((item, i) => (
              <li key={i}>
                <strong>{item.name ?? `Producto #${item.id_product}`}</strong>
                {" — "}cantidad: {item.qty}
              </li>
            ))}
          </ul>
          <div style={{ background: "#dcfce7", borderRadius: 6, padding: "0.4rem 0.6rem", fontSize: "0.75rem", color: "#15803d", marginBottom: "0.75rem" }}>
            En producción (b2b.esgas.es): PrestaShop añade cada artículo al carrito via AJAX y navega a /carrito automáticamente.
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a
              href={PS_CART}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", background: "#0066cc", color: "white", borderRadius: 8, padding: "0.5rem 1.25rem", fontSize: "0.85rem", fontWeight: 600, textDecoration: "none" }}
            >
              Ver carrito en b2b.esgas.es →
            </a>
            <button
              onClick={() => setAddedItems([])}
              style={{ background: "white", border: "1px solid #86efac", color: "#15803d", borderRadius: 8, padding: "0.5rem 1.25rem", fontSize: "0.85rem", cursor: "pointer" }}
            >
              Limpiar sesión
            </button>
          </div>
        </div>
      )}

      {/* iframe del chatbot */}
      <iframe
        src={embedSrc}
        style={{
          position: "fixed",
          bottom: 0,
          right: 0,
          width: 450,
          height: 680,
          border: "none",
          zIndex: 9999,
          background: "transparent",
        }}
        allow="clipboard-write"
        title="Chatbot ESGAS — Prueba"
      />
    </div>
  );
}
