import type { ReactNode } from 'react';
import { DemoFooter, DemoHeader } from '../../components/demo/DemoBits';

/** The public demo pages share the landing page's look (.mk): the visitor isn't in the signed-in app yet. */
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mk dm-page">
      <DemoHeader />
      {children}
      <DemoFooter />
    </div>
  );
}
