"use client";

// ─────────────────────────────────────────────────────────────
// Widget de chat embebible de ESGAS — "Carlos, Asesor Técnico".
// Botón flotante + ventana de chat. Habla con /api/chat.
//
// NO importa lib/prestashop ni usa la API key: todo pasa por /api/chat.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message, Product } from "@/lib/types";
import ChatBubble, { type ChatMessage } from "./ChatBubble";
import RealisticRobot from "./RealisticRobot";

export interface ChatWidgetProps {
  /**
   * URL de un logo personalizado. Si se deja vacío se usa el robot de
   * marca de ESGAS (el mismo logo de la página).
   */
  logoUrl?: string;
  /** Color principal de la marca. */
  primaryColor?: string;
  /** Endpoint del chat. Por defecto /api/chat. */
  webhookUrl?: string;
  /** Nombre de la empresa. */
  companyName?: string;
  /** Si true, el widget arranca abierto (útil para la demo de la home). */
  startOpen?: boolean;
}

const WELCOME =
  "¡Hola! 👋 Soy **Carlos**, tu asesor técnico de ESGAS, distribuidor oficial **NTN/SNR**.\n\nDime qué rodamiento o suministro necesitas y te ayudo a encontrarlo al mejor precio. ¿En qué estás trabajando?";

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export default function ChatWidget({
  logoUrl,
  primaryColor = "#0066cc",
  webhookUrl = "/api/chat",
  companyName = "ESGAS",
  startOpen = false,
}: ChatWidgetProps) {
  const [open, setOpen] = useState(startOpen);
  const [sessionId, setSessionId] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: WELCOME },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Genera el sessionId al montar (memoria del componente, no localStorage).
  useEffect(() => {
    setSessionId(uid());
  }, []);

  // Auto-scroll al último mensaje.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Si vivimos dentro de un iframe (embed en Prestashop), avisamos al
  // contenedor para que redimensione el iframe según abierto/cerrado.
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    window.parent.postMessage({ type: "esgas-chat", open }, "*");
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Historial (sin el mensaje de bienvenida) limitado a 10 turnos / 20 mensajes.
    const history: Message[] = [...messages, userMsg]
      .filter((m) => m.id !== "welcome")
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId, history }),
      });
      const data: { output?: string; products?: Product[] } = await res
        .json()
        .catch(() => ({}));

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content:
            data.output ??
            "Lo siento, no he podido procesar tu consulta. Inténtalo de nuevo.",
          products: data.products,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content:
            "Ha habido un problema de conexión. ¿Puedes intentarlo de nuevo?",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, sessionId, webhookUrl]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[2147483000] flex flex-col items-end font-sans">
      {/* Ventana de chat */}
      {open && (
        <div
          className="mb-3 flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] origin-bottom-right animate-scale-in flex-col overflow-hidden rounded-2xl bg-gray-50 shadow-2xl ring-1 ring-black/5 max-[420px]:h-[80vh]"
          role="dialog"
          aria-label={`Chat con Carlos de ${companyName}`}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 ring-2 ring-white/30">
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logoUrl} alt={companyName} className="h-8 w-8 object-contain" />
              ) : (
                <RealisticRobot size={34} onlyHead />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                Carlos · Asesor Técnico {companyName}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-white/90">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
                En línea
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar chat"
              className="rounded-full p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} primaryColor={primaryColor} />
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3 shadow-sm">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-2 w-2 animate-typing-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 bg-white p-3">
            <div className="flex items-end gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Escribe tu consulta técnica…"
                disabled={loading}
                className="flex-1 rounded-full border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-transparent focus:ring-2 disabled:opacity-60"
                style={{ ["--tw-ring-color" as any]: primaryColor }}
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                aria-label="Enviar mensaje"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: primaryColor }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-gray-400">
              {companyName} · Distribuidor oficial NTN/SNR
            </p>
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Cerrar chat" : "Abrir chat con Carlos"}
        className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-xl ring-4 ring-white/40 transition-transform duration-200 hover:scale-105 active:scale-95"
        style={{ backgroundColor: primaryColor }}
      >
        {open ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={companyName} className="h-10 w-10 object-contain" />
        ) : (
          <RealisticRobot size={42} onlyHead />
        )}
      </button>
    </div>
  );
}
