import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LITE_DEMO } from '../../../lib/preview';
import { LiteOffice } from './LiteOffice';

export const metadata: Metadata = { title: 'Your demo office — AgentCity', robots: { index: false } };

/** The visitor's own simulated office in the 3D city. Only exists in the lite demo build. */
export default function DemoOfficePage() {
  if (!LITE_DEMO) notFound();
  return <LiteOffice />;
}
