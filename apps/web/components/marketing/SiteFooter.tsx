import { CtaLink, Mark } from './Primitives';
import { CONTACT_EMAIL, PUBLIC_PREVIEW } from '../../lib/preview';

export function SiteFooter({ contactEmail }: { contactEmail?: string }) {
  return (
    <footer className="mk-footer">
      <div className="mk-container">
        <section className="mk-contact" id="contact" aria-labelledby="contact-title">
          <h2 id="contact-title" className="mk-contact-title">
            See how your next team could work.
          </h2>
          <p className="mk-body">
            Explore the office, meet the AI personas and picture a clearer way to manage your daily opportunities.
          </p>
          <CtaLink href="#get-demo" variant="secondary" size="sm" testId="footer-cta-demo">
            Get My Free Demo Office
          </CtaLink>
          <p className="mk-note">
            Questions about setup?{' '}
            <a href={`mailto:${contactEmail ?? CONTACT_EMAIL}?subject=${encodeURIComponent('Setup question')}`}>
              {contactEmail ?? CONTACT_EMAIL}
            </a>
          </p>
          <p className="mk-note">Free demo · Email-link access · Simulated activity</p>
        </section>
        <div className="mk-footer-base">
          <a className="mk-wordmark" href="/" aria-label="AgentCity home">
            <Mark className="mk-wordmark-mark" />
            <span>AgentCity</span>
          </a>
          <nav aria-label="Footer">
            <ul>
              <li>
                <a href="/city">Explore the city</a>
              </li>
              {!PUBLIC_PREVIEW && (
                <>
                  <li>
                    <a href="/signin">Sign in</a>
                  </li>
                  <li>
                    <a href="/status">Status</a>
                  </li>
                </>
              )}
            </ul>
          </nav>
          <p className="mk-footer-note">Public city activity is simulated. Agent names are AI personas.</p>
        </div>
      </div>
    </footer>
  );
}
