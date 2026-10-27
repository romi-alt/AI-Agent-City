import type { Metadata } from 'next';
import { DemoRequestForm } from '../../components/demo/DemoRequestForm';

export const metadata: Metadata = {
  title: 'Get your demo office — AgentCity',
  description: 'Your own virtual AI office in AgentCity, prepared in minutes with sample data.',
};

/** The request form on its own page: the landing page shows the same form at #get-demo. */
export default function DemoRequestPage() {
  return (
    <main className="dm-main">
      <div className="dm-request-layout">
        <section aria-labelledby="demo-intro-title" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span className="dm-eyebrow">Free personal demo</span>
          <h1 id="demo-intro-title" className="dm-title">
            Your own AI office in AgentCity, ready in minutes
          </h1>
          <p className="dm-lede">
            Tell us a little about your business and we’ll prepare a private demo office with a sample team of AI agents
            for you to explore.
          </p>
          <ul className="dm-points">
            <li>Walk the 3D city and visit your own floor in Rental Building 2.</li>
            <li>Meet sample agents, see what they work on, and try a few things with them.</li>
            <li>Everything is simulated: nothing is sent to anyone, and no real records are touched.</li>
            <li>No password. You sign in with a code we email you.</li>
          </ul>
        </section>
        <section className="dm-card" aria-labelledby="demo-form-title">
          <h2 id="demo-form-title" style={{ margin: 0, fontSize: 22 }}>
            Request your demo office
          </h2>
          <DemoRequestForm headingId="demo-form-title" />
        </section>
      </div>
    </main>
  );
}
