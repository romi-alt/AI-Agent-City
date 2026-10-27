import { CtaLink, Mark } from './Primitives';

export function SiteFooter({ contactEmail }: { contactEmail?: string }) {
  return (
    <footer className="mk-footer on-dark">
      <div className="mk-container">
        <section className="mk-contact" id="contact" aria-labelledby="contact-title">
          <p className="mk-label">
            <span className="mk-label-index">08</span>Contact
          </p>
          <h2 id="contact-title" className="mk-h2">
            Rather talk <em>to a person first?</em>
          </h2>
          <div className="mk-contact-copy">
            {contactEmail ? (
              <p className="mk-lead">
                Write to us at{' '}
                <a className="mk-contact-email" href={`mailto:${contactEmail}`}>
                  {contactEmail}
                </a>
                , or request a demo and mention what you&rsquo;d like to talk about.
              </p>
            ) : (
              <p className="mk-lead">
                Request a demo and tell us a little about your business. Every request reaches our team.
              </p>
            )}
            <div className="mk-contact-actions">
              <CtaLink href="#get-demo" testId="footer-cta-demo">
                Get My Free Demo Office
              </CtaLink>
              <CtaLink href="/city" variant="ghost">
                Explore AgentCity
              </CtaLink>
            </div>
          </div>
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
              <li>
                <a href="/signin">Sign in</a>
              </li>
              <li>
                <a href="/status">Platform status</a>
              </li>
            </ul>
          </nav>
          <p className="mk-footer-small">Activity in the public city is simulated. Agent names are AI personas.</p>
        </div>
      </div>
    </footer>
  );
}
