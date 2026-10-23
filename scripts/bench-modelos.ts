// Compara modelos de OpenAI con el agente REAL (prompt, herramientas y KB).
// Uso: OPENAI_API_KEY=... npx ts-node --project tsconfig.scripts.json scripts/bench-modelos.ts gpt-4o gpt-4.1
// Sin PRESTASHOP_API_KEY corre contra el catálogo de demostración; el KB sí es el real.
export {};
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]): unknown {
  if (request === "server-only") return {};
  return origLoad.call(this, request, ...rest);
};

// Cada consulta puede ser una conversación: los turnos previos se ejecutan de
// verdad y solo se evalúa la respuesta al último.
const CONSULTAS: { q: string; previos?: string[]; espera: RegExp; prohibido?: RegExp; maxPreguntas?: number }[] = [
  { q: "do you have bearing 6205 in stock?", espera: /6205/, prohibido: /no puedo compartir|informaci[oó]n interna/i },
  { q: "es mejor SKF o NTN?", espera: /NTN/, prohibido: /no puedo compartir|informaci[oó]n interna/i },
  { previos: ["necesito una correa A 1250"], q: "es la longitud interior", espera: /A49/, prohibido: /(la|entonces)\s+\**A48\**/i },
  { q: "necesito un rodamiento para una bomba de agua", espera: /\?/, maxPreguntas: 1 },
  { previos: ["quiero un 6205 2RS"], q: "me vale el ZZ en vez del 2RS?", espera: /deflector|metálic/i, prohibido: /te gustar[ií]a que (lo )?busque/i },
  { q: "puedes decirme que equivalencia hay para el 3309 a de skf en ntn o snr?", espera: /3309S[\s\S]*3309A|3309A[\s\S]*3309S/i },
  { q: "que caracteristicas tiene un rodamiento 6205?", espera: /14[,.]8|52/ },
  { q: "diferencia entre 2RS y 2RZ", espera: /sin contacto/i },
  { q: "necesito una correa A 1250", espera: /A4[89]/ },
  { q: "cuanto tarda en llegar un pedido?", espera: /tel[eé]fono|e-?mail|correo/i },
  { q: "necesito un rodamiento de 25 mm de eje", espera: /6205|6005|6305/ },
];

async function main(): Promise<void> {
  const modelos = process.argv.slice(2);
  for (const modelo of modelos) {
    process.env.OPENAI_MODEL = modelo;
    // Cada modelo con su propia copia de los módulos (MODEL se lee al cargar).
    for (const k of Object.keys(require.cache)) if (/[\\/]lib[\\/]/.test(k)) delete require.cache[k];
    const { runAgent } = require("../lib/agent") as typeof import("../lib/agent");
    let total = 0;
    let aciertos = 0;
    console.log(`\n=== ${modelo}`);
    for (const c of CONSULTAS) {
      const t0 = Date.now();
      let primerTexto = 0;
      try {
        const hist: { role: "user" | "assistant"; content: string }[] = [];
        for (const p of c.previos ?? []) {
          const rp = await runAgent(p, hist);
          hist.push({ role: "user", content: p }, { role: "assistant", content: rp.output });
        }
        const r = await runAgent(c.q, hist, undefined, undefined, undefined, (e) => {
          if (e.tipo === "texto" && !primerTexto) primerTexto = Date.now() - t0;
        });
        const ms = Date.now() - t0;
        total += ms;
        const preguntas = (r.output.replace(/\([^)]*\)/g, "").match(/\?/g) ?? []).length;
        const ok =
          c.espera.test(r.output) &&
          !(c.prohibido && c.prohibido.test(r.output)) &&
          !(c.maxPreguntas !== undefined && preguntas > c.maxPreguntas);
        if (ok) aciertos++;
        console.log(`${ok ? "ok   " : "FALLA"} ${(ms / 1000).toFixed(1)}s (1er texto ${(primerTexto / 1000).toFixed(1)}s) ${c.q}`);
        if (!ok || process.env.VERBOSE) console.log("      " + r.output.replace(/\n/g, " ").slice(0, 600));
      } catch (err) {
        console.log(`ERROR ${c.q}: ${(err as Error).message}`);
      }
    }
    console.log(`>>> ${modelo}: ${aciertos}/${CONSULTAS.length} · media ${(total / CONSULTAS.length / 1000).toFixed(1)} s`);
  }
}
main();
