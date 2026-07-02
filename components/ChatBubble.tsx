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
                  a: ({ node, ...props }) => (
                    <a
                      {...props}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline decoration-1 underline-offset-2"
                      style={{ color: primaryColor }}
                    />
                  ),
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
                {message.content}
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
              />
            ))}
          </div>
        )}

        {!isUser && message.needsHuman && (supportPhone || supportEmail) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="w-full text-xs font-medium text-amber-800">
              ¿Prefieres hablar con un técnico de ESGAS?
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
                href={`mailto:${supportEmail}`}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm ring-1 ring-amber-300 transition hover:bg-amber-100"
              >
                ✉️ {supportEmail}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
