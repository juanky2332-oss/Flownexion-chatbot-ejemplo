import "server-only";
import { neon } from "@neondatabase/serverless";

// Registro de conversaciones, eventos (carrito, PDF, contacto, valoraciones)
// y errores en la base de datos Neon del proyecto (variables NEON_* que puso
// la integración de Vercel). Es lo que alimenta el panel /panel: qué se
// pregunta, qué no sabe responder el bot y cuánto acaba en carrito.
//
// Nunca puede romper el chat: si la base no está o falla, se anota en el log
// del servidor y la conversación sigue igual.

const URL_BD = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
const sql = URL_BD ? neon(URL_BD) : null;

export const registroActivo = (): boolean => !!sql;

let esquemaListo: Promise<void> | null = null;

function asegurarEsquema(): Promise<void> {
  if (!sql) return Promise.resolve();
  esquemaListo ??= (async () => {
    await sql`create table if not exists chat_mensajes (
      id bigserial primary key,
      ts timestamptz not null default now(),
      session_id text not null,
      origen text,
      cliente text,
      pregunta text not null,
      respuesta text,
      productos jsonb,
      escalado boolean not null default false,
      motivo text,
      sin_respuesta boolean not null default false,
      ms integer,
      modelo text
    )`;
    await sql`create index if not exists chat_mensajes_ts on chat_mensajes (ts desc)`;
    await sql`alter table chat_mensajes add column if not exists tokens_entrada integer`;
    await sql`alter table chat_mensajes add column if not exists tokens_cache integer`;
    await sql`alter table chat_mensajes add column if not exists tokens_salida integer`;
    await sql`create index if not exists chat_mensajes_sesion on chat_mensajes (session_id)`;
    await sql`create table if not exists chat_eventos (
      id bigserial primary key,
      ts timestamptz not null default now(),
      session_id text,
      tipo text not null,
      datos jsonb
    )`;
    await sql`create index if not exists chat_eventos_ts on chat_eventos (ts desc)`;
    await sql`create table if not exists chat_errores (
      id bigserial primary key,
      ts timestamptz not null default now(),
      ruta text not null,
      categoria text not null,
      detalle text
    )`;
  })().catch((err) => {
    esquemaListo = null;
    throw err;
  });
  return esquemaListo;
}

export interface MensajeRegistro {
  sessionId: string;
  origen: "tienda" | "web";
  cliente?: string;
  pregunta: string;
  respuesta: string;
  productos: { id: number; ref: string; nombre: string; precio: number; stock?: number }[];
  escalado: boolean;
  motivo?: string;
  sinRespuesta: boolean;
  ms: number;
  modelo: string;
  uso?: { entrada: number; cache: number; salida: number };
}

export async function registrarMensaje(m: MensajeRegistro): Promise<void> {
  if (!sql) return;
  try {
    await asegurarEsquema();
    await sql`insert into chat_mensajes
      (session_id, origen, cliente, pregunta, respuesta, productos, escalado, motivo, sin_respuesta, ms, modelo,
       tokens_entrada, tokens_cache, tokens_salida)
      values (${m.sessionId.slice(0, 80)}, ${m.origen}, ${m.cliente ?? null}, ${m.pregunta.slice(0, 2000)},
              ${m.respuesta.slice(0, 12000)}, ${JSON.stringify(m.productos)}, ${m.escalado}, ${m.motivo ?? null},
              ${m.sinRespuesta}, ${m.ms}, ${m.modelo},
              ${m.uso?.entrada ?? null}, ${m.uso?.cache ?? null}, ${m.uso?.salida ?? null})`;
  } catch (err) {
    console.error("[registro] mensaje no guardado:", (err as Error).message);
  }
}

export const TIPOS_EVENTO = [
  "anadir_carrito",
  "anadir_error",
  "tramitar",
  "pdf",
  "contacto_email",
  "contacto_tel",
  "contacto_datos",
  "valoracion",
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export async function registrarEvento(sessionId: string, tipo: TipoEvento, datos: unknown): Promise<void> {
  if (!sql) return;
  try {
    await asegurarEsquema();
    await sql`insert into chat_eventos (session_id, tipo, datos)
      values (${sessionId.slice(0, 80)}, ${tipo}, ${JSON.stringify(datos ?? {}).slice(0, 4000)})`;
  } catch (err) {
    console.error("[registro] evento no guardado:", (err as Error).message);
  }
}

export async function registrarError(ruta: string, categoria: string, detalle: string): Promise<void> {
  if (!sql) return;
  try {
    await asegurarEsquema();
    await sql`insert into chat_errores (ruta, categoria, detalle)
      values (${ruta}, ${categoria}, ${detalle.slice(0, 2000)})`;
  } catch (err) {
    console.error("[registro] error no guardado:", (err as Error).message);
  }
}

/** Acceso de solo lectura para el panel. */
export function consultaPanel() {
  return sql;
}
export { asegurarEsquema };
