import Link from "next/link";
import { headers } from "next/headers";
import { datosPanel, conversacion } from "@/lib/panel";

// Panel privado del chat (usuario y contraseña, ver middleware.ts): qué se
// pregunta, qué no sabe responder el bot, cuánto acaba en carrito, qué valoran
// mal los clientes, quién ha dejado sus datos y los errores técnicos.

export const dynamic = "force-dynamic";
export const metadata = { title: "Panel del chat · ESGAS", robots: { index: false, follow: false } };

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");

function Tarjeta({ titulo, valor, nota }: { titulo: string; valor: string | number; nota?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-gray-500">{nota}</p>}
    </div>
  );
}

function Seccion({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-900">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

const Vacio = ({ texto = "Nada en este periodo." }: { texto?: string }) => <p className="text-sm text-gray-400">{texto}</p>;

export default async function Panel({ searchParams }: { searchParams: { dias?: string; sesion?: string } }) {
  const dias = Math.min(365, Math.max(1, Number(searchParams.dias) || 30));
  // El coste de OpenAI es cosa de Flownexion: ESGAS no lo ve.
  const verCoste = headers().get("x-panel-usuario") === "flownexion";

  if (searchParams.sesion) return <VistaConversacion id={searchParams.sesion} dias={dias} />;

  let d: Awaited<ReturnType<typeof datosPanel>> = null;
  let fallo = "";
  try {
    d = await datosPanel(dias);
  } catch (err) {
    fallo = (err as Error).message;
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 text-gray-800">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Panel del chat técnico · ESGAS</h1>
            <p className="text-sm text-gray-500">Últimos {dias} días · se actualiza en cada visita</p>
          </div>
          <nav className="flex gap-1 text-sm">
            {[1, 7, 30, 90].map((x) => (
              <Link
                key={x}
                href={`/panel?dias=${x}`}
                className={`rounded-lg px-3 py-1.5 font-medium ${x === dias ? "bg-[#0066cc] text-white" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"}`}
              >
                {x === 1 ? "Hoy" : `${x} días`}
              </Link>
            ))}
          </nav>
        </header>

        {!d ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {fallo ? `No se ha podido leer el registro: ${fallo}` : "El registro no está configurado (falta la base de datos)."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <Tarjeta titulo="Conversaciones" valor={d.kpi.conversaciones} nota={`${d.kpi.mensajes} preguntas · ${d.kpi.clientes} clientes identificados`} />
              <Tarjeta
                titulo="Acaban en carrito"
                valor={pct(d.kpi.sesionesConCarrito, d.kpi.conversaciones)}
                nota={`${d.kpi.sesionesConCarrito} conversaciones · ${d.kpi.udsAnadidas} uds añadidas`}
              />
              <Tarjeta titulo="Sin respuesta" valor={d.kpi.sinRespuesta} nota={`${pct(d.kpi.sinRespuesta, d.kpi.mensajes)} de las preguntas`} />
              <Tarjeta titulo="Tiempo medio" valor={`${(d.kpi.msMedio / 1000).toFixed(1)} s`} nota="hasta la respuesta completa" />
              <Tarjeta titulo="Pulsan «Tramitar pedido»" valor={d.kpi.tramitar} />
              <Tarjeta titulo="PDF descargados" valor={d.kpi.pdfs} />
              <Tarjeta titulo="Piden contacto" valor={d.kpi.contactos} nota={`${d.kpi.escalados} respuestas ofrecieron un técnico`} />
              <Tarjeta titulo="Valoraciones" valor={`👍 ${d.kpi.votosSi} · 👎 ${d.kpi.votosNo}`} />
              {verCoste && <Tarjeta
                titulo="Coste de OpenAI (estimado)"
                valor={`${d.kpi.costeUsd.toFixed(2)} $`}
                nota={`${d.kpi.mensajes ? (d.kpi.costeUsd / d.kpi.mensajes).toFixed(3) : "0"} $ por pregunta · ${d.kpi.pctCache} % del prompt desde caché`}
              />}
            </div>

            <Seccion titulo="Actividad por día">
              {(() => {
                const max = Math.max(1, ...d.porDia.map((x) => x.conversaciones));
                const ultimos = d.porDia.slice(-31);
                return (
                  <div className="flex h-32 items-end gap-[3px]">
                    {ultimos.map((x) => (
                      <div key={x.dia} className="group relative flex h-full flex-1 flex-col justify-end" title={`${x.dia}: ${x.conversaciones} conversaciones, ${x.carrito} con carrito`}>
                        <div className="w-full rounded-t-sm bg-[#0066cc]" style={{ height: `${(x.conversaciones / max) * 100}%`, minHeight: x.conversaciones ? 2 : 0 }} />
                      </div>
                    ))}
                  </div>
                );
              })()}
              <p className="mt-1 flex justify-between text-[11px] text-gray-400">
                <span>{d.porDia.slice(-31)[0]?.dia}</span>
                <span>conversaciones por día (pasa el ratón para ver el detalle)</span>
                <span>{d.porDia[d.porDia.length - 1]?.dia}</span>
              </p>
            </Seccion>

            <div className="grid gap-4 md:grid-cols-2">
              <Seccion titulo="Productos más consultados">
                {d.productosPreguntados.length ? (
                  <table className="w-full text-sm">
                    <tbody>
                      {d.productosPreguntados.map((p) => (
                        <tr key={p.ref} className="border-t border-gray-100">
                          <td className="py-1.5 font-mono text-xs">{p.ref}</td>
                          <td className="truncate py-1.5 text-gray-500">{p.nombre}</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">{p.veces}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Vacio />
                )}
              </Seccion>
              <Seccion titulo="Productos añadidos al carrito desde el chat">
                {d.productosAnadidos.length ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400">
                        <th className="font-medium">Referencia</th>
                        <th className="text-right font-medium">Veces</th>
                        <th className="text-right font-medium">Uds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.productosAnadidos.map((p) => (
                        <tr key={p.ref} className="border-t border-gray-100">
                          <td className="py-1.5 font-mono text-xs">{p.ref}</td>
                          <td className="py-1.5 text-right tabular-nums">{p.veces}</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">{p.uds}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Vacio />
                )}
              </Seccion>
            </div>

            <Seccion
              titulo={`Consultas que el bot no resolvió (${d.sinRespuesta.length})`}
              extra={<a href={`/api/panel/export?tipo=sin_respuesta&dias=${dias}`} className="text-xs font-semibold text-[#0066cc] hover:underline">Descargar CSV</a>}
            >
              <p className="mb-2 text-xs text-gray-500">
                Es la lista de trabajo para mejorar el bot: cada una es un dato que falta en el glosario o en el catálogo, o una regla que ajustar.
              </p>
              {d.sinRespuesta.length ? (
                <ul className="divide-y divide-gray-100">
                  {d.sinRespuesta.map((x, i) => (
                    <li key={i} className="py-2 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/panel?sesion=${encodeURIComponent(x.session_id)}&dias=${dias}`} className="font-semibold text-gray-900 hover:underline">
                          {x.pregunta}
                        </Link>
                        <span className="text-xs text-gray-400">
                          {fecha(x.ts)}
                          {x.motivo ? ` · ${x.motivo}` : ""}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{x.respuesta}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <Vacio texto="Ninguna. 👍" />
              )}
            </Seccion>

            <div className="grid gap-4 md:grid-cols-2">
              <Seccion
                titulo="Clientes que han dejado sus datos"
                extra={<a href={`/api/panel/export?tipo=contactos&dias=${dias}`} className="text-xs font-semibold text-[#0066cc] hover:underline">CSV</a>}
              >
                {d.contactos.length ? (
                  <ul className="divide-y divide-gray-100 text-sm">
                    {d.contactos.map((c, i) => (
                      <li key={i} className="py-1.5">
                        <span className="font-semibold">{c.contacto}</span> <span className="text-xs text-gray-400">· {fecha(c.ts)}</span>
                        <p className="text-xs text-gray-500">{c.consulta}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Vacio />
                )}
              </Seccion>
              <Seccion titulo="Respuestas valoradas con 👎">
                {d.valoracionesNo.length ? (
                  <ul className="divide-y divide-gray-100 text-sm">
                    {d.valoracionesNo.map((v, i) => (
                      <li key={i} className="py-1.5">
                        <Link href={`/panel?sesion=${encodeURIComponent(v.session_id)}&dias=${dias}`} className="font-semibold hover:underline">
                          {v.pregunta || "(sin pregunta)"}
                        </Link>
                        <p className="text-xs text-gray-500">{v.comentario || "Sin comentario"} · {fecha(v.ts)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Vacio />
                )}
              </Seccion>
            </div>

            <Seccion
              titulo="Conversaciones recientes"
              extra={<a href={`/api/panel/export?tipo=mensajes&dias=${dias}`} className="text-xs font-semibold text-[#0066cc] hover:underline">Descargar todo (CSV)</a>}
            >
              {d.conversaciones.length ? (
                <ul className="divide-y divide-gray-100 text-sm">
                  {d.conversaciones.map((c) => (
                    <li key={c.session_id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                      <Link href={`/panel?sesion=${encodeURIComponent(c.session_id)}&dias=${dias}`} className="min-w-0 flex-1 truncate hover:underline">
                        {c.primera}
                      </Link>
                      <span className="text-xs text-gray-400">
                        {c.turnos} pregunta{c.turnos === 1 ? "" : "s"}
                        {c.carrito ? " · 🛒 carrito" : ""}
                        {c.sin_respuesta ? ` · ${c.sin_respuesta} sin respuesta` : ""}
                        {c.cliente ? ` · ${c.cliente}` : ""} · {fecha(c.inicio)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Vacio />
              )}
            </Seccion>

            <Seccion titulo={`Errores técnicos (${d.errores.length})`}>
              {d.errores.length ? (
                <ul className="divide-y divide-gray-100 text-sm">
                  {d.errores.map((e, i) => (
                    <li key={i} className="py-1.5">
                      <span className="font-semibold text-red-700">{e.categoria}</span>{" "}
                      <span className="text-xs text-gray-400">
                        {e.ruta} · {fecha(e.ts)}
                      </span>
                      <p className="break-all text-xs text-gray-500">{e.detalle}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <Vacio texto="Ninguno." />
              )}
            </Seccion>
          </>
        )}
      </div>
    </main>
  );
}

async function VistaConversacion({ id, dias }: { id: string; dias: number }) {
  const c = await conversacion(id);
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 text-gray-800">
      <div className="mx-auto max-w-3xl space-y-3">
        <Link href={`/panel?dias=${dias}`} className="text-sm font-semibold text-[#0066cc] hover:underline">
          ← Volver al panel
        </Link>
        <h1 className="text-lg font-bold text-gray-900">Conversación</h1>
        {!c || !c.mensajes.length ? (
          <Vacio texto="No hay mensajes de esta conversación." />
        ) : (
          <>
            <p className="text-xs text-gray-500">
              {c.mensajes[0].cliente ? `Cliente: ${c.mensajes[0].cliente} · ` : "Cliente sin identificar · "}
              {c.mensajes[0].origen === "tienda" ? "desde la tienda" : "desde la web del chat"}
            </p>
            {c.mensajes.map((m, i) => (
              <div key={i} className="space-y-1.5">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#0066cc] px-3 py-2 text-sm text-white">{String(m.pregunta)}</div>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border bg-white px-3 py-2 text-sm ${m.sin_respuesta ? "border-red-300" : "border-gray-200"}`}>
                  {String(m.respuesta ?? "")}
                  <p className="mt-1.5 text-[11px] text-gray-400">
                    {fecha(m.ts instanceof Date ? m.ts.toISOString() : String(m.ts))} · {((Number(m.ms) || 0) / 1000).toFixed(1)} s
                    {m.escalado ? ` · ofreció técnico${m.motivo ? ` (${m.motivo})` : ""}` : ""}
                    {m.sin_respuesta ? " · SIN RESPUESTA" : ""}
                    {Array.isArray(m.productos) && m.productos.length
                      ? ` · tarjetas: ${(m.productos as { ref: string }[]).map((p) => p.ref).join(", ")}`
                      : ""}
                  </p>
                </div>
              </div>
            ))}
            {c.eventos.length > 0 && (
              <Seccion titulo="Qué hizo el cliente">
                <ul className="text-xs text-gray-600">
                  {c.eventos.map((e, i) => (
                    <li key={i}>
                      {fecha(e.ts instanceof Date ? e.ts.toISOString() : String(e.ts))} · <strong>{String(e.tipo)}</strong> {JSON.stringify(e.datos)}
                    </li>
                  ))}
                </ul>
              </Seccion>
            )}
          </>
        )}
      </div>
    </main>
  );
}
