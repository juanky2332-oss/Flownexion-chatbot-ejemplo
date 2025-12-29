// services/geminiService.ts
import { N8N_WEBHOOK_URL } from "../constants";

export const chatWithGemini = async (
  message: string, 
  history: { role: string; parts: { text: string }[] }[] = [],
  sessionId?: string // Nuevo parametro para la memoria
) => {
  try {
    console.log("🚀 Enviando a n8n:", { message, sessionId });

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatInput: message,
        history: history,
        sessionId: sessionId // Enviamos el ID unico
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Error HTTP:", response.status, errorText);
      throw new Error(`Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("✅ Respuesta n8n:", data);

    const text = data.output || data.text || data.response || data.message || "Error: n8n no devolvió texto.";
    
    return { 
      text: text, 
      sources: data.sources || [] 
    };

  } catch (error: any) {
    console.error("❌ ERROR CLIENTE:", error);
    return { 
      text: `Error de conexión: ${error.message}`, 
      sources: [] 
    };
  }
};

export const generateOrEditImage = async (prompt: string, base64Image?: string) => {
  return "https://via.placeholder.com/150?text=Imagen+Desactivada";
};
