import { CtaLink, Mark } from './Primitives';

export function SiteFooter({ contactEmail }: { contactEmail?: string }) {
  return (
    <footer className="mk-footer">
      <div className="mk-container">
        <section className="mk-contact" id="contact" aria-labelledby="contact-title">
          <h2 id="contact-title" className="mk-contact-title">
            Questions first?
          </h2>
          <p className="mk-body">
            {contactEmail ? (
              <>
                Write to <a href={`mailto:${contactEmail}`}>{contactEmail}</a>, or request a demo and tell us what
                you&rsquo;d like to know.
              </>
            ) : (
              <>Request a demo and tell us what you&rsquo;d like to know. Every request reaches our team.</>
            )}
          </p>
          <CtaLink href="#get-demo" variant="secondary" size="sm" testId="footer-cta-demo">
            Get My Free Demo Office
          </CtaLink>
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
                <a href="/status">Status</a>
              </li>
            </ul>
          </nav>
          <p className="mk-footer-note">Public city activity is simulated. Agent names are AI personas.</p>
        </div>
      </div>
    </footer>
  );
}
