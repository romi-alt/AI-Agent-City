import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// The browser talks only to this site (PUBLIC_ORIGIN); `/api/*` is proxied to the API so the session cookie it sets
// is first-party here (DESIGN.md "Topology"). Next records rewrites at build time, so API_URL must be set for
// `next build` as well as for `next start`.
const apiUrl = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/+$/, '');

const preview = process.env.NEXT_PUBLIC_PUBLIC_PREVIEW === 'true';

// Content-Security-Policy. The site loads nothing from other hosts (fonts, models and textures are served from here
// and the city's own loaders use blob:/data: URLs), so everything is limited to this origin. Scripts and styles keep
// 'unsafe-inline' because Next writes its hydration data inline and the pages are prerendered, so a per-request
// nonce is not possible; the other directives (no objects, no other origins to talk to, no framing, no foreign
// form targets) are what limit the damage of an injected tag. `next dev` needs eval for React's debugging.
const development = process.env.NODE_ENV === 'development';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' data: blob:${development ? ' ws: wss:' : ''}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

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
        source: '/((?!_next/static|_next/image|api/|city/|fonts/|favicon|og-).*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' }],
      },
      // The confirm page's address carries the one-time token, so no shared cache may keep it.
      { source: '/demo/confirm', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // Browsers ignore this over plain http, so it only takes effect on the https site. No includeSubDomains
          // or preload: other subdomains of the domain (mail, say) are not ours to commit to https from here.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default config;
