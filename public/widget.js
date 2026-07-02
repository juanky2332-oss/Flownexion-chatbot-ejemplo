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
  var COLLAPSED   = "96px";
  var EXPANDED_W  = "412px";
  var EXPANDED_H  = "640px";

  // Listener global de mensajes del iframe
  window.addEventListener("message", function (ev) {
    if (ev.origin !== ORIGIN) return;
    var d = ev.data || {};

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

    // Añadir producto al carrito desde el iframe.
    // Navegación same-origin a la URL NATIVA de PrestaShop (controller=cart&add=1),
    // que forma parte del core y siempre existe — no depende de addchat.php ni de
    // ningún controlador de módulo que haya que subir al servidor. Al correr en
    // b2b.esgas.es, viaja con las cookies de sesión del cliente logueado y PS
    // añade el producto a su carrito y redirige a /carrito.
    if (d.type === "esgas-add-to-cart") {
      var items = d.items || [];
      if (!items.length) return;
      var item = items[0];
      var addUrl =
        "/index.php?controller=cart&add=1" +
        "&id_product="           + encodeURIComponent(item.id_product) +
        "&id_product_attribute=" + encodeURIComponent(item.id_product_attribute || 0) +
        "&qty="                  + encodeURIComponent(item.qty || 1) +
        "&action=add" +
        "&back="                 + encodeURIComponent("/carrito?action=show");

      window.location.href = addUrl;
      return;
    }
  });

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
