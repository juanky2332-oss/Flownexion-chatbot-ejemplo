/** @type {import('next').NextConfig} */
const nextConfig = {
  // ⚠️ OJO: con ignoreBuildErrors, "next build" compila y dice "Compiled
  // successfully" AUNQUE haya errores de TypeScript. Un identificador sin
  // importar pasa el build y revienta en producción con un ReferenceError
  // (pasó de verdad el 2026-07-27: findGlossaryForMessage sin importar tumbó
  // /api/chat entero). El build NO es una verificación válida por sí solo:
  // antes de desplegar hay que pasar "npm run verify" (typecheck + test:kb +
  // build) y mirar su código de salida.
  typescript: {
    ignoreBuildErrors: true,
  },

  // ⚠️ El KB (data/kb/*.json) llega a la función serverless porque lib/kb.ts
  // escribe cada ruta LITERALMENTE en su readFileSync — ver KB_READERS allí.
  // El rastreador de ficheros de Next solo sabe seguir rutas literales: con
  // la versión anterior, que pasaba la ruta como variable, NINGÚN JSON del KB
  // se empaquetaba (solo glosario.json, el único ya literal) y el bot decía
  // "no tengo información técnica" teniendo el dato. En local nunca se nota,
  // porque ahí los ficheros están en disco.
  //
  // outputFileTracingIncludes se probó como alternativa y NO surtió efecto en
  // esta versión de Next; la garantía son las rutas literales. Al tocar la
  // carga del KB, comprobar que .next/server/app/api/chat/route.js.nft.json
  // sigue listando los 36 ficheros de data/kb.
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        // Permite que /embed sea embebido como iframe en b2b.esgas.es
        source: '/embed',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' https://b2b.esgas.es https://*.esgas.es http://localhost:* https://localhost:*",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
