"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Product } from "@/lib/types";
import type { FichaTecnica } from "@/lib/ficha";
import ProductCard from "./ProductCard";
import { abrirVentanaCarrito, anadirConVentana, anadirEnTienda, enTienda, enviarContacto, enviarEvento, type LineaCarrito } from "@/lib/carritoTienda";
import { useCarritoChat } from "./CarritoChat";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: Product[];
  needsHuman?: boolean;
  /** Asunto sugerido para el e-mail de contacto (consulta concreta de la conversación). */
  humanContext?: string;
  /** Fichas técnicas de la respuesta: si hay, se ofrece descargarlas en PDF. */
  fichas?: FichaTecnica[];
  /** El cliente pidió comparar: se ofrece también el PDF comparativo. */
  comparar?: boolean;
  /** La respuesta aún se está escribiendo (streaming). */
  enCurso?: boolean;
  /** Qué está haciendo el bot mientras prepara la respuesta. */
  estado?: string;
}

interface ChatBubbleProps {
  message: ChatMessage;
  primaryColor?: string;
  psBase?: string;
  identityToken?: string | null;
  customerId?: number | null;
  supportPhone?: string;
  supportEmail?: string;
  /** Pregunta del cliente a la que responde este mensaje (para la valoración). */
  pregunta?: string;
  /** E-mail del cliente identificado, para no pedírselo al dejar sus datos. */
  clienteEmail?: string | null;
  /**
   * Todos los productos que han salido en la conversación, sin repetir. Solo
   * se pasa al último mensaje con productos: ahí va el "añadir varios".
   */
  productosConversacion?: Product[];
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
  pregunta,
  clienteEmail,
  productosConversacion,
}: ChatBubbleProps) {
  const isUser = message.role === "user";

  // Mientras se piensa la respuesta y aún no hay texto: el indicador de
  // escritura con lo que está haciendo ("Consultando el catálogo…").
  if (!isUser && message.enCurso && !message.content) {
    return (
      <div className="flex justify-start">
        <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3 shadow-sm">
          <span className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2 w-2 animate-typing-bounce rounded-full bg-gray-400" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
          {message.estado && <span className="text-xs text-gray-500">{message.estado}</span>}
        </div>
      </div>
    );
  }

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
                        onClick={() => {
                          if (href?.startsWith("tel:")) enviarEvento("contacto_tel", { desde: "texto" });
                          else if (href?.startsWith("mailto:")) enviarEvento("contacto_email", { desde: "texto" });
                        }}
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

        {!message.enCurso && message.products && message.products.length > 0 && (
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

        {!isUser && !message.enCurso && productosConversacion && productosConversacion.length > 1 && (
          <AnadirVarios products={productosConversacion} primaryColor={primaryColor} psBase={psBase} cliente={clienteEmail} identityToken={identityToken} />
        )}

        {!isUser && !message.enCurso && message.fichas && message.fichas.length > 0 && (
          <DescargaFicha fichas={message.fichas} primaryColor={primaryColor} comparar={!!message.comparar} />
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
                onClick={() => enviarEvento("contacto_tel", { desde: "boton", consulta: message.humanContext })}
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
                onClick={() => enviarEvento("contacto_email", { desde: "boton", consulta: message.humanContext })}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm ring-1 ring-amber-300 transition hover:bg-amber-100"
              >
                ✉️ {message.humanContext ? "Enviar consulta por e-mail" : supportEmail}
              </a>
            )}
            <DejarContacto consulta={message.humanContext || pregunta || ""} clienteEmail={clienteEmail} />
          </div>
        )}

        {!isUser && !message.enCurso && message.id !== "welcome" && (
          <Valoracion pregunta={pregunta ?? ""} respuesta={message.content} />
        )}
      </div>
    </div>
  );
}

/**
 * Recuadro "Descargar en formato PDF" bajo la tarjeta del producto (maqueta
 * del cliente). El PDF se genera en el propio navegador con la información
 * técnica que acaba de mostrar el chat.
 */
