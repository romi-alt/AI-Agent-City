import type { ReactNode } from 'react';
import '../../components/asc/asc.css';

/** The public front page. It brings its own header, footer and styles (all scoped under .asc). */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
