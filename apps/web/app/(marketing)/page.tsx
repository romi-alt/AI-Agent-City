import type { Metadata } from 'next';
import { Audience } from '../../components/marketing/Audience';
import { Faq } from '../../components/marketing/Faq';
import { GetDemo } from '../../components/marketing/GetDemo';
import { Hero } from '../../components/marketing/Hero';
import { Highlights } from '../../components/marketing/Highlights';
import { HowItWorks } from '../../components/marketing/HowItWorks';
import { Pricing } from '../../components/marketing/Pricing';
import { Product } from '../../components/marketing/Product';
import { Security } from '../../components/marketing/Security';
import { SiteFooter } from '../../components/marketing/SiteFooter';
import { CONTACT_EMAIL } from '../../lib/preview';

// Owner: workstream B. The public landing page: static, rendered at build time.

const TITLE = 'AgentCity | Your Business. Your AI Team. One Clear View.';
const DESCRIPTION =
  'Explore a virtual AI office for sales, follow-up and content planning. Try a free simulated demo and view one-time setup and monthly service pricing.';

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
    images: [{ url: '/og-agentcity.png', width: 1200, height: 630, alt: 'The AgentCity 3D city at golden hour' }],
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
  const contactEmail = CONTACT_EMAIL;
  return (
    <>
      <main id="main" className="mk-main" tabIndex={-1}>
        <Hero />
        <Highlights />
        <HowItWorks />
        <Product />
        <Audience />
        <Security />
        <Pricing />
        <GetDemo ttlDays={ttlDays} />
        <Faq ttlDays={ttlDays} />
      </main>
      <SiteFooter contactEmail={contactEmail} />
    </>
  );
}
