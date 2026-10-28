'use client';
import { type ReactNode, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { sceneBus } from '../camera/bus.ts';
import { canEnter, findBuilding } from '../camera/modes.ts';
import { useNav } from '../camera/useNav.ts';
import { useCity, useCityContext } from '../context.tsx';
import { OfficeOccupantsContext, statusColor, statusLabel, type DeskOccupant } from '../interior/occupants.ts';
import { occupantsFromLayout } from '../interior/placement.ts';
import type { CityMode, LayoutBuilding, LayoutFloor } from '../types.ts';
import { IconBack, IconDown, IconUp } from './icons.tsx';
import { aiCount, districtName, floorSummary, floorsTopDown, KIND_LABEL } from './text.ts';

/** Where "Enter office" leads when the viewer may not enter (the public city): the demo request. */
export interface OfficeCta {
  href: string;
  label: string;
  note?: string;
}

export const DEFAULT_OFFICE_CTA: OfficeCta = {
  href: '/#get-demo',
  label: 'Request a demo',
  note: 'Offices belong to their teams, so they stay private. Request a demo and we will set up a sample office for you to walk into.',
};

export interface PanelOptions {
  officeCta?: OfficeCta;
  /** Where "Enter building" takes the visitor in an enterable building (e.g. their demo floor). */
  entry?: { building: string; level: number };
}

/**
 * The panel for the current view, as a side panel (desktop) or bottom sheet (phones). It reports the space it
 * covers to the camera so framings stay centred in the visible part of the scene, and moves focus to its heading
 * when it opens or changes, returning focus where it was when it closes.
 */
export function NavPanel({
  officeCta = DEFAULT_OFFICE_CTA,
  entry,
  directory,
  onCloseDirectory,
  measure = true,
}: PanelOptions & {
  /** Explore mode: show the building directory. */
  directory?: boolean;
  onCloseDirectory?: () => void;
  /** Report the panel size to the camera (off for the 2D map). */
  measure?: boolean;
}) {
  const { store, layout } = useCityContext();
  const mode = useCity(s => s.mode);
  const ref = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const key = panelKey(mode, directory);
  const open = key !== null;

  // Focus: into the panel on open/change, back to where it was on close.
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    const was = prevKey.current;
    prevKey.current = key;
    if (key && key !== was) {
      const active = document.activeElement as HTMLElement | null;
      if (!was && active && !ref.current?.contains(active)) returnTo.current = active;
      // Let the content render first.
      requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    } else if (!key && was) {
      const back = returnTo.current;
      returnTo.current = null;
      if (back && back.isConnected && back.offsetParent !== null) back.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('[data-city-focus]')?.focus({ preventScroll: true });
    }
  }, [key]);

  // Insets for the camera.
  useEffect(() => {
    if (!measure) return;
    const bus = sceneBus(store);
    const el = ref.current;
    if (!el || !open) {
      bus.emit({ type: 'insets', right: 0, bottom: 0 });
      return;
    }
    const report = () => {
      const phone = window.matchMedia('(max-width: 720px)').matches;
      const r = el.getBoundingClientRect();
      bus.emit(
        phone ? { type: 'insets', right: 0, bottom: r.height } : { type: 'insets', right: r.width + 16, bottom: 0 },
      );
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      ro.disconnect();
      bus.emit({ type: 'insets', right: 0, bottom: 0 });
    };
  }, [store, open, measure, key]);

  if (!open) return null;
  let body: ReactNode = null;
  let label = '';
  if (mode.kind === 'explore' || mode.kind === 'arrival') {
    label = 'Buildings';
    body = <DirectoryBody headingRef={heading} onClose={onCloseDirectory} />;
  } else {
    const b = findBuilding(layout, mode.building);
    if (!b) return null;
    label = b.name;
    if (mode.kind === 'building') body = <BuildingBody b={b} headingRef={heading} entry={entry} />;
    else {
      const f = b.floors.find(x => x.level === mode.level);
      if (!f) return null;
      body =
        mode.kind === 'floor' ? (
          <FloorBody b={b} f={f} headingRef={heading} cta={officeCta} />
        ) : (
          <OfficeBody b={b} f={f} desk={mode.desk} headingRef={heading} />
        );
    }
  }
  return (
    <section ref={ref} className="ac-panel ac-glass" aria-label={label} data-panel={mode.kind}>
      <div className="ac-sheet-handle" aria-hidden="true" />
      <div className="ac-panel-scroll">{body}</div>
    </section>
  );
}

