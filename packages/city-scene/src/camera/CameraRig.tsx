'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useContext, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCityContext } from '../context.tsx';
import { OfficeOccupantsContext } from '../interior/occupants.ts';
import { roomLayout } from '../interior/room/layout.ts';
import { deskWorld, occupantsFromLayout, referenceDeskWorld, referencePlanFor } from '../interior/placement.ts';
import type { CityMode, CityState, LayoutBuilding } from '../types.ts';
import { ARRIVAL_FADE_SECONDS, ARRIVAL_SECONDS, markArrivalPlayed } from './arrival.ts';
import {
  type Box,
  type CityBounds,
  cityBounds,
  cityBoxes,
  clampPosition,
  clampTarget,
  liftClear,
  withMeasured,
} from './bounds.ts';
import { type MeasuredBox, measureBuildings, measureSkyline } from './measure.ts';
import { sceneBus } from './bus.ts';
import { Callout } from './Callout.tsx';
import { LabelProjector } from './labels.ts';
import { type Flight, type Glide, planFlight, planGlide, sampleFlight, sampleGlide } from './flight.ts';
import { keyBelongsToControl, keyToCommand } from './keyboard.ts';
import { clamp, dampFactor, dist, type V3 } from './math.ts';
import { arrivalEnd, findBuilding, sameMode } from './modes.ts';
import { explodedExtra, floorLift, liveExplode } from './explode.ts';
import { DEFAULT_VIEWPORT, type Viewport } from './fit.ts';
import { boxesFor } from './scene-boxes.ts';
import {
  BUILDING_LIMITS,
  clampOrbit,
  EXPLORE_LIMITS,
  OFFICE_LIMITS,
  type Orbit,
  orbitFromPose,
  orbitPosition,
  type OrbitLimits,
  pan,
  rotate,
  zoom,
} from './orbit.ts';
import {
  arrivalKeyframes,
  buildingShot,
  deskFromAbove,
  floorShot,
  homeShot,
  sideHeading,
  topShot,
  type Pose,
} from './shots.ts';
import {
  clampToRoom,
  OFFICE_EASE_SECONDS,
  officeDeskShot,
  officeLimits,
  officeOverview,
  officeOverviewOrbit,
  type OfficeRoom,
  officeRoom,
} from './office.ts';
import { designsForLayout } from '../buildings/info.ts';
import { navigate } from './useNav.ts';
import { asMat } from '../interior/r3f.ts';

type Motion =
  | { kind: 'flight'; flight: Flight; t: number }
  | { kind: 'glide'; glide: Glide; t: number }
  | { kind: 'fade'; to: Pose; t: number; out: number; hold: number; in: number; done?: () => void };

interface Rig {
  /** Real extents of the buildings, measured from the scene once it has rendered. */
  measured: Map<string, MeasuredBox> | null;
  /** The background skyline's towers. */
  skyline: Box[];
  /** An arrival waiting for the first measurement (so its path can clear the real skyline). */
  pendingArrival: boolean;
  cut: { building: string; level: number } | undefined;
  sinceMeasure: number;
  cur: Orbit;
  goal: Orbit;
  motion: Motion | null;
  limits: OrbitLimits;
  boxes: Box[];
  fade: number;
  insets: { right: number; bottom: number };
  offset: { x: number; y: number };
  frames: number;
  lastProgress: number;
  /** Seconds since the visitor last touched the controls (auto-orbit resumes after a while). */
  idle: number;
  /** The focused building's live explode progress, last seen. */
  explodeT: number;
  /** Collision boxes to switch to once the current flight lands. */
  pendingBoxes: Box[] | null;
  /** The visitor has moved the camera since the current framing was made. */
  userMoved: boolean;
  /** The office being looked at (office mode only): pans stay over it. */
  room: OfficeRoom | null;
}

const PICK_SLOP = 6;

