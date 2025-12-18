
export enum MessageRole {
  USER = 'user',
  BOT = 'bot'
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  sources?: Array<{ uri: string; title: string }>;
  imageUrl?: string;
  isImageAction?: boolean;
}

export interface BrandIdentity {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
}
