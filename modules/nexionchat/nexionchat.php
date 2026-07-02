<?php
/**
 * Módulo nexionchat para PrestaShop 8.x
 * Embebe el chatbot ESGAS como iframe flotante en todas las páginas de la tienda.
 * El token HMAC es opcional: sin él el chatbot funciona en modo anónimo.
 */

if (!defined('_PS_VERSION_')) {
    exit;
}

class Nexionchat extends Module
{
    public function __construct()
    {
        $this->name              = 'nexionchat';
        $this->tab               = 'front_office_features';
        $this->version           = '1.0.0';
        $this->author            = 'Flownexion';
        $this->need_instance     = 0;
        $this->ps_versions_compliancy = ['min' => '8.0', 'max' => _PS_VERSION_];
        $this->bootstrap         = true;

        parent::__construct();

        $this->displayName = $this->l('NexionChat — Asistente IA');
        $this->description = $this->l('Chatbot conversacional ESGAS. Embebe el técnico virtual de ESGAS como widget flotante.');
    }

    public function install()
    {
        return parent::install()
            && $this->registerHook('displayFooter')
            && Configuration::updateValue('NEXIONCHAT_HMAC_SECRET', '')
            && Configuration::updateValue('NEXIONCHAT_CHAT_URL', 'https://esgas.nodoflow.com');
    }

    public function uninstall()
    {
        return parent::uninstall()
            && Configuration::deleteByName('NEXIONCHAT_HMAC_SECRET')
            && Configuration::deleteByName('NEXIONCHAT_CHAT_URL');
    }

    // ─── Página de configuración en el back-office ───────────────────────────

    public function getContent()
    {
        $output = '';
        if (Tools::isSubmit('submitNexionchatConfig')) {
            $secret = Tools::getValue('NEXIONCHAT_HMAC_SECRET');
            $url    = rtrim(Tools::getValue('NEXIONCHAT_CHAT_URL'), '/');
            Configuration::updateValue('NEXIONCHAT_HMAC_SECRET', $secret);
            Configuration::updateValue('NEXIONCHAT_CHAT_URL', $url);
            $output .= $this->displayConfirmation($this->l('Configuración guardada.'));
        }
        return $output . $this->renderConfigForm();
    }

    private function renderConfigForm()
    {
        $fields_form = [[
            'form' => [
                'legend' => [
                    'title' => $this->l('Configuración NexionChat'),
                    'icon'  => 'icon-cogs',
                ],
                'input' => [
                    [
                        'type'     => 'text',
                        'label'    => $this->l('URL del chatbot'),
                        'name'     => 'NEXIONCHAT_CHAT_URL',
                        'size'     => 80,
                        'required' => true,
                        'hint'     => $this->l('URL de Vercel donde está desplegado el chatbot.'),
                    ],
                    [
                        'type'     => 'text',
                        'label'    => $this->l('Secreto HMAC (opcional)'),
                        'name'     => 'NEXIONCHAT_HMAC_SECRET',
                        'size'     => 80,
                        'required' => false,
                        'hint'     => $this->l('Deja vacío para modo anónimo. Rellena para activar precios B2B personalizados por cliente.'),
                    ],
                ],
                'submit' => ['title' => $this->l('Guardar')],
            ],
        ]];

        $helper = new HelperForm();
        $helper->module          = $this;
        $helper->name_controller = $this->name;
        $helper->token           = Tools::getAdminTokenLite('AdminModules');
        $helper->currentIndex    = AdminController::$currentIndex . '&configure=' . $this->name;
        $helper->default_form_language = $this->context->language->id;
        $helper->show_toolbar    = false;

        $helper->fields_value['NEXIONCHAT_CHAT_URL']    = Configuration::get('NEXIONCHAT_CHAT_URL');
        $helper->fields_value['NEXIONCHAT_HMAC_SECRET'] = Configuration::get('NEXIONCHAT_HMAC_SECRET');

        return $helper->generateForm($fields_form);
    }

    // ─── Hook: inyecta iframe + bridge JS justo antes de </body> ─────────────

