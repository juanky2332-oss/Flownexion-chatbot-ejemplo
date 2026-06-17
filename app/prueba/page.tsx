"use client";

import { useEffect, useState } from "react";

type CartItem = {
  id_product: number;
  qty: number;
  id_product_attribute: number;
  name?: string;
};

const TEST_EMAIL = "juancarlos@flownexion.com";

export default function PruebaPage() {
  const [embedEmail, setEmbedEmail] = useState(TEST_EMAIL);
  const [status, setStatus] = useState<"idle" | "adding" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
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

      // Confirma al widget para resetear el botón
      try {
        const src = e.source as Window;
        src?.postMessage?.({ type: "esgas-cart-handled", name: first.name ?? "artículo" }, "*");
      } catch {}

      // Añade al carrito real de PS vía WS API
      fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.id_product,
            qty: item.qty,
            idProductAttribute: item.id_product_attribute ?? 0,
          })),
        }),
      })
        .then((r) => r.json())
        .then((data: { cartId?: string; cartUrl?: string; error?: string }) => {
          if (data.cartUrl) {
            // Recovery URL → PS merges cart with user session
            window.location.href = data.cartUrl;
          } else if (data.cartId) {
            window.location.href = "https://b2b.esgas.es/carrito?action=show";
          } else {
            setStatus("error");
            setErrorMsg(data.error ?? "No se pudo crear el carrito en PrestaShop");
          }
        })
        .catch((err) => {
          setStatus("error");
          setErrorMsg(String(err));
        });
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
        Simula el entorno de producción. Al pulsar{" "}
        <strong>«Añadir al carrito»</strong> en el chat, esta página llama a la API de
        PrestaShop y te redirige al carrito real en b2b.esgas.es.
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
        <code style={{ background: "#e2e8f0", padding: "1px 5px", borderRadius: 4 }}>{embedEmail}</code>
        <span style={{ marginLeft: 12 }}>·</span>
        <span style={{ marginLeft: 12 }}>
          Cambia con{" "}
          <code style={{ background: "#e2e8f0", padding: "1px 5px", borderRadius: 4 }}>
            ?email=otro@correo.com
          </code>
        </span>
      </div>

      {/* Instrucciones */}
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
          <strong style={{ color: "#1e293b" }}>Pasos para probar:</strong>
          <ol style={{ margin: "0.5rem 0 0 1.25rem", padding: 0 }}>
            <li>Abre el chat (botón abajo a la derecha)</li>
            <li>
              Pide un rodamiento → ej: <em>«necesito rodamiento 6205»</em>
            </li>
            <li>Ajusta la cantidad y pulsa 🛒 Añadir al carrito</li>
            <li>Esta página llama a la API de PS y te lleva al carrito real</li>
          </ol>
        </div>
      )}

      {/* Añadiendo... */}
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
              Añadiendo al carrito de PrestaShop…
            </p>
            <p style={{ color: "#3b82f6", fontSize: "0.8rem", margin: "0.25rem 0 0" }}>
              {lastAdded.name ?? `Producto #${lastAdded.id_product}`} × {lastAdded.qty} uds
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: 12,
            padding: "1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          <p style={{ fontWeight: 700, color: "#dc2626", margin: "0 0 0.5rem" }}>
            ❌ Error al añadir al carrito
          </p>
          {errorMsg && (
            <p style={{ color: "#b91c1c", fontSize: "0.8rem", margin: "0 0 0.75rem" }}>
              {errorMsg}
            </p>
          )}
          <p style={{ color: "#7f1d1d", fontSize: "0.75rem", margin: "0 0 0.75rem" }}>
            Comprueba que las variables de entorno PRESTASHOP_BASE_URL y PRESTASHOP_API_KEY
            están configuradas en Vercel.
          </p>
          <button
            onClick={() => { setStatus("idle"); setErrorMsg(""); setLastAdded(null); }}
            style={{
              background: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: "0.5rem 1.25rem",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

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
