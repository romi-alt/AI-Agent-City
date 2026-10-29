import type { Metadata } from 'next';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = { title: 'Sign in — AutoSalesCity' };

const REASONS: Record<string, string> = {
  session_revoked: 'You were signed out on this device. Sign in again to continue.',
  not_signed_in: 'Sign in to continue.',
  device_proof_required: "This browser's sign-in key doesn't match your session any more. Sign in again here.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const returnTo = one(params.returnTo) ?? '/account';
  const reason = REASONS[one(params.reason) ?? ''];
  return (
    <main>
      <h1>Sign in to AutoSalesCity</h1>
      {reason && (
        <p className="notice" role="status" data-testid="signin-reason">
          {reason}
        </p>
      )}
      {returnTo.startsWith('/invitations/accept') && <p>Sign in with the email address your invitation was sent to.</p>}
      <SignInForm returnTo={returnTo} />
    </main>
  );
}
