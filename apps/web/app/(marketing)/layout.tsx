import type { ReactNode } from 'react';
import '../../components/marketing/marketing.css';
import { Reveal } from '../../components/marketing/Reveal';
import { SiteHeader } from '../../components/marketing/SiteHeader';

/** Public marketing pages: the site header, the scroll-in effect and the marketing styles. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mk">
      <SiteHeader />
      <Reveal />
      {children}
    </div>
  );
}
