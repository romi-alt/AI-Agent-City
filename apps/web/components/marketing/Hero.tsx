import { HeroCity } from './HeroCity';
import { CtaLink } from './Primitives';
import { Skyline } from './Skyline';

export function Hero() {
  return (
    <section className="mk-hero on-light" aria-labelledby="hero-title">
      <div className="mk-hero-sky" aria-hidden="true" />
      <Skyline className="mk-hero-skyline" />
      <HeroCity />
      <div className="mk-hero-scrim" aria-hidden="true" />
      <div className="mk-hero-content">
        <p className="mk-label mk-hero-label">AI teams in a living city</p>
        <h1 id="hero-title" className="mk-hero-title">
          <span>Your Business.</span> <span>Your AI Team.</span> <em>Your City.</em>
        </h1>
        <p className="mk-hero-lead">
          Give your business an office in a sunlit 3D city, staffed by AI agents for follow-up, social content,
          scheduling and reporting. You see who is working on what, and nothing goes out until you say so.
        </p>
        <div className="mk-hero-actions">
          <CtaLink href="#get-demo" testId="hero-cta-demo">
            Get My Free Demo Office
          </CtaLink>
          <CtaLink href="/city" variant="ghost" testId="hero-cta-city">
            Explore AgentCity
          </CtaLink>
        </div>
        <ul className="mk-hero-facts" aria-label="About the demo">
          <li>Free, with sample data</li>
          <li>No password: sign in with an email code</li>
          <li>Demo agents never send anything</li>
        </ul>
      </div>
    </section>
  );
}
