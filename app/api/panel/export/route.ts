import { NextRequest } from "next/server";
import { exportar } from "@/lib/panel";

// CSV del panel (protegido por middleware.ts). Separador ";" y BOM para que
// Excel en español lo abra bien con doble clic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const tipo = (["mensajes", "sin_respuesta", "contactos"].includes(q.get("tipo") ?? "") ? q.get("tipo") : "mensajes") as
    | "mensajes"
    | "sin_respuesta"
    | "contactos";
  const dias = Math.min(365, Math.max(1, Number(q.get("dias")) || 30));
  const filas = (await exportar(tipo, dias)) as Record<string, unknown>[];
  const cols = filas.length ? Object.keys(filas[0]) : ["sin_datos"];
  const celda = (v: unknown) => {
    const t = v instanceof Date ? v.toISOString() : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${t.replace(/"/g, '""')}"`;
  };
  const csv = "﻿" + [cols.join(";"), ...filas.map((f) => cols.map((c) => celda(f[c])).join(";"))].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="chat-esgas-${tipo}-${dias}d.csv"`,
    },
  });
}
