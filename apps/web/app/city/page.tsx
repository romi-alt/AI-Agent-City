import type { Metadata } from 'next';
import { AscCity } from './AscCity';

export const metadata: Metadata = { title: 'Explore the city · AutoSalesCity' };

// The public city: the design's own 3D city, opened full screen. The earlier AgentCity explorer is still at /city/classic.
export default function CityPage() {
  return <AscCity />;
}
