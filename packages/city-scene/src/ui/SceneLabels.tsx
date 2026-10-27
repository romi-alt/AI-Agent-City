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
  return (
    <div
      className="ac-labels"
      aria-label={labels.some(l => l.kind === 'desk') ? 'Desks' : undefined}
      role={labels.some(l => l.kind === 'desk') ? 'group' : undefined}
    >
      {labels.map(l =>
        l.kind === 'desk' ? (
          <button
            key={l.id}
            ref={el => reg.bindElement(l.id, el)}
            type="button"
            className={`ac-label ac-desk-tag${l.selected ? ' is-selected' : ''}`}
            aria-pressed={!!l.selected}
            aria-label={l.ariaLabel}
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
