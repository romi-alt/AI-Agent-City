import type { Metadata } from 'next';
import { Buildings } from '../../components/marketing/Buildings';
import { Capabilities } from '../../components/marketing/Capabilities';
import { DemoJourney } from '../../components/marketing/DemoJourney';
import { Faq } from '../../components/marketing/Faq';
import { GetDemo } from '../../components/marketing/GetDemo';
import { Hero } from '../../components/marketing/Hero';
import { HowItWorks } from '../../components/marketing/HowItWorks';
import { Industries } from '../../components/marketing/Industries';
import { Intro } from '../../components/marketing/Intro';
import { OfficePreview } from '../../components/marketing/OfficePreview';
import { Security } from '../../components/marketing/Security';
import { SiteFooter } from '../../components/marketing/SiteFooter';

// Owner: workstream B. The public landing page: static, rendered at build time.

const TITLE = 'AgentCity: Your Business. Your AI Team. Your City.';
const DESCRIPTION =
  'Give your business an office in a living 3D city, staffed by AI agents for follow-up, social content, scheduling and reporting. Get a free demo office with sample data.';

// Not launched yet: the landing page may be indexed only when the deployment opts in.
const allowIndex = process.env.NEXT_PUBLIC_ALLOW_INDEX === 'true';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  robots: allowIndex ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: 'website',
    siteName: 'AgentCity',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    locale: 'en_US',
    images: [{ url: '/og-agentcity.png', width: 1200, height: 630, alt: 'The AgentCity skyline at dusk' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/og-agentcity.png'] },
};

/** Demo length shown on the page: the server's DEMO_TTL_DAYS at build time (PLAN.md default 14). */
function demoDays(): number {
  const n = Number(process.env.DEMO_TTL_DAYS);
  return Number.isInteger(n) && n > 0 ? n : 14;
}

export default function LandingPage() {
  const ttlDays = demoDays();
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined;
  return (
    <>
      <main id="main" className="mk-main" tabIndex={-1}>
        <Hero />
        <Intro />
        <HowItWorks />
        <Buildings />
        <OfficePreview />
        <Capabilities />
        <Industries />
        <Security />
        <DemoJourney ttlDays={ttlDays} />
        <GetDemo ttlDays={ttlDays} />
        <Faq ttlDays={ttlDays} />
      </main>
      <SiteFooter contactEmail={contactEmail} />
    </>
  );
}
