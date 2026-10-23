"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message, Product, CartItem } from "@/lib/types";
import type { FichaTecnica } from "@/lib/ficha";
import ChatBubble, { type ChatMessage } from "./ChatBubble";
import RealisticRobot from "./RealisticRobot";
import { CarritoChatProvider, MiniCarrito } from "./CarritoChat";
import { configurarEventos, enTienda, PS_BASE } from "@/lib/carritoTienda";

export interface ChatWidgetProps {
  logoUrl?: string;
  primaryColor?: string;
  webhookUrl?: string;
  companyName?: string;
  startOpen?: boolean;
  requireAuth?: boolean;
}

const WELCOME =
  "Hola, soy el **técnico de ESGAS**. ¿Qué rodamiento o pieza de transmisión necesitas?";

const LOGIN_URL = "https://b2b.esgas.es/iniciar-sesion";
const CART_PAGE = "https://b2b.esgas.es/carrito?action=show";


const SUPPORT_PHONE = "968 676 983";
const SUPPORT_EMAIL = "esgas@esgas.es";

const QUICK_CHIPS = [
  "¿Tenéis el 6205 LLU en stock?",
  "Necesito un rodamiento Ø25 mm interior",
  "¿Equivalente NTN al 6205-2RS1 de SKF?",
  "Busco una correa trapezoidal A 1250",
];

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

  const [identityToken, setIdentityToken] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  // E-mail del cliente que publica la tienda (window.prestashop.customer), sin
  // firmar: solo para calcular su precio mientras no esté el módulo firmado.
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [inStore, setInStore] = useState(false);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = uid();
    setSessionId(id);
    configurarEventos(id, new URL(webhookUrl, window.location.href).origin);
    setInStore(enTienda(PS_BASE));
  }, [webhookUrl]);

  useEffect(() => {
    const inIframe = detectIframe();
    setIsInIframe(inIframe);
    if (inIframe) {
      window.parent.postMessage({ type: "esgas-ready" }, "*");
      const retry   = setTimeout(() => window.parent.postMessage({ type: "esgas-ready" }, "*"), 300);
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
      if (event.data?.type === "esgas-customer-id" && typeof event.data.id === "number") {
        setCustomerId(event.data.id);
        setTokenChecked(true);
      }
      if (event.data?.type === "esgas-customer" && event.origin === new URL(PS_BASE).origin) {
        if (typeof event.data.email === "string" && event.data.email) setCustomerEmail(event.data.email);
        if (typeof event.data.id === "number" && event.data.id > 0) setCustomerId(event.data.id);
        setTokenChecked(true);
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
  }, [messages, loading, open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // Al abrir el chat, la tienda empieza a preparar el índice del catálogo
  // mientras el cliente escribe (una vez por visita).
  const calentado = useRef(false);
  useEffect(() => {
    if (!open || calentado.current) return;
    calentado.current = true;
    fetch(new URL("/api/calentar", new URL(webhookUrl, window.location.href)).toString(), { method: "POST", keepalive: true }).catch(() => undefined);
  }, [open, webhookUrl]);

  // Permite abrir el chat desde fuera del widget (p.ej. el robot grande del
  // hero de la landing dispara este evento al pincharlo).
  useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener("esgas-open-chat", openChat);
    return () => window.removeEventListener("esgas-open-chat", openChat);
  }, []);

  const isLocked   = requireAuth && isInIframe && tokenChecked && !identityToken && !customerId && !customerEmail;
  const tokenEmail = identityToken ? decodeTokenEmail(identityToken) : customerEmail;
  const isIdentified = Boolean(identityToken || customerId || customerEmail);


  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText !== undefined ? overrideText : input).trim();
    if (!text || loading || isLocked) return;

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    if (overrideText === undefined) setInput("");
    setLoading(true);

    // Turnos ANTERIORES: el mensaje actual va aparte ("message"); antes iba
    // también aquí y el modelo lo recibía dos veces.
    const history: Message[] = messages
      .filter((m) => m.id !== "welcome" && !m.enCurso && m.content)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    // La respuesta se pinta según llega (streaming): primero lo que está
    // haciendo ("Consultando el catálogo…") y después el texto, palabra a
    // palabra. La versión definitiva (con tarjetas y PDF) llega al final y
    // sustituye a lo escrito.
    const botId = uid();
    setMessages((prev) => [...prev, { id: botId, role: "assistant", content: "", enCurso: true }]);
    const actualizar = (cambio: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === botId ? cambio(m) : m)));

    type Final = { output?: string; products?: Product[]; needsHuman?: boolean; humanContext?: string; fichas?: FichaTecnica[]; comparar?: boolean };
    const cerrar = (data: Final) =>
      actualizar(() => ({
        id: botId,
        role: "assistant",
        // Si el servidor no devuelve texto (error, o la plataforma corta la
        // petición), el cliente NO puede quedarse con una disculpa y nada
        // más: se le ofrece siempre el contacto.
        content:
          data.output ??
          "No he podido completar la consulta en este momento. Vuelve a intentarlo en unos segundos y, si te corre prisa, escríbenos por teléfono o e-mail y te lo resolvemos al momento.",
        products: data.products,
        fichas: data.fichas,
        comparar: data.comparar,
        needsHuman: data.needsHuman ?? !data.output,
        humanContext: data.humanContext ?? (data.output ? undefined : text.slice(0, 150)),
      }));

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({
          message: text,
          sessionId,
          history,
          stream: true,
          origen: inStore ? "tienda" : "web",
          ...(identityToken ? { identityToken } : {}),
          ...(!identityToken && customerEmail ? { customerEmail } : {}),
          ...(!identityToken && customerId ? { customerId } : {}),
        }),
      });

      const esStream = (res.headers.get("content-type") ?? "").includes("ndjson") && res.body;
      if (!esStream) {
        cerrar(await res.json().catch(() => ({})));
      } else {
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buffer = "";
        let final: Final | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const linea = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!linea) continue;
            let ev: { tipo?: string; texto?: string } & Final;
            try { ev = JSON.parse(linea); } catch { continue; }
            if (ev.tipo === "estado") actualizar((m) => ({ ...m, estado: ev.texto }));
            else if (ev.tipo === "texto") actualizar((m) => ({ ...m, content: m.content + (ev.texto ?? "") }));
            else if (ev.tipo === "reinicio") actualizar((m) => ({ ...m, content: "" }));
            else if (ev.tipo === "fin") final = ev;
          }
        }
        cerrar(final ?? {});
      }
    } catch {
      actualizar(() => ({
        id: botId,
        role: "assistant",
        content:
          "Ha habido un problema de conexión. Vuelve a intentarlo, y si sigue sin ir, escríbenos por teléfono o e-mail y te atendemos al momento.",
        needsHuman: true,
        humanContext: text.slice(0, 150),
      }));
    } finally {
      setLoading(false);
    }
  }, [input, loading, isLocked, messages, sessionId, webhookUrl, identityToken, customerEmail, customerId, inStore]);

  const sendChip = useCallback((text: string) => { send(text); }, [send]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const openCart = () => {
    window.open(CART_PAGE, "_blank", "noopener,noreferrer");
  };

  return (
    <CarritoChatProvider psBase={PS_BASE}>
    <div className="fixed bottom-4 right-4 z-[2147483000] flex flex-col items-end font-sans">
      {open && (
        <div
          className="mb-3 flex h-[600px] w-[400px] max-w-[calc(100vw-2rem)] origin-bottom-right animate-scale-in flex-col overflow-hidden rounded-2xl bg-gray-50 shadow-2xl ring-1 ring-black/5 max-[420px]:h-[80vh]"
          role="dialog"
          aria-label={`Chat técnico de ${companyName}`}
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
              <p className="truncate text-sm font-semibold">Técnico {companyName}</p>
              <div className="flex items-center gap-1.5 text-xs text-white/90">
                <span className={`inline-block h-2 w-2 rounded-full ${
                  isLocked      ? "bg-red-400"
                  : isIdentified  ? "bg-green-400"
                  : tokenChecked  ? "bg-green-400"
                  : "animate-pulse bg-yellow-400"
                }`} />
                {isLocked
                  ? <span>Acceso restringido</span>
                  : tokenEmail
                    ? <span className="truncate">{tokenEmail}</span>
                    : customerId
                      ? <span>Cliente identificado</span>
                      : tokenChecked
                        ? <span>En línea</span>
                        : <span>Identificando…</span>
                }
              </div>
            </div>

            <button
              onClick={openCart}
              title="Ver carrito"
              className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold transition hover:bg-white/30 active:scale-95"
            >
              🛒 Carrito
            </button>

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

          {!isLocked && <MiniCarrito primaryColor={primaryColor} enLaTienda={inStore} cliente={tokenEmail} />}

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
                {messages.map((m, idx) => (
                  <ChatBubble
                    key={m.id}
                    message={m}
                    pregunta={m.role === "assistant" && idx > 0 && messages[idx - 1].role === "user" ? messages[idx - 1].content : undefined}
                    clienteEmail={tokenEmail}
                    primaryColor={primaryColor}
                    psBase={PS_BASE}
                    identityToken={identityToken}
                    customerId={customerId}
                    supportPhone={SUPPORT_PHONE}
                    supportEmail={SUPPORT_EMAIL}
                  />
                ))}

                {/* Chips de preguntas frecuentes — solo visible en el primer turno */}
                {messages.length === 1 && !loading && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <p className="mb-0.5 w-full text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Preguntas frecuentes
                    </p>
                    {QUICK_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => sendChip(chip)}
                        className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 active:scale-95"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

              </div>

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
                    onClick={() => send()}
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
                  <br />
                  📞 {SUPPORT_PHONE} · ✉️ {SUPPORT_EMAIL}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Cerrar chat" : "Abrir chat técnico"}
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
      <p className="mt-1 text-center text-[9px] text-gray-400 select-none">
        Powered by{" "}
        <a
          href="https://flownexion.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-gray-600 transition-colors"
        >
          Flownexion
        </a>
      </p>
    </div>
    </CarritoChatProvider>
  );
}
