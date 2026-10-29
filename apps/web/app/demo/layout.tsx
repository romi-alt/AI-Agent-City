import type { ReactNode } from 'react';
import { DemoFrame } from '../../components/demo/DemoFrame';

/** The public demo pages share the front page's look: the AutoSalesCity night theme (demo-asc.css). */
export default function DemoLayout({ children }: { children: ReactNode }) {
  return <DemoFrame>{children}</DemoFrame>;
}
