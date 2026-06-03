import React from 'react';

export const ESGAS_IDENTITY = {
  name: "Carlos",
  company: "ESGAS",
  tagline: "Distribuidor oficial NTN/SNR · Rodamientos y transmisión de potencia",
  primaryColor: "#00C2E0",
  secondaryColor: "#0047C8",
  darkBg: "#09131F",
};

// URL del webhook n8n — configurar también en Vercel → Environment Variables
// Variable: VITE_N8N_WEBHOOK_URL
export const N8N_WEBHOOK_URL =
  (import.meta as any).env?.VITE_N8N_WEBHOOK_URL ||
  "https://paneln8n.transformaconia.com/webhook/031ab1e6-d64e-41f0-b03e-f5c0681a6491";

// El system prompt real está en n8n → AI Agent node.
// Este campo solo se usa como referencia / fallback local.
export const SYSTEM_PROMPT = `
Eres Carlos, asesor técnico-comercial de ESGAS, distribuidor oficial NTN/SNR en España.
Consulta siempre la API de PrestaShop antes de responder. Nunca inventes datos.
`;

export const WELCOME_MESSAGE = "¡Hola! Soy **Carlos**, tu asesor técnico de ESGAS.\n¿Qué rodamiento o componente necesitas hoy?";

// Alias para compatibilidad con ChatWidget
export const FLOWNEXION_IDENTITY = ESGAS_IDENTITY;
