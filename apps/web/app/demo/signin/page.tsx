import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LITE_DEMO } from '../../../lib/preview';
import { LiteSignIn } from './LiteSignIn';

export const metadata: Metadata = { title: 'Sign in to your demo office — AutoSalesCity', referrer: 'no-referrer' };

/** The way back into a demo office from another browser, or after closing the tab for good. */
export default function SignInPage() {
  if (!LITE_DEMO) notFound();
  return (
    <main className="dm-main dm-narrow">
      <LiteSignIn />
    </main>
  );
}
