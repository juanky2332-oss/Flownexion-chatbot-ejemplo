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
