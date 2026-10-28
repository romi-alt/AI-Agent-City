import { CityPreview } from './CityPreview';
import { CtaLink } from './Primitives';

export function Hero() {
  return (
    <section className="mk-hero" aria-labelledby="hero-title">
      <div className="mk-container mk-hero-inner">
        <p className="mk-pill">
          <span className="mk-pill-dot" aria-hidden="true" />
          An AI workspace for sales, follow-up and growth
        </p>
        <h1 id="hero-title" className="mk-display">
          <span>Your business.</span> <span>Your AI team.</span> <span>One clear view.</span>
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
      <div className="mk-container mk-hero-window">
        <CityPreview />
      </div>
    </section>
  );
}
