/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL;

    if (!api) return [];

    return [
      // Rewrite public API routes (search, healthz, etc.) to backend
      // Exclude /api/admin/* - those are handled by Next.js API routes in app/api/admin/*
      {
        source: '/api/search/:path*',
        destination: `${api}/api/search/:path*`,
      },
      {
        source: '/api/healthz',
        destination: `${api}/api/healthz`,
      },
      {
        source: '/api/capabilities',
        destination: `${api}/api/capabilities`,
      },
      {
        source: '/api/jobs/:path*',
        destination: `${api}/api/jobs/:path*`,
      },
      // Note: /api/admin/* routes are NOT rewritten - they are handled by Next.js API routes
      // in app/api/admin/* which act as proxies to the backend
    ];
  },
};

module.exports = nextConfig;