function limitsFor(mode: CityMode, view: CityState['view']): OrbitLimits {
  if (mode.kind === 'office') return OFFICE_LIMITS;
  // The plan view looks almost straight down; every other mode keeps a little tilt so "up" on screen means north-ish.
  if (mode.kind === 'explore' || mode.kind === 'arrival')
    return view === 'top' ? { ...EXPLORE_LIMITS, minPhi: 0.03 } : EXPLORE_LIMITS;
  return BUILDING_LIMITS;
}

/** Auto-orbit speed (rad/s) and how long the visitor must leave the controls alone before it resumes (s). */
const ORBIT_SPEED = 0.06;
const ORBIT_RESUME = 5;

/**
 * The camera: one controller for every mode. Explore input (drag, touch, wheel, keys) edits a goal orbit that the
 * camera eases towards; mode changes fly (or, with reduced motion, fade) to a framing for the new mode. Every
 * position is clamped against the city's bounds and the buildings' boxes, during flights too.
 */
export function CameraRig() {
  const { store, layout, homePose } = useCityContext();
  const occupants = useContext(OfficeOccupantsContext);
  const { camera: cameraR3f, gl, scene: sceneR3f, size } = useThree();
  const camera = cameraR3f as unknown as THREE.PerspectiveCamera;
  const scene = sceneR3f as unknown as THREE.Scene;
  const bus = useMemo(() => sceneBus(store), [store]);
  const baseBounds = useMemo(() => cityBounds(layout), [layout]);
  const boundsRef = useRef<CityBounds>(baseBounds);
  const fadeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#fafaf9',
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        name: 'a3-fade-curtain',
      }),
    [],
  );
  const fadeRef = useRef<THREE.Mesh>(null);
  const designs = useMemo(() => new Map(designsForLayout(layout).map(d => [d.key, d] as const)), [layout]);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const rig = useRef<Rig>(null as unknown as Rig);
  if (!rig.current) {
    const start =
      homePose ?? homeShot(cityBoxes(layout), { ...DEFAULT_VIEWPORT, width: size.width, height: size.height });
    const o = orbitFromPose(start.pos, start.target);
    rig.current = {
      cur: { ...o },
      goal: { ...o },
      motion: null,
      limits: EXPLORE_LIMITS,
      boxes: cityBoxes(layout),
      measured: null,
      skyline: [],
      pendingArrival: false,
      cut: undefined,
      sinceMeasure: 0,
      fade: 0,
      insets: bus.last('insets') ?? { right: 0, bottom: 0 },
      offset: { x: 0, y: 0 },
      frames: 0,
      lastProgress: -1,
      idle: 0,
      explodeT: 0,
      pendingBoxes: null,
      userMoved: false,
      room: null,
    };
  }

  const clockRef = useRef(0);
  const touched = useRef(false);
  const rigApi = useRef<{ go(m: CityMode): void; finishArrival(): void } | null>(null);

  // Desk positions depend on how many people sit on the floor (the plan grows with the team).
  const occupantsRef = useRef(occupants);
  occupantsRef.current = occupants;

  useEffect(() => {
    const r = rig.current;
    const deskCount = (mode: Extract<CityMode, { kind: 'office' }>) => {
      const o = occupantsRef.current;
      if (o && o.building === mode.building && o.level === mode.level) return o.agents.length;
      return findBuilding(layout, mode.building)?.floors.find(f => f.level === mode.level)?.desks.length ?? 0;
    };

    /** The visible part of the view (HUD panels excluded) and the camera's field of view. */
    const viewport = (): Viewport => ({
      width: sizeRef.current.width,
      height: sizeRef.current.height,
      right: r.insets.right,
      bottom: r.insets.bottom,
      fov: camera.fov,
    });
    /** Every layout building at its real size (measured once rendered). */
    const realBoxes = () => withMeasured(cityBoxes(layout), r.measured);
    const othersThan = (key: string) => realBoxes().filter(x => x.key !== key);
    const target = () => (store.get().explode ? 1 : 0);
    const homeOf = (): Pose => homePose ?? homeShot(realBoxes(), viewport());

    /** Who sits in an office: the host's team on its own floor, else the public layout's desks. */
    const peopleIn = (mode: { building: string; level: number }) => {
      const o = occupantsRef.current;
      if (o && o.building === mode.building && o.level === mode.level) return o.agents;
      const f = findBuilding(layout, mode.building)?.floors.find(x => x.level === mode.level);
      return f ? occupantsFromLayout(f.desks) : [];
    };
    /** The office room as the reference plan lays it out (its feature wall's height). */
    const roomOf = (b: LayoutBuilding, mode: { building: string; level: number }) => {
      const plan = referencePlanFor(b, peopleIn(mode));
      const r = roomLayout(plan);
      const m = r.meeting;
      const f = r.featureWall;
      const zones = [
        r.leadRug,
        r.teamRug,
        r.loungeRug,
        { x: m.x, z: m.z, w: m.radius * 2, d: m.radius * 2 },
        { x: f.x, z: f.z, w: f.w, d: 0.5 },
        { x: r.liveScreen.x, z: r.liveScreen.z, w: 1.5, d: 1.5 },
      ];
      return officeRoom(b, mode.level, plan, zones);
    };

    /** A selected agent's desk on a floor seen in the cut-away (the public city: look, don't enter). */
    const deskOfAgent = (mode: Extract<CityMode, { kind: 'floor' }>, id: string) => {
      const b = findBuilding(layout, mode.building);
      if (!b) return null;
      const n = deskCount({ kind: 'office', building: mode.building, level: mode.level, desk: null });
      const o = occupantsRef.current;
      const own = o && o.building === mode.building && o.level === mode.level ? o.agents : null;
      const slot = own ? own.findIndex(a => a.id === id) : Number(id.split('/').pop());
      if (!(slot >= 0)) return null;
      const d = deskWorld(b, mode.level, slot, n);
      if (!d) return null;
      return { pos: [d.pos[0], d.pos[1] + floorLift(b.key, mode.level, target()), d.pos[2]] as V3, facing: d.facing };
    };

    const shotFor = (mode: CityMode): Pose => {
      const vp = viewport();
      const st = store.get();
      switch (mode.kind) {
        case 'arrival':
          return homeOf();
        case 'explore':
          // Overview and orbit start from the aerial overview; the plan view looks straight down.
          return st.view === 'top' ? topShot(realBoxes(), vp) : homeOf();
        case 'building': {
          const b = findBuilding(layout, mode.building);
          if (!b) return homeOf();
          const info = designs.get(b.key);
          const top = Math.max(info?.height ?? 0, r.measured?.get(b.key)?.top ?? b.floors.length * 1.4);
          return buildingShot(
            b,
            vp,
            othersThan(b.key),
            top,
            explodedExtra(b.key, b.floors.length, target()),
            info ? sideHeading(info.entrance) : 0,
          );
        }
        case 'floor': {
          const b = findBuilding(layout, mode.building);
          if (!b) return homeOf();
          const agent = st.selectedAgent ? deskOfAgent(mode, st.selectedAgent) : null;
          if (agent) return deskFromAbove(agent.pos, agent.facing);
          return floorShot(b, mode.level, vp, floorLift(b.key, mode.level, target()));
        }
        case 'office': {
          const b = findBuilding(layout, mode.building);
          if (!b) return homeOf();
          const room = roomOf(b, mode);
          if (mode.desk !== null) {
            const d = referenceDeskWorld(b, mode.level, mode.desk, peopleIn(mode));
            if (d) return officeDeskShot(d.pos, room);
          }
          return officeOverview(room, vp);
        }
      }
    };

    const setCamera = (p: Pose) => {
      const o = orbitFromPose(p.pos, p.target);
      r.cur = { ...o };
      r.goal = { ...o };
    };

    const currentPose = (): Pose => ({ pos: camera.position.toArray() as V3, target: [...r.cur.target] });

    const go = (mode: CityMode, prevMode: CityMode | null, opts: { instant?: boolean; quick?: boolean } = {}) => {
      r.userMoved = false;
      const prevCut = r.cut;
      r.limits = limitsFor(mode, store.get().view);
      const b = mode.kind === 'office' ? findBuilding(layout, mode.building) : null;
      r.room = mode.kind === 'office' && b ? roomOf(b, mode) : null;
      // The office's zoom-out limit follows its own overview (a big floor needs more room than a small one).
      if (r.room) r.limits = officeLimits(officeOverviewOrbit(r.room, viewport()));
      r.cut =
        mode.kind === 'floor' || mode.kind === 'office' ? { building: mode.building, level: mode.level } : undefined;
      const nextBoxes = [...boxesFor(layout, mode, r.measured, Math.max(r.explodeT, target())), ...r.skyline];
      // Leaving an opened floor: the camera starts inside the building, so the opened boxes stay in force until the
      // flight out has landed (otherwise the closed building would pin the camera against its own facade).
      const leavingCut = !r.cut && !!prevCut;
      r.boxes = leavingCut ? r.boxes : nextBoxes;
      r.pendingBoxes = leavingCut ? nextBoxes : null;
      const near = mode.kind === 'office' ? 0.03 : mode.kind === 'floor' ? 0.1 : 0.5;
      if (camera instanceof THREE.PerspectiveCamera && camera.near !== near) {
        camera.near = near;
        camera.updateProjectionMatrix();
      }
      const reduced = store.get().reducedMotion;
      if (r.pendingArrival && mode.kind !== 'arrival') {
        // Skipped before it started: lift the curtain.
        r.pendingArrival = false;
        r.fade = 0;
      }
      if (mode.kind === 'arrival') {
        if (r.measured === null) {
          // Hold behind the curtain until the real city (and its skyline) has been measured, a few frames.
          r.pendingArrival = true;
          r.fade = 1;
          return;
        }
        r.pendingArrival = false;
        markArrivalPlayed(typeof window === 'undefined' ? null : window.sessionStorage);
        const end = arrivalEnd({ layout, enterable: store.get().enterable, highlight: store.get().highlight });
        const endPose = shotFor(end);
        const keys = arrivalKeyframes(realBoxes(), viewport(), findBuilding(layout, store.get().highlight), []);
        keys[keys.length - 1] = endPose;
        const lifted = liftClear(keys, r.skyline);
        keys.splice(0, keys.length, ...lifted);
        if (reduced) {
          setCamera(keys[0]!);
          r.motion = fadeTo(endPose, ARRIVAL_FADE_SECONDS, () => finishArrival());
        } else {
          setCamera(keys[0]!);
          r.fade = 1;
          r.motion = { kind: 'glide', glide: planGlide(keys, ARRIVAL_SECONDS), t: 0 };
        }
        return;
      }
      const to = shotFor(mode);
      if (opts.instant) {
        setCamera(to);
        r.motion = null;
        return;
      }
      const from = currentPose();
      if (dist(from.pos, to.pos) < 0.05 && dist(from.target, to.target) < 0.05) {
        // Already there (e.g. the arrival ended on this framing): nothing to fly or fade.
        r.motion = null;
        return;
      }
      if (reduced || opts.quick) {
        r.motion = fadeTo(to, reduced ? 0.5 : 0.7);
        return;
      }
      // Inside one office (a desk chosen, or back to the whole room) the move is a short ease, not a flight.
      // A re-frame (no previous mode) in an office is a move inside it too.
      const inRoom =
        mode.kind === 'office' &&
        (!prevMode ||
          (prevMode.kind === 'office' && prevMode.building === mode.building && prevMode.level === mode.level));
      r.motion = {
        kind: 'flight',
        flight: inRoom ? { from, to, duration: OFFICE_EASE_SECONDS, pullBack: 0 } : planFlight(from, to),
        t: 0,
      };
    };

    const fadeTo = (to: Pose, total: number, done?: () => void): Motion => ({
      kind: 'fade',
      to,
      t: 0,
      out: total * 0.4,
      hold: total * 0.15,
      in: total * 0.45,
      ...(done ? { done } : {}),
    });

    const finishArrival = () => {
      if (store.get().mode.kind === 'arrival') navigate(store, layout, { type: 'arrival-done' });
    };

    let prev = store.get().mode;
    go(prev, null, { instant: prev.kind !== 'arrival' });
    rigApi.current = { go: m => go(m, null), finishArrival };

    let prevView = store.get().view;
    let prevExplode = store.get().explode;
    let prevAgent = store.get().selectedAgent;
    const unsub = store.subscribe(() => {
      const st = store.get();
      const mode = st.mode;
      // View style, exploded floors and the selected agent re-frame the current mode.
      const reframe =
        (mode.kind === 'explore' && st.view !== prevView) ||
        ((mode.kind === 'building' || mode.kind === 'floor') && st.explode !== prevExplode) ||
        (mode.kind === 'floor' && st.selectedAgent !== prevAgent);
      prevView = st.view;
      prevExplode = st.explode;
      prevAgent = st.selectedAgent;
      if (sameMode(mode, prev)) {
        if (reframe) {
          // Choosing Orbit starts turning at once; other changes count as the visitor's input.
          r.idle = mode.kind === 'explore' && st.view === 'orbit' ? ORBIT_RESUME : 0;
          go(mode, null);
        }
        return;
      }
      const was = prev;
      prev = mode;
      // Skipping the arrival (or anything ending it early) is a quick fade, never a long flight.
      const skipped = was.kind === 'arrival' && r.motion?.kind === 'glide';
      go(mode, was, { quick: skipped });
    });

    const offBus = bus.on(e => {
      switch (e.type) {
        case 'insets': {
          const changed = Math.abs(e.right - r.insets.right) > 8 || Math.abs(e.bottom - r.insets.bottom) > 8;
          r.insets = { right: e.right, bottom: e.bottom };
          // A panel opened, closed or resized: re-frame so the subject sits in the visible part, unless the visitor
          // has taken the camera since the view was framed.
          const mode = store.get().mode;
          if (changed && !r.userMoved && mode.kind !== 'arrival') go(mode, null);
          break;
        }
        case 'skip':
          finishArrival();
          break;
        case 'reset':
          go(store.get().mode, null);
          break;
        case 'zoom':
        case 'rotate':
        case 'pan':
          input(e.type === 'pan' ? { type: 'pan', right: e.right, forward: e.forward } : e);
          break;
        default:
          break;
      }
    });
    return () => {
      unsub();
      offBus();
    };
  }, [store, layout, bus, camera]);

  /** Any explore input: stops a flight where it is (the visitor took over) and edits the goal orbit. */
  const takeOver = () => {
    touched.current = true;
    rig.current.idle = 0;
    rig.current.userMoved = true;
    const r = rig.current;
    if (!r.motion) return true;
    if (store.get().mode.kind === 'arrival') {
      rigApi.current?.finishArrival();
      return false;
    }
    if (r.motion.kind === 'fade') return false;
    r.motion = null;
    r.goal = { ...r.cur };
    return true;
  };

  const input = (
    c:
      | { type: 'zoom'; dir: 1 | -1 }
      | { type: 'rotate'; dir: 1 | -1 }
      | { type: 'tilt'; dir: 1 | -1 }
      | { type: 'pan'; right: number; forward: number },
  ) => {
    if (!takeOver()) return;
    const r = rig.current;
    if (c.type === 'zoom') r.goal = zoom(r.goal, c.dir > 0 ? 0.8 : 1.25, r.limits);
    if (c.type === 'rotate') r.goal = rotate(r.goal, c.dir * 0.06, 0, r.limits);
    if (c.type === 'tilt') r.goal = rotate(r.goal, 0, c.dir * 0.05, r.limits);
    if (c.type === 'pan') r.goal = pan(r.goal, c.right * 0.12, c.forward * 0.12);
  };

  // Pointer, touch and wheel on the canvas.
  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';
    const pointers = new Map<number, { x: number; y: number; button: number; shift: boolean }>();
    let down: { x: number; y: number; t: number; moved: number } | null = null;
    let pinch: { d: number; mx: number; my: number } | null = null;
    const ray = new THREE.Raycaster();

    const pinchState = () => {
      const [a, b] = [...pointers.values()];
      if (!a || !b) return null;
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey });
      if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      if (pointers.size === 2) {
        pinch = pinchState();
        down = null;
      }
      el.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (down && down.moved < PICK_SLOP && pointers.size === 1) return;
      const r = rig.current;
      const h = Math.max(1, el.clientHeight);
      if (pointers.size >= 2) {
        const now = pinchState();
        if (now && pinch) {
          if (!takeOver()) return;
          if (pinch.d > 0 && now.d > 0) r.goal = zoom(r.goal, pinch.d / now.d, r.limits);
          r.goal = pan(r.goal, (-(now.mx - pinch.mx) / h) * 0.8, ((now.my - pinch.my) / h) * 0.8);
          pinch = now;
        }
        return;
      }
      if (!takeOver()) return;
      if (p.button === 2 || p.button === 1 || p.shift) {
        r.goal = pan(r.goal, (-dx / h) * 0.8, (dy / h) * 0.8);
      } else {
        r.goal = rotate(r.goal, dx / Math.max(1, el.clientWidth), dy / h, r.limits);
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      el.style.cursor = 'grab';
      const d = down;
      down = null;
      if (!d || d.moved >= PICK_SLOP || performance.now() - d.t > 600) return;
      // A click: during the arrival it skips; otherwise it may pick a building.
      if (store.get().mode.kind === 'arrival') {
        rigApi.current?.finishArrival();
        return;
      }
      pick(e);
    };
    const pick = (e: PointerEvent) => {
      const mode = store.get().mode;
      if (mode.kind === 'office') return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      for (const hit of ray.intersectObjects(scene.children, true)) {
        let o: THREE.Object3D | null = hit.object;
        if (!o.visible) continue;
        while (o && o.userData.buildingKey === undefined && !o.userData.interior) o = o.parent;
        if (!o) continue;
        if (o.userData.interior) return; // interior objects handle their own clicks
        const key = String(o.userData.buildingKey);
        if ('building' in mode && mode.building === key && mode.kind !== 'building') return;
        navigate(store, layout, { type: 'select-building', building: key });
        return;
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!takeOver()) return;
      const r = rig.current;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      r.goal = zoom(r.goal, Math.exp(clamp(delta, -200, 200) * 0.0015), r.limits);
    };
    const onContext = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContext);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContext);
    };
  }, [gl, camera, scene, store, layout]);

  // Keyboard: only when focus is on the page, the scene or a control that does not use the key itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName ?? 'BODY';
      if (t?.isContentEditable) return;
      if (t && t !== document.body && keyBelongsToControl(e.key, tag, t.getAttribute('role'))) return;
      // The scene's keys apply when focus is inside the scene, or on the page itself when the scene fills the
      // window (the city explorer). Embedded in a page (the demo office), page keys keep scrolling the page.
      const host = gl.domElement.parentElement?.parentElement?.parentElement ?? null;
      if (t && t !== document.body && !host?.contains(t)) return;
      if ((!t || t === document.body) && host) {
        const r = host.getBoundingClientRect();
        if (r.width * r.height < window.innerWidth * window.innerHeight * 0.8) return;
      }
      const mode = store.get().mode;
      if (mode.kind === 'arrival') {
        // Any key skips the arrival (modifier keys alone and Tab do not: Tab moves to the Skip button).
        if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
        e.preventDefault();
        rigApi.current?.finishArrival();
        return;
      }
      const c = keyToCommand(e);
      if (!c) return;
      // Arrow keys on buttons belong to the scene only when the focus is the scene itself or the page.
      const onControl = t && t !== document.body && tag !== 'CANVAS' && t.dataset.cityFocus === undefined;
      if (onControl && c.type === 'pan' && e.key.startsWith('Arrow')) return;
      e.preventDefault();
      if (c.type === 'reset') bus.emit({ type: 'reset' });
      else if (c.type === 'home') {
        if (!navigate(store, layout, { type: 'home' })) bus.emit({ type: 'reset' });
      } else if (c.type === 'back') navigate(store, layout, { type: 'back' });
      else input(c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, layout, bus, gl]);

  useFrame((_, rawDt) => {
    const r = rig.current;
    const dt = Math.min(rawDt, 0.1);
    // Camera moves run on wall-clock time (up to half a second a frame): on a slow device a 4 s flight still lands
    // in about 4 s instead of crawling for minutes at a tenth of a second per frame.
    const moveDt = Math.min(rawDt, 0.5);
    const reduced = store.get().reducedMotion;
    const m = r.motion;
    // Whether a camera move is under way, for tests and tooling (the canvas carries it as data-city-motion).
    const moving = m ? m.kind : '';
    if (gl.domElement.dataset.cityMotion !== moving) gl.domElement.dataset.cityMotion = moving;
    if (m?.kind === 'flight') {
      m.t += moveDt;
      const p = sampleFlight(m.flight, m.t);
      const o = orbitFromPose(p.pos, p.target);
      r.cur = o;
      r.goal = { ...o };
      if (m.t >= m.flight.duration) {
        r.motion = null;
        r.goal = clampOrbit(r.goal, r.limits);
      }
    }
    if (!r.motion && r.pendingBoxes) {
      r.boxes = r.pendingBoxes;
      r.pendingBoxes = null;
    }
    if (m?.kind === 'flight') {
      // Sampled above, before the pending collision boxes are applied.
    } else if (m?.kind === 'glide') {
      m.t += moveDt;
      // Fade in from the night-blue curtain over the first second.
      r.fade = clamp(1 - m.t / 1.2, 0, 1);
      const p = sampleGlide(m.glide, m.t);
      const o = orbitFromPose(p.pos, p.target);
      r.cur = o;
      r.goal = { ...o };
      const progress = clamp(m.t / m.glide.duration, 0, 1);
      if (progress - r.lastProgress > 0.02 || progress === 1) {
        r.lastProgress = progress;
        bus.emit({ type: 'arrival-progress', value: progress });
      }
      if (m.t >= m.glide.duration) {
        r.motion = null;
        rigApi.current?.finishArrival();
      }
    } else if (m?.kind === 'fade') {
      const before = m.t;
      m.t += moveDt;
      if (m.t < m.out) r.fade = m.t / m.out;
      else if (m.t < m.out + m.hold) {
        r.fade = 1;
        if (before < m.out) {
          const o = orbitFromPose(m.to.pos, m.to.target);
          r.cur = { ...o };
          r.goal = { ...o };
        }
      } else {
        if (before < m.out) {
          const o = orbitFromPose(m.to.pos, m.to.target);
          r.cur = { ...o };
          r.goal = { ...o };
        }
        r.fade = clamp(1 - (m.t - m.out - m.hold) / m.in, 0, 1);
        if (r.fade <= 0) {
          r.motion = null;
          m.done?.();
        }
      }
    } else {
      // City Orbit: a slow automatic turn round the district, paused by any input and resumed when left alone.
      const st = store.get();
      if (st.mode.kind === 'explore' && st.view === 'orbit' && !reduced && r.idle >= ORBIT_RESUME)
        r.goal.theta += ORBIT_SPEED * dt;
      // Explore: ease the camera towards the goal. Reduced motion settles faster (less drift after input).
      const k = dampFactor(reduced ? 22 : 9, dt);
      const c = r.cur;
      const g = r.goal;
      g.target = clampTarget(g.target, boundsRef.current);
      if (r.room) g.target = clampToRoom(g.target, r.room);
      c.target = [
        c.target[0] + (g.target[0] - c.target[0]) * k,
        c.target[1] + (g.target[1] - c.target[1]) * k,
        c.target[2] + (g.target[2] - c.target[2]) * k,
      ];
      c.theta += (g.theta - c.theta) * k;
      c.phi += (g.phi - c.phi) * k;
      c.radius = Math.exp(Math.log(c.radius) + (Math.log(g.radius) - Math.log(c.radius)) * k);
    }

    r.idle += dt;
    // Exploded floors (animated by A1): the collision boxes follow the focused building's live progress.
    const focus = store.get().mode;
    const liveT = 'building' in focus ? liveExplode(store, focus.building) : 0;
    if (Math.abs(liveT - r.explodeT) > 1e-3) {
      r.explodeT = liveT;
      r.boxes = [...boxesFor(layout, focus, r.measured, liveT), ...r.skyline];
    }

    // Never inside a building, below the street or outside the city.
    const pos = orbitPosition(r.cur);
    const safe = clampPosition(pos, r.boxes, boundsRef.current);
    if (safe[0] !== pos[0] || safe[1] !== pos[1] || safe[2] !== pos[2]) {
      r.cur = orbitFromPose(safe, r.cur.target);
      if (!r.motion) {
        const gp = clampPosition(orbitPosition(r.goal), r.boxes, boundsRef.current);
        r.goal = orbitFromPose(gp, r.goal.target);
      }
    }
    camera.position.set(safe[0], safe[1], safe[2]);
    camera.lookAt(r.cur.target[0], r.cur.target[1], r.cur.target[2]);

    // Centre framings in the part of the view that HUD panels leave visible.
    if (camera instanceof THREE.PerspectiveCamera) {
      const kx = dampFactor(reduced ? 30 : 6, dt);
      r.offset.x += (r.insets.right / 2 - r.offset.x) * kx;
      r.offset.y += (r.insets.bottom / 2 - r.offset.y) * kx;
      const w = size.width;
      const h = size.height;
      if (Math.abs(r.offset.x) > 0.5 || Math.abs(r.offset.y) > 0.5)
        camera.setViewOffset(w, h, r.offset.x, r.offset.y, w, h);
      else if (camera.view) camera.clearViewOffset();
    }

    // The curtain belongs to a glide or a fade alone: whatever replaced or ended one of those (a skip, a flight
    // that interrupted it, the visitor taking over, a mode change) lifts it at once, so it can never hang.
    if (m?.kind !== 'glide' && m?.kind !== 'fade' && !r.pendingArrival && r.fade > 0) r.fade = 0;
    const quad = fadeRef.current;
    if (quad) {
      fadeMat.opacity = r.fade;
      quad.visible = r.fade > 0.001;
      if (quad.visible) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        quad.position.copy(camera.position).addScaledVector(dir, camera.near * 2 + 0.01);
        quad.quaternion.copy(camera.quaternion);
      }
    }

    if (r.frames < 4 && ++r.frames === 3) bus.emit({ type: 'ready' });

    // Measure the real architecture once it has rendered, and again while it settles (details may stream in).
    r.sinceMeasure += rawDt;
    if (r.frames >= 3 && (r.measured === null || (r.sinceMeasure > 2 && clockRef.current < 20))) {
      r.sinceMeasure = 0;
      const first = r.measured === null;
      r.measured = measureBuildings(scene, layout);
      r.skyline = measureSkyline(scene);
      if (r.skyline.length) {
        const reach = Math.max(
          ...r.skyline.map(b => Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minZ), Math.abs(b.maxZ))),
        );
        boundsRef.current = { ...baseBounds, extent: Math.max(baseBounds.extent, reach + 40) };
      }
      if (r.pendingArrival && store.get().mode.kind === 'arrival') rigApi.current?.go(store.get().mode);
      r.boxes = [...boxesFor(layout, store.get().mode, r.measured, r.explodeT), ...r.skyline];
      // The first framing was made before the real architecture was known: re-frame once, gently, unless the
      // visitor has already taken over.
      const mode = store.get().mode;
      if (first && !touched.current && !r.motion && mode.kind !== 'arrival') rigApi.current?.go(mode);
    }
    clockRef.current += rawDt;
  });

  return (
    <>
      <mesh
        ref={fadeRef}
        name="a3-fade-curtain"
        material={asMat(fadeMat)}
        renderOrder={10_000}
        frustumCulled={false}
        userData={{ noPick: true }}
      >
        <planeGeometry args={[50, 50]} />
      </mesh>
      <Callout />
      <LabelProjector store={store} />
    </>
  );
}