function DescargaFicha({ fichas, primaryColor, comparar }: { fichas: FichaTecnica[]; primaryColor: string; comparar: boolean }) {
  // Qué botón está generando ("comparativa" o el índice de la ficha).
  const [generando, setGenerando] = useState<string | null>(null);
  const [error, setError] = useState(false);

  // Precarga jsPDF y el logo en cuanto aparece el botón: al pulsarlo, la
  // descarga sale en el acto.
  useEffect(() => {
    import("@/lib/fichaPdf").then((m) => m.precargarFichaPdf()).catch(() => undefined);
  }, []);

  type ModuloPdf = typeof import("@/lib/fichaPdf");

  const ejecutar = async (id: string, accion: (m: ModuloPdf) => Promise<void>) => {
    if (generando) return;
    setGenerando(id);
    setError(false);
    try {
      await accion(await import("@/lib/fichaPdf"));
      enviarEvento("pdf", { tipo: id === "comparativa" ? "comparativa" : "ficha", refs: fichas.map((f) => f.referencia) });
    } catch (err) {
      console.error("[ficha pdf]", err);
      setError(true);
    } finally {
      setGenerando(null);
    }
  };

  const boton = (id: string, texto: string, accion: (m: ModuloPdf) => Promise<void>, secundario = false) => (
    <button
      key={id}
      type="button"
      onClick={() => ejecutar(id, accion)}
      disabled={generando !== null}
      className={`rounded-md px-3 py-1.5 text-left text-xs font-semibold shadow-sm transition hover:opacity-90 active:scale-95 disabled:cursor-wait disabled:opacity-70 ${
        secundario ? "border bg-white" : "text-white"
      }`}
      style={secundario ? { borderColor: primaryColor, color: primaryColor } : { backgroundColor: primaryColor }}
    >
      {generando === id ? "Generando PDF…" : texto}
    </button>
  );

  const varias = fichas.length > 1;
  // El PDF comparativo solo cuando el cliente ha pedido comparar.
  const conComparativa = varias && comparar;

  return (
    <div className="mt-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-xs text-gray-700">
        {conComparativa
          ? "Puede descargar la comparativa de todos los productos, o la información técnica de cada uno, pulsando en los siguientes botones"
          : varias
            ? "Puede descargar la información técnica de cada producto pulsando en los siguientes botones"
            : "Puede descargar la información técnica pulsando en el siguiente botón"}
      </p>
      <div className="mt-2 flex flex-col items-start gap-1.5">
        {varias
          ? [
              ...(conComparativa ? [boton("comparativa", "Descargar comparativa en PDF", (m) => m.descargarComparativaPdf(fichas))] : []),
              ...fichas.map((f, i) =>
                boton(String(i), `PDF · ${f.titulo || f.referencia}`, (m) => m.descargarFichaPdf([f]), conComparativa)
              ),
            ]
          : boton("0", "Descargar en formato PDF", (m) => m.descargarFichaPdf(fichas))}
      </div>
      {error && (
        <p className="mt-1.5 text-[11px] text-red-600">
          No se ha podido generar el PDF. Vuelve a intentarlo en unos segundos.
        </p>
      )}
    </div>
  );
}


/**
 * "Añadir varios" bajo una comparativa: marca los que quieras, ajusta las
 * unidades de cada uno y añádelos todos de una vez. Solo con el chat dentro de
 * la tienda, que es donde el carrito se puede llenar con la sesión del cliente.
 */
