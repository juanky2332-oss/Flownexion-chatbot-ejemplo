<?php
/**
 * Módulo nexionchat — Asistente técnico ESGAS para PrestaShop 1.7 / 8.
 *
 * Hace dos cosas, nada más:
 *  1. Carga el chat (widget.js) en todas las páginas de la tienda.
 *  2. Si el cliente ha iniciado sesión, le pasa al chat un TOKEN FIRMADO con
 *     su id, su grupo y su e-mail (HMAC-SHA256 con el secreto compartido).
 *     El chat lo verifica en su servidor: así cada cliente ve SU descuento y
 *     nadie puede hacerse pasar por otro cliente.
 *
 * El añadir al carrito lo hace widget.js con el añadir nativo de la tienda
 * (con su token de seguridad), por eso este módulo no necesita controladores.
 */

if (!defined('_PS_VERSION_')) {
    exit;
}

class Nexionchat extends Module
{
    const DEFAULT_CHAT_URL = 'https://flownexion-chatbot-ejemplo.vercel.app';

    public function __construct()
    {
        $this->name                   = 'nexionchat';
        $this->tab                    = 'front_office_features';
        $this->version                = '2.1.0';
        $this->author                 = 'Flownexion';
        $this->need_instance          = 0;
        $this->ps_versions_compliancy = ['min' => '1.7.0.0', 'max' => _PS_VERSION_];
        $this->bootstrap              = true;

        parent::__construct();

        $this->displayName = $this->l('NexionChat — Asistente técnico ESGAS');
        $this->description = $this->l('Chat técnico de ESGAS con precios del cliente y añadir al carrito.');
    }

    public function install()
    {
        return parent::install()
            && $this->registerHook('displayBeforeBodyClosingTag')
            && $this->registerHook('displayFooter')
            && Configuration::updateValue('NEXIONCHAT_HMAC_SECRET', $this->clavePrecargada())
            && Configuration::updateValue('NEXIONCHAT_CHAT_URL', self::DEFAULT_CHAT_URL);
    }

    /**
     * El zip que se entrega a ESGAS lleva la clave en clave.php para que el
     * módulo quede configurado al instalarlo. Se lee una vez y se borra del
     * servidor; el zip público de descargas no la lleva.
     */
    private function clavePrecargada()
    {
        $fichero = dirname(__FILE__) . '/clave.php';
        if (!is_file($fichero)) {
            return '';
        }
        $clave = include $fichero;
        $clave = trim((string) $clave);
        @unlink($fichero);
        return preg_match('/^[a-f0-9]{64}$/', $clave) ? $clave : '';
    }

    public function uninstall()
    {
        return parent::uninstall()
            && Configuration::deleteByName('NEXIONCHAT_HMAC_SECRET')
            && Configuration::deleteByName('NEXIONCHAT_CHAT_URL');
    }

    // ─── Configuración en el back-office ─────────────────────────────────────

    public function getContent()
    {
        $output = '';
        if (Tools::isSubmit('submitNexionchatConfig')) {
            $url    = rtrim(trim((string) Tools::getValue('NEXIONCHAT_CHAT_URL')), '/');
            $secret = trim((string) Tools::getValue('NEXIONCHAT_HMAC_SECRET'));
            if (!Validate::isAbsoluteUrl($url) || strpos($url, 'https://') !== 0) {
                $output .= $this->displayError($this->l('La URL del chat debe empezar por https://'));
            } else {
                Configuration::updateValue('NEXIONCHAT_CHAT_URL', $url);
                Configuration::updateValue('NEXIONCHAT_HMAC_SECRET', $secret);
                $output .= $this->displayConfirmation($this->l('Configuración guardada.'));
            }
        }
        return $output . $this->renderConfigForm();
    }

    private function renderConfigForm()
    {
        $fields_form = [[
            'form' => [
                'legend' => ['title' => $this->l('Configuración del chat'), 'icon' => 'icon-cogs'],
                'input'  => [
                    [
                        'type'     => 'text',
                        'label'    => $this->l('URL del chat'),
                        'name'     => 'NEXIONCHAT_CHAT_URL',
                        'required' => true,
                        'desc'     => $this->l('Dirección del chat que os ha dado Flownexion (empieza por https://).'),
                    ],
                    [
                        'type'     => 'text',
                        'label'    => $this->l('Clave secreta'),
                        'name'     => 'NEXIONCHAT_HMAC_SECRET',
                        'required' => false,
                        'desc'     => $this->l('Clave que os ha dado Flownexion. Con ella, cada cliente ve su propio precio en el chat.'),
                    ],
                ],
                'submit' => ['title' => $this->l('Guardar')],
            ],
        ]];

        $helper                           = new HelperForm();
        $helper->module                   = $this;
        $helper->name_controller          = $this->name;
        $helper->token                    = Tools::getAdminTokenLite('AdminModules');
        $helper->currentIndex             = AdminController::$currentIndex . '&configure=' . $this->name;
        $helper->default_form_language    = (int) $this->context->language->id;
        $helper->show_toolbar             = false;
        $helper->submit_action            = 'submitNexionchatConfig';
        $helper->fields_value['NEXIONCHAT_CHAT_URL']    = Configuration::get('NEXIONCHAT_CHAT_URL');
        $helper->fields_value['NEXIONCHAT_HMAC_SECRET'] = Configuration::get('NEXIONCHAT_HMAC_SECRET');

        return $helper->generateForm($fields_form);
    }

    // ─── Inserta el chat justo antes de </body> ──────────────────────────────
    // displayFooter es el respaldo por si el tema no llama al hook de </body>;
    // el chat se inserta solo una vez, en el primero de los dos que se ejecute.

    private static $insertado = false;

    public function hookDisplayFooter($params)
    {
        return $this->hookDisplayBeforeBodyClosingTag($params);
    }

    public function hookDisplayBeforeBodyClosingTag($params)
    {
        if (self::$insertado) {
            return '';
        }
        self::$insertado = true;

        $chatUrl = rtrim((string) (Configuration::get('NEXIONCHAT_CHAT_URL') ?: self::DEFAULT_CHAT_URL), '/');
        $secret  = (string) Configuration::get('NEXIONCHAT_HMAC_SECRET');

        $config = ['company' => 'ESGAS', 'color' => '#0066cc'];

        $customer = $this->context->customer;
        if ($secret !== '' && $customer && $customer->isLogged()) {
            $payload = json_encode([
                'id_customer' => (int) $customer->id,
                'id_group'    => (int) $customer->id_default_group,
                'email'       => (string) $customer->email,
                'exp'         => time() + 7200,
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $config['identityToken'] = base64_encode($payload) . '.' . hash_hmac('sha256', $payload, $secret);
        }

        $flags  = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;
        $src    = htmlspecialchars($chatUrl . '/widget.js?v=' . $this->version, ENT_QUOTES, 'UTF-8');

        return '<script>window.ESGASChatConfig=' . json_encode($config, $flags) . ';</script>'
            . '<script src="' . $src . '" async></script>';
    }
}
