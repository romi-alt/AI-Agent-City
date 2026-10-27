import type { Metadata } from 'next';
import { DemoOffice } from './DemoOffice';

export const metadata: Metadata = { title: 'Your demo office — AgentCity' };

/** Signed in, in a demo tenant: the office scene, the selected agent's panel, the guided tour. */
export default function OfficePage() {
  return <DemoOffice />;
}
