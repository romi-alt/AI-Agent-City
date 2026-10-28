import type { Metadata } from 'next';
import { LITE_DEMO } from '../../../lib/preview';
import { LiteVerified } from './LiteVerified';
import { VerifiedSignIn } from './VerifiedSignIn';

export const metadata: Metadata = { title: 'Email confirmed — AgentCity', referrer: 'no-referrer' };

/**
 * Where the identity provider sends people after they confirm their email address (PLAN.md "Visitor journey"). The
 * lite demo only lands here when an email link could not be used (it opens the office itself otherwise).
 */
export default async function VerifiedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  return (
    <main className="dm-main dm-narrow">
      {LITE_DEMO ? <LiteVerified error={Array.isArray(error) ? error[0] : error} /> : <VerifiedSignIn />}
    </main>
  );
}
