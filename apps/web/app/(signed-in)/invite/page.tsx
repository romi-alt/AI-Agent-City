import type { Metadata } from 'next';
import { AcceptInvitation } from './AcceptInvitation';

export const metadata: Metadata = { title: 'Accept invitation — AgentCity', referrer: 'no-referrer' };

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  return (
    <main>
      <h1>Accept your invitation</h1>
      <AcceptInvitation token={token ?? null} />
    </main>
  );
}
