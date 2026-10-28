import { CityPreview } from './CityPreview';
import { CtaLink } from './Primitives';

export function Hero() {
  return (
    <section className="mk-hero" aria-labelledby="hero-title">
      <div className="mk-container mk-hero-inner">
        <p className="mk-pill">
          <span className="mk-pill-dot" aria-hidden="true" />
          AI teamwork for sales, service and customer follow-up
        </p>
        <h1 id="hero-title" className="mk-display">
          <span>Give every</span> <span>opportunity</span> <span>a next step.</span>
        </h1>
        <p className="mk-hero-lead">
          Bring customer follow-up, content planning and daily priorities into one visible workspace. Meet your AI team,
          see who owns each task, and review the work that needs your decision.
        </p>
        <div className="mk-hero-actions">
          <CtaLink href="#get-demo" testId="hero-cta-demo">
            Get My Free Demo Office
          </CtaLink>
          <CtaLink href="/city" variant="secondary" testId="hero-cta-city">
            Explore the City
          </CtaLink>
        </div>
        <p className="mk-note mk-hero-note">Free sample office. No card required. Access through an email link.</p>
        <p className="mk-note mk-hero-note">Demo activity is simulated. No customer messages are sent.</p>
      </div>
      <div className="mk-container mk-hero-window">
        <CityPreview />
      </div>
    </section>
  );
}
