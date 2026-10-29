import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// The browser talks only to this site (PUBLIC_ORIGIN); `/api/*` is proxied to the API so the session cookie it sets
// is first-party here (DESIGN.md "Topology"). Next records rewrites at build time, so API_URL must be set for
// `next build` as well as for `next start`.
const apiUrl = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/+$/, '');

const preview = process.env.NEXT_PUBLIC_PUBLIC_PREVIEW === 'true';

const config: NextConfig = {
  // The public preview ships as a self-contained server (no workspace install on the host); tracing starts at the
  // repository root so the workspace packages are included. No page uses next/image, so the native image resizer
  // (sharp, ~37 MB) is left out of the package.
  ...(preview
    ? {
        output: 'standalone' as const,
        // fileURLToPath, not URL.pathname: on Windows the pathname is `/D:/...`, which Turbopack cannot open.
        outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
        outputFileTracingExcludes: { '*': ['**/@img/**', '**/sharp@*/**', '**/sharp/**'] },
        images: { unoptimized: true },
      }
    : {}),
  // The browser smoke test (test/browser-smoke.ts) builds into its own folder so it never replaces the real build.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // The 3D city is a workspace package shipped as TypeScript source.
  transpilePackages: ['@agentcity/city-scene'],
  poweredByHeader: false,
  async rewrites() {
    if (preview) return [];
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      // Pages are prerendered, and Next gives them a one-year shared-cache lifetime. The host's CDN kept serving an old
      // homepage after a deploy because of it, so HTML is revalidated every minute; hashed assets stay long-cached.
      {
        source: '/((?!_next/static|_next/image|api/|city/|fonts/|asc/|favicon|og-).*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' }],
      },
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
