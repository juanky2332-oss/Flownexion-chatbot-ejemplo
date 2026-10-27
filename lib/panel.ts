import "server-only";
import { consultaPanel, asegurarEsquema } from "./registro";

// Consultas del panel. Todo en SQL sobre las tablas del registro (lib/registro.ts).

export interface DatosPanel {
  kpi: {
    conversaciones: number;
    mensajes: number;
    clientes: number;
    escalados: number;
    sinRespuesta: number;
    msMedio: number;
    sesionesConCarrito: number;
    udsAnadidas: number;
    lineasAnadidas: number;
    tramitar: number;
    pdfs: number;
    contactos: number;
    votosSi: number;
    votosNo: number;
    /** Coste estimado de OpenAI en dólares y % del prompt servido desde la caché. */
    costeUsd: number;
    pctCache: number;
  };
  porDia: { dia: string; conversaciones: number; mensajes: number; carrito: number }[];
  productosPreguntados: { ref: string; nombre: string; veces: number }[];
  productosAnadidos: { ref: string; veces: number; uds: number }[];
  sinRespuesta: { ts: string; session_id: string; pregunta: string; respuesta: string; motivo: string | null }[];
  valoracionesNo: { ts: string; session_id: string; pregunta: string; comentario: string }[];
  contactos: { ts: string; session_id: string; contacto: string; consulta: string }[];
  errores: { ts: string; ruta: string; categoria: string; detalle: string }[];
  conversaciones: { session_id: string; inicio: string; turnos: number; primera: string; cliente: string | null; carrito: boolean; sin_respuesta: number }[];
}

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function datosPanel(dias: number): Promise<DatosPanel | null> {
  const sql = consultaPanel();
  if (!sql) return null;
  await asegurarEsquema();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  const [k1, k2, porDia, preguntados, anadidos, sinResp, votosNo, contactos, errores, convs] = await Promise.all([
    sql`select count(distinct session_id) conversaciones, count(*) mensajes, count(distinct cliente) clientes,
               count(*) filter (where escalado) escalados, count(*) filter (where sin_respuesta) sin_respuesta,
               coalesce(avg(ms),0) ms_medio,
               coalesce(sum(tokens_entrada),0) t_ent, coalesce(sum(tokens_cache),0) t_cache, coalesce(sum(tokens_salida),0) t_sal
        from chat_mensajes where ts >= ${desde}`,
    sql`select
          count(distinct session_id) filter (where tipo='anadir_carrito' and coalesce(datos->>'confirmado','true') <> 'false') sesiones_carrito,
          coalesce(sum(case when tipo='anadir_carrito' and coalesce(datos->>'confirmado','true') <> 'false'
                 then coalesce((datos->>'uds')::int, (select sum((l->>'uds')::int) from jsonb_array_elements(coalesce(datos->'lineas','[]'::jsonb)) l)) end),0) uds,
          coalesce(sum(case when tipo='anadir_carrito' and coalesce(datos->>'confirmado','true') <> 'false'
                 then coalesce(jsonb_array_length(datos->'lineas'), 1) end),0) lineas,
          count(*) filter (where tipo='tramitar') tramitar,
          count(*) filter (where tipo='pdf') pdfs,
          count(*) filter (where tipo in ('contacto_datos','contacto_email','contacto_tel')) contactos,
          count(*) filter (where tipo='valoracion' and datos->>'voto'='si') si,
          count(*) filter (where tipo='valoracion' and datos->>'voto'='no') no
        from chat_eventos where ts >= ${desde}`,
    sql`with d as (select generate_series(date_trunc('day', ${desde}::timestamptz), date_trunc('day', now()), interval '1 day') dia)
        select to_char(d.dia,'YYYY-MM-DD') dia,
               (select count(distinct session_id) from chat_mensajes m where date_trunc('day', m.ts)=d.dia) conversaciones,
               (select count(*) from chat_mensajes m where date_trunc('day', m.ts)=d.dia) mensajes,
               (select count(distinct session_id) from chat_eventos e where e.tipo='anadir_carrito' and date_trunc('day', e.ts)=d.dia) carrito
        from d order by d.dia`,
    sql`select p->>'ref' ref, max(p->>'nombre') nombre, count(*) veces
        from chat_mensajes, jsonb_array_elements(coalesce(productos,'[]'::jsonb)) p
        where ts >= ${desde} and coalesce(p->>'ref','') <> ''
        group by 1 order by veces desc limit 15`,
    sql`select ref, count(*) veces, sum(uds) uds from (
          select datos->>'ref' ref, coalesce((datos->>'uds')::int,0) uds from chat_eventos
            where tipo='anadir_carrito' and ts >= ${desde} and datos ? 'ref' and coalesce(datos->>'confirmado','true') <> 'false'
          union all
          select l->>'ref', coalesce((l->>'uds')::int,0) from chat_eventos, jsonb_array_elements(datos->'lineas') l
            where tipo='anadir_carrito' and ts >= ${desde} and jsonb_typeof(datos->'lineas')='array'
        ) x where coalesce(ref,'') <> '' group by ref order by veces desc limit 15`,
    sql`select ts, session_id, pregunta, left(coalesce(respuesta,''), 400) respuesta, motivo
        from chat_mensajes where sin_respuesta and ts >= ${desde} order by ts desc limit 100`,
    sql`select ts, session_id, coalesce(datos->>'pregunta','') pregunta, coalesce(datos->>'comentario','') comentario
        from chat_eventos where tipo='valoracion' and datos->>'voto'='no' and ts >= ${desde} order by ts desc limit 50`,
    sql`select ts, session_id,
               case tipo when 'contacto_tel' then '📞 Llamar' when 'contacto_email' then '✉️ E-mail' else coalesce(datos->>'contacto','') end contacto,
               coalesce(datos->>'consulta','') consulta
        from chat_eventos where tipo in ('contacto_tel','contacto_email','contacto_datos') and ts >= ${desde} order by ts desc limit 100`,
    sql`select ts, ruta, categoria, left(coalesce(detalle,''), 300) detalle
        from chat_errores where ts >= ${desde} order by ts desc limit 50`,
    sql`select m.session_id, min(m.ts) inicio, count(*) turnos,
               (array_agg(m.pregunta order by m.ts))[1] primera, max(m.cliente) cliente,
               count(*) filter (where m.sin_respuesta) sin_respuesta,
               exists(select 1 from chat_eventos e where e.session_id=m.session_id and e.tipo='anadir_carrito') carrito
        from chat_mensajes m where m.ts >= ${desde}
        group by m.session_id order by inicio desc limit 60`,
  ]);

  const a = k1[0] ?? {};
  const b = k2[0] ?? {};
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
  return {
    kpi: {
      conversaciones: n(a.conversaciones),
      mensajes: n(a.mensajes),
      clientes: n(a.clientes),
      escalados: n(a.escalados),
      sinRespuesta: n(a.sin_respuesta),
      msMedio: Math.round(n(a.ms_medio)),
      sesionesConCarrito: n(b.sesiones_carrito),
      udsAnadidas: n(b.uds),
      lineasAnadidas: n(b.lineas),
      tramitar: n(b.tramitar),
      pdfs: n(b.pdfs),
      contactos: n(b.contactos),
      votosSi: n(b.si),
      votosNo: n(b.no),
      // Tarifa de gpt-4o (dólares por millón de tokens): entrada 2,50, entrada
      // en caché 1,25, salida 10. Si se cambia de modelo, ajustar aquí.
      costeUsd: ((n(a.t_ent) - n(a.t_cache)) * 2.5 + n(a.t_cache) * 1.25 + n(a.t_sal) * 10) / 1_000_000,
      pctCache: n(a.t_ent) ? Math.round((n(a.t_cache) / n(a.t_ent)) * 100) : 0,
    },
    porDia: porDia.map((r) => ({ dia: String(r.dia), conversaciones: n(r.conversaciones), mensajes: n(r.mensajes), carrito: n(r.carrito) })),
    productosPreguntados: preguntados.map((r) => ({ ref: String(r.ref), nombre: String(r.nombre ?? ""), veces: n(r.veces) })),
    productosAnadidos: anadidos.map((r) => ({ ref: String(r.ref), veces: n(r.veces), uds: n(r.uds) })),
    sinRespuesta: sinResp.map((r) => ({ ts: iso(r.ts), session_id: String(r.session_id), pregunta: String(r.pregunta), respuesta: String(r.respuesta), motivo: (r.motivo as string) ?? null })),
    valoracionesNo: votosNo.map((r) => ({ ts: iso(r.ts), session_id: String(r.session_id), pregunta: String(r.pregunta), comentario: String(r.comentario) })),
    contactos: contactos.map((r) => ({ ts: iso(r.ts), session_id: String(r.session_id), contacto: String(r.contacto), consulta: String(r.consulta) })),
    errores: errores.map((r) => ({ ts: iso(r.ts), ruta: String(r.ruta), categoria: String(r.categoria), detalle: String(r.detalle) })),
    conversaciones: convs.map((r) => ({
      session_id: String(r.session_id),
      inicio: iso(r.inicio),
      turnos: n(r.turnos),
      primera: String(r.primera ?? ""),
      cliente: (r.cliente as string) ?? null,
      carrito: !!r.carrito,
      sin_respuesta: n(r.sin_respuesta),
    })),
  };
}

