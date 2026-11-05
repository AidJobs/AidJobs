/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // Same setting as SITE_INDEXABLE in lib/site/siteUrl.ts. Netlify never sets it, so its copies stay unindexed.
    if (process.env.NEXT_PUBLIC_SITE_INDEXABLE === 'true') return [];
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL;

    if (!api) return [];

    // Normalize backend URL: strip trailing /api so we don't end up with /api/api/... in production
    const backend = api.replace(/\/api$/, '');

    return [
      // Rewrite public API routes (search, healthz, etc.) to backend. These run after the route
      // files, so a path with its own app/api route (such as /api/db/status) never reaches them.
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
      // Note: /api/admin/* routes are NOT rewritten - they are handled by Next.js API routes
      // in app/api/admin/* which act as proxies to the backend
    ];
  },
};

module.exports = nextConfig;
