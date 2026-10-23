import "server-only";
import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";

// Modelo del agente. Se puede cambiar sin tocar código con la variable
// OPENAI_MODEL en Vercel. Medido el 23-10-2026 con 11 consultas reales del
// cliente (scripts/bench-modelos.ts): gpt-4.1 y gpt-5.4 fallan reglas que
// gpt-4o cumple, y gpt-5.5 acierta igual pero tarda más del doble.
export const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o";

// Si el modelo elegido no estuviera disponible en la cuenta de OpenAI (o
// OpenAI lo retirase), el chat no puede quedarse sin responder: se repite la
// misma petición con el modelo de siempre.
const MODEL_RESPALDO = "gpt-4o";

/** Los gpt-5.x y la serie o razonan: no aceptan max_tokens ni temperature. */
function esRazonador(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

type Base = Omit<ChatCompletionCreateParamsNonStreaming, "model" | "max_tokens" | "temperature">;

function parametros(model: string, maxTokens: number, temperature: number) {
  if (esRazonador(model)) {
    return {
      model,
      max_completion_tokens: maxTokens,
      // "none": en /v1/chat/completions los gpt-5.4 solo admiten herramientas
      // sin razonamiento (con "low" devuelven 400). Además, en un chat de
      // ventas cada segundo cuenta y las reglas ya vienen escritas en el prompt.
      reasoning_effort: (process.env.OPENAI_REASONING_EFFORT?.trim() || "none") as "low",
    };
  }
  return { model, max_tokens: maxTokens, temperature };
}

/** El modelo no existe en la cuenta: se pasa al de respaldo para siempre. */
function modeloNoDisponible(err: unknown): boolean {
  const e = err as { status?: number; code?: string };
  return e?.code === "model_not_found" || e?.status === 404;
}

/**
 * La petición no le vale a ESTE modelo (parámetro no admitido, combinación de
 * opciones...): se repite esa misma petición con el de respaldo. Un fallo por
 * pasarse de contexto no se arregla cambiando de modelo.
 */
function peticionRechazada(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  return e?.status === 400 && !/context|maximum.*tokens/i.test(e?.message ?? "");
}

let respaldoActivo = false;

export async function completar(
  openai: OpenAI,
  body: Base,
  opts: { maxTokens: number; temperature: number }
): Promise<ChatCompletion> {
  const model = respaldoActivo ? MODEL_RESPALDO : MODEL;
  try {
    return await openai.chat.completions.create({ ...body, ...parametros(model, opts.maxTokens, opts.temperature) } as ChatCompletionCreateParamsNonStreaming);
  } catch (err) {
    if (model === MODEL_RESPALDO || !(modeloNoDisponible(err) || peticionRechazada(err))) throw err;
    console.error(`[llm] ${model} ha fallado, repito con ${MODEL_RESPALDO}:`, (err as Error).message);
    if (modeloNoDisponible(err)) respaldoActivo = true;
    return openai.chat.completions.create({ ...body, ...parametros(MODEL_RESPALDO, opts.maxTokens, opts.temperature) } as ChatCompletionCreateParamsNonStreaming);
  }
}

export async function completarEnStreaming(
  openai: OpenAI,
  body: Base,
  opts: { maxTokens: number; temperature: number }
): Promise<AsyncIterable<ChatCompletionChunk>> {
  const model = respaldoActivo ? MODEL_RESPALDO : MODEL;
  const crear = (m: string) =>
    openai.chat.completions.create({
      ...body,
      ...parametros(m, opts.maxTokens, opts.temperature),
      stream: true,
      // El último trozo trae los tokens gastados (y cuántos salieron de la caché).
      stream_options: { include_usage: true },
    } as ChatCompletionCreateParamsStreaming);
  try {
    return await crear(model);
  } catch (err) {
    if (model === MODEL_RESPALDO || !(modeloNoDisponible(err) || peticionRechazada(err))) throw err;
    console.error(`[llm] ${model} ha fallado, repito con ${MODEL_RESPALDO}:`, (err as Error).message);
    if (modeloNoDisponible(err)) respaldoActivo = true;
    return crear(MODEL_RESPALDO);
  }
}
