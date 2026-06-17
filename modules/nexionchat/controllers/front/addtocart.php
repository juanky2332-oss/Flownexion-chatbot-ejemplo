<?php
/**
 * Controlador AJAX para añadir productos al carrito de sesión desde el chatbot.
 * URL: /module/nexionchat/addtocart
 * Método: POST (application/x-www-form-urlencoded)
 * Parámetros: id_product, id_product_attribute, qty, ajax=1
 * Requiere: cliente logueado en la sesión PS.
 */

if (!defined('_PS_VERSION_')) {
    exit;
}

class NexionchatAddtocartModuleFrontController extends ModuleFrontController
{
    public $ajax = true;

    public function postProcess()
    {
        header('Content-Type: application/json; charset=utf-8');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            die(json_encode(['success' => false, 'error' => 'Method not allowed']));
        }

        if (!$this->context->customer->isLogged()) {
            die(json_encode(['success' => false, 'error' => 'Not authenticated']));
        }

        $idProduct          = (int) Tools::getValue('id_product', 0);
        $idProductAttribute = (int) Tools::getValue('id_product_attribute', 0);
        $qty                = max(1, (int) Tools::getValue('qty', 1));

        if (!$idProduct) {
            die(json_encode(['success' => false, 'error' => 'Invalid product id']));
        }

        if (!Product::existsInDatabase($idProduct, 'product')) {
            die(json_encode(['success' => false, 'error' => 'Product not found']));
        }

        // Usar el carrito activo de la sesión (o crear uno nuevo si no existe)
        $cart = $this->context->cart;

        if (!Validate::isLoadedObject($cart)) {
            $cart                      = new Cart();
            $cart->id_lang             = (int) $this->context->language->id;
            $cart->id_currency         = (int) $this->context->currency->id;
            $cart->id_customer         = (int) $this->context->customer->id;
            $idAddress                 = (int) Address::getFirstCustomerAddressId(
                (int) $this->context->customer->id
            );
            $cart->id_address_delivery = $idAddress;
            $cart->id_address_invoice  = $idAddress;
            $cart->add();
            $this->context->cookie->id_cart = (int) $cart->id;
            $this->context->cart = $cart;
        }

        // updateQty: false = error, true = ok
        $result = $cart->updateQty(
            $qty,
            $idProduct,
            $idProductAttribute ?: null
        );

        $cartCount = (int) $cart->nbProducts();
        $cartUrl   = $this->context->link->getPageLink(
            'cart',
            null,
            null,
            ['action' => 'show']
        );

        die(json_encode([
            'success'   => (bool) $result,
            'cartCount' => $cartCount,
            'cartUrl'   => $cartUrl,
        ]));
    }
}
