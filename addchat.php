<?php
/**
 * Chatbot ESGAS — endpoint añadir al carrito
 * Subir este archivo a la RAÍZ del PrestaShop (mismo nivel que index.php)
 * URL resultante: https://b2b.esgas.es/addchat.php
 *
 * Modos:
 *   - redirect=0 (defecto): responde JSON {ok: bool} para peticiones AJAX (iframe)
 *   - redirect=1           : añade y redirige al carrito (para navegación directa)
 */
require_once(dirname(__FILE__) . '/config/config.inc.php');
require_once(dirname(__FILE__) . '/init.php');

header('Cache-Control: no-store');

$redirect = (bool) Tools::getValue('redirect', 0);

if (!$redirect) {
    // CORS solo necesario en modo AJAX (iframe en esgas.nodoflow.com)
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

$ok = false;

if ($id_product > 0) {
    $context = Context::getContext();
    $cart    = $context->cart;
    if (Validate::isLoadedObject($cart)) {
        $ok = (bool) $cart->updateQty($qty, $id_product, $id_product_attribute, false, 'up');
    }
}

if ($redirect) {
    // Redirigir al carrito (funciona con SameSite=Lax, no necesita CORS)
    Tools::redirect('index.php?controller=cart&action=show');
} else {
    echo json_encode(['ok' => $ok]);
}
