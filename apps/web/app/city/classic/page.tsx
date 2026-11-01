import type { Metadata } from 'next';
import { CityExplorer } from '../CityExplorer';

export const metadata: Metadata = { title: 'Explore AgentCity' };

// Owner: workstream A3 (camera, navigation, HUD). The public city: catalog only, no tenant data.
export default function CityPage() {
  return <CityExplorer />;
}
