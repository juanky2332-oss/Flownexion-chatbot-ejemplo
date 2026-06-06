// ─────────────────────────────────────────────────────────────
// Tipos compartidos del chatbot ESGAS
// ─────────────────────────────────────────────────────────────

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
  description?: string;
  /** URL de la ficha del producto en la tienda. */
  link: string;
  /** URL para añadir el producto al carrito (base qty=1). */
  cartLink: string;
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

/** Body de entrada de /api/chat */
export interface ChatRequest {
  message: string;
  sessionId: string;
  history: Message[];
  /** Porcentaje de descuento del cliente (0-99). */
  customerDiscount?: number;
  /** Estado actual del carrito virtual del chatbot. */
  cart?: CartItem[];
}

/** Respuesta de /api/chat */
export interface ChatResponse {
  output: string;
  products?: Product[];
}
