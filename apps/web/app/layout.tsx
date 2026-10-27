import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';
import './theme.css';

// Self-hosted (OFL, see public/fonts/LICENSES.md): the build needs no network, and next/font adds size-adjusted
// fallbacks so swapping the font in causes no layout shift.
const display = localFont({
  src: [
    { path: '../public/fonts/instrument-serif-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/instrument-serif-latin-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
});
const text = localFont({
  src: [{ path: '../public/fonts/instrument-sans-latin-wght-normal.woff2', weight: '400 700', style: 'normal' }],
  variable: '--font-instrument-sans',
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
  themeColor: '#0f1b2d',
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}