    public function hookDisplayFooter($params)
    {
        // Solo para clientes logueados
        if (!$this->context->customer->isLogged()) {
            return '';
        }

        $secret  = Configuration::get('NEXIONCHAT_HMAC_SECRET');
        $chatUrl = rtrim(
            Configuration::get('NEXIONCHAT_CHAT_URL') ?: 'https://esgas.nodoflow.com',
            '/'
        );

        // ── Token HMAC (opcional) ────────────────────────────────────────────
        $token = '';
        if ($secret) {
            $payload = json_encode([
                'id_customer' => (int) $this->context->customer->id,
                'id_group'    => (int) $this->context->customer->id_default_group,
                'email'       => $this->context->customer->email,
                'exp'         => time() + 900,
            ], JSON_UNESCAPED_UNICODE);

            $signature = hash_hmac('sha256', $payload, $secret);
            $token     = base64_encode($payload) . '.' . $signature;
        }

        // ── Valores JS seguros ───────────────────────────────────────────────
        $chatUrlHtml = htmlspecialchars($chatUrl, ENT_QUOTES, 'UTF-8');
        $chatUrlJs   = json_encode($chatUrl, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_QUOT);
        $tokenJs     = json_encode($token,   JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_QUOT);

        // ── CSS ──────────────────────────────────────────────────────────────
        $output  = '<style>';
        $output .= '#nexionchat-frame{';
        $output .= 'position:fixed;bottom:0;right:0;';
        $output .= 'width:80px;height:80px;';
        $output .= 'border:none;z-index:2147482999;';
        $output .= 'background:transparent;overflow:hidden;';
        $output .= 'transition:width .2s ease,height .2s ease;';
        $output .= '}';
        $output .= '</style>';

        // ── Iframe ───────────────────────────────────────────────────────────
        $output .= '<iframe';
        $output .= ' id="nexionchat-frame"';
        $output .= ' src="' . $chatUrlHtml . '/embed"';
        $output .= ' frameborder="0" scrolling="no"';
        $output .= ' allow="clipboard-write"';
        $output .= ' title="Asistente técnico ESGAS"';
        $output .= '></iframe>';

        // ── Bridge JS ────────────────────────────────────────────────────────
        $output .= '<script>';
        $output .= '(function(){';
        $output .= 'var chatUrl=' . $chatUrlJs . ';';
        $output .= 'var token='   . $tokenJs   . ';';
        $output .= 'var frame=document.getElementById("nexionchat-frame");';
        $output .= 'if(!frame)return;';

        // Enviar token cuando el iframe esté listo (si hay token)
        $output .= 'function sendToken(){';
        $output .= '  if(token&&frame.contentWindow){';
        $output .= '    frame.contentWindow.postMessage({type:"esgas-identity-token",token:token},chatUrl);';
        $output .= '  }';
        $output .= '}';
        $output .= 'frame.addEventListener("load",function(){setTimeout(sendToken,80);});';

        // Mensajes desde el iframe
        $output .= 'window.addEventListener("message",function(e){';
        $output .= '  if(!frame.contentWindow||e.source!==frame.contentWindow)return;';

        // Widget listo → enviar token
        $output .= '  if(e.data&&e.data.type==="esgas-ready"){sendToken();return;}';

        // Redimensionar iframe al abrir/cerrar chat
        $output .= '  if(e.data&&e.data.type==="esgas-chat"){';
        $output .= '    if(e.data.open){frame.style.width="450px";frame.style.height="680px";}';
        $output .= '    else{frame.style.width="80px";frame.style.height="80px";}';
        $output .= '    return;';
        $output .= '  }';

        // Añadir al carrito (misma sesión, mismo dominio — sin CORS)
        $output .= '  if(e.data&&e.data.type==="esgas-add-to-cart"&&Array.isArray(e.data.items)){';
        $output .= '    var items=e.data.items;';
        $output .= '    Promise.all(items.map(function(item){';
        $output .= '      var b=new URLSearchParams({';
        $output .= '        id_product:String(item.id_product||0),';
        $output .= '        id_product_attribute:String(item.id_product_attribute||0),';
        $output .= '        qty:String(item.qty||1),';
        $output .= '        ajax:"1"';
        $output .= '      });';
        $output .= '      return fetch("/module/nexionchat/addtocart",{';
        $output .= '        method:"POST",';
        $output .= '        headers:{"Content-Type":"application/x-www-form-urlencoded"},';
        $output .= '        body:b.toString(),';
        $output .= '        credentials:"same-origin"';
        $output .= '      }).then(function(r){return r.json();}).catch(function(){return{};});';
        $output .= '    })).then(function(results){';
        $output .= '      var first=items[0]||{};';
        $output .= '      var res=results[0]||{};';
        $output .= '      frame.contentWindow.postMessage({type:"esgas-cart-handled",name:first.name||""},chatUrl);';
        $output .= '      if(typeof prestashop!=="undefined"&&prestashop.emit){';
        $output .= '        prestashop.emit("updateCart",{reason:{idProduct:first.id_product,idProductAttribute:first.id_product_attribute||0}});';
        $output .= '      }';
        $output .= '      if(res.cartUrl){setTimeout(function(){window.location.href=res.cartUrl;},600);}';
        $output .= '    });';
        $output .= '    return;';
        $output .= '  }';

        $output .= '});';
        $output .= '})();';
        $output .= '</script>';

        return $output;
    }
}
