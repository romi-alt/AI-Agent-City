import { HeaderScroll } from './HeaderScroll';
import { CtaLink, Mark } from './Primitives';

const NAV = [
  { href: '#city', label: 'How it works' },
  { href: '#buildings', label: 'Buildings' },
  { href: '#capabilities', label: 'AI teams' },
  { href: '#security', label: 'Security' },
  { href: '#faq', label: 'FAQ' },
];

export function SiteHeader() {
  return (
    <header className="mk-site-header on-light">
      <HeaderScroll />
      <a className="mk-skip" href="#main">
        Skip to content
      </a>
      <div className="mk-site-header-inner">
        <a className="mk-wordmark" href="/" aria-label="AgentCity home">
          <Mark className="mk-wordmark-mark" />
          <span>AgentCity</span>
        </a>
        <nav className="mk-nav" aria-label="Page sections">
          <ul>
            {NAV.map(n => (
              <li key={n.href}>
                <a href={n.href}>{n.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mk-site-header-actions">
          <a className="mk-header-link" href="/signin">
            Sign in
          </a>
          <CtaLink href="#get-demo" testId="header-cta">
            Free demo
          </CtaLink>
        </div>
      </div>
    </header>
  );
}
