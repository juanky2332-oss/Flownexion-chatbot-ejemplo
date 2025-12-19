// services/geminiService.ts

// 1. Importamos la URL desde constants.tsx
import { N8N_WEBHOOK_URL } from "../constants";

export const chatWithGemini = async (
  message: string, 
  history: { role: string; parts: { text: string }[] }[] = []
) => {
  try {
    console.log("🚀 Intentando conectar con n8n en:", N8N_WEBHOOK_URL); // Log para depurar

    // 2. Hacemos la llamada al Webhook
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatInput: message, // Enviamos el mensaje
        history: history    // Enviamos el historial
      })
    });

    // 3. Verificamos si la red respondió bien
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Error HTTP del servidor:", response.status, errorText);
      throw new Error(`Error ${response.status}: ${errorText}`);
    }

    // 4. Procesamos el JSON de respuesta
    const data = await response.json();
    console.log("✅ Respuesta recibida de n8n:", data);

    // 5. Buscamos el texto en cualquier propiedad posible (output, text, response...)
    const text = data.output || data.text || data.response || data.message || "Recibí tu mensaje, pero n8n no devolvió texto legible.";
    
    // 6. Devolvemos el resultado al chat
    return { 
      text: text, 
      sources: data.sources || [] 
    };

  } catch (error: any) {
    console.error("❌ ERROR CRÍTICO EN CLIENTE:", error);
    return { 
      text: `Error de conexión: ${error.message}. (Revisa la consola con F12)`, 
      sources: [] 
    };
  }
};

// Mantenemos esta función para que no rompa el import, aunque por ahora no haga nada real
export const generateOrEditImage = async (prompt: string, base64Image?: string) => {
  return "https://via.placeholder.com/150?text=Imagen+Desactivada";
};
