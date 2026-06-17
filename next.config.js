/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Prevent TypeScript type errors from blocking the production build.
    // Type safety is enforced during development (IDE / CI checks).
    ignoreBuildErrors: true,
  },
  eslint: {
    // Same for ESLint — warnings don't block Vercel deploys.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
