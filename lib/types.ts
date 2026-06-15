// Tipos compartidos del chatbot ESGAS

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
  /** Porcentaje de descuento del cliente (0-99). */
  customerDiscount?: number;
  /** ID de grupo PS del cliente para precios B2B. */
  customerGroupId?: number;
  /** Estado actual del carrito virtual del chatbot. */
  cart?: CartItem[];
}

/** Respuesta de /api/chat */
export interface ChatResponse {
  output: string;
  products?: Product[];
}
