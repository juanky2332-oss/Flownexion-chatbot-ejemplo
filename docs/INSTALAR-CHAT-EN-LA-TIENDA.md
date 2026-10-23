# Instalar el chat técnico en b2b.esgas.es

Unos 5 minutos. Se hace desde el panel de administración de PrestaShop y no hace falta tocar ningún archivo del servidor.

Con el módulo instalado:
- el chat aparece en todas las páginas de la tienda (abajo a la derecha);
- cada cliente que ha iniciado sesión ve **su propio precio**, con el descuento de su cuenta;
- desde el chat se añade al carrito de verdad (uno o varios productos a la vez) y se puede ir directamente a tramitar el pedido.

---

## Lo que necesitas

1. **El archivo del módulo:** https://flownexion-chatbot-ejemplo.vercel.app/descargas/nexionchat.zip (descárgalo y **no lo descomprimas**).
2. **La clave secreta**, que te pasa Flownexion por un canal privado. Es una línea larga de letras y números.

---

## Paso a paso

1. Entra en el panel de administración de la tienda.
2. En el menú de la izquierda: **Módulos → Gestor de módulos**.
3. Arriba a la derecha, pulsa **Subir un módulo**.
4. Arrastra el archivo `nexionchat.zip` a la ventana (o pulsa en «selecciona el archivo»). Espera al mensaje **«Módulo instalado»**.
5. En ese mismo aviso pulsa **Configurar**. Si lo has cerrado, busca «NexionChat» en el Gestor de módulos y pulsa **Configurar**.
6. Rellena los dos campos:
   - **URL del chat:** `https://flownexion-chatbot-ejemplo.vercel.app` (ya viene puesta; déjala así).
   - **Clave secreta:** pega la clave que te ha pasado Flownexion, sin espacios delante ni detrás.
7. Pulsa **Guardar**. Tiene que salir «Configuración guardada».
8. Borra la caché de la tienda: **Parámetros avanzados → Rendimiento → Borrar caché** (botón de arriba a la derecha).

### Si antes se había pegado el código del chat a mano

Si en algún bloque HTML del pie de página está el código `<script src=".../widget.js">`, **bórralo**. Con el módulo ya no hace falta y así el chat no se carga dos veces.

---

## Comprobar que funciona (2 minutos)

1. Abre la tienda en una ventana normal e **inicia sesión con una cuenta de cliente**.
2. Abajo a la derecha aparece el botón del chat. Al abrirlo, en la cabecera se ve el **e-mail de esa cuenta**: así se sabe que el chat ha reconocido al cliente.
3. Pregunta por un producto, por ejemplo: «quiero el 6205 ZZ C3». La tarjeta muestra el precio **con el descuento de esa cuenta** (precio de tarifa tachado y precio final).
4. Pulsa **Añadir al carrito** en la tarjeta. Debe salir «✓ Añadidas N uds», el contador del carrito de la cabecera de la tienda sube, y arriba del chat aparece el resumen con **Seguir comprando / Tramitar pedido**.
5. Quita ese producto del carrito si era solo una prueba.

---

## Si algo no va

| Qué pasa | Qué hacer |
|---|---|
| No aparece el botón del chat | Borra la caché (paso 8) y recarga con Ctrl+F5. Comprueba que el módulo está **activado** en el Gestor de módulos. |
| En la cabecera del chat pone «En línea» y no el e-mail del cliente | La sesión no está iniciada, o la clave secreta no coincide. Vuelve a pegarla en Configurar → Guardar y borra la caché. |
| Al añadir dice «Inicia sesión en la tienda» | El cliente no ha iniciado sesión: es lo esperado. Tras entrar, ya añade. |
| Cualquier otra cosa | Avisa a Flownexion con la hora aproximada y lo que se preguntó: queda registrado en el panel del chat y se localiza enseguida. |

---

## Para Flownexion (no hace falta que ESGAS lo lea)

- El módulo inserta `window.ESGASChatConfig = {identityToken}` y `widget.js` antes de `</body>` (hook `displayBeforeBodyClosingTag`). El token es `base64(json).hmac_sha256(json, NEXIONCHAT_HMAC_SECRET)`, caduca a las 2 h y lo verifica `lib/hmac.ts` con `HMAC_SECRET` de Vercel (tienen que ser la misma clave).
- Cuando esté comprobado en la tienda real, poner `IDENTIDAD_FIRMADA_OBLIGATORIA=1` en Vercel: desde ese momento solo se acepta la identidad firmada y se ignora el e-mail sin firmar que publica el tema.
- Si la tienda activa alguna caché de página completa, excluir este módulo de ella: el token es distinto para cada cliente.
- Tras cambiar el módulo, regenerar el zip con `npm run zip:modulo` (deja `public/descargas/nexionchat.zip`) y subir la versión nueva desde «Subir un módulo».
