import { CityPreview } from './CityPreview';
import { CtaLink } from './Primitives';

export function Hero() {
  return (
    <section className="mk-hero" aria-labelledby="hero-title">
      <div className="mk-container mk-hero-inner">
        <p className="mk-pill">
          <span className="mk-pill-dot" aria-hidden="true" />
          Free demo office · sample data
        </p>
        <h1 id="hero-title" className="mk-display">
          <span>Your Business.</span> <span>Your AI Team.</span> <span>Your City.</span>
        </h1>
        <p className="mk-hero-lead">
          An office in a living 3D city, staffed by AI agents that follow up, plan content, keep schedules and report
          back. Nothing goes out without your OK.
        </p>
        <div className="mk-hero-actions">
          <CtaLink href="#get-demo" testId="hero-cta-demo">
            Get My Free Demo Office
          </CtaLink>
          <CtaLink href="/city" variant="secondary" testId="hero-cta-city">
            Explore AgentCity
          </CtaLink>
        </div>
      </div>
      <div className="mk-container mk-hero-window">
        <CityPreview />
      </div>
    </section>
  );
}
