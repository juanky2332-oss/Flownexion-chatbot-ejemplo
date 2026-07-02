<?php
/**
 * Chatbot ESGAS v3 — endpoint añadir al carrito
 * Subir a la RAÍZ del PrestaShop (mismo nivel que index.php)
 * URL: https://b2b.esgas.es/addchat.php
 *
 * Modos:
 *   redirect=0 (defecto): JSON {ok: bool, ...} — para AJAX desde iframe
 *   redirect=1           : añade al carrito y redirige a /carrito — para navegación directa
 *   debug=1              : añade el motivo del fallo y el id de carrito al JSON (no usar en producción)
 *
 * Nota: este script solo incluye config.inc.php + init.php, NO pasa por
 * FrontController::init(), así que PrestaShop nunca llega a crear el
 * "id_guest" de sesión automáticamente. Sin id_guest, Cart::add() falla su
 * validación para visitantes no identificados y updateQty() nunca llega a
 * ejecutarse — por eso el endpoint devolvía {"ok":false} incluso con
 * productos válidos y con stock. Lo replicamos aquí a mano.
 */
require_once(dirname(__FILE__) . '/config/config.inc.php');
require_once(dirname(__FILE__) . '/init.php');

header('Cache-Control: no-store');

// Leer parámetros antes de cualquier output
$redirect = ((int) Tools::getValue('redirect', 0) === 1);
$debug    = ((int) Tools::getValue('debug', 0) === 1);

if (!$redirect) {
    header('Access-Control-Allow-Origin: https://esgas.nodoflow.com');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Content-Type: application/json; charset=utf-8');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

$id_product           = (int) Tools::getValue('id_product');
$id_product_attribute = (int) Tools::getValue('id_product_attribute', 0);
$qty                  = min(max((int) Tools::getValue('qty', 1), 1), 999);

$ok    = false;
$error = '';
$cart  = null;

if ($id_product <= 0) {
    $error = 'id_product invalido';
} elseif (!Product::existsInDatabase($id_product, 'product')) {
    $error = 'el producto no existe';
} else {
    $context = Context::getContext();
    $cart    = $context->cart;

    // Si no hay carrito cargado en la sesión, crear uno nuevo
    if (!Validate::isLoadedObject($cart)) {
        $cart                 = new Cart();
        $cart->id_lang        = (int) $context->language->id;
        $cart->id_currency    = (int) $context->currency->id;
        $cart->id_shop_group  = (int) $context->shop->id_shop_group;
        $cart->id_shop        = (int) $context->shop->id;

        if ($context->customer && (int) $context->customer->id > 0) {
            $cart->id_customer = (int) $context->customer->id;
        } elseif (!(int) $context->cookie->id_guest) {
            // Visitante anónimo sin id_guest en cookie: lo creamos a mano,
            // igual que hace FrontController::init() en una navegación normal.
            try {
                $guest                      = new Guest();
                $guest->id_customer         = 0;
                $guest->id_lang             = (int) $context->language->id;
                $guest->id_shop             = (int) $context->shop->id;
                $guest->id_shop_group       = (int) $context->shop->id_shop_group;
                $guest->id_operating_system = 0;
                $guest->id_web_browser      = 0;
                $guest->ipaddress           = (int) ip2long((string) Tools::getRemoteAddr());
                $guest->add();
                if ($guest->id) {
                    $context->cookie->id_guest = (int) $guest->id;
                }
            } catch (Exception $e) {
                // seguimos sin id_guest; cart->add() puede fallar más abajo,
                // pero no queremos un error fatal aquí
            }
        }

        if ((int) $context->cookie->id_guest) {
            $cart->id_guest = (int) $context->cookie->id_guest;
        }

        $cart->add();
        if ($cart->id) {
            $context->cart              = $cart;
            $context->cookie->id_cart  = (int) $cart->id;
            $context->cookie->write();
        }
    }

    if (!Validate::isLoadedObject($cart)) {
        $error = 'no se pudo crear el carrito (revisa id_guest/id_shop_group)';
    } else {
        $ok = (bool) $cart->updateQty(
            $qty,
            $id_product,
            $id_product_attribute,
            false,
            'up'
        );
        if (!$ok) {
            $error = 'updateQty devolvio false (revisa stock, combinacion o estado del producto)';
        }
    }
}

if ($redirect) {
    // Redirigir siempre al carrito, aunque ok=false
    // (el usuario verá el carrito vacío si hubo error, pero no se queda en JSON)
    Tools::redirect('index.php?controller=cart&action=show');
} else {
    $payload = ['ok' => $ok];
    if ($debug) {
        $payload['error']  = $error;
        $payload['cartId'] = Validate::isLoadedObject($cart) ? (int) $cart->id : 0;
    }
    echo json_encode($payload);
}
