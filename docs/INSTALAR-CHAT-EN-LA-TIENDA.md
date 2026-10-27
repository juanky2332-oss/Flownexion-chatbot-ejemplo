# Instalar el chat técnico en b2b.esgas.es

Unos 5 minutos, todo desde el panel de administración de PrestaShop. No hay que tocar archivos del servidor, ni el tema, ni pegar ninguna clave: **el módulo ya viene configurado**.

Con el módulo instalado:
- el chat aparece en todas las páginas de la tienda (abajo a la derecha);
- cada cliente que ha iniciado sesión ve **su propio precio**, con el descuento de su cuenta;
- desde el chat se añade al carrito de verdad (uno o varios productos a la vez) y se va directo a tramitar el pedido.

---

## Lo que necesitas

- **El archivo `nexionchat.zip`** que os ha enviado Flownexion. **No lo descomprimas.**
- Un usuario del panel de PrestaShop con permiso para instalar módulos.

> Ese zip lleva dentro la clave de vuestra tienda. No lo reenviéis ni lo subáis a ningún sitio público.

---

## Instalación (3 pasos)

**1. Subir el módulo**
1. Entra en el panel de administración de la tienda.
2. Menú de la izquierda: **Módulos → Gestor de módulos**.
3. Arriba a la derecha: **Subir un módulo**.
4. Arrastra `nexionchat.zip` a la ventana (o pulsa «selecciona el archivo»).
5. Si PrestaShop avisa de que el módulo no viene de Addons, pulsa **Continuar con la instalación**: es normal en módulos hechos a medida.
6. Espera a **«Módulo instalado»**.

**2. Comprobar la configuración (no hay que cambiar nada)**
1. En ese aviso pulsa **Configurar** (o busca «NexionChat» en el Gestor de módulos → **Configurar**).
2. Deben verse los dos campos rellenos:
   - **URL del chat:** `https://flownexion-chatbot-ejemplo.vercel.app`
   - **Clave secreta:** una línea de 64 letras y números.
3. Si los dos están rellenos, no toques nada. Si la clave saliera vacía, avisa a Flownexion y os la pasamos para pegarla aquí y pulsar **Guardar**.

**3. Borrar la caché**
**Parámetros avanzados → Rendimiento → Borrar caché** (botón arriba a la derecha).

Listo.

---

## Comprobar que funciona (2 minutos)

1. Abre la tienda en una ventana normal y **inicia sesión con una cuenta de cliente**.
2. Abajo a la derecha aparece el botón del chat. Al abrirlo, en la cabecera sale el **e-mail de esa cuenta**.
3. Pregunta: «quiero 2 rodamientos 6205 ZZ C3». La tarjeta muestra el precio **con el descuento de esa cuenta** (tarifa tachada y precio final, sin IVA).
4. Pulsa **Añadir al carrito**: sale «✓ Añadidas 2 uds», sube el contador del carrito de la tienda y arriba del chat aparece **Seguir comprando / Tramitar pedido**.
5. Quita el producto del carrito si era solo una prueba.

---

## Si algo no va

| Qué pasa | Qué hacer |
|---|---|
| No aparece el botón del chat | Borra la caché (paso 3) y recarga con Ctrl+F5. En el Gestor de módulos, comprueba que NexionChat está **activado**. |
| El precio no lleva el descuento del cliente | Comprueba que la sesión está iniciada y que la **Clave secreta** está rellena (paso 2). Borra la caché. |
| Al añadir dice «Inicia sesión en la tienda» | Es lo esperado sin sesión iniciada: tras entrar, ya añade. |
| Cualquier otra cosa | Avisa a Flownexion con la hora aproximada y lo que se preguntó: queda registrado en el panel del chat y se localiza enseguida. |

---

## Panel del chat (para ESGAS)

En **https://flownexion-chatbot-ejemplo.vercel.app/panel** se ven las conversaciones, lo más preguntado, lo que se ha añadido al carrito, las preguntas sin respuesta y los clientes que han pulsado «Llamar» o «Escribir». Usuario y contraseña os los pasa Flownexion por separado.

---

## Para Flownexion (no hace falta que ESGAS lo lea)

- **Zip de entrega (con la clave)**: `NEXIONCHAT_CLAVE=<HMAC_SECRET> node scripts/zip-modulo.js "<ruta fuera del repo>/nexionchat.zip"`. Mete `nexionchat/clave.php`; el módulo la guarda en su configuración al instalarse y borra el fichero del servidor. El script se niega a dejar ese zip dentro de `public/`. El zip público (`npm run zip:modulo` → `public/descargas/nexionchat.zip`) va **sin** clave.
- El módulo inserta `window.ESGASChatConfig = {identityToken}` y `widget.js` en `displayBeforeBodyClosingTag`, con `displayFooter` de respaldo (el tema `ebusiness` es de terceros); sale una sola vez. El token es `base64(json).hmac_sha256(json, NEXIONCHAT_HMAC_SECRET)`, caduca a las 2 h y lo verifica `lib/hmac.ts` con `HMAC_SECRET` de Vercel (comprobado el 27-10-2026 que coinciden).
- Comprobar desde fuera tras la instalación: el HTML de la home debe contener `ESGASChatConfig` y `widget.js?v=2.1.0`. Con sesión de cliente, además `identityToken`.
- Cuando esté comprobado en la tienda real, poner `IDENTIDAD_FIRMADA_OBLIGATORIA=1` en Vercel: desde entonces solo se acepta la identidad firmada.
- Si la tienda activa una caché de página completa, excluir este módulo: el token es distinto para cada cliente.
- Para actualizar el módulo: subir la versión nueva desde «Subir un módulo» (la configuración guardada se conserva).
