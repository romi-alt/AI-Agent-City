import { CtaLink, Mark } from './Primitives';
import { PUBLIC_PREVIEW } from '../../lib/preview';

export function SiteFooter({ contactEmail }: { contactEmail?: string }) {
  return (
    <footer className="mk-footer">
      <div className="mk-container">
        <section className="mk-contact" id="contact" aria-labelledby="contact-title">
          <h2 id="contact-title" className="mk-contact-title">
            See the work. Meet the team. Find your next step.
          </h2>
          <p className="mk-body">
            Explore a sample office and picture how your business could organize its daily follow-up.
            {contactEmail && (
              <>
                {' '}
                Questions first? Write to <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
              </>
            )}
          </p>
          <CtaLink href="#get-demo" variant="secondary" size="sm" testId="footer-cta-demo">
            Get My Free Demo Office
          </CtaLink>
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
