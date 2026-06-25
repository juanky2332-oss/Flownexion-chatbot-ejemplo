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
    if (Validate::isLoadedObject($cart)) {
        $ok = (bool) $cart->updateQty($qty, $id_product, $id_product_attribute, false, 'up');
    }
}

echo json_encode(['ok' => $ok]);
