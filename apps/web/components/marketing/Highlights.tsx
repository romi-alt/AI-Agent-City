// A colourful strip of short highlights under the hero. Decorative: every phrase repeats something the page already
// says (hero, How it works, Security, Get a demo), so screen readers skip it and it adds no new claims.
const ITEMS = [
  'An AI workspace for sales, follow-up and growth',
  'A building for your business',
  'A floor for every department',
  'A desk for every agent',
  'Your team prepares. You make the call.',
  'Free simulated demo office',
  'Email-link sign-in',
  'No card required',
];

export function Highlights() {
  return (
    <div className="mk-highlights" aria-hidden="true">
      <div className="mk-highlights-track">
        {/* Two copies side by side, so the strip loops without a gap. */}
        {[0, 1].map(copy => (
          <ul key={copy}>
            {ITEMS.map(t => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
