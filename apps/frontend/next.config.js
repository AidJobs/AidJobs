/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL;

    if (!api) return [];

    // Normalize backend URL: strip trailing /api so we don't end up with /api/api/... in production
    const backend = api.replace(/\/api$/, '');

    return [
      // Rewrite public API routes (search, healthz, db status, etc.) to backend
      // Exclude /api/admin/* - those are handled by Next.js API routes in app/api/admin/*
      {
        source: '/api/search/:path*',
        destination: `${backend}/api/search/:path*`,
      },
      {
        source: '/api/healthz',
        destination: `${backend}/api/healthz`,
      },
      {
        source: '/api/capabilities',
        destination: `${backend}/api/capabilities`,
      },
      {
        source: '/api/jobs/:path*',
        destination: `${backend}/api/jobs/:path*`,
      },
      {
        // Dashboard uses this for the Database card
        source: '/api/db/status',
        destination: `${backend}/api/db/status`,
      },
      // Note: /api/admin/* routes are NOT rewritten - they are handled by Next.js API routes
      // in app/api/admin/* which act as proxies to the backend
    ];
  },
};

module.exports = nextConfig;