function AnadirVarios({
  products,
  primaryColor,
  psBase = "https://b2b.esgas.es",
  cliente,
  identityToken,
}: {
  products: Product[];
  primaryColor: string;
  psBase?: string;
  cliente?: string | null;
  identityToken?: string | null;
}) {
  const comprables = products.filter((p) => p.price > 0 && (p.stock === undefined || p.stock > 0));
  const carrito = useCarritoChat();
  const [abierto, setAbierto] = useState(false);
  const [sel, setSel] = useState<Record<number, number>>({});
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [dentro, setDentro] = useState(false);
  useEffect(() => setDentro(enTienda(psBase)), [psBase]);
  if (comprables.length < 2) return null;

  const max = (p: Product) => (p.stock !== undefined ? Math.max(1, p.stock) : 999);
  const marcados = comprables.filter((p) => sel[p.id] !== undefined);
  const totalUds = marcados.reduce((s, p) => s + (sel[p.id] ?? 0), 0);
  const subtotal = marcados.reduce((s, p) => s + (sel[p.id] ?? 0) * p.price, 0);

  const alternar = (p: Product) =>
    setSel((prev) => {
      const n = { ...prev };
      if (n[p.id] !== undefined) delete n[p.id];
      else n[p.id] = Math.min(Math.max(1, p.qty ?? 1), max(p));
      return n;
    });
  const cambiar = (p: Product, d: number) =>
    setSel((prev) => ({ ...prev, [p.id]: Math.min(max(p), Math.max(1, (prev[p.id] ?? 1) + d)) }));

  const anadir = async () => {
    if (!marcados.length || enviando) return;
    const lineas: LineaCarrito[] = marcados.map((p) => ({
      id_product: Number(p.id),
      id_product_attribute: p.idProductAttribute ?? 0,
      qty: sel[p.id],
      name: p.name,
      reference: p.reference,
      price: p.price,
    }));
    if (!dentro) {
      // Fuera de la tienda: la ventanita que añade una a una y se cierra sola,
      // con comprobación en la tienda (abrirla dentro del clic).
      const w = abrirVentanaCarrito();
      if (!w) {
        setAviso({ ok: false, texto: "El navegador ha bloqueado la ventana de la tienda. Permite las ventanas emergentes de esta página y vuelve a pulsar." });
        return;
      }
      setEnviando(true);
      setAviso(null);
      const r = await anadirConVentana(w, lineas, identityToken, psBase);
      setEnviando(false);
      if (!r.comprobado) {
        setAviso({ ok: true, texto: "Enviado a la tienda. Revisa tu carrito para confirmarlo." });
        return;
      }
      if (r.anadidas.length) {
        carrito?.registrar(r.anadidas, {});
        enviarEvento("anadir_carrito", { multiple: true, lineas: r.anadidas.map((l) => ({ ref: l.reference, id: l.id_product, uds: l.qty, precio: l.price })) });
        setSel({});
      }
      const fallos = r.fallidas.map((l) => l.reference || l.name).join(", ");
      setAviso({
        ok: r.anadidas.length > 0 && !r.fallidas.length,
        texto: r.anadidas.length
          ? `✓ Añadidos ${r.anadidas.length} producto${r.anadidas.length === 1 ? "" : "s"} a tu carrito${fallos ? `. No se pudo confirmar: ${fallos}` : ""}.`
          : "La tienda no ha confirmado el añadido. Comprueba que tienes la sesión iniciada en b2b.esgas.es y vuelve a intentarlo.",
      });
      return;
    }
    setEnviando(true);
    setAviso(null);
    const r = await anadirEnTienda(lineas, psBase);
    setEnviando(false);
    if (r.sinRespuesta) {
      setAviso({ ok: false, texto: "La tienda no ha respondido. Añádelos desde cada tarjeta." });
      return;
    }
    if (r.needsLogin && !r.ok) {
      setAviso({ ok: false, texto: "Inicia sesión en la tienda para añadir productos a tu carrito." });
      return;
    }
    if (r.ok) {
      carrito?.registrar(r.anadidas, { resumen: r.resumen, cartUrl: r.cartUrl, orderUrl: r.orderUrl });
      enviarEvento("anadir_carrito", {
        multiple: true,
        lineas: r.anadidas.map((l) => ({ ref: l.reference, id: l.id_product, uds: l.qty, precio: l.price })),
      });
      setSel({});
    }
    const fallos = r.fallidas.map((f) => f.linea.reference || f.linea.name).join(", ");
    setAviso({
      ok: r.ok && !r.fallidas.length,
      texto: r.ok
        ? `✓ Añadidos ${r.anadidas.length} producto${r.anadidas.length === 1 ? "" : "s"} a tu carrito${fallos ? `. No se pudo añadir: ${fallos}` : ""}.`
        : "No se pudo añadir ninguno. Inténtalo desde cada tarjeta o contacta por teléfono o e-mail.",
    });
  };

  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-sm">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center justify-between font-semibold"
        style={{ color: primaryColor }}
        aria-expanded={abierto}
      >
        <span>🛒 Añadir varios a la vez</span>
        <span className="text-gray-400">{abierto ? "▲" : "▼"}</span>
      </button>
      {abierto && (
        <div className="mt-2 space-y-1.5">
          {comprables.map((p) => {
            const on = sel[p.id] !== undefined;
            return (
              <div key={p.id} className="flex items-center gap-2">
                <input type="checkbox" checked={on} onChange={() => alternar(p)} className="h-4 w-4 shrink-0" aria-label={`Seleccionar ${p.name}`} />
                <button type="button" onClick={() => alternar(p)} className="min-w-0 flex-1 truncate text-left text-gray-700">
                  <span className="font-semibold text-gray-900">{p.reference || p.name}</span> · {p.price.toFixed(2)} €
                  {p.stock !== undefined && <span className="text-gray-400"> · {p.stock} en stock</span>}
                </button>
                <div className={`flex items-center overflow-hidden rounded-md border border-gray-200 ${on ? "" : "opacity-40"}`}>
                  <button type="button" disabled={!on} onClick={() => cambiar(p, -1)} className="h-6 w-6 font-bold text-gray-500 hover:bg-gray-100" aria-label="Quitar una unidad">−</button>
                  <span className="w-8 text-center font-semibold">{on ? sel[p.id] : 0}</span>
                  <button type="button" disabled={!on || sel[p.id] >= max(p)} onClick={() => cambiar(p, 1)} className="h-6 w-6 font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-40" aria-label="Añadir una unidad">+</button>
                </div>
              </div>
            );
          })}
          {(
            <button
              type="button"
              onClick={anadir}
              disabled={!marcados.length || enviando}
              className="mt-1 w-full rounded-lg py-1.5 font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              {enviando
                ? "Añadiendo…"
                : marcados.length
                  ? `Añadir ${marcados.length} producto${marcados.length === 1 ? "" : "s"} · ${totalUds} uds · ${subtotal.toFixed(2)} €`
                  : "Marca los que quieras añadir"}
            </button>
          )}
        </div>
      )}
      {aviso && <p className={`mt-1.5 font-medium ${aviso.ok ? "text-green-700" : "text-red-600"}`}>{aviso.texto}</p>}
    </div>
  );
}

