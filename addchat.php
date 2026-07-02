<?php
/**
 * Chatbot ESGAS v2 — endpoint añadir al carrito
 * Subir a la RAÍZ del PrestaShop (mismo nivel que index.php)
 * URL: https://b2b.esgas.es/addchat.php
 *
 * Modos:
 *   redirect=0 (defecto): JSON {ok: bool} — para AJAX desde iframe
 *   redirect=1           : añade al carrito y redirige a /carrito — para navegación directa
 */
require_once(dirname(__FILE__) . '/config/config.inc.php');
require_once(dirname(__FILE__) . '/init.php');

header('Cache-Control: no-store');

// Leer parámetro redirect antes de cualquier output
$redirect = ((int) Tools::getValue('redirect', 0) === 1);

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
$error = null;

try {
    if ($id_product <= 0) {
        $error = 'id_product invalido';
    } else {
        $context = Context::getContext();
        $cart    = $context->cart;

        // Si no hay carrito cargado en la sesión, crear uno nuevo
        if (!Validate::isLoadedObject($cart)) {
            $cart              = new Cart();
            $cart->id_lang     = (int) $context->language->id;
            $cart->id_currency = (int) $context->currency->id;
            $cart->id_shop     = (int) $context->shop->id;
            if ($context->customer && (int) $context->customer->id > 0) {
                $cart->id_customer = (int) $context->customer->id;

                // Sin id_address_delivery, Cart::updateQty() puede no llegar a
                // crear la línea del carrito (mismo fix que ya usa el módulo
                // nexionchat en controllers/front/addtocart.php).
                $idAddress = (int) Address::getFirstCustomerAddressId(
                    (int) $context->customer->id
                );
                if ($idAddress) {
                    $cart->id_address_delivery = $idAddress;
                    $cart->id_address_invoice  = $idAddress;
                }
            }
            $cart->add();
            if ($cart->id) {
                $context->cart             = $cart;
                $context->cookie->id_cart  = (int) $cart->id;
                $context->cookie->write();
            }
        }

        if (!Validate::isLoadedObject($cart)) {
            $error = 'no se pudo crear o cargar el carrito';
        } else {
            $result = $cart->updateQty(
                $qty,
                $id_product,
                $id_product_attribute ?: null,
                false,
                'up'
            );
            $ok = (bool) $result;
            if (!$ok) {
                $error = 'updateQty devolvio ' . var_export($result, true)
                    . ' (revisar stock, combinacion o direccion del cliente)';
            }
        }
    }
} catch (Exception $e) {
    $error = $e->getMessage();
}

if ($redirect) {
    // Redirigir siempre al carrito, aunque ok=false
    // (el usuario verá el carrito vacío si hubo error, pero no se queda en JSON)
    Tools::redirect('index.php?controller=cart&action=show');
} else {
    echo json_encode(['ok' => $ok, 'error' => $error]);
}
