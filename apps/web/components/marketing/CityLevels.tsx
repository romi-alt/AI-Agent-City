import type { ReactNode } from 'react';
import { CITY_FACTS } from './cityFacts';
import { SectionHead } from './Primitives';

// "The idea" and "How the city works", merged: five drawings, each zooming into the highlighted part of the last.
const DRAWINGS: Record<string, ReactNode> = {
  city: (
    <>
      <rect width="200" height="140" className="d-sky" />
      <path d="M10 104 L100 134 L190 104 L100 74 Z" className="d-ground" />
      <path d="M40 104 L100 124 L130 114 L70 94 Z" className="d-green" />
      <path d="M70 94 L130 114 L160 104 L100 84 Z" className="d-hi" />
      <path d="M55 99 L145 129 M85 89 L175 119 M40 109 L130 79 M70 119 L160 89" className="d-thin" />
      <path d="M100 84 v-30 M112 88 v-44 M124 92 v-26 M138 96 v-36 M150 100 v-22" className="d-tower" />
    </>
  ),
  district: (
    <>
      <rect width="200" height="140" className="d-sky" />
      <path d="M0 122 H200 V140 H0 Z" className="d-ground" />
      <rect x="20" y="74" width="28" height="48" className="d-stone" />
      <rect x="56" y="48" width="30" height="74" className="d-glass" />
      <rect x="94" y="28" width="34" height="94" className="d-hi" />
      <path d="M111 28 v-14" className="d-line" />
      <rect x="136" y="60" width="26" height="62" className="d-brick" />
      <rect x="170" y="86" width="22" height="36" className="d-stone" />
    </>
  ),
  building: (
    <>
      <rect width="200" height="140" className="d-sky" />
      <path d="M0 128 H200 V140 H0 Z" className="d-ground" />
      <rect x="70" y="18" width="60" height="110" className="d-glass" />
      <path d="M70 32 H130 M70 46 H130 M70 60 H130 M70 88 H130 M70 102 H130 M70 116 H130" className="d-thin-w" />
      <rect x="70" y="74" width="60" height="14" className="d-hi" />
      <path d="M90 18 v-10 h20 v10" className="d-line" />
    </>
  ),
  floor: (
    <>
      <rect width="200" height="140" className="d-paper" />
      <rect x="16" y="20" width="168" height="102" className="d-line" />
      <path d="M16 60 H70 V20" className="d-thin" />
      <rect x="22" y="26" width="42" height="28" className="d-green-soft" />
      {[0, 1, 2].map(r =>
        [0, 1, 2].map(c => (
          <rect
            key={`${r}${c}`}
            x={90 + c * 30}
            y={34 + r * 28}
            width={20}
            height={12}
            className={r === 1 && c === 1 ? 'd-hi' : 'd-desk'}
          />
        )),
      )}
      <circle cx="40" cy="94" r="11" className="d-coral" />
    </>
  ),
  desk: (
    <>
      <rect width="200" height="140" className="d-paper" />
      <path d="M20 114 H180 M36 114 V134 M164 114 V134" className="d-line" />
      <rect x="52" y="36" width="96" height="62" rx="3" className="d-screen" />
      <path d="M100 98 V114" className="d-line" />
      <path d="M64 52 H116 M64 64 H132 M64 76 H108" className="d-thin-w" />
      <circle cx="132" cy="80" r="9" className="d-hi" />
      <path d="M127 80 l4 4 l7 -8" className="d-check" />
    </>
  ),
};

export function CityLevels() {
  const levels = [
    { key: 'city', name: 'City', text: 'Every business on one skyline.' },
    { key: 'district', name: 'District', text: CITY_FACTS.districts.join(', ') + '.' },
    { key: 'building', name: 'Building', text: 'One business; its floors are its departments.' },
    { key: 'floor', name: 'Floor', text: 'One team, its agents beside its people.' },
    { key: 'desk', name: 'Desk', text: 'One agent, one job: tasks, conversations, what it is waiting on.' },
  ];
  return (
    <section className="mk-section mk-city on-light" aria-labelledby="city-title" id="city">
      <div className="mk-container">
        <SectionHead
          index="01"
          label="The idea · how the city works"
          id="city-title"
          align="split"
          title={
            <>
              Not a chat window. <em>A place you can walk into.</em>
            </>
          }
          lead="Every business gets a building, every team a floor, every AI agent a desk. Zoom from the skyline to a single desk and see who is working on what."
        />
        <ol className="mk-levels">
          {levels.map((l, i) => (
            <li key={l.key} className="mk-level">
              <svg className="mk-level-drawing" viewBox="0 0 200 140" aria-hidden="true" focusable="false">
                {DRAWINGS[l.key]}
              </svg>
              <p className="mk-level-step">
                {String(i + 1).padStart(2, '0')} <span>{l.name}</span>
              </p>
              <p className="mk-level-text">{l.text}</p>
            </li>
          ))}
        </ol>
        <div className="mk-city-foot">
          <dl className="mk-facts" aria-label="The public city map today">
            <div>
              <dd>{CITY_FACTS.buildings}</dd>
              <dt>buildings</dt>
            </div>
            <div>
              <dd>{CITY_FACTS.districts.length}</dd>
              <dt>districts</dt>
            </div>
            <div>
              <dd>{CITY_FACTS.floors}</dd>
              <dt>floors</dt>
            </div>
            <div>
              <dd>{CITY_FACTS.desks}</dd>
              <dt>desks</dt>
            </div>
          </dl>
          <p className="mk-note">
            Counted from the public city map, not customer accounts. Access follows your organisation, not the map: a
            client sees only its own building. On this site activity is simulated; live windows driven by your agents
            are on the roadmap.
          </p>
        </div>
      </div>
    </section>
  );
}
