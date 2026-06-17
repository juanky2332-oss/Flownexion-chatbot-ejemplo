"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message, Product, CartItem, PSCustomer } from "@/lib/types";
import ChatBubble, { type ChatMessage } from "./ChatBubble";
import RealisticRobot from "./RealisticRobot";

export interface ChatWidgetProps {
  logoUrl?: string;
  primaryColor?: string;
  webhookUrl?: string;
  companyName?: string;
  startOpen?: boolean;
  customerDiscount?: number;
  /** Email del cliente autenticado. Viene del portal B2B (URL param o postMessage). */
  customerEmail?: string;
}

const WELCOME =
  "¡Hola! 👋 Soy **Carlos**, tu asesor técnico de ESGAS, distribuidor oficial **NTN/SNR**.\n\nDime qué rodamiento o suministro necesitas y te ayudo a encontrarlo al mejor precio. ¿En qué estás trabajando?";

const LOGIN_URL = "https://b2b.esgas.es/iniciar-sesion";
const CART_PAGE = "https://b2b.esgas.es/carrito?action=show";
const SHIPPING_THRESHOLD = 80;

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

/** True cuando el widget corre dentro de un iframe (producción en b2b.esgas.es) */
function detectIframe(): boolean {
  try { return window.top !== window.self; } catch { return true; }
}

