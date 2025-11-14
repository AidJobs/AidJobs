/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL;

    if (!api) return [];

    return [
      {
        source: '/api/:path*',
        destination: `${api}/api/:path*`,
        // Exclude /api/admin/* routes - these are handled by Next.js API routes (app/api/admin/*)
        // which act as proxies to the backend
        has: [
          {
            type: 'header',
            key: 'x-nextjs-rewrite',
            value: 'false',
          },
        ],
      },
      // Note: Admin pages (like /admin/login) are served by Next.js pages
      // Admin API calls are proxied via /api/admin/* routes (app/api/admin/*), not rewrites
      // The rewrite above is for public API routes like /api/search, /api/healthz, etc.
    ];
  },
};

module.exports = nextConfig;
