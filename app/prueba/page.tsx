"use client";

import { useEffect, useRef, useState } from "react";

type CartItem = {
  id_product: number;
  qty: number;
  id_product_attribute: number;
  name?: string;
};

const PS_BASE = "https://b2b.esgas.es";

export default function PruebaPage() {
  const [status, setStatus] = useState<"idle" | "adding">("idle");
  const [lastAdded, setLastAdded] = useState<CartItem | null>(null);
  const [tokenStatus, setTokenStatus] = useState<"pending" | "ok" | "unavailable">("pending");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const testTokenRef = useRef<string | null>(null);

  const sendTokenToIframe = (token: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "esgas-identity-token", token },
      "*"
    );
  };

  // Fetch test token al montar (requiere HMAC_SECRET + PRESTASHOP_DEMO=1 en Vercel)
  useEffect(() => {
    fetch("/api/test-token")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.token) {
          testTokenRef.current = data.token;
          setTokenStatus("ok");
          sendTokenToIframe(data.token);
        } else {
          setTokenStatus("unavailable");
        }
      })
      .catch(() => setTokenStatus("unavailable"));
  }, []);

  // Mensajes del iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // El widget señala que está listo → reenviar token
      if (e.data?.type === "esgas-ready" && testTokenRef.current) {
        sendTokenToIframe(testTokenRef.current);
        return;
      }

      // Añadir al carrito
      if (e.data?.type !== "esgas-add-to-cart" || !Array.isArray(e.data.items)) return;

      const items = e.data.items as CartItem[];
      const first = items[0];
      if (!first) return;

      setStatus("adding");
      setLastAdded(first);

      // Confirmar al widget
      try {
        (e.source as Window)?.postMessage?.(
          { type: "esgas-cart-handled", name: first.name ?? "artículo" },
          "*"
        );
      } catch {}

      // Redirigir a PS (añade al carrito de sesión)
      const back = encodeURIComponent("/carrito?action=show");
      window.location.href =
        `${PS_BASE}/index.php?controller=cart&add=1` +
        `&id_product=${first.id_product}` +
        `&id_product_attribute=${first.id_product_attribute ?? 0}` +
        `&qty=${first.qty}` +
        `&action=add&back=${back}`;
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        🧪 Página de prueba — Chatbot ESGAS
      </h1>
      <p style={{ color: "#555", fontSize: "0.85rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
        Pulsa <strong>«Añadir al carrito»</strong> en el chat → redirige a b2b.esgas.es y añade a la sesión.
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
        <strong>Estado HMAC token:</strong>{" "}
        {tokenStatus === "ok" && (
          <span style={{ color: "#16a34a", fontWeight: 600 }}>✅ Activo — precios B2B habilitados</span>
        )}
        {tokenStatus === "unavailable" && (
          <span style={{ color: "#92400e" }}>
            ⚠️ No disponible — configura{" "}
            <code style={{ background: "#fef3c7", padding: "0 3px", borderRadius: 3 }}>HMAC_SECRET</code>
            {" "}+{" "}
            <code style={{ background: "#fef3c7", padding: "0 3px", borderRadius: 3 }}>PRESTASHOP_DEMO=1</code>
            {" "}en Vercel para precios B2B
          </span>
        )}
        {tokenStatus === "pending" && <span>Cargando…</span>}
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
            <li>Esta página redirige a PS y añade el artículo a tu sesión</li>
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
            <p style={{ fontWeight: 700, color: "#1d4ed8", margin: 0 }}>Redirigiendo a PrestaShop…</p>
            <p style={{ color: "#3b82f6", fontSize: "0.8rem", margin: "0.25rem 0 0" }}>
              {lastAdded.name ?? `Producto #${lastAdded.id_product}`} × {lastAdded.qty} uds
            </p>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <iframe
        ref={iframeRef}
        src="/embed"
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
