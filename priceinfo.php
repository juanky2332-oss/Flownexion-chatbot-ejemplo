<?php
/**
 * Chatbot ESGAS — precio real por cliente
 * Subir a la RAÍZ del PrestaShop (mismo nivel que index.php)
 * URL: https://b2b.esgas.es/priceinfo.php
 *
 * Usa Product::getPriceStatic(), la misma función con la que PrestaShop
 * calcula el precio en la ficha del producto — incluye specific_prices Y
 * reglas de precios de catálogo (Descuentos de tienda), sin tener que
 * reimplementar esa lógica desde el chatbot.
 *
 * Llamada server-to-server desde el backend del chatbot (no desde el
 * navegador), por eso lleva un secreto compartido en vez de depender de CORS.
 *
 * IMPORTANTE: cambia PRICEINFO_SECRET por un valor propio y pon ese mismo
 * valor en Vercel como variable de entorno PRESTASHOP_PRICE_SECRET.
 */
require_once(dirname(__FILE__) . '/config/config.inc.php');
require_once(dirname(__FILE__) . '/init.php');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const PRICEINFO_SECRET = 'CAMBIA-ESTE-VALOR-POR-UNO-PROPIO';

$secret = (string) Tools::getValue('secret');
if ($secret === '' || !hash_equals(PRICEINFO_SECRET, $secret)) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$idsParam   = (string) Tools::getValue('ids');
$idCustomer = (int) Tools::getValue('id_customer', 0);

if ($idsParam === '') {
    http_response_code(400);
    echo json_encode(['error' => 'faltan ids']);
    exit;
}

$idList = array_filter(array_map('intval', explode(',', $idsParam)));
$out = [];

foreach ($idList as $idProduct) {
    if ($idProduct <= 0) {
        continue;
    }
    try {
        $priceBase = Product::getPriceStatic(
            $idProduct, true, null, 2, null, false, false, 1, false,
            $idCustomer ?: null
        );
        $priceFinal = Product::getPriceStatic(
            $idProduct, true, null, 2, null, false, true, 1, false,
            $idCustomer ?: null
        );

        $pct = null;
        if ($priceBase > 0 && $priceFinal < $priceBase) {
            $pct = round((1 - ($priceFinal / $priceBase)) * 100, 2);
        }

        $out[$idProduct] = [
            'price'         => (float) $priceFinal,
            'originalPrice' => (float) $priceBase,
            'discountPct'   => $pct,
        ];
    } catch (Exception $e) {
        $out[$idProduct] = ['error' => $e->getMessage()];
    }
}

echo json_encode($out);
