# ESGAS Chatbot — Carlos, Asesor Técnico-Comercial NTN/SNR

Chatbot de ventas técnicas para **ESGAS** (distribuidor oficial NTN/SNR en España),
construido con **Next.js 14 + Vercel**. Sin n8n ni middleware externo: el agente IA
(GPT-4o) y los proxys a la API de Prestashop viven 100% en este repositorio.

El agente **Carlos** asesora técnicamente sobre rodamientos, consulta el catálogo y el
**stock real** de Prestashop, y guía al cliente hasta el carrito/pago.

---

## 🏗️ Arquitectura

```
app/
  api/
    chat/route.ts       → Agente IA (GPT-4o) + lógica principal
    products/route.ts   → Proxy seguro → API Prestashop (productos)
    stock/route.ts      → Proxy seguro → stock_availables Prestashop
  embed/page.tsx        → Página del widget para cargar en iframe
  layout.tsx
  page.tsx              → Landing demo con el widget
components/
  ChatWidget.tsx        → Widget embebible (botón flotante + ventana)
  ChatBubble.tsx        → Burbuja de mensaje (markdown)
  ProductCard.tsx       → Tarjeta de producto
lib/
  prestashop.ts         → Cliente API Prestashop (server-only, usa env vars)
  agent.ts              → System prompt + tool-calling del agente Carlos
  http.ts               → CORS, rate limiting, auth interna
  types.ts              → Tipos compartidos
public/
  widget.js             → Script de embed (<5KB) para Prestashop
  logo.svg / logo-mark.svg → Logo ESGAS
vercel.json
```

### Seguridad de la API key
`PRESTASHOP_API_KEY` **nunca** aparece en el frontend ni en el bundle del cliente.
`lib/prestashop.ts` está marcado con `import "server-only"` y solo lo importan las
rutas de `/app/api/*`. Ningún archivo de `/components` o `/public` lo importa.

---

## ⚙️ Configuración

### 1. Clonar y configurar variables de entorno

```bash
cp .env.example .env.local
# Editar .env.local con los valores reales
npm install
npm run dev
```

Variables (ver `.env.example`):

| Variable | Descripción |
| --- | --- |
| `OPENAI_API_KEY` | Clave de OpenAI (GPT-4o). |
| `PRESTASHOP_API_KEY` | Webservice key de Prestashop (solo server-side). |
| `PRESTASHOP_BASE_URL` | `https://esgas.nodoflow.com` |
| `ALLOWED_ORIGINS` | Orígenes CORS permitidos (coma-separados). |
| `INTERNAL_API_SECRET` | Secreto para llamadas internas server→server. |

> ⚠️ `.env.local` está en `.gitignore` y **NUNCA** se sube a GitHub.

### 2. Desplegar en Vercel

1. Conecta este repositorio GitHub en [vercel.com](https://vercel.com).
2. En **Settings → Environment Variables**, añade:
   `OPENAI_API_KEY`, `PRESTASHOP_API_KEY`, `PRESTASHOP_BASE_URL`,
   `ALLOWED_ORIGINS`, `INTERNAL_API_SECRET`.
3. Deploy automático en cada push.

Las variables **solo** se configuran en el Dashboard de Vercel, nunca en el repo.

### 3. Embeber en Prestashop

Añade esto en `/themes/[tema]/templates/_partials/footer.tpl`
o en **Módulos → Editor de plantillas HTML** del footer:

```html
<script>
  window.ESGASChatConfig = {
    logo: 'https://tu-dominio.vercel.app/logo-mark.svg',
    color: '#0066cc',
    company: 'ESGAS'
  };
</script>
<script src="https://tu-dominio.vercel.app/widget.js" async></script>
```

El widget se carga en un iframe aislado, así que **no interfiere** con el CSS/JS
del tema de Prestashop.

---

## 🔌 API

### `POST /api/chat`
```jsonc
// Request
{ "message": "Necesito un 6205 con sellado de goma", "sessionId": "uuid", "history": [] }
// Response
{ "output": "📦 **...**", "products": [ /* hasta 3 */ ] }
```
- Modelo `gpt-4o`, `temperature: 0.2`, `max_tokens: 800`.
- CORS restringido a `ALLOWED_ORIGINS`. Rate limit: 30 req/min por IP.
- El historial se mantiene en el cliente (máx. 10 turnos / 20 mensajes).

### `GET /api/products?q=...` y `GET /api/stock?id=...`
Proxys internos protegidos con `Bearer INTERNAL_API_SECRET`. Devuelven datos
limpios sin exponer la `ws_key` de Prestashop.

---

## 🧪 Comprobaciones

```bash
npm run build        # Compila sin errores
npm run dev          # Levanta en http://localhost:3000
```

El flujo end-to-end es: **widget → /api/chat → GPT-4o → (tools) → Prestashop API**.
