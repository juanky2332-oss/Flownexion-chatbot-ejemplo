import { NextRequest, NextResponse } from "next/server";

// El panel (/panel y su exportación) lleva usuario y contraseña: el navegador
// los pide una vez y los recuerda. Se configuran en Vercel con PANEL_USUARIO y
// PANEL_CLAVE; sin PANEL_CLAVE el panel queda cerrado para todo el mundo.
export function middleware(req: NextRequest) {
  const usuario = process.env.PANEL_USUARIO || "esgas";
  const clave = process.env.PANEL_CLAVE || "";
  const auth = req.headers.get("authorization") ?? "";
  if (clave && auth.startsWith("Basic ")) {
    try {
      const [u, ...resto] = atob(auth.slice(6)).split(":");
      if (u === usuario && resto.join(":") === clave) return NextResponse.next();
    } catch {
      /* cabecera mal formada */
    }
  }
  return new NextResponse("Acceso restringido", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Panel del chat ESGAS", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/panel/:path*", "/api/panel/:path*"] };
