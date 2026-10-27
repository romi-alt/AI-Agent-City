import type { ReactNode } from 'react';
import '../../components/marketing/marketing.css';
import { SiteHeader } from '../../components/marketing/SiteHeader';

/** Public marketing pages: the site header and the marketing styles. The footer belongs to each page. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mk">
      <SiteHeader />
      {children}
    </div>
  );
}
