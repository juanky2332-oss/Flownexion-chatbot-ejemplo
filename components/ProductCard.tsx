"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";

interface ProductCardProps {
  product: Product;
  primaryColor?: string;
  psBase?: string;
  // Ya no se usan aquí (el carrito lo añade la tienda con la sesión del
  // cliente); se mantienen para no romper a quien las pase.
  identityToken?: string | null;
  customerId?: number | null;
  supportPhone?: string;
  supportEmail?: string;
}


export default function ProductCard({
  product,
  primaryColor = "#0066cc",
  psBase = "https://b2b.esgas.es",
  supportPhone = "968 676 983",
  supportEmail = "esgas@esgas.es",
}: ProductCardProps) {
  // Enlaces de contacto pulsables para los avisos de "sin stock en la página":
  // el cliente llama o escribe con un solo toque.
  const contactLinks = (
    <>
      <a
        href={`tel:${supportPhone.replace(/\s+/g, "")}`}
        className="font-bold underline underline-offset-2"
      >
        teléfono
      </a>{" "}
      o{" "}
      <a
        href={`mailto:${supportEmail}`}
        className="font-bold underline underline-offset-2"
      >
        e-mail
      </a>
    </>
  );
  // El B2B nunca tramita más unidades de las que hay en stock real: es
  // política de negocio, no un límite técnico. maxQty acota tanto el
  // selector de cantidad como el botón de añadir; product.stock === 0 oculta
  // por completo el flujo de compra B2B y muestra el aviso de pedido
  // ordinario en su lugar.
  const stockKnown = product.stock !== undefined;
  const outOfStockForB2B = stockKnown && (product.stock as number) <= 0;
  const maxQty = stockKnown ? Math.max(product.stock as number, 1) : undefined;

  const [qty, setQty] = useState(() => {
    const initial = Math.max(1, product.qty ?? 1);
    return maxQty !== undefined ? Math.min(initial, maxQty) : initial;
  });
  const [adding, setAdding] = useState(false);
  // contact: true → el error termina ofreciendo la consulta por teléfono/e-mail
  // con enlaces pulsables (se añaden al renderizar, no dentro del texto).
  const [addError, setAddError] = useState<{ text: string; contact?: boolean } | null>(null);

  const changeQty = (delta: number) =>
    setQty((prev) => {
      const next = Math.max(1, prev + delta);
      return maxQty !== undefined ? Math.min(next, maxQty) : next;
    });
  const hasDiscount =
    product.discountPct != null && product.discountPct > 0;

  const cartPage = `${psBase}/carrito?action=show`;
  const [added, setAdded] = useState<{ qty: number; cartUrl: string } | null>(null);
  // Enlace para terminar la compra en la tienda cuando el chat no está
  // embebido en ella: la ficha del producto con la orden de añadir.
  const [storeLink, setStoreLink] = useState<string | null>(null);

  // ── Por qué el carrito se abría vacío (hasta el 22-10-2026) ──────────────
  // 1) Fuera de la tienda (web de pruebas) se creaba un carrito por la
  //    Webservice API y se abría un enlace recover_cart que PrestaShop
  //    ignora: la tienda mostraba el carrito de la sesión, vacío.
  // 2) Dentro de la tienda se llamaba al addchat.php instalado, que solo
  //    añade si la sesión YA tiene un carrito guardado. PrestaShop no lo crea
  //    hasta el primer producto, así que con el carrito vacío respondía
  //    {"ok":false} sin añadir nada... y aun así se abría el carrito.
  // Ahora el añadir lo hace widget.js en la propia página de la tienda con el
  // añadir NATIVO de PrestaShop (el mismo que el botón de la ficha): crea el
  // carrito si no existe, comprueba el stock y actualiza la cabecera. Y el
  // carrito solo se ofrece cuando la tienda ha confirmado que lo añadió.
  const inStore = (() => {
    if (typeof window === "undefined") return false;
    try {
      if (window.top === window.self) return false;
    } catch {
      /* iframe de otro origen: seguimos comprobando */
    }
    try {
      const shop = new URL(psBase).origin;
      const anc = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
      if (anc && anc.length) return anc[0] === shop;
      return !!document.referrer && new URL(document.referrer).origin === shop;
    } catch {
      return false;
    }
  })();

  // addchat.php ya instalado en la tienda: añade al carrito de la sesión.
  const addchatUrl = (qtyToAdd: number) =>
    `${psBase}/addchat.php` +
    `?id_product=${encodeURIComponent(product.id)}` +
    `&id_product_attribute=${encodeURIComponent(product.idProductAttribute ?? 0)}` +
    `&qty=${encodeURIComponent(qtyToAdd)}`;

  const showStoreError = (error: string | null, needsLogin: boolean) => {
    if (needsLogin) {
      setAddError({ text: "Inicia sesión en la tienda para añadir productos a tu carrito." });
      return;
    }
    if (error && /stock|cantidad|disponible|quantity/i.test(error)) {
      setAddError({
        text: "No hay unidades suficientes en la página para esa cantidad ahora mismo. Para pedir más unidades, contacta por ",
        contact: true,
      });
      return;
    }
    setAddError({ text: "No se pudo añadir al carrito. Inténtalo de nuevo o contacta por ", contact: true });
  };

  const handleAdd = () => {
    if (adding || outOfStockForB2B) return;
    setAddError(null);
    setAdded(null);
    setStoreLink(null);

    // Nunca se debería llegar aquí con qty > stock (el selector ya lo acota),
    // pero se vuelve a acotar por si product.stock cambió tras el primer
    // render: safeQty es lo único que se usa a partir de aquí.
    const safeQty = maxQty !== undefined ? Math.min(qty, maxQty) : qty;
    if (safeQty !== qty) setQty(safeQty);

    if (!inStore) {
      // Fuera de la tienda (web del chat): se abre el addchat.php que ESGAS ya
      // tiene instalado como PESTAÑA de la tienda. Al ser una navegación de
      // primer nivel, el navegador manda la sesión del cliente en b2b.esgas.es
      // y las unidades entran en SU carrito. Comprobado con sesión real el
      // 22-10-2026: {"ok":true} y el carrito con las unidades. (Funciona
      // porque al iniciar sesión PrestaShop ya deja guardado un carrito, que
      // es lo único que ese addchat.php necesita.)
      // addchat.php responde con un JSON; la pestaña se lleva al carrito en
      // cuanto ha tenido tiempo de procesarlo. Aunque la navegación llegara a
      // cortar la espera, el producto ya está añadido: PHP lo guarda antes de
      // escribir la respuesta.
      const url = addchatUrl(safeQty);
      const tab = window.open(url, "_blank");
      if (!tab) {
        setStoreLink(url);
        return;
      }
      setAdding(true);
      setTimeout(() => {
        try {
          if (!tab.closed) tab.location.href = cartPage;
        } catch {
          /* pestaña cerrada */
        }
        setAdding(false);
        setAdded({ qty: safeQty, cartUrl: cartPage });
      }, 2500);
      return;
    }

    setAdding(true);
    const requestId = `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let done = false;

    const finish = () => {
      done = true;
      window.removeEventListener("message", onResult);
      clearTimeout(timer);
      setAdding(false);
    };

    function onResult(ev: MessageEvent) {
      const d = ev.data || {};
      if (d.type !== "esgas-cart-result" || d.requestId !== requestId || done) return;
      finish();
      if (d.ok) setAdded({ qty: Number(d.qty) || safeQty, cartUrl: d.cartUrl || cartPage });
      else showStoreError(typeof d.error === "string" ? d.error : null, !!d.needsLogin);
    }

    const timer = setTimeout(() => {
      if (done) return;
      finish();
      // La tienda no contestó (página sin el widget actualizado): se deja el
      // enlace a la ficha para terminar allí, sin prometer nada.
      setStoreLink(addchatUrl(safeQty));
    }, 15000);

    window.addEventListener("message", onResult);
    window.parent.postMessage(
      {
        type: "esgas-add-to-cart",
        requestId,
        items: [{
          id_product: Number(product.id),
          id_product_attribute: product.idProductAttribute ?? 0,
          qty: safeQty,
          name: product.name,
        }],
      },
      new URL(psBase).origin
    );
  };

  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      {/* Name + price */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {product.isEquivalent ? "Equivalente" : "NTN / SNR"}
          </p>
          <p className="mt-0.5 text-sm font-bold leading-snug text-gray-900">
            {product.name}
          </p>
          {product.reference && (
            <p className="font-mono text-[11px] text-gray-500">
              Ref. {product.reference}
            </p>
          )}
          {product.isEquivalent && product.originalBrand && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              ↔ Equiv. a {product.originalBrand}
            </span>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {hasDiscount && product.originalPrice != null ? (
            <>
              <span className="text-[10px] text-gray-400 line-through">
                {product.originalPrice.toFixed(2)} €
              </span>
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  -{Math.round(product.discountPct! * 100)}%
                </span>
                <span
                  className="rounded-full px-2.5 py-1 text-sm font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {product.price.toFixed(2)} €
                </span>
              </div>
            </>
          ) : (
            <span
              className="rounded-full px-2.5 py-1 text-sm font-bold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {product.price.toFixed(2)} €
            </span>
          )}
        </div>
      </div>

      {/* Stock */}
      {product.stock !== undefined && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              product.stock > 0 ? "bg-green-500" : "bg-red-400"
            }`}
          />
          <span
            className={`text-xs font-medium ${
              product.stock > 0 ? "text-green-700" : "text-red-600"
            }`}
          >
            {product.stock > 0
              ? `${product.stock} ud${product.stock === 1 ? "." : "s."} en stock`
              : "Sin stock disponible en la página ahora mismo"}
          </span>
        </div>
      )}

      {/* Sin stock: el B2B nunca tramita este producto ahora mismo (regla de
          negocio, no un fallo). Se sustituye el selector de cantidad y el
          botón de añadir por el aviso de pedido ordinario, coherente con el
          mensaje que ya da el chat. */}
      {outOfStockForB2B && (
        <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
          Sin stock en la página ahora mismo. Para pedirlo, contacta por {contactLinks} y te lo gestionan al momento.
        </p>
      )}

      {/* Qty + actions */}
      {!outOfStockForB2B && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            <button
              onClick={() => changeQty(-1)}
              className="flex h-7 w-7 items-center justify-center font-bold text-gray-500 transition hover:bg-gray-100"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={maxQty}
              value={qty}
              onChange={(e) => {
                const parsed = Math.max(1, parseInt(e.target.value) || 1);
                setQty(maxQty !== undefined ? Math.min(parsed, maxQty) : parsed);
              }}
              className="w-10 border-x border-gray-200 bg-white py-0.5 text-center text-sm font-semibold outline-none"
            />
            <button
              onClick={() => changeQty(1)}
              disabled={maxQty !== undefined && qty >= maxQty}
              className="flex h-7 w-7 items-center justify-center font-bold text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>

          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold text-white transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: primaryColor }}
          >
            {adding ? (
              <>
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Añadiendo…
              </>
            ) : (
              `🛒 ${qty > 1 ? `Añadir ${qty} uds` : "Añadir al carrito"}`
            )}
          </button>
        </div>
      )}

      <div className={outOfStockForB2B ? "mt-1.5" : "mt-2.5 flex items-center gap-2"}>
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-gray-50"
          style={{ color: primaryColor, borderColor: primaryColor }}
        >
          Ver ficha →
        </a>
      </div>

      {added && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs font-semibold text-green-700">
          ✓ {added.qty === 1 ? "Añadida 1 ud." : `Añadidas ${added.qty} uds.`} a tu carrito
          <a
            href={added.cartUrl}
            target="_top"
            className="font-bold underline underline-offset-2"
            style={{ color: primaryColor }}
          >
            Ir al carrito →
          </a>
        </p>
      )}

      {storeLink && (
        <p className="mt-1.5 text-xs text-gray-600">
          <a
            href={storeLink}
            target="_blank"
            rel="noopener"
            className="font-bold underline underline-offset-2"
            style={{ color: primaryColor }}
          >
            Pulsa aquí para añadirlo al carrito →
          </a>
        </p>
      )}

      {addError && (
        <p className="mt-1.5 text-xs text-red-600">
          {addError.text}
          {addError.contact && <>{contactLinks} y te lo gestionan al momento.</>}
        </p>
      )}
    </div>
  );
}
