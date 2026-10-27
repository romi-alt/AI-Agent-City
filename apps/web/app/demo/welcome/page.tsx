import type { Metadata } from 'next';
import { DemoWelcome } from './DemoWelcome';

export const metadata: Metadata = { title: 'Welcome to AgentCity' };

/** Signed in: the demo is claimed here (the API checks the session and the verified email). */
export default function WelcomePage() {
  return (
    <main className="dm-main">
      <DemoWelcome />
    </main>
  );
}
