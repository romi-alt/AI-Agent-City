import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';
import './theme.css';

// Geist, self-hosted (OFL, see public/fonts/LICENSES.md): the build needs no network, and next/font adds a
// size-adjusted fallback so swapping the font in causes no layout shift.
const sans = localFont({
  src: [{ path: '../public/fonts/Geist-Variable.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-geist',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

// Absolute URLs for Open Graph. PUBLIC_ORIGIN is the site's own address (infra/local-dev.env).
const origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: 'AgentCity',
  description: 'AgentCity: AI teams working in a living 3D city.',
  // Not launched: nothing is indexed unless a page opts in (the landing page does, when NEXT_PUBLIC_ALLOW_INDEX=true).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#fafaf9',
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
