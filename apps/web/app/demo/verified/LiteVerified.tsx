import Link from 'next/link';
import { LiteNotice, talkToUsHref } from '../../../components/demo/LiteBits';

// The email link is single-use and short-lived. This page says which of those happened without blaming anyone, and
// offers the one thing that fixes it: ask for a new link.
export function LiteVerified({ error }: { error: string | undefined }) {
  const expired = error === 'expired';
  return (
    <LiteNotice
      eyebrow="Confirmation link"
      kind={error ?? 'none'}
      title={expired ? 'This link has expired or was already used' : 'We could not open your demo office'}
      actions={
        <>
          <Link className="mk-btn mk-btn-primary" href="/demo/signin" data-testid="verified-new-link">
            Email me a sign-in link
          </Link>
          <a className="dm-link" href={talkToUsHref('Demo link problem')}>
            Talk to us
          </a>
        </>
      }
    >
      <p>
        {expired
          ? 'Confirmation links work once and only for a limited time. Request your demo office again and we will email a fresh link.'
          : 'The link may be incomplete or damaged. Request your demo office again and we will email a fresh link.'}
      </p>
      {expired && (
        <p>
          <Link className="dm-link" href="/demo/welcome">
            I already confirmed: open my office
          </Link>
        </p>
      )}
    </LiteNotice>
  );
}
