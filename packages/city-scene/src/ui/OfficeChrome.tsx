'use client';
import { findBuilding } from '../camera/modes.ts';
import { useCity, useCityContext } from '../context.tsx';

/** The legend's colours, the reference look's tokens (legacy style.css: --human, --blue, --green, --red). */
export const OFFICE_LEGEND: readonly { label: string; color: string }[] = [
  { label: 'Human', color: '#F2B33D' },
  { label: 'AI agent', color: '#4AA8D8' },
  { label: 'Working', color: '#2ECC71' },
  { label: 'Needs you', color: '#EF4444' },
];

/**
 * The office view's own chrome, over the scene: a title chip naming the place with a one-line hint, and the
 * legend for the desk colours. Shown in office mode only; the breadcrumb, panel and camera pad stay as they are.
 */
export function OfficeChrome() {
  const { layout } = useCityContext();
  const mode = useCity(s => s.mode);
  if (mode.kind !== 'office') return null;
  const b = findBuilding(layout, mode.building);
  return (
    <>
      <div className="ac-office-title-wrap">
        <div className="ac-office-title ac-glass">
          <b>
            {b?.name ?? 'Office'} · floor {mode.level}
          </b>
          <span>Tap any agent. Drag to look around.</span>
        </div>
      </div>
      <ul className="ac-legend ac-glass" aria-label="What the colours mean">
        {OFFICE_LEGEND.map(l => (
          <li key={l.label}>
            <i style={{ background: l.color }} aria-hidden="true" />
            {l.label}
          </li>
        ))}
      </ul>
    </>
  );
}
