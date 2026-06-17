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
  const [received, setReceived] = useState<CartItem[] | null>(null);
  const [embedEmail, setEmbedEmail] = useState(TEST_EMAIL);

  useEffect(() => {
    // Permite cambiar el email de prueba via ?email= en la URL
    const params = new URLSearchParams(window.location.search);
    const e = params.get("email");
    if (e && e.includes("@")) setEmbedEmail(e);
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "esgas-add-to-cart" && Array.isArray(e.data.items)) {
        setReceived(e.data.items);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const embedSrc = `/embed?email=${encodeURIComponent(embedEmail)}`;

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        🧪 Página de prueba — Chatbot ESGAS
      </h1>
      <p style={{ color: "#555", fontSize: "0.85rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
        Esta página <strong>simula el entorno de producción</strong>: el chatbot corre dentro de un iframe,
        igual que estará en b2b.esgas.es. Puedes probar el flujo completo incluyendo «Tramitar pedido».
      </p>

      <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "1.5rem", fontSize: "0.8rem", color: "#475569" }}>
        <strong>Email de prueba:</strong> <code style={{ background: "#e2e8f0", padding: "1px 5px", borderRadius: 4 }}>{embedEmail}</code>
        <span style={{ marginLeft: 12 }}>·</span>
        <span style={{ marginLeft: 12 }}>Cambia con <code style={{ background: "#e2e8f0", padding: "1px 5px", borderRadius: 4 }}>?email=otro@correo.com</code> en la URL</span>
      </div>

      {/* Instrucciones de prueba */}
      {!received && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.5rem", fontSize: "0.85rem", color: "#475569", lineHeight: 1.6 }}>
          <strong style={{ color: "#1e293b" }}>Pasos para probar:</strong>
          <ol style={{ margin: "0.5rem 0 0 1.25rem", padding: 0 }}>
            <li>Abre el chat (botón abajo a la derecha)</li>
            <li>Pide un rodamiento → ej: <em>"necesito rodamiento 6205"</em></li>
            <li>Pulsa <strong>🛒 Añadir al carrito</strong> en los resultados</li>
            <li>Cuando el contador aparezca, pulsa <strong>Tramitar →</strong></li>
            <li>Aquí aparecerá la confirmación ✅</li>
          </ol>
        </div>
      )}

      {/* Confirmación al recibir el postMessage */}
      {received && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "1.25rem", marginBottom: "1.5rem" }}>
          <p style={{ fontWeight: 700, color: "#15803d", margin: "0 0 0.75rem", fontSize: "1rem" }}>
            ✅ ¡Tramitar pedido funciona correctamente!
          </p>
          <p style={{ color: "#166534", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
            El chatbot enviaría estos artículos al carrito de PrestaShop:
          </p>
          <ul style={{ margin: "0 0 0.75rem 1.25rem", padding: 0, fontSize: "0.875rem", color: "#166534" }}>
            {received.map((item, i) => (
              <li key={i}>
                <strong>{item.name ?? `Producto #${item.id_product}`}</strong>
                {" — "}cantidad: {item.qty}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: "0.75rem", color: "#4ade80", margin: "0 0 1rem", background: "#dcfce7", borderRadius: 6, padding: "0.4rem 0.6rem" }}>
            En producción (b2b.esgas.es): PrestaShop recibiría este mensaje, añadiría los artículos al carrito via AJAX y llevaría al cliente directamente al pago.
          </p>
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
              onClick={() => setReceived(null)}
              style={{ background: "white", border: "1px solid #86efac", color: "#15803d", borderRadius: 8, padding: "0.5rem 1.25rem", fontSize: "0.85rem", cursor: "pointer" }}
            >
              Volver a probar
            </button>
          </div>
        </div>
      )}

      {/* iframe del chatbot — simula exactamente el entorno de producción */}
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
