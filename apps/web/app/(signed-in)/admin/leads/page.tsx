import type { Metadata } from 'next';
import { LeadsTable } from './LeadsTable';

export const metadata: Metadata = { title: 'Demo leads — AgentCity', referrer: 'no-referrer' };

/** Owner of the platform agency only; the API asks for a fresh strong sign-in (step-up `permission`). */
export default function LeadsPage() {
  return <LeadsTable />;
}
