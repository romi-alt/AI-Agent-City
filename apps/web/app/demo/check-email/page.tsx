import type { Metadata } from 'next';
import { CheckEmailStatus } from './CheckEmailStatus';

export const metadata: Metadata = { title: 'Check your email — AgentCity', referrer: 'no-referrer' };

/**
 * After the request form. The request id in the address is unguessable and carries no personal data; the status
 * endpoint answers with a status only (PLAN.md "API contract").
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.request) ? params.request[0] : params.request;
  const requestId = raw && /^[A-Za-z0-9_-]{1,128}$/.test(raw) ? raw : null;
  // The local mail inbox (Mailpit) is only mentioned outside production, or when a test/dev build asks for it.
  const mailbox =
    process.env.DEMO_DEV_MAILBOX_URL || (process.env.NODE_ENV !== 'production' ? 'http://127.0.0.1:58025' : null);
  return (
    <main className="dm-main dm-narrow">
      <CheckEmailStatus requestId={requestId} devMailboxUrl={mailbox} />
    </main>
  );
}
