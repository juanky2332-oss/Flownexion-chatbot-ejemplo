<?php
/**
 * Controlador GET: añade un producto al carrito de sesión de PS y redirige al carrito.
 * URL: /module/nexionchat/addandgo?id_product=X&qty=Y[&id_product_attribute=Z]
 *
 * Usado por el chatbot en modo standalone (Vercel) para añadir productos
 * al carrito usando la sesión activa del usuario logueado en b2b.esgas.es.
 * Si no está logueado, redirige al login y vuelve aquí después.
 */

if (!defined('_PS_VERSION_')) {
    exit;
}

class NexionchatAddandgoModuleFrontController extends ModuleFrontController
{
    public function initContent()
    {
        $cartPageLink = $this->context->link->getPageLink(
            'cart', null, null, ['action' => 'show']
        );

        // Si no está logueado, redirigir a login y volver aquí después
        if (!$this->context->customer->isLogged()) {
            $selfUrl = $this->context->link->getModuleLink(
                $this->module->name,
                'addandgo',
                [
                    'id_product'           => (int) Tools::getValue('id_product', 0),
                    'id_product_attribute' => (int) Tools::getValue('id_product_attribute', 0),
                    'qty'                  => max(1, (int) Tools::getValue('qty', 1)),
                ]
            );
            Tools::redirect('index.php?controller=authentication&back=' . urlencode($selfUrl));
        }

        $idProduct          = (int) Tools::getValue('id_product', 0);
        $idProductAttribute = (int) Tools::getValue('id_product_attribute', 0);
        $qty                = max(1, (int) Tools::getValue('qty', 1));

        if ($idProduct && Product::existsInDatabase($idProduct, 'product')) {
            $cart = $this->context->cart;

            // Si no hay carrito activo, crear uno
            if (!Validate::isLoadedObject($cart)) {
                $cart              = new Cart();
                $cart->id_lang     = (int) $this->context->language->id;
                $cart->id_currency = (int) $this->context->currency->id;
                $cart->id_customer = (int) $this->context->customer->id;
                $idAddress = (int) Address::getFirstCustomerAddressId(
                    (int) $this->context->customer->id
                );
                $cart->id_address_delivery = $idAddress;
                $cart->id_address_invoice  = $idAddress;
                $cart->add();
                $this->context->cookie->id_cart = (int) $cart->id;
                $this->context->cart = $cart;
            }

            $cart->updateQty($qty, $idProduct, $idProductAttribute ?: null);
        }

        Tools::redirect($cartPageLink);
    }
}
