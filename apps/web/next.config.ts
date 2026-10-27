import type { NextConfig } from 'next';

// The browser talks only to this site (PUBLIC_ORIGIN); `/api/*` is proxied to the API so the session cookie it sets
// is first-party here (DESIGN.md "Topology"). Next records rewrites at build time, so API_URL must be set for
// `next build` as well as for `next start`.
const apiUrl = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/+$/, '');

const config: NextConfig = {
  // The browser smoke test (test/browser-smoke.ts) builds into its own folder so it never replaces the real build.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default config;
