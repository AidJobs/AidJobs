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
      {
        source: '/admin/:path*',
        destination: `${api}/admin/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
