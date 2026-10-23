import { NextRequest, NextResponse } from "next/server";

// El panel (/panel y su exportación) lleva usuario y contraseña: el navegador
// los pide una vez y los recuerda, y todo viaja cifrado (HTTPS).
// Cada uno con su acceso: PANEL_ACCESOS = "esgas:clave1;flownexion:clave2".
// (PANEL_USUARIO + PANEL_CLAVE siguen valiendo como un acceso más.)
// Sin ningún acceso configurado el panel queda cerrado para todo el mundo.
function accesos(): Map<string, string> {
  const m = new Map<string, string>();
  for (const par of (process.env.PANEL_ACCESOS || "").split(";")) {
    const i = par.indexOf(":");
    if (i > 0) m.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
  if (process.env.PANEL_CLAVE) m.set(process.env.PANEL_USUARIO || "esgas", process.env.PANEL_CLAVE);
  return m;
}

export function middleware(req: NextRequest) {
  const permitidos = accesos();
  const auth = req.headers.get("authorization") ?? "";
  if (permitidos.size && auth.startsWith("Basic ")) {
    try {
      const [u, ...resto] = atob(auth.slice(6)).split(":");
      const clave = permitidos.get(u);
      if (clave && resto.join(":") === clave) return NextResponse.next();
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
