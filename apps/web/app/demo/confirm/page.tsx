import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LiteNotice } from '../../../components/demo/LiteBits';

export const metadata: Metadata = {
  title: 'Open your demo office — AutoSalesCity',
  // Not 'no-referrer': with that policy browsers send `Origin: null` on the button's form post, and the same-origin
  // check on the verify route then refuses every real visitor. 'same-origin' keeps the token (it is in this page's
  // address) from ever leaving the site and still lets the post carry its real Origin.
  referrer: 'same-origin',
  robots: { index: false },
};

/**
 * The email link lands here (via /api/lite/demo/verify). Nothing is used up by looking at this page; the button
 * posts the token back, which is what opens the demo. That keeps mail scanners from spending the one-time link.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await searchParams;
  const token = Array.isArray(t) ? t[0] : t;
  if (!token || token.length > 100) redirect('/demo/verified?error=expired');
  return (
    <main className="dm-main dm-narrow">
      <LiteNotice
        eyebrow="Confirm your email"
        kind="confirm"
        title="One click to open your demo office"
        actions={
          <form method="post" action="/api/lite/demo/verify">
            <input type="hidden" name="t" value={token} />
            <button className="mk-btn mk-btn-primary" type="submit" data-testid="confirm-open">
              Open my demo office
            </button>
          </form>
        }
      >
        <p>
          Press the button to confirm this is your email address and step inside. The link works once, so this extra
          step keeps email security tools from using it up before you do.
        </p>
      </LiteNotice>
    </main>
  );
}
