/** @type {import('next').NextConfig} */
const nextConfig = {
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
