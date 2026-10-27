import type { Metadata } from 'next';
import { VerifiedSignIn } from './VerifiedSignIn';

export const metadata: Metadata = { title: 'Email confirmed — AgentCity', referrer: 'no-referrer' };

/** Where the identity provider sends people after they confirm their email address (PLAN.md "Visitor journey"). */
export default function VerifiedPage() {
  return (
    <main className="dm-main dm-narrow">
      <VerifiedSignIn />
    </main>
  );
}
