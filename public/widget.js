/*!
 * ESGAS Chat Widget — script de embed para Prestashop.
 * Uso (en el footer del tema o en el editor HTML del footer):
 *
 *   <script>
 *     window.ESGASChatConfig = {
 *       logo: 'https://tu-dominio.vercel.app/logo-mark.svg',
 *       color: '#0066cc',
 *       company: 'ESGAS'
 *     };
 *   </script>
 *   <script src="https://tu-dominio.vercel.app/widget.js" async></script>
 *
 * No interfiere con el CSS/JS del tema: todo vive en un iframe aislado.
 */
(function () {
  "use strict";

  if (window.__esgasChatLoaded) return;
  window.__esgasChatLoaded = true;

  var cfg = window.ESGASChatConfig || {};

  // Derivar la URL base del propio <script src="...widget.js">.
  function baseUrl() {
    var s = document.currentScript;
    if (!s) {
      var all = document.getElementsByTagName("script");
      for (var i = 0; i < all.length; i++) {
        if ((all[i].src || "").indexOf("widget.js") !== -1) {
          s = all[i];
          break;
        }
      }
    }
    try {
      return s ? new URL(s.src).origin : window.location.origin;
    } catch (e) {
      return window.location.origin;
    }
  }

  var ORIGIN = baseUrl();

  // Variables del iframe (declaradas aquí para que el listener las vea)
  var iframeStyle = null;
  var iframeEl    = null;
  var COLLAPSED   = "96px";
  var EXPANDED_W  = "412px";
  var EXPANDED_H  = "640px";
  var tokenSent   = false;

  // Identidad del cliente, para que el chat le aplique SU descuento:
  //  1. Con el módulo nexionchat instalado, la tienda firma un token
  //     (window.ESGASChatConfig.identityToken) que el backend verifica.
  //  2. Sin módulo, el e-mail que el propio tema publica en
  //     window.prestashop.customer (este tema no publica el id). Va sin firmar
  //     y el backend solo lo usa para calcular el precio de su grupo.
  function sendIdentityToken() {
    if (!iframeEl || !iframeEl.contentWindow) return;
    try {
      if (cfg.identityToken) {
        iframeEl.contentWindow.postMessage({ type: "esgas-identity-token", token: String(cfg.identityToken) }, ORIGIN);
        tokenSent = true;
        return;
      }
      var c = window.prestashop && window.prestashop.customer;
      if (c && c.is_logged && (c.email || c.id)) {
        iframeEl.contentWindow.postMessage(
          { type: "esgas-customer", email: c.email ? String(c.email) : "", id: c.id ? Number(c.id) : 0 },
          ORIGIN
        );
        tokenSent = true;
      }
    } catch (e) { /* modo anónimo si no está disponible */ }
  }

  // Listener global de mensajes del iframe
  window.addEventListener("message", function (ev) {
    if (ev.origin !== ORIGIN) return;
    var d = ev.data || {};

    // El widget dentro del iframe avisa que está listo para recibir el token
    // Siempre se reenvía: el envío del "load" puede llegar antes de que el
    // chat esté escuchando y perderse; "esgas-ready" garantiza que ya escucha.
    if (d.type === "esgas-ready") {
      sendIdentityToken();
      return;
    }

    // Redimensionar iframe cuando el chat se abre/cierra
    if (d.type === "esgas-chat") {
      if (!iframeStyle) return;
      if (d.open) {
        iframeStyle.width  = EXPANDED_W;
        iframeStyle.height = EXPANDED_H;
      } else {
        iframeStyle.width  = COLLAPSED;
        iframeStyle.height = COLLAPSED;
      }
      return;
    }

    // Añadir producto al carrito desde el iframe. Se hace aquí (en la página
    // de la tienda, mismo origen) con el añadir al carrito NATIVO, y se le
    // devuelve el resultado al chat para que lo muestre en la tarjeta.
    // Varias líneas (el "añadir varios" de una comparativa) van una detrás
    // de otra: PrestaShop actualiza el mismo carrito y en paralelo podría
    // perder alguna. Se devuelve el resultado de cada una y el resumen real
    // del carrito (nº de unidades y total) para el mini-carrito del chat.
    if (d.type === "esgas-add-to-cart") {
      var items = (d.items || []).slice(0, 10);
      if (!items.length) return;
      var reqId = d.requestId || null;
      var results = [];
      var last = null;
      var needsLogin = false;
      var chain = Promise.resolve();
      items.forEach(function (item) {
        chain = chain.then(function () {
          if (needsLogin) { results.push({ ok: false, error: "sin_sesion" }); return; }
          return addToCart(item).then(function (res) {
            if (res.needsLogin) needsLogin = true;
            if (res.ok) last = { item: item, res: res };
            results.push({ ok: !!res.ok, qty: res.qty, error: res.error || null });
          });
        });
      });
      chain.then(function () {
        if (last) emitUpdateCart(last.item, last.res);
        var first = results[0] || {};
        reply({
          type: "esgas-cart-result",
          requestId: reqId,
          ok: results.some(function (r) { return r.ok; }),
          qty: first.qty,
          error: first.error || null,
          results: results,
          needsLogin: needsLogin,
          cartUrl: cartPageUrl(),
          orderUrl: orderPageUrl(),
          summary: last ? cartSummary(last.res.cart) : null,
        });
      });
      return;
    }
  });

  function reply(msg) {
    try {
      if (iframeEl && iframeEl.contentWindow) iframeEl.contentWindow.postMessage(msg, ORIGIN);
    } catch (e) { /* nada */ }
  }

  // ── Carrito ────────────────────────────────────────────────────────────
  // Por qué así: el addchat.php instalado en la tienda solo añade si la
  // sesión YA tiene un carrito guardado. Un cliente que acaba de entrar y no
  // ha añadido nada todavía no lo tiene (PrestaShop no lo crea hasta el
  // primer producto), así que addchat.php respondía {"ok":false}, no añadía
  // nada y aun así se abría el carrito: vacío. El añadir nativo (el mismo
  // POST que hace el botón "Añadir al carrito" de la ficha del producto)
  // crea el carrito si no existe, valida el stock y usa el token de la
  // propia sesión. addchat.php queda solo de respaldo.
  function ps() { return window.prestashop || null; }

  function cartPageUrl() {
    var p = ps();
    var base = (p && p.urls && p.urls.pages && p.urls.pages.cart) || "/carrito";
    return base + (base.indexOf("?") === -1 ? "?" : "&") + "action=show";
  }

  function orderPageUrl() {
    var p = ps();
    return (p && p.urls && p.urls.pages && p.urls.pages.order) || "/pedido";
  }

  // Resumen del carrito tal cual lo devuelve PrestaShop 1.7 al añadir
  // (importes ya formateados por la tienda, con el descuento del cliente).
  function cartSummary(cart) {
    if (!cart) return null;
    try {
      var t = cart.totals && cart.totals.total;
      var sub = cart.subtotals && cart.subtotals.products;
      return {
        count: Number(cart.products_count) || undefined,
        total: (t && (t.value || t.amount)) ? String(t.value || t.amount) : undefined,
        subtotal: (sub && sub.value) ? String(sub.value) : undefined,
      };
    } catch (e) { return null; }
  }

  function isLogged() {
    var p = ps();
    return !!(p && p.customer && p.customer.is_logged);
  }

  function addToCart(item) {
    var qty = Math.max(1, parseInt(item.qty, 10) || 1);
    var p = ps();
    var token = p && p.static_token;
    if (!token) return addViaAddchat(item, qty);

    var body =
      "token="                 + encodeURIComponent(token) +
      "&id_product="           + encodeURIComponent(item.id_product) +
      "&id_product_attribute=" + encodeURIComponent(item.id_product_attribute || 0) +
      "&id_customization=0" +
      "&qty="                  + encodeURIComponent(qty) +
      "&add=1&action=update&ajax=1";
    var url = (p.urls && p.urls.pages && p.urls.pages.cart) || "/carrito";

    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: body,
    })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        var data = null;
        try { data = JSON.parse(txt); } catch (e) { /* no es JSON */ }
        if (!data) {
          // La tienda contestó con una página (p. ej. pide iniciar sesión).
          return { ok: false, qty: qty, needsLogin: !isLogged(), error: isLogged() ? "respuesta_no_valida" : "sin_sesion" };
        }
        if (data.hasError || (data.errors && data.errors.length)) {
          var err = [].concat(data.errors || []).join(" ").replace(/<[^>]+>/g, "").trim();
          return { ok: false, qty: qty, error: err || "error_tienda" };
        }
        return { ok: data.success !== false, qty: qty, cart: data.cart || null, resp: data };
      })
      .catch(function () { return addViaAddchat(item, qty); });
  }

  function addViaAddchat(item, qty) {
    var addUrl =
      "/addchat.php" +
      "?id_product="           + encodeURIComponent(item.id_product) +
      "&id_product_attribute=" + encodeURIComponent(item.id_product_attribute || 0) +
      "&qty="                  + encodeURIComponent(qty);
    return fetch(addUrl, { credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        return { ok: !!(data && data.ok), qty: qty, needsLogin: !isLogged(), error: (data && data.error) || (data && data.ok ? null : "no_anadido") };
      })
      .catch(function () { return { ok: false, qty: qty, error: "sin_conexion" }; });
  }

  // Lo mismo que hace el tema tras su propio "Añadir al carrito": actualiza
  // el contador del carrito de la cabecera y abre el aviso "Producto añadido".
  function emitUpdateCart(item, res) {
    var p = ps();
    if (!p || typeof p.emit !== "function") return;
    var r = res.resp || { success: true, cart: res.cart };
    try {
      p.emit("updateCart", {
        reason: {
          idProduct: r.id_product || Number(item.id_product),
          idProductAttribute: r.id_product_attribute || Number(item.id_product_attribute || 0),
          idCustomization: r.id_customization || 0,
          linkAction: "add-to-cart",
          cart: res.cart,
        },
        resp: r,
      });
    } catch (e) { /* el contador se verá al recargar */ }
  }

  // Llegada desde el chat abierto fuera de la tienda (web de pruebas): la
  // tarjeta abre la ficha del producto con #esgas-add=ID-ATRIBUTO-UDS. Aquí
  // ya estamos en la tienda, con la sesión del cliente: se añade y se va al
  // carrito. Si algo falla, el cliente se queda en la ficha del producto
  // (con su propio botón de añadir), nunca en un carrito vacío.
  function handleAddFromHash() {
    var m = /[#&]esgas-add=(\d+)-(\d+)-(\d+)/.exec(window.location.hash || "");
    if (!m) return;
    var original = window.location.href;
    try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch (e) { /* nada */ }
    var item = { id_product: m[1], id_product_attribute: m[2], qty: m[3] };
    addToCart(item).then(function (res) {
      if (res.ok) window.location.replace(cartPageUrl());
      else if (!isLogged()) {
        var p = ps();
        var login = (p && p.urls && p.urls.pages && p.urls.pages.authentication) || "/iniciar-sesion";
        window.location.href = login + (login.indexOf("?") === -1 ? "?" : "&") + "back=" + encodeURIComponent(original);
      }
    });
  }

  function build() {
    if (document.getElementById("esgas-chat-root")) return;

    var root = document.createElement("div");
    root.id = "esgas-chat-root";

    // Sin cfg.logo, el widget usa el robot de marca de ESGAS por defecto.
    var q =
      "?color=" +
      encodeURIComponent(cfg.color || "#0066cc") +
      "&company=" +
      encodeURIComponent(cfg.company || "ESGAS");
    if (cfg.logo) {
      q += "&logo=" + encodeURIComponent(cfg.logo);
    }

    var iframe = document.createElement("iframe");
    iframe.id = "esgas-chat-iframe";
    iframe.src = ORIGIN + "/embed" + q;
    iframe.title = "Chat ESGAS";
    iframe.allow = "clipboard-write";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("scrolling", "no");
    iframeEl = iframe; // exponer al listener de "esgas-ready"
    iframe.addEventListener("load", function () {
      setTimeout(sendIdentityToken, 80);
    });

    var s = iframe.style;
    iframeStyle = s; // exponer al listener
    s.position   = "fixed";
    s.bottom     = "0";
    s.right      = "0";
    s.border     = "0";
    s.width      = COLLAPSED;
    s.height     = COLLAPSED;
    s.maxWidth   = "100vw";
    s.maxHeight  = "100vh";
    s.background = "transparent";
    s.colorScheme = "normal";
    s.zIndex     = "2147483000";
    s.transition = "width .25s ease, height .25s ease";

    root.appendChild(iframe);
    document.body.appendChild(root);
  }

  function start() {
    build();
    handleAddFromHash();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
