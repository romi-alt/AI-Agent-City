import type { ReactNode } from 'react';
import { CITY_FACTS } from './cityFacts';
import { SectionHead } from './Primitives';

// Five small line drawings: each one zooms into the gold element of the one before.
const DRAWINGS: Record<string, ReactNode> = {
  city: (
    <>
      <path d="M10 98 L100 128 L190 98 L100 68 Z" className="d-line" />
      <path d="M40 98 L100 118 L130 108 L70 88 Z" className="d-soft" />
      <path d="M70 88 L130 108 L160 98 L100 78 Z" className="d-hi" />
      <path d="M55 93 L145 123 M85 83 L175 113 M40 103 L130 73 M70 113 L160 83" className="d-thin" />
      <path d="M100 78 v-26 M115 83 v-34 M130 88 v-20 M145 93 v-28" className="d-line" />
    </>
  ),
  district: (
    <>
      <path d="M10 120 H190" className="d-line" />
      <rect x="22" y="70" width="28" height="50" className="d-line" />
      <rect x="58" y="44" width="30" height="76" className="d-line" />
      <rect x="96" y="28" width="34" height="92" className="d-hi" />
      <rect x="138" y="58" width="26" height="62" className="d-line" />
      <rect x="170" y="84" width="20" height="36" className="d-line" />
      <path d="M113 28 v-14" className="d-line" />
    </>
  ),
  building: (
    <>
      <path d="M10 126 H190" className="d-line" />
      <rect x="70" y="20" width="60" height="106" className="d-line" />
      <path d="M70 34 H130 M70 48 H130 M70 62 H130 M84 76 H130 M70 90 H130 M70 104 H130" className="d-thin" />
      <rect x="70" y="62" width="60" height="14" className="d-hi" />
      <path d="M90 20 v-10 h20 v10" className="d-line" />
      <path d="M134 69 H160" className="d-thin" />
    </>
  ),
  floor: (
    <>
      <rect x="18" y="24" width="164" height="98" className="d-line" />
      <path d="M18 64 H74 V24" className="d-thin" />
      {[0, 1, 2].map(r =>
        [0, 1, 2].map(c => (
          <rect
            key={`${r}${c}`}
            x={92 + c * 30}
            y={36 + r * 28}
            width={20}
            height={12}
            className={r === 1 && c === 1 ? 'd-hi' : 'd-soft'}
          />
        )),
      )}
      <circle cx="40" cy="96" r="10" className="d-line" />
    </>
  ),
  desk: (
    <>
      <path d="M20 112 H180 M36 112 V132 M164 112 V132" className="d-line" />
      <rect x="54" y="40" width="92" height="58" className="d-line" />
      <path d="M100 98 V112" className="d-line" />
      <path d="M66 54 H118 M66 66 H132 M66 78 H110" className="d-thin" />
      <path d="M120 74 l6 6 l12 -14" className="d-hi-stroke" />
    </>
  ),
};

export function HowItWorks() {
  const levels = [
    {
      key: 'city',
      name: 'City',
      text: 'Every business on one skyline. See the whole picture at a glance, then pick where to go.',
    },
    {
      key: 'district',
      name: 'District',
      text: `Neighbourhoods of related buildings. The public city has ${CITY_FACTS.districts.length}: ${CITY_FACTS.districts.join(', ')}.`,
    },
    {
      key: 'building',
      name: 'Building',
      text: 'One business, one building. Its floors are its departments, from sales to service.',
    },
    {
      key: 'floor',
      name: 'Floor',
      text: 'One team. Each floor has its own agents and its own work, side by side with the people they help.',
    },
    {
      key: 'desk',
      name: 'Desk',
      text: 'One agent, one job. Open a desk to see its tasks, its conversations and what it is waiting on.',
    },
  ];
  return (
    <section className="mk-section mk-how on-light" aria-labelledby="how-title" id="how-it-works">
      <div className="mk-container">
        <SectionHead
          index="02"
          label="How the city works"
          id="how-title"
          align="split"
          title={
            <>
              From the skyline <em>to a single desk.</em>
            </>
          }
          lead="AgentCity is organised the way a real city is, in five levels. Each one is a step closer to the work."
        />
        <ol className="mk-levels">
          {levels.map((l, i) => (
            <li key={l.key} className="mk-level">
              <svg className="mk-level-drawing" viewBox="0 0 200 140" aria-hidden="true" focusable="false">
                {DRAWINGS[l.key]}
              </svg>
              <p className="mk-level-step">Level {i + 1}</p>
              <h3 className="mk-h3">{l.name}</h3>
              <p>{l.text}</p>
            </li>
          ))}
        </ol>
        <p className="mk-how-foot">
          <strong>Access follows your organisation, not the map.</strong> A client sees only its own building&rsquo;s
          work; an agency sees the clients it manages; a viewer can look but not change anything.
        </p>
      </div>
    </section>
  );
}
