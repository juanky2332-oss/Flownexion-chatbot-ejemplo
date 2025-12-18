
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";

// Helper to get fresh AI client instance
const getAIClient = () => {
  // Always use process.env.API_KEY directly as per guidelines
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const chatWithGemini = async (
  message: string, 
  history: { role: string; parts: { text: string }[] }[] = []
) => {
  const ai = getAIClient();
  
  // Use Gemini 3 Flash for speed and search grounding
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [...history, { role: 'user', parts: [{ text: message }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
    },
  });

  // response.text is a property, not a method
  const text = response.text || "Lo siento, tuve un problema procesando tu solicitud.";
  // Extract URLs from groundingChunks as required by guidelines
  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
    ?.map((chunk: any) => chunk.web)
    .filter((web: any) => web && web.uri);

  return { text, sources };
};

export const generateOrEditImage = async (prompt: string, base64Image?: string) => {
  const ai = getAIClient();
  
  const contents: any = {
    parts: [{ text: prompt }]
  };

  if (base64Image) {
    contents.parts.unshift({
      inlineData: {
        data: base64Image.split(',')[1],
        mimeType: 'image/png'
      }
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: contents,
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
  });

  let imageUrl = '';
  // Iterate through all parts to find the image part; do not assume the first part is an image
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      imageUrl = `data:image/png;base64,${part.inlineData.data}`;
      break;
    }
  }

  return imageUrl;
};
