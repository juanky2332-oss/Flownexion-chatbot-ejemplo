<?php
/**
 * Chatbot ESGAS — endpoint añadir al carrito (modo standalone / Vercel)
 * Subir este archivo a la RAÍZ del PrestaShop (mismo nivel que index.php)
 * URL resultante: https://b2b.esgas.es/addchat.php
 *
 * Flujo:
 *  · Si el usuario NO tiene sesión → redirige al login de PS y vuelve aquí
 *    después de autenticarse (back=).
 *  · Si está logueado → añade el producto al carrito (creándolo si no existe)
 *    y redirige directamente a la página del carrito.
 *
 * Al redirigir (en vez de devolver JSON) no hay "flash" de texto y funciona
 * desde cualquier navegador/ordenador, tenga o no sesión previa.
 */
require_once(dirname(__FILE__) . '/config/config.inc.php');
require_once(dirname(__FILE__) . '/init.php');

$id_product           = (int) Tools::getValue('id_product');
$id_product_attribute = (int) Tools::getValue('id_product_attribute', 0);
$qty                  = min(max((int) Tools::getValue('qty', 1), 1), 999);

$context  = Context::getContext();
$cartLink = $context->link->getPageLink('cart', null, null, ['action' => 'show']);

// ── 1. Sin sesión → al login y volver aquí con los mismos parámetros ─────────
if (!$context->customer->isLogged()) {
    $self = Tools::getShopDomainSsl(true) . __PS_BASE_URI__ . 'addchat.php'
        . '?id_product=' . $id_product
        . '&id_product_attribute=' . $id_product_attribute
        . '&qty=' . $qty;

    Tools::redirect('index.php?controller=authentication&back=' . urlencode($self));
    exit;
}

// ── 2. Añadir al carrito ─────────────────────────────────────────────────────
if ($id_product > 0 && Product::existsInDatabase($id_product, 'product')) {
    $cart = $context->cart;

    // Si no hay carrito en sesión, crear uno asociado al cliente
    if (!Validate::isLoadedObject($cart)) {
        $cart              = new Cart();
        $cart->id_lang     = (int) $context->language->id;
        $cart->id_currency = (int) $context->currency->id;
        $cart->id_customer = (int) $context->customer->id;
        $idAddress         = (int) Address::getFirstCustomerAddressId((int) $context->customer->id);
        $cart->id_address_delivery = $idAddress;
        $cart->id_address_invoice  = $idAddress;
        $cart->add();
        $context->cookie->id_cart = (int) $cart->id;
        $context->cart = $cart;
    }

    $cart->updateQty($qty, $id_product, $id_product_attribute, false, 'up');
}

// ── 3. Al carrito ────────────────────────────────────────────────────────────
Tools::redirect($cartLink);