/** El cliente deja su teléfono o e-mail y ESGAS le contacta (queda en el panel). */
function DejarContacto({ consulta, clienteEmail }: { consulta: string; clienteEmail?: string | null }) {
  const [valor, setValor] = useState(clienteEmail ?? "");
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "guardado" | "error">("idle");
  const limpio = valor.trim();
  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) || limpio.replace(/\D/g, "").length >= 9;

  if (estado === "ok") {
    return <p className="w-full text-xs font-semibold text-green-700">✓ Recibido. Un técnico de ESGAS te contactará lo antes posible.</p>;
  }
  if (estado === "guardado") {
    // Sin aviso inmediato configurado no se promete una llamada: se dice lo
    // que es verdad y se deja la vía rápida.
    return <p className="w-full text-xs font-semibold text-green-700">✓ Datos guardados. Si te corre prisa, llámanos o escríbenos con los botones de arriba.</p>;
  }
  return (
    <form
      className="flex w-full flex-wrap gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valido || estado === "enviando") return;
        setEstado("enviando");
        const r = await enviarContacto({ contacto: limpio, consulta: consulta.slice(0, 300) });
        setEstado(!r.ok ? "error" : r.avisado ? "ok" : "guardado");
      }}
    >
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="O déjanos tu teléfono o e-mail y te contactamos"
        className="min-w-0 flex-1 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-amber-400"
        aria-label="Teléfono o e-mail de contacto"
      />
      <button
        type="submit"
        disabled={!valido || estado === "enviando"}
        className="shrink-0 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
      >
        {estado === "enviando" ? "…" : "Enviar"}
      </button>
      {estado === "error" && <span className="w-full text-[11px] text-red-600">No se ha enviado. Inténtalo otra vez.</span>}
    </form>
  );
}

/** 👍/👎 bajo cada respuesta: lo que no gusta aparece en el panel para corregirlo. */
function Valoracion({ pregunta, respuesta }: { pregunta: string; respuesta: string }) {
  const [voto, setVoto] = useState<"si" | "no" | null>(null);
  const [comentario, setComentario] = useState("");
  const [enviado, setEnviado] = useState(false);

  const votar = (v: "si" | "no") => {
    if (voto) return;
    setVoto(v);
    if (v === "si") enviarEvento("valoracion", { voto: "si", pregunta: pregunta.slice(0, 300), respuesta: respuesta.slice(0, 600) });
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 pl-1 text-[11px] text-gray-400">
      {!voto && (
        <>
          <span>¿Te ha servido?</span>
          <button type="button" onClick={() => votar("si")} className="rounded px-1 hover:bg-gray-100" aria-label="Sí, me ha servido">👍</button>
          <button type="button" onClick={() => votar("no")} className="rounded px-1 hover:bg-gray-100" aria-label="No me ha servido">👎</button>
        </>
      )}
      {voto === "si" && <span>Gracias por tu valoración.</span>}
      {voto === "no" && !enviado && (
        <form
          className="flex w-full gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            enviarEvento("valoracion", { voto: "no", comentario: comentario.slice(0, 500), pregunta: pregunta.slice(0, 300), respuesta: respuesta.slice(0, 600) });
            setEnviado(true);
          }}
        >
          <input
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="¿Qué ha faltado? (opcional)"
            className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-700 outline-none"
          />
          <button type="submit" className="rounded bg-gray-100 px-2 py-1 font-semibold text-gray-600 hover:bg-gray-200">Enviar</button>
        </form>
      )}
      {voto === "no" && enviado && <span>Gracias, lo revisaremos para mejorarlo.</span>}
    </div>
  );
}
