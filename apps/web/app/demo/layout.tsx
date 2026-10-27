import type { ReactNode } from 'react';
import '../../components/demo/demo.css';

/** Shared frame for the public demo pages: the visitor isn't in the signed-in app yet, so no account header. */
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dm dm-page">
      <header className="dm-topbar">
        <a className="dm-logo" href="/" data-testid="demo-home-link">
          <span className="dm-logo-mark" aria-hidden="true" />
          AgentCity
        </a>
        <nav aria-label="Demo">
          <a href="/city">Explore the city</a>
        </nav>
      </header>
      {children}
      <footer className="dm-footer">
        Demo offices use sample data only. Demo agents never contact anyone or change real records.
      </footer>
    </div>
  );
}
