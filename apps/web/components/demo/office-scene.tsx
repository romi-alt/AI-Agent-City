'use client';

// THE SWAP POINT for the demo office scene. Workstream A3 exports <DemoOfficeScene agents building level onSelectAgent />
// from @agentcity/city-scene (interior/). Until it lands, a 2D stand-in with the same props is used. To switch, replace
// the import inside dynamic() with:
//
//   import('@agentcity/city-scene').then(m => m.DemoOfficeScene)
//
// WebGL needs the browser, so the scene is never rendered on the server (ssr: false).
import dynamic from 'next/dynamic';

export const DemoOfficeScene = dynamic(() => import('./DemoOfficeStandIn').then(m => m.DemoOfficeStandIn), {
  ssr: false,
  loading: () => (
    <p className="dm-status-line" style={{ padding: 24 }}>
      Opening your office…
    </p>
  ),
});
