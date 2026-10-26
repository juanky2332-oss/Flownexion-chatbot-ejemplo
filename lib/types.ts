// Tipos compartidos del chatbot ESGAS

import type { FichaTecnica } from "./ficha";

export type Role = "user" | "assistant" | "system";

export interface Message {
  role: Role;
  content: string;
}

/** Producto normalizado (sin datos crudos de Prestashop) */
export interface Product {
  id: number;
  name: string;
  reference: string;
  price: number;
  /** Precio base de catálogo antes del descuento B2B */
  originalPrice?: number;
  /** Fracción de descuento aplicada (0-1). Ej: 0.824 = 82.4% */
  discountPct?: number | null;
  description?: string;
  /** URL de la ficha del producto en la tienda. */
  link: string;
  /** URL para añadir el producto al carrito (base qty=1). */
  cartLink: string;
  /** ID de la combinación por defecto (0 para productos simples sin variantes). */
  idProductAttribute?: number;
  /** URL del proceso de pago. */
  checkoutLink: string;
  imageUrl?: string;
  /** Cantidad solicitada por el cliente en la conversación. */
  qty?: number;
  /** Stock real consultado con get_stock. Solo definido si se consultó. */
  stock?: number;
  /** true si es equivalente de una marca distinta a la pedida. */
  isEquivalent?: boolean;
  /** Marca original solicitada por el cliente (para mostrar equivalencia). */
  originalBrand?: string;
  /** Marca del artículo según la tienda (fabricante), para la etiqueta de la tarjeta. */
  brand?: string;
}

/** Artículo en el carrito virtual del chatbot. */
export interface CartItem {
  product: Product;
  qty: number;
}

/** Disponibilidad de stock normalizada */
export interface StockInfo {
  id_product: number;
  quantity: number;
  available: boolean;
}

/** Cliente B2B identificado en PrestaShop */
export interface PSCustomer {
  id: number;
  groupId: number;
  firstName: string;
  lastName: string;
  email: string;
  secureKey: string;
}

/** Body de entrada de /api/chat */
export interface ChatRequest {
  message: string;
  sessionId: string;
  history: Message[];
  /**
   * Token HMAC firmado por el módulo nexionchat de PS.
   * Si está presente y es válido, el groupId se extrae de él (no del body).
   */
  identityToken?: string;
  /** Fallback de groupId solo cuando HMAC_SECRET no está configurado (demo/dev). */
  customerGroupId?: number;
  /**
   * id_customer leído directamente de window.prestashop.customer.id en la
   * página real de Prestashop (sin firmar). Se usa solo si no hay
   * identityToken válido: el backend resuelve su grupo real contra la
   * Webservice API (fuente de verdad propia), nunca confía en un grupo
   * que venga del cliente.
   */
  customerId?: number;
  /**
   * E-mail del cliente que publica la propia tienda (window.prestashop.customer),
   * sin firmar: solo sirve para calcular el precio de su grupo mientras no esté
   * instalado el módulo de identidad firmada.
   */
  customerEmail?: string;
  /** "tienda" si el chat está embebido en b2b.esgas.es. */
  origen?: "tienda" | "web";
  /** true → la respuesta llega por streaming (NDJSON). */
  stream?: boolean;
  /** Estado actual del carrito virtual del chatbot. */
  cart?: CartItem[];
}

/** Respuesta de /api/chat */
export interface ChatResponse {
  output: string;
  products?: Product[];
  /** true si el agente no pudo confirmar un dato y ofrece escalar a un técnico humano. */
  needsHuman?: boolean;
  /** Resumen en una línea de la consulta, para prellenar el asunto del e-mail de contacto. */
  humanContext?: string;
  /** Fichas técnicas que contiene la respuesta, para el botón "Descargar en formato PDF". */
  fichas?: FichaTecnica[];
  /** El cliente pidió comparar: además de cada ficha, el PDF comparativo. */
  comparar?: boolean;
}
