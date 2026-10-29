import type { ReactNode } from 'react';
import { Skyline } from '../../components/asc/Skyline';
import { DemoFooter, DemoHeader } from '../../components/demo/DemoBits';

/** The public demo pages share the front page's look: the AutoSalesCity night theme (demo-asc.css): the visitor isn't in the signed-in app yet. */
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mk dm-page">
      <div className="dm-skyline" aria-hidden="true">
        <Skyline width={1400} height={320} color="#818cf8" seed={7} />
      </div>
      <DemoHeader />
      {children}
      <DemoFooter />
    </div>
  );
}
