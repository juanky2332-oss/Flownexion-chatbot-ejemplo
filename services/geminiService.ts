import { N8N_WEBHOOK_URL } from "../constants";

// Función principal para hablar con el chat (ahora vía n8n)
export const chatWithGemini = async (
  message: string, 
  history: { role: string; parts: { text: string }[] }[] = []
) => {
  try {
    // Llamada a tu Webhook de n8n
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatInput: message, // n8n recibirá esto
        history: history    // Enviamos el historial por si n8n lo usa
      })
    });

    if (!response.ok) {
      throw new Error(`Error de conexión con n8n: ${response.status}`);
    }

    const data = await response.json();

    // Adaptamos la respuesta de n8n al formato que espera tu chat
    // Tu nodo final en n8n debe devolver un JSON con un campo "output" o "text"
    const text = data.output || data.text || data.message || "Lo siento, no pude procesar la respuesta.";
    
    // Si tu n8n devuelve fuentes (opcional), las extraemos. Si no, array vacío.
    const sources = data.sources || [];

    return { text, sources };

  } catch (error) {
    console.error("Error en chatWithGemini (n8n):", error);
    return { 
      text: "Lo siento, hubo un error de conexión con mi servidor central (n8n).", 
      sources: [] 
    };
  }
};

// Función de imagen (Desactivada temporalmente o redirigida a n8n si quieres)
export const generateOrEditImage = async (prompt: string, base64Image?: string) => {
  // Si quieres que n8n también genere imágenes, la lógica sería similar a la de arriba.
  // Por ahora, para que no rompa, devolvemos un mensaje de error controlado o una imagen placeholder.
  console.warn("La generación de imágenes via n8n requiere configuración adicional.");
  return "https://via.placeholder.com/512?text=Imagen+via+n8n+Pendiente";
};
