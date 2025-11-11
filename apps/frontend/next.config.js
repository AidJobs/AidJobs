/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL;

    if (!api) return [];

    return [
      {
        source: '/api/:path*',
        destination: `${api}/api/:path*`,
      },
      // Note: Admin pages (like /admin/login) are served by Next.js pages
      // Admin API calls are proxied via /api/admin/* routes, not rewrites
    ];
  },
};

module.exports = nextConfig;
