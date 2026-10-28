'use client';
import { useSyncExternalStore } from 'react';
import { labelRegistry } from '../camera/labels.ts';
import { useCityContext } from '../context.tsx';
import { statusColor } from '../interior/occupants.ts';

/** The DOM layer for labels in the 3D scene (desk name tags, the visitor's building). Render it in the overlay. */
export function SceneLabels() {
  const { store } = useCityContext();
  const reg = labelRegistry(store);
  const labels = useSyncExternalStore(reg.subscribe, reg.list, reg.list);
  const desks = labels.some(l => l.kind === 'desk' || l.kind === 'agent');
  return (
    <div className="ac-labels" aria-label={desks ? 'Desks' : undefined} role={desks ? 'group' : undefined}>
      {labels.some(l => l.kind === 'agent') && <style>{AGENT_PILL_CSS}</style>}
      {labels.map(l =>
        l.kind === 'floor' ? (
          <button
            key={l.id}
            ref={el => reg.bindElement(l.id, el)}
            type="button"
            className={`ac-label ac-floor-tag${l.selected ? ' is-selected' : ''}`}
            aria-current={l.selected ? 'true' : undefined}
            aria-label={l.ariaLabel}
            onClick={l.onSelect}
            style={{ visibility: 'hidden' }}
          >
            <b>{l.text}</b>
            <span>{l.sub}</span>
          </button>
        ) : l.kind === 'agent' ? (
          <button
            key={l.id}
            ref={el => reg.bindElement(l.id, el)}
            type="button"
            className={`ac-label ac-agent-pill${l.selected ? ' is-selected' : ''}`}
            data-status={l.status ?? 'idle'}
            data-tone={l.tone ?? 'ai'}
            aria-pressed={!!l.selected}
            aria-label={l.ariaLabel}
            data-testid={l.testId}
            onClick={l.onSelect}
            style={{ visibility: 'hidden' }}
          >
            <b>{l.text}</b>
            {l.sub && <span>{l.sub}</span>}
          </button>
        ) : l.kind === 'desk' ? (
          <button
            key={l.id}
            ref={el => reg.bindElement(l.id, el)}
            type="button"
            className={`ac-label ac-desk-tag${l.selected ? ' is-selected' : ''}`}
            aria-pressed={!!l.selected}
            aria-label={l.ariaLabel}
            data-testid={l.testId}
            onClick={l.onSelect}
            style={{ visibility: 'hidden' }}
          >
            <i className="ac-dot" style={{ background: statusColor(l.status ?? 'idle') }} aria-hidden="true" />
            <b>{l.text}</b>
            {l.sub && <span>{l.sub}</span>}
          </button>
        ) : (
          <div
            key={l.id}
            ref={el => reg.bindElement(l.id, el)}
            className="ac-label ac-callout"
            aria-hidden="true"
            style={{ visibility: 'hidden' }}
          >
            {l.kicker && <span className="ac-callout-kicker">{l.kicker}</span>}
            <strong>{l.text}</strong>
          </div>
        ),
      )}
    </div>
  );
}

/**
 * The Office view's name pills (the reference look): a small white rounded pill with a hairline border, the name in
 * bold monospaced capitals and the role after it in the legend colour (amber for people, blue for AI agents).
 * On phones only the name stays (the role is in the pill's accessible name and in the panel), so eight pills fit
 * the strip of room above the sheet.
 * JetBrains Mono is self-hosted by the app (`--font-jetbrains-mono`); the system monospace stands in elsewhere.
 */
const AGENT_PILL_CSS = `
.ac-agent-pill { position: absolute; left: 0; top: 0; pointer-events: auto; display: inline-flex; align-items: baseline;
  gap: 8px; padding: 3px 8px; border-radius: 6px; background: #fff; border: 1px solid #e6e0d4; color: #1f2328;
  font: 700 11px/1.3 var(--font-jetbrains-mono, 'JetBrains Mono'), ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; cursor: pointer;
  box-shadow: 0 1px 2px rgba(31, 35, 40, 0.08), 0 2px 8px rgba(31, 35, 40, 0.08); }
.ac-agent-pill span { font-weight: 500; color: #2f86b8; }
.ac-agent-pill[data-tone="human"] span { color: #b7791f; }
.ac-agent-pill[data-status="needs-you"] { border-color: #ef4444; }
.ac-agent-pill:hover { border-color: #c9bfae; }
.ac-agent-pill.is-selected { border-color: #f5b335; box-shadow: 0 0 0 2px rgba(245, 179, 53, 0.45), 0 2px 8px rgba(31, 35, 40, 0.12); }
.ac-agent-pill:focus-visible { outline: 2px solid #0c0c0d; outline-offset: 2px; }
@media (max-width: 640px) { .ac-agent-pill { font-size: 10px; padding: 2px 6px; gap: 6px; } .ac-agent-pill span { display: none; } }
`;