function panelKey(mode: CityMode, directory?: boolean): string | null {
  switch (mode.kind) {
    case 'arrival':
      return null;
    case 'explore':
      return directory ? 'directory' : null;
    case 'building':
      return `b:${mode.building}`;
    case 'floor':
      return `f:${mode.building}:${mode.level}`;
    case 'office':
      return `o:${mode.building}:${mode.level}`;
  }
}

type HeadingRef = React.RefObject<HTMLHeadingElement | null>;

function Head({ kicker, title, headingRef }: { kicker: string; title: string; headingRef: HeadingRef }) {
  return (
    <div className="ac-panel-head">
      <span className="ac-kicker">{kicker}</span>
      <h2 ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
    </div>
  );
}

function DirectoryBody({ headingRef, onClose }: { headingRef: HeadingRef; onClose?: () => void }) {
  const { layout } = useCityContext();
  const nav = useNav();
  const enterable = useCity(s => s.enterable);
  const highlight = useCity(s => s.highlight);
  return (
    <>
      <Head kicker="AgentCity" title="Find a building" headingRef={headingRef} />
      <p>Every building is open to look around. Choose one to see its floors and teams.</p>
      {layout.districts.map(d => (
        <div key={d.key}>
          <h3 className="ac-list-title">{d.name}</h3>
          <ul className="ac-list">
            {layout.buildings
              .filter(b => b.district === d.key)
              .map(b => (
                <li key={b.key}>
                  <button
                    type="button"
                    className="ac-row"
                    onClick={() => nav({ type: 'select-building', building: b.key })}
                  >
                    <span className="ac-swatch" style={{ background: b.color }} aria-hidden="true" />
                    <span>
                      {b.name}
                      <small>
                        {KIND_LABEL[b.kind]}
                        {b.key === highlight ? ' · Your building' : ''}
                        {canEnter({ enterable }, b.key) ? ' · You can enter' : ''}
                      </small>
                    </span>
                    <span className="ac-meta">{b.floors.length} floors</span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {onClose && (
        <div className="ac-actions">
          <button type="button" className="ac-btn" onClick={onClose}>
            Close the list
          </button>
        </div>
      )}
    </>
  );
}

function BuildingBody({
  b,
  headingRef,
  entry,
}: {
  b: LayoutBuilding;
  headingRef: HeadingRef;
  entry?: PanelOptions['entry'];
}) {
  const { store, layout } = useCityContext();
  const nav = useNav();
  const enterable = useCity(s => canEnter(s, b.key));
  const highlight = useCity(s => s.highlight);
  const bus = useMemo(() => sceneBus(store), [store]);
  const ai = aiCount(b);
  useEffect(() => () => bus.emit({ type: 'floor-preview', level: null }), [bus]);
  const enterLevel =
    entry && entry.building === b.key
      ? entry.level
      : (b.floors.find(f => f.desks.length)?.level ?? b.floors[0]?.level ?? 1);
  return (
    <>
      <Head kicker={districtName(layout, b.district)} title={b.name} headingRef={headingRef} />
      <ul className="ac-chips" aria-label="About this building">
        <li>{KIND_LABEL[b.kind]}</li>
        <li>{b.floors.length} floors</li>
        {ai > 0 && <li>{ai} AI agents</li>}
        {b.key === highlight && <li>Your building</li>}
      </ul>
      {enterable ? (
        <p className="ac-note ac-gold">You can enter this building.</p>
      ) : (
        <p className="ac-note">
          You can look around every floor. The offices belong to their teams, so they stay private.
        </p>
      )}
      <div className="ac-actions">
        {enterable && (
          <button
            type="button"
            className="ac-btn ac-primary"
            onClick={() => nav({ type: 'select-floor', level: enterLevel })}
          >
            Enter building
          </button>
        )}
        <button type="button" className="ac-btn" onClick={() => nav({ type: 'back' })}>
          <IconBack /> Back to the city
        </button>
      </div>
      <div>
        <h3>Floors</h3>
        <ul className="ac-list" onMouseLeave={() => bus.emit({ type: 'floor-preview', level: null })}>
          {floorsTopDown(b).map(f => (
            <li key={f.level}>
              <button
                type="button"
                className="ac-row"
                onMouseEnter={() => bus.emit({ type: 'floor-preview', level: f.level })}
                onFocus={() => bus.emit({ type: 'floor-preview', level: f.level })}
                onBlur={() => bus.emit({ type: 'floor-preview', level: null })}
                onClick={() => nav({ type: 'select-floor', level: f.level })}
                aria-label={`Floor ${f.level}, ${f.name}. ${floorSummary(f)}. ${enterable ? 'Open this floor' : 'Look around this floor'}`}
              >
                <span className="ac-lvl">{f.level}</span>
                <span>
                  {f.name}
                  <small>{floorSummary(f)}</small>
                </span>
                <span className="ac-meta">{enterable ? 'Open' : 'Look'}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** The people on a floor (the host's team on its own floor, else the public layout) and agent selection. */
function useFloorPeople(b: LayoutBuilding, f: LayoutFloor) {
  const nav = useNav();
  const host = useContext(OfficeOccupantsContext);
  const own = host && host.building === b.key && host.level === f.level ? host : null;
  const people = own ? own.agents : occupantsFromLayout(f.desks, { building: b.key, level: f.level });
  const selectedId = useCity(s => s.selectedAgent);
  const index = selectedId ? people.findIndex(p => p.id === selectedId) : -1;
  const select = (i: number) => {
    const p = people[i];
    if (!p) return;
    const same = index === i;
    nav({ type: 'select-agent', id: same ? null : p.id, desk: same ? null : i });
    if (!same) own?.onSelect?.(p.id);
  };
  return { people, selected: index >= 0 ? index : null, sel: index >= 0 ? people[index] : undefined, select };
}

/** The selected agent: who they are, their role and status, and what they are doing. */
function AgentCard({ who, onClose, closeLabel }: { who: DeskOccupant; onClose: () => void; closeLabel: string }) {
  return (
    <div className="ac-agent" aria-live="polite" data-agent={who.id} data-kind={who.kind}>
      <span className="ac-kicker">{who.kind === 'ai' ? 'AI agent' : 'Team member'}</span>
      <h3>{who.name ?? (who.kind === 'human' ? 'Team member' : 'AI agent')}</h3>
      <p>
        {who.role} ·{' '}
        <span
          className="ac-dot"
          style={{ background: statusColor(who.status), verticalAlign: 'middle' }}
          aria-hidden="true"
        />{' '}
        {statusLabel(who.status)}
      </p>
      <p>
        {who.summary ??
          (who.kind === 'ai'
            ? `Works on ${who.role} for this team. This is a public preview; a demo shows the agent's work as it happens.`
            : 'A member of the team. People are not shown by name in the public city.')}
      </p>
      <div className="ac-actions">
        <button type="button" className="ac-btn" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

function FloorBody({
  b,
  f,
  headingRef,
  cta,
}: {
  b: LayoutBuilding;
  f: LayoutFloor;
  headingRef: HeadingRef;
  cta: OfficeCta;
}) {
  const nav = useNav();
  const enterable = useCity(s => canEnter(s, b.key));
  const [offer, setOffer] = useState(false);
  const offerId = useId();
  const { people, selected, sel, select } = useFloorPeople(b, f);
  const levels = b.floors.map(x => x.level).sort((x, y) => x - y);
  const i = levels.indexOf(f.level);
  const up = levels[i + 1];
  const down = levels[i - 1];
  useEffect(() => setOffer(false), [b.key, f.level]);
  return (
    <>
      <Head kicker={`${b.shortName} · Floor ${f.level}`} title={f.name} headingRef={headingRef} />
      {sel && (
        <AgentCard who={sel} onClose={() => nav({ type: 'select-agent', id: null })} closeLabel="Back to the floor" />
      )}
      {f.info && <p>{f.info}</p>}
      <ul className="ac-chips" aria-label="About this floor">
        <li>{floorSummary(f)}</li>
        {f.rentable && f.desks.length > 0 && <li>For rent</li>}
      </ul>
      <div className="ac-actions">
        {enterable ? (
          <button type="button" className="ac-btn ac-primary" onClick={() => nav({ type: 'enter-office' })}>
            Enter office
          </button>
        ) : (
          <button
            type="button"
            className={offer ? 'ac-btn' : 'ac-btn ac-primary'}
            aria-expanded={offer}
            aria-controls={offerId}
            onClick={() => setOffer(o => !o)}
          >
            Enter office
          </button>
        )}
        <button type="button" className="ac-btn" onClick={() => nav({ type: 'back' })}>
          <IconBack /> Back to the building
        </button>
      </div>
      {!enterable && offer && (
        <div
          id={offerId}
          className="ac-note ac-gold"
          role="region"
          aria-label="Get your own office"
          style={{ display: 'grid', gap: 10 }}
        >
          <span>{cta.note}</span>
          <a className="ac-btn ac-primary" href={cta.href}>
            {cta.label}
          </a>
        </div>
      )}
      <div className="ac-actions" aria-label="Other floors" role="group">
        <button
          type="button"
          className="ac-btn ac-quiet"
          disabled={up === undefined}
          onClick={() => up !== undefined && nav({ type: 'select-floor', level: up })}
        >
          <IconUp /> Floor above
        </button>
        <button
          type="button"
          className="ac-btn ac-quiet"
          disabled={down === undefined}
          onClick={() => down !== undefined && nav({ type: 'select-floor', level: down })}
        >
          <IconDown /> Floor below
        </button>
      </div>
      <People people={people} selected={selected} onSelect={select} />
    </>
  );
}

function People({
  people,
  selected,
  onSelect,
}: {
  people: DeskOccupant[];
  selected?: number | null;
  onSelect?: (i: number) => void;
}) {
  if (!people.length) return <p>No one works on this floor yet.</p>;
  return (
    <div>
      <h3>Who works here</h3>
      <ul className="ac-list">
        {people.map((p, i) => {
          const name = p.name ?? (p.kind === 'human' ? 'Team member' : 'AI agent');
          const content = (
            <>
              <span className="ac-dot" style={{ background: statusColor(p.status) }} aria-hidden="true" />
              <span>
                {name}
                <small>
                  {p.role} · {p.kind === 'ai' ? 'AI agent' : 'Person'}
                </small>
              </span>
              <span className="ac-meta">{statusLabel(p.status)}</span>
            </>
          );
          return (
            <li key={p.id}>
              {onSelect ? (
                <button type="button" className="ac-row" aria-pressed={selected === i} onClick={() => onSelect(i)}>
                  {content}
                </button>
              ) : (
                <div className="ac-row">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OfficeBody({
  b,
  f,
  desk,
  headingRef,
}: {
  b: LayoutBuilding;
  f: LayoutFloor;
  desk: number | null;
  headingRef: HeadingRef;
}) {
  const nav = useNav();
  void desk;
  const { people, selected, sel, select } = useFloorPeople(b, f);
  return (
    <>
      <Head kicker={`${b.shortName} · Floor ${f.level}`} title={`${f.name} office`} headingRef={headingRef} />
      {sel ? (
        <AgentCard
          who={sel}
          onClose={() => nav({ type: 'select-agent', id: null })}
          closeLabel="Look around the whole office"
        />
      ) : (
        <p>Choose a desk to see who works there and what they are doing.</p>
      )}
      <People people={people} selected={selected} onSelect={select} />
      <div className="ac-actions">
        <button type="button" className="ac-btn" onClick={() => nav({ type: 'select-floor', level: f.level })}>
          <IconBack /> Back to the floor
        </button>
        <button type="button" className="ac-btn ac-quiet" onClick={() => nav({ type: 'home' })}>
          Back to the city
        </button>
      </div>
    </>
  );
}
