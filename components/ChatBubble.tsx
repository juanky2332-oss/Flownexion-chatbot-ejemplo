"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Product } from "@/lib/types";
import ProductCard from "./ProductCard";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: Product[];
  needsHuman?: boolean;
  /** Asunto sugerido para el e-mail de contacto (consulta concreta de la conversación). */
  humanContext?: string;
}

interface ChatBubbleProps {
  message: ChatMessage;
  primaryColor?: string;
  psBase?: string;
  identityToken?: string | null;
  customerId?: number | null;
  supportPhone?: string;
  supportEmail?: string;
}

/**
 * Convierte las menciones de contacto del texto del bot en enlaces pulsables:
 * "teléfono" (o el número literal) → tel:, y "e-mail"/"correo" (o la dirección
 * literal) → mailto:. No toca los enlaces markdown que ya vengan en el texto.
 */
function linkifyContacts(text: string, phone?: string, email?: string): string {
  const telHref = phone ? `tel:${phone.replace(/\s+/g, "")}` : undefined;
  const mailHref = email ? `mailto:${email}` : undefined;
  if (!telHref && !mailHref) return text;

  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alts: string[] = [];
  if (mailHref && email) alts.push(escapeRe(email), "correo electr[oó]nico", "e-?mail", "correo");
  if (telHref && phone) alts.push(escapeRe(phone), "tel[eé]fono");
  const re = new RegExp(`(${alts.join("|")})`, "gi");

  return text
    .split(/(\[[^\]]*\]\([^)]*\))/g)
    .map((part, i) =>
      i % 2 === 1
        ? part // ya es un enlace markdown: no tocar
        : part.replace(re, (m) => {
            const isMail = /correo|mail|@/i.test(m);
            const href = isMail ? mailHref : telHref;
            return href ? `[${m}](${href})` : m;
          })
    )
    .join("");
}

export default function ChatBubble({
  message,
  primaryColor = "#0066cc",
  psBase,
  identityToken,
  customerId,
  supportPhone,
  supportEmail,
}: ChatBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex w-full animate-fade-in-up ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
            isUser
              ? "rounded-br-md text-white"
              : "rounded-bl-md bg-white text-gray-800 border border-gray-100"
          }`}
          style={isUser ? { backgroundColor: primaryColor } : undefined}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className="markdown-body break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node, href, ...props }) => {
                    // tel:/mailto: se abren en la propia app de teléfono/correo,
                    // no en una pestaña nueva
                    const isContact =
                      href?.startsWith("tel:") || href?.startsWith("mailto:");
                    return (
                      <a
                        {...props}
                        href={href}
                        {...(isContact
                          ? {}
                          : { target: "_blank", rel: "noopener noreferrer" })}
                        className="font-medium underline decoration-1 underline-offset-2"
                        style={{ color: primaryColor }}
                      />
                    );
                  },
                  p: ({ node, ...props }) => (
                    <p {...props} className="mb-1.5 last:mb-0" />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul {...props} className="mb-1.5 ml-4 list-disc" />
                  ),
                  strong: ({ node, ...props }) => (
                    <strong {...props} className="font-semibold" />
                  ),
                }}
              >
                {linkifyContacts(message.content, supportPhone, supportEmail)}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {message.products && message.products.length > 0 && (
          <div className="mt-1">
            {message.products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                primaryColor={primaryColor}
                psBase={psBase}
                identityToken={identityToken}
                customerId={customerId}
                supportPhone={supportPhone}
                supportEmail={supportEmail}
              />
            ))}
          </div>
        )}

        {!isUser && message.needsHuman && (supportPhone || supportEmail) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="w-full text-xs font-medium text-amber-800">
              {message.humanContext
                ? "Resuélvelo en un momento con un técnico de ESGAS:"
                : "¿Prefieres hablar con un técnico de ESGAS?"}
            </p>
            {supportPhone && (
              <a
                href={`tel:${supportPhone.replace(/\s+/g, "")}`}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm ring-1 ring-amber-300 transition hover:bg-amber-100"
              >
                📞 Llamar · {supportPhone}
              </a>
            )}
            {supportEmail && (
              <a
                href={
                  message.humanContext
                    ? `mailto:${supportEmail}?subject=${encodeURIComponent(
                        `Consulta: ${message.humanContext}`
                      )}&body=${encodeURIComponent(
                        `Hola,\n\nOs escribo desde el chat de la página sobre: ${message.humanContext}.\n\n¿Me podéis confirmar disponibilidad y plazo?\n\nGracias.`
                      )}`
                    : `mailto:${supportEmail}`
                }
                className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm ring-1 ring-amber-300 transition hover:bg-amber-100"
              >
                ✉️ {message.humanContext ? "Enviar consulta por e-mail" : supportEmail}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
