import type { Metadata } from 'next';
import { AscPage } from '../../components/asc/AscPage';
import { CONTACT_EMAIL } from '../../lib/preview';

// Owner: workstream B. The public front page: static, rendered at build time. Markup is server-rendered; the 3D hero
// and the live demo load in the browser (components/asc/AscClient.tsx).

const TITLE = 'AutoSalesCity · AI sales floors for every dealership';
const DESCRIPTION =
  'AutoSalesCity: a living 3D city where every dealership, broker and salesperson gets an AI-staffed sales floor connected to their CRM.';

// Not launched yet: the landing page may be indexed only when the deployment opts in.
const allowIndex = process.env.NEXT_PUBLIC_ALLOW_INDEX === 'true';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  robots: allowIndex ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: 'website',
    siteName: 'AutoSalesCity',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    locale: 'en_US',
    images: [{ url: '/og-agentcity.png', width: 1200, height: 630, alt: 'A 3D city at golden hour' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/og-agentcity.png'] },
};

export default function LandingPage() {
  return <AscPage contactEmail={CONTACT_EMAIL} />;
}
