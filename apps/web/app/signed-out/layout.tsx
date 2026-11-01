import type { ReactNode } from 'react';
import { DemoFrame } from '../../components/demo/DemoFrame';

export default function Layout({ children }: { children: ReactNode }) {
  return <DemoFrame>{children}</DemoFrame>;
}
