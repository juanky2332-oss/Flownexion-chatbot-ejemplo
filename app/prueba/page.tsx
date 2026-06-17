"use client";

import { useEffect, useState } from "react";

type CartItem = {
  id_product: number;
  qty: number;
  id_product_attribute: number;
  name?: string;
};

const TEST_EMAIL = "juancarlos@flownexion.com";
const PS_BASE = "https://b2b.esgas.es";

export default function PruebaPage() {
  const [embedEmail, setEmbedEmail] = useState(TEST_EMAIL);
  const [status, setStatus] = useState<"idle" | "adding">("idle");
  const [lastAdded, setLastAdded] = useState<CartItem | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("email");
    if (e && e.includes("@")) setEmbedEmail(e);
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "esgas-add-to-cart" || !Array.isArray(e.data.items)) return;

      const items = e.data.items as CartItem[];
      const first = items[0];
      if (!first) return;

      setStatus("adding");
      setLastAdded(first);

      // Resetea el botón del widget
      try {
        const src = e.source as Window;
        src?.postMessage?.({ type: "esgas-cart-handled", name: first.name ?? "artículo" }, "*");
      } catch {}

      // URL nativa de PS — usa la sesión del usuario logueado, fiable al 100%
      // /index.php?controller=cart&add=1&... añade el producto y redirige a /carrito
      const back = encodeURIComponent("/carrito?action=show");
      const addUrl =
        `${PS_BASE}/index.php?controller=cart&add=1` +
        `&id_product=${first.id_product}` +
        `&id_product_attribute=${first.id_product_attribute ?? 0}` +
        `&qty=${first.qty}` +
        `&action=add` +
        `&back=${back}`;

      window.location.href = addUrl;
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
        Pulsa <strong>«Añadir al carrito»</strong> en el chat → te redirige a b2b.esgas.es
        que añade el artículo directamente a tu sesión y abre el carrito.
        <br />
        <strong style={{ color: "#0066cc" }}>Requisito: estar logueado en b2b.esgas.es.</strong>
      </p>

      <div
        style={{
          background: "#f1f5f9",
          borderRadius: 10,
          padding: "0.75rem 1rem",
          marginBottom: "1.5rem",
          fontSize: "0.8rem",
          color: "#475569",
        }}
      >
        <strong>Email de prueba:</strong>{" "}
        <code style={{ background: "#e2e8f0", padding: "1px 5px", borderRadius: 4 }}>
          {embedEmail}
        </code>
        <span style={{ marginLeft: 12 }}>·</span>
        <span style={{ marginLeft: 12 }}>
          Cambia con{" "}
          <code style={{ background: "#e2e8f0", padding: "1px 5px", borderRadius: 4 }}>
            ?email=otro@correo.com
          </code>
        </span>
      </div>

      {status === "idle" && (
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            fontSize: "0.85rem",
            color: "#475569",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "#1e293b" }}>Pasos:</strong>
          <ol style={{ margin: "0.5rem 0 0 1.25rem", padding: 0 }}>
            <li>Inicia sesión en b2b.esgas.es en otra pestaña</li>
            <li>Abre el chat (botón abajo a la derecha)</li>
            <li>Pide un rodamiento y pulsa 🛒 Añadir al carrito</li>
            <li>Esta página te redirige a PS → el artículo aparece en el carrito</li>
          </ol>
        </div>
      )}

      {status === "adding" && lastAdded && (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #93c5fd",
            borderRadius: 12,
            padding: "1.25rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              border: "3px solid #3b82f6",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
              flexShrink: 0,
            }}
          />
          <div>
            <p style={{ fontWeight: 700, color: "#1d4ed8", margin: 0 }}>
              Redirigiendo a PrestaShop…
            </p>
            <p style={{ color: "#3b82f6", fontSize: "0.8rem", margin: "0.25rem 0 0" }}>
              {lastAdded.name ?? `Producto #${lastAdded.id_product}`} × {lastAdded.qty} uds
            </p>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

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
