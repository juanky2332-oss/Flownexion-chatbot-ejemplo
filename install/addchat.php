<?php
/**
 * Chatbot ESGAS — endpoint añadir al carrito
 * Subir este archivo a la RAÍZ del PrestaShop (mismo nivel que index.php)
 * URL resultante: https://b2b.esgas.es/addchat.php
 */
require_once(dirname(__FILE__) . '/config/config.inc.php');
require_once(dirname(__FILE__) . '/init.php');

// CORS: solo acepta peticiones del chatbot
header('Access-Control-Allow-Origin: https://esgas.nodoflow.com');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$id_product           = (int) Tools::getValue('id_product');
$id_product_attribute = (int) Tools::getValue('id_product_attribute', 0);
$qty                  = min(max((int) Tools::getValue('qty', 1), 1), 999);

$ok = false;

if ($id_product > 0) {
    $context = Context::getContext();
    $cart    = $context->cart;

    // Si no hay carrito en sesión, crear uno nuevo asociado al cliente (o como guest)
    if (!Validate::isLoadedObject($cart)) {
        $cart              = new Cart();
        $cart->id_lang     = (int) $context->language->id;
        $cart->id_currency = (int) $context->currency->id;
        $cart->id_customer = (int) $context->customer->id;

        if ($context->customer->isLogged()) {
            $idAddress = (int) Address::getFirstCustomerAddressId((int) $context->customer->id);
            $cart->id_address_delivery = $idAddress;
            $cart->id_address_invoice  = $idAddress;
        }

        $cart->add();
        $context->cookie->id_cart = (int) $cart->id;
        $context->cart = $cart;
    }

    $ok = (bool) $cart->updateQty($qty, $id_product, $id_product_attribute, false, 'up');
}

echo json_encode(['ok' => $ok]);
