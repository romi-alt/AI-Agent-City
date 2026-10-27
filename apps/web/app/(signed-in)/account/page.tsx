import type { Metadata } from 'next';
import { AccountView } from './AccountView';

export const metadata: Metadata = { title: 'Your account — AgentCity' };

export default function AccountPage() {
  return (
    <main>
      <h1>Your account</h1>
      <AccountView />
    </main>
  );
}
