import type { ReactNode } from 'react';
import { Skyline } from '../asc/Skyline';
import { DemoFooter, DemoHeader } from './DemoBits';

/** The AutoSalesCity night frame (logo header, skyline, footer) shared by the demo funnel and the sign-in pages. */
export function DemoFrame({ children }: { children: ReactNode }) {
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
