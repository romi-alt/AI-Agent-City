import type { Metadata } from 'next';
import { AcceptInvitation } from './AcceptInvitation';

export const metadata: Metadata = { title: 'Accept invitation — AgentCity', referrer: 'no-referrer' };

/** Invitation links look like /invitations/accept#token=… : the token is in the fragment, so it never reaches a server. */
export default function AcceptInvitationPage() {
  return (
    <main>
      <h1>Accept your invitation</h1>
      <AcceptInvitation />
    </main>
  );
}
