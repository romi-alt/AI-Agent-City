import { HeaderScroll } from './HeaderScroll';
import { CtaLink, Mark } from './Primitives';

const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#product', label: 'Product' },
  { href: '#security', label: 'Security' },
  { href: '#faq', label: 'FAQ' },
];

export function SiteHeader() {
  return (
    <header className="mk-header">
      <HeaderScroll />
      <a className="mk-skip" href="#main">
        Skip to content
      </a>
      <div className="mk-header-inner">
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
        <div className="mk-header-actions">
          <a className="mk-header-link" href="/signin">
            Sign in
          </a>
          <CtaLink href="#get-demo" variant="dark" size="sm" testId="header-cta">
            Get a demo
          </CtaLink>
        </div>
      </div>
    </header>
  );
}
