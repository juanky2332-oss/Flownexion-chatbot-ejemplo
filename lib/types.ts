// ─────────────────────────────────────────────────────────────
// Tipos compartidos del chatbot ESGAS
// ─────────────────────────────────────────────────────────────

export type Role = "user" | "assistant" | "system";

export interface Message {
  role: Role;
  content: string;
}

/** Producto normalizado que devuelven nuestros proxys (sin datos crudos de Prestashop) */
export interface Product {
  id: number;
  name: string;
  reference: string;
  price: number;
  description?: string;
  link: string;
  cartLink: string;
  imageUrl?: string;
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
}

/** Respuesta de /api/chat */
export interface ChatResponse {
  output: string;
  products?: Product[];
}
