import type { Metadata } from 'next';
import { LITE_DEMO } from '../../../lib/preview';
import { DemoWelcome } from './DemoWelcome';
import { LiteWelcome } from './LiteWelcome';

export const metadata: Metadata = { title: 'Welcome to AgentCity' };

/** Signed in: the demo is claimed here (the API checks the session and the verified email). */
export default function WelcomePage() {
  return <main className="dm-main">{LITE_DEMO ? <LiteWelcome /> : <DemoWelcome />}</main>;
}