export default function ChatWidget({
  logoUrl,
  primaryColor = "#0066cc",
  webhookUrl = "/api/chat",
  companyName = "ESGAS",
  startOpen = false,
  customerDiscount,
  customerEmail,
}: ChatWidgetProps) {
  const [open, setOpen] = useState(startOpen);
  const [sessionId, setSessionId] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: WELCOME },
  ]);
  const [cartMap, setCartMap] = useState<Map<number, CartItem>>(new Map());
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [fallbackLinks, setFallbackLinks] = useState<{ name: string; qty: number; url: string }[] | null>(null);

  const [resolvedEmail, setResolvedEmail] = useState<string | undefined>(customerEmail);
  const [customer, setCustomer] = useState<PSCustomer | null>(null);
  const [authChecked, setAuthChecked] = useState(!!customerEmail);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSessionId(uid()); }, []);

  useEffect(() => {
    if (customerEmail) return;
    const t = setTimeout(() => setAuthChecked(true), 400);
    return () => clearTimeout(t);
  }, [customerEmail]);

  useEffect(() => {
    if (customerEmail) {
      setResolvedEmail(customerEmail);
      setAuthChecked(true);
    }
  }, [customerEmail]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.data?.type === "esgas-customer" &&
        typeof event.data.email === "string" &&
        event.data.email.includes("@")
      ) {
        setResolvedEmail(event.data.email);
        setAuthChecked(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!resolvedEmail) return;
    const cached = (() => {
      try { return JSON.parse(localStorage.getItem("esgas-customer") ?? "null") as PSCustomer | null; }
      catch { return null; }
    })();
    if (cached?.email?.toLowerCase() === resolvedEmail.toLowerCase()) {
      setCustomer(cached);
      return;
    }
    setCustomer(null);
    localStorage.removeItem("esgas-customer");
    fetch(`/api/customer?email=${encodeURIComponent(resolvedEmail)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: PSCustomer | null) => {
        if (data?.id) {
          setCustomer(data);
          localStorage.setItem("esgas-customer", JSON.stringify(data));
        }
      })
      .catch(() => {});
  }, [resolvedEmail]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open, fallbackLinks]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    window.parent.postMessage({ type: "esgas-chat", open }, "*");
  }, [open]);

  const isLocked = authChecked && !resolvedEmail;

  const totalCartUnits = Array.from(cartMap.values()).reduce((s, i) => s + i.qty, 0);
  const totalCartPrice = Array.from(cartMap.values()).reduce(
    (s, i) => s + i.product.price * i.qty, 0
  );

  const handleAddedToCart = useCallback(
    (product: Product, qty: number) => {
      setCartMap((prev) => {
        const next = new Map(prev);
        next.set(product.id, { product, qty });
        return next;
      });
    },
    []
  );

  const handleCheckout = useCallback(
    async (singleProduct?: Product, singleQty?: number) => {
      setFallbackLinks(null);
      setIsCheckingOut(true);

      const allItems = Array.from(cartMap.values()).map((i) => ({
        productId: i.product.id,
        qty: i.qty,
        idProductAttribute: i.product.idProductAttribute ?? 0,
      }));
      if (singleProduct && !cartMap.has(singleProduct.id)) {
        allItems.push({
          productId: singleProduct.id,
          qty: singleQty ?? 1,
          idProductAttribute: singleProduct.idProductAttribute ?? 0,
        });
      }

      const fullItems = Array.from(cartMap.values());
      if (singleProduct && !cartMap.has(singleProduct.id)) {
        fullItems.push({ product: singleProduct, qty: singleQty ?? 1 });
      }

      if (!allItems.length) {
        window.open(CART_PAGE, "_blank", "noopener,noreferrer");
        setIsCheckingOut(false);
        return;
      }

      // ── PRODUCCIÓN (iframe dentro de b2b.esgas.es) ────────────────────────
      // Envía los artículos al padre vía postMessage. El script del tema PS los
      // añade al carrito con el token de sesión nativo y luego navega al carrito.
      if (detectIframe()) {
        window.parent.postMessage(
          {
            type: "esgas-add-to-cart",
            items: allItems.map((i) => ({
              id_product: i.productId,
              qty: i.qty,
              id_product_attribute: i.idProductAttribute ?? 0,
            })),
          },
          "*"
        );
        // Fallback: si el script PS aún no está instalado, navegar después de 2s
        setTimeout(() => {
          try {
            if (window.top && window.top !== window) window.top.location.href = CART_PAGE;
          } catch { /* ignorar */ }
        }, 2000);
        setIsCheckingOut(false);
        return;
      }

      // ── PRUEBAS (standalone Vercel, sin iframe) ───────────────────────────
      // Intenta crear el carrito vía WS. Si funciona → abre recovery URL.
      // Si no → muestra fichas de producto para añadir manualmente.
      try {
        const res = await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: allItems,
            ...(customer?.id ? { customerId: customer.id } : {}),
            ...(customer?.secureKey ? { customerSecureKey: customer.secureKey } : {}),
          }),
        });
        const data: { cartId?: string; cartUrl?: string } =
          await res.json().catch(() => ({}));

        if (data.cartId) {
          window.open(data.cartUrl || CART_PAGE, "_blank", "noopener,noreferrer");
        } else {
          setFallbackLinks(
            fullItems.map((item) => ({
              name: `${item.product.name} × ${item.qty}`,
              qty: item.qty,
              url: item.product.link,
            }))
          );
        }
      } catch {
        setFallbackLinks(
          fullItems.map((item) => ({
            name: `${item.product.name} × ${item.qty}`,
            qty: item.qty,
            url: item.product.link,
          }))
        );
      } finally {
        setIsCheckingOut(false);
      }
    },
    [cartMap, customer]
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

    const cart: CartItem[] = Array.from(cartMap.values());

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          history,
          ...(customerDiscount ? { customerDiscount } : {}),
          ...(customer?.groupId ? { customerGroupId: customer.groupId } : {}),
          ...(cart.length > 0 ? { cart } : {}),
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
  }, [input, loading, isLocked, messages, sessionId, webhookUrl, customerDiscount, customer, cartMap]);

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
          {/* Header */}
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
                <span className={`inline-block h-2 w-2 rounded-full ${isLocked ? "bg-red-400" : "animate-pulse bg-green-400"}`} />
                {customer
                  ? <span>{customer.firstName} {customer.lastName} · B2B</span>
                  : isLocked
                    ? <span>Acceso restringido</span>
                    : <span>Identificando…</span>
                }
              </div>
            </div>

            {!isLocked && totalCartUnits > 0 && (
              <button
                onClick={() => handleCheckout()}
                disabled={isCheckingOut}
                title="Tramitar pedido"
                className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold transition hover:bg-white/30 disabled:opacity-60"
              >
                🛒 {totalCartUnits}
              </button>
            )}

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

          {/* Pantalla bloqueada */}
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
              {/* Mensajes */}
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
                {messages.map((m) => (
                  <ChatBubble
                    key={m.id}
                    message={m}
                    primaryColor={primaryColor}
                    onAddedToCart={handleAddedToCart}
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
              </div>

              {/* Panel de carrito */}
              {totalCartUnits > 0 && (
                <div className="border-t border-green-100 bg-green-50 px-4 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-green-800">
                        🛒 {totalCartUnits} artículo{totalCartUnits !== 1 ? "s" : ""} · {totalCartPrice.toFixed(2)} €
                      </p>
                      {totalCartPrice > 0 && totalCartPrice < SHIPPING_THRESHOLD && (
                        <p className="text-[10px] text-amber-700">
                          Añade {(SHIPPING_THRESHOLD - totalCartPrice).toFixed(2)} € más para envío gratis
                        </p>
                      )}
                      {totalCartPrice >= SHIPPING_THRESHOLD && (
                        <p className="text-[10px] text-green-700">✓ Envío gratuito disponible</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleCheckout()}
                      disabled={isCheckingOut}
                      className="ml-3 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60 flex-shrink-0"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {isCheckingOut ? "..." : "Tramitar →"}
                    </button>
                  </div>
                </div>
              )}

              {/* Panel fallback (modo prueba standalone) */}
              {fallbackLinks && (
                <div className="border-t border-amber-200 bg-amber-50 px-4 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-semibold text-amber-800">
                      📋 Modo prueba — abre cada ficha para añadir al carrito
                    </p>
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
                  <p className="mt-1 text-[9px] text-amber-600">En producción (integrado en b2b.esgas.es) el carrito se rellena automáticamente</p>
                </div>
              )}

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

      {/* Botón flotante */}
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

        {!open && totalCartUnits > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
            {totalCartUnits > 99 ? "99+" : totalCartUnits}
          </span>
        )}
      </button>
    </div>
  );
}
