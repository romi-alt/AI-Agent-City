// Owner: workstream B (marketing landing page). Placeholder until it lands.
import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>AgentCity</h1>
      <p>
        <Link href="/city">Explore AgentCity</Link> · <Link href="/status">Platform status</Link>
      </p>
    </main>
  );
}
