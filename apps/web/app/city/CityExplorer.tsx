'use client';
import dynamic from 'next/dynamic';

// WebGL needs the browser: the scene is never rendered on the server.
const CityScene = dynamic(() => import('@agentcity/city-scene').then(m => m.CityScene), {
  ssr: false,
  loading: () => <p className="city-loading">Loading the city…</p>,
});

export function CityExplorer() {
  return (
    <main className="city-page" style={{ height: '100dvh' }}>
      <CityScene />
    </main>
  );
}
