import type { CSSProperties } from 'react';
import { CityPreview } from './CityPreview';
import { CtaLink } from './Primitives';

const LINES = ['Your business.', 'Your AI team.', 'One clear view.'] as const;

// On wide screens the city fills the hero and the copy sits on it in a card; on narrower screens the copy comes
// first and the city follows edge to edge (marketing.css, "Hero").
export function Hero() {
  return (
    <section className="mk-hero" aria-labelledby="hero-title">
      <div className="mk-container mk-hero-inner">
        <div className="mk-hero-card">
          <p className="mk-pill">
            <span className="mk-pill-dot" aria-hidden="true" />
            An AI workspace for sales, follow-up and growth
          </p>
          {/* Each line stands on one of the logo's three towers (same colours and heights), so the headline builds the
              mark; the towers rise once on load. */}
          <h1 id="hero-title" className="mk-display">
            {LINES.map((line, i) => (
              <span key={line} className="mk-line" style={{ '--i': i } as CSSProperties}>
                <i className="mk-tower" aria-hidden="true" />
                {line}{' '}
              </span>
            ))}
          </h1>
          <p className="mk-hero-lead">
            Give every lead, follow-up and content idea a place to move forward. Meet your AI team in a virtual office,
            see what needs attention, and review the next step before it becomes action.
          </p>
          <div className="mk-hero-actions">
            <CtaLink href="#get-demo" testId="hero-cta-demo">
              Get My Free Demo Office
            </CtaLink>
            <CtaLink href="/city" variant="secondary" testId="hero-cta-city">
              Explore the City
            </CtaLink>
          </div>
          <p className="mk-note mk-hero-note">
            <a className="mk-text-link" href="#pricing" data-testid="hero-link-pricing">
              View setup and monthly pricing
            </a>
          </p>
          <p className="mk-note mk-hero-note">Free sample office. No card required. Sign in with an email link.</p>
          <p className="mk-note mk-hero-note">Explore simulated activity. Demo agents do not contact customers.</p>
        </div>
      </div>
      <div className="mk-container mk-hero-window">
        <CityPreview />
      </div>
    </section>
  );
}
