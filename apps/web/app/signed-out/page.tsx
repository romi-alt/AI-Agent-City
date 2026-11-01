import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Signed out — AutoSalesCity' };

export default function SignedOutPage() {
  return (
    <main>
      <h1 data-testid="signed-out">You're signed out</h1>
      <p>Your session on this device has ended. Close this tab, or sign in again whenever you're ready.</p>
      <div className="actions">
        <a className="button primary" href="/signin" data-testid="signed-out-signin">
          Sign in again
        </a>
      </div>
    </main>
  );
}
