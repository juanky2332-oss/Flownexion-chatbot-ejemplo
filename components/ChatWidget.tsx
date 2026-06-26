"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message, Product, CartItem } from "@/lib/types";
import ChatBubble, { type ChatMessage } from "./ChatBubble";
import RealisticRobot from "./RealisticRobot";

export interface ChatWidgetProps {
  logoUrl?: string;
  primaryColor?: string;
  webhookUrl?: string;
  companyName?: string;
  startOpen?: boolean;
  /** Si true, muestra pantalla de bloqueo cuando no hay token HMAC válido (modo producción). */
  requireAuth?: boolean;
}

const WELCOME =
  "¡Hola! 👋 Soy **Carlos**, tu asesor técnico de ESGAS, distribuidor oficial **NTN/SNR**.\n\nDime qué rodamiento o suministro necesitas y te ayudo a encontrarlo al mejor precio. ¿En qué estás trabajando?";

const LOGIN_URL = "https://b2b.esgas.es/iniciar-sesion";
const CART_PAGE = "https://b2b.esgas.es/carrito?action=show";
const PS_BASE   = "https://b2b.esgas.es";

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function detectIframe(): boolean {
  try { return window.top !== window.self; } catch { return true; }
}

function decodeTokenEmail(token: string): string | null {
  try {
    const lastDot = token.lastIndexOf(".");
    if (lastDot <= 0) return null;
    const payload = JSON.parse(atob(token.slice(0, lastDot)));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export default function ChatWidget({
  logoUrl,
  primaryColor = "#0066cc",
  webhookUrl = "/api/chat",
  companyName = "ESGAS",
  startOpen = false,
  requireAuth = false,
}: ChatWidgetProps) {
  const [open, setOpen] = useState(startOpen);
  const [sessionId, setSessionId] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: WELCOME },
  ]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [fallbackLinks, setFallbackLinks] = useState<{ name: string; qty: number; url: string }[] | null>(null);
  const [cartConfirmed, setCartConfirmed] = useState<string | null>(null);

  const [identityToken, setIdentityToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSessionId(uid()); }, []);

  useEffect(() => {
    const inIframe = detectIframe();
    setIsInIframe(inIframe);

    if (inIframe) {
      window.parent.postMessage({ type: "esgas-ready" }, "*");
      const retry = setTimeout(() => window.parent.postMessage({ type: "esgas-ready" }, "*"), 300);
      const timeout = setTimeout(() => setTokenChecked(true), 800);
      return () => { clearTimeout(retry); clearTimeout(timeout); };
    } else {
      setTokenChecked(true);
    }
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "esgas-identity-token" && typeof event.data.token === "string") {
        setIdentityToken(event.data.token);
        setTokenChecked(true);
      }
      if (event.data?.type === "esgas-cart-handled") {
        setCartConfirmed(event.data.name ?? "artículo");
        setTimeout(() => setCartConfirmed(null), 2500);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    window.parent.postMessage({ type: "esgas-chat", open }, "*");
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open, fallbackLinks, cartConfirmed]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const isLocked = requireAuth && isInIframe && tokenChecked && !identityToken;
  const tokenEmail = identityToken ? decodeTokenEmail(identityToken) : null;

  const handleCheckout = useCallback(
    async (singleProduct?: Product, singleQty?: number) => {
      setFallbackLinks(null);

      if (!singleProduct) {
        if (detectIframe()) {
          try { if (window.top && window.top !== window) window.top.location.href = CART_PAGE; } catch {}
        } else {
          window.open(CART_PAGE, "_blank", "noopener,noreferrer");
        }
        return;
      }

      setIsCheckingOut(true);

      const item = {
        productId: singleProduct.id,
        qty: singleQty ?? 1,
        idProductAttribute: singleProduct.idProductAttribute ?? 0,
      };

      // En iframe: delega al padre vía postMessage
      if (detectIframe()) {
        window.parent.postMessage(
          {
            type: "esgas-add-to-cart",
            items: [{
              id_product: item.productId,
              qty: item.qty,
              id_product_attribute: item.idProductAttribute,
              name: singleProduct.name,
            }],
          },
          "*"
        );
        setIsCheckingOut(false);
        return;
      }

      // Standalone: URL nativa de PS para añadir al carrito (funciona con sesión activa)
      const psCartUrl =
        `${PS_BASE}/index.php?controller=cart&add=1` +
        `&id_product=${item.productId}` +
        `&id_product_attribute=${item.idProductAttribute}` +
        `&qty=${item.qty}` +
        `&action=add` +
        `&back=${encodeURIComponent("/carrito")}`;

      try {
        // Intento silencioso vía addchat.php (funciona si la sesión PS comparte cookies)
        const res = await fetch(
          `${PS_BASE}/addchat.php` +
          `?id_product=${item.productId}` +
          `&id_product_attribute=${item.idProductAttribute}` +
          `&qty=${item.qty}`,
          { credentials: "include" }
        );
        const data: { ok?: boolean } = await res.json().catch(() => ({}));
        if (data.ok) {
          setCartConfirmed(singleProduct.name);
          setTimeout(() => setCartConfirmed(null), 3000);
        } else {
          // addchat.php no pudo añadir → abrir URL nativa PS en nueva pestaña
          window.open(psCartUrl, "_blank");
        }
      } catch {
        // Error de red o CORS → abrir URL nativa PS en nueva pestaña
        window.open(psCartUrl, "_blank");
      } finally {
        setIsCheckingOut(false);
      }
    },
    []
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || isLocked) return;

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const history: Message[] = [...messages, userMsg]
      .filter((m) => m.id !== "welcome")
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          history,
          ...(identityToken ? { identityToken } : {}),
        }),
      });
      const data: { output?: string; products?: Product[] } = await res.json().catch(() => ({}));

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: data.output ?? "Lo siento, no he podido procesar tu consulta. Inténtalo de nuevo.",
          products: data.products,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: "Ha habido un problema de conexión. ¿Puedes intentarlo de nuevo?" },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, isLocked, messages, sessionId, webhookUrl, identityToken]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[2147483000] flex flex-col items-end font-sans">
      {open && (
        <div
          className="mb-3 flex h-[600px] w-[400px] max-w-[calc(100vw-2rem)] origin-bottom-right animate-scale-in flex-col overflow-hidden rounded-2xl bg-gray-50 shadow-2xl ring-1 ring-black/5 max-[420px]:h-[80vh]"
          role="dialog"
          aria-label={`Chat con Carlos de ${companyName}`}
        >
          <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: primaryColor }}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 ring-2 ring-white/30">
              {logoUrl
                ? <img src={logoUrl} alt={companyName} className="h-8 w-8 object-contain" />
                : <RealisticRobot size={34} onlyHead />
              }
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Carlos · Asesor Técnico {companyName}</p>
              <div className="flex items-center gap-1.5 text-xs text-white/90">
                <span className={`inline-block h-2 w-2 rounded-full ${
                  isLocked ? "bg-red-400"
                  : identityToken ? "bg-green-400"
                  : tokenChecked ? "bg-yellow-300"
                  : "animate-pulse bg-yellow-400"
                }`} />
                {isLocked
                  ? <span>Acceso restringido</span>
                  : identityToken && tokenEmail
                    ? <span className="truncate">{tokenEmail} · B2B</span>
                    : tokenChecked
                      ? <span>Demo</span>
                      : <span>Identificando…</span>
                }
              </div>
            </div>

            <a
              href={CART_PAGE}
              target="_top"
              rel="noopener noreferrer"
              title="Ver carrito"
              className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold transition hover:bg-white/30"
            >
              🛒 Carrito
            </a>

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

          {isLocked ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-3xl">🔒</div>
              <div>
                <p className="font-semibold text-gray-800">Acceso exclusivo para clientes B2B</p>
                <p className="mt-1.5 text-sm text-gray-500">
                  Debes iniciar sesión en el portal para acceder al asistente técnico y ver tus precios personalizados.
                </p>
              </div>
              <a
                href={LOGIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                Iniciar sesión en b2b.esgas.es →
              </a>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
                {messages.map((m) => (
                  <ChatBubble
                    key={m.id}
                    message={m}
                    primaryColor={primaryColor}
                    onCheckout={handleCheckout}
                  />
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3 shadow-sm">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="h-2 w-2 animate-typing-bounce rounded-full bg-gray-400" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                )}
                {cartConfirmed && (
                  <div className="flex justify-center">
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                      ✅ Añadido al carrito · {cartConfirmed}
                    </span>
                  </div>
                )}
              </div>

              {fallbackLinks && (
                <div className="border-t border-amber-200 bg-amber-50 px-4 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-semibold text-amber-800">📋 Abre la ficha y añade desde la web</p>
                    <button onClick={() => setFallbackLinks(null)} className="text-amber-600 text-sm leading-none">✕</button>
                  </div>
                  <div className="space-y-1">
                    {fallbackLinks.map((link, i) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50 transition"
                      >
                        <span>{link.name}</span>
                        <span className="text-amber-500 text-[10px]">Ver ficha →</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

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
                      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                    </svg>
                  </button>
                </div>
                <p className="mt-1.5 text-center text-[10px] text-gray-400">
                  {companyName} · Distribuidor oficial NTN/SNR
                </p>
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Cerrar chat" : "Abrir chat con Carlos"}
        className="relative flex h-16 w-16 items-center justify-center rounded-full text-white shadow-xl ring-4 ring-white/40 transition-transform duration-200 hover:scale-105 active:scale-95"
        style={{ backgroundColor: primaryColor }}
      >
        {open ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : logoUrl ? (
          <img src={logoUrl} alt={companyName} className="h-10 w-10 object-contain" />
        ) : (
          <RealisticRobot size={52} isPointing />
        )}
      </button>
    </div>
  );
}