export async function conversacion(sessionId: string) {
  const sql = consultaPanel();
  if (!sql) return null;
  await asegurarEsquema();
  const [mensajes, eventos] = await Promise.all([
    sql`select ts, pregunta, respuesta, productos, escalado, motivo, sin_respuesta, ms, cliente, origen
        from chat_mensajes where session_id=${sessionId} order by ts`,
    sql`select ts, tipo, datos from chat_eventos where session_id=${sessionId} order by ts`,
  ]);
  return { mensajes, eventos };
}

export async function exportar(tipo: "mensajes" | "sin_respuesta" | "contactos", dias: number) {
  const sql = consultaPanel();
  if (!sql) return [];
  await asegurarEsquema();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  if (tipo === "contactos") {
    return sql`select ts, session_id,
                      case tipo when 'contacto_tel' then 'teléfono' when 'contacto_email' then 'e-mail' else datos->>'contacto' end contacto,
                      datos->>'desde' desde, datos->>'consulta' consulta
               from chat_eventos where tipo in ('contacto_tel','contacto_email','contacto_datos') and ts >= ${desde} order by ts desc`;
  }
  if (tipo === "sin_respuesta") {
    return sql`select ts, session_id, cliente, pregunta, respuesta, motivo from chat_mensajes
               where sin_respuesta and ts >= ${desde} order by ts desc`;
  }
  return sql`select ts, session_id, origen, cliente, pregunta, respuesta, escalado, motivo, sin_respuesta, ms
             from chat_mensajes where ts >= ${desde} order by ts desc limit 5000`;
}
