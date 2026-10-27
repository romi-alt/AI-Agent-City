'use client';
import dynamic from 'next/dynamic';

// WebGL needs the browser: the explorer (scene, HUD and 2D fallback) never renders on the server.
const CityClient = dynamic(() => import('./CityClient').then(m => m.CityClient), {
  ssr: false,
  loading: () => (
    <main
      className="city-loading"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#0f1b2d',
        color: '#f6f3ec',
        maxWidth: 'none',
        padding: 0,
      }}
    >
      <p style={{ color: '#f6f3ec' }}>Loading the city…</p>
    </main>
  ),
});

export function CityExplorer() {
  return <CityClient />;
}
