'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useContext, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCityContext } from '../context.tsx';
import { OfficeOccupantsContext } from '../interior/occupants.ts';
import { deskWorld } from '../interior/placement.ts';
import type { CityMode } from '../types.ts';
import { ARRIVAL_FADE_SECONDS, ARRIVAL_SECONDS, markArrivalPlayed } from './arrival.ts';
import { type Box, cityBounds, cityBoxes, clampPosition, clampTarget } from './bounds.ts';
import { sceneBus } from './bus.ts';
import { Callout } from './Callout.tsx';
import { LabelProjector } from './labels.ts';
import { type Flight, type Glide, planFlight, planGlide, sampleFlight, sampleGlide } from './flight.ts';
import { keyBelongsToControl, keyToCommand } from './keyboard.ts';
import { clamp, dampFactor, dist, type V3 } from './math.ts';
import { arrivalEnd, findBuilding, sameMode } from './modes.ts';
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
  deskShot,
  floorShot,
  homeShot,
  officeShot,
  type Pose,
  poseFromOrbit,
} from './shots.ts';
import { navigate } from './useNav.ts';
import { asMat } from '../interior/r3f.ts';

type Motion =
  | { kind: 'flight'; flight: Flight; t: number }
  | { kind: 'glide'; glide: Glide; t: number }
  | { kind: 'fade'; to: Pose; t: number; out: number; hold: number; in: number; done?: () => void };

interface Rig {
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
}

const PICK_SLOP = 6;

function limitsFor(mode: CityMode): OrbitLimits {
  if (mode.kind === 'office') return OFFICE_LIMITS;
  if (mode.kind === 'explore' || mode.kind === 'arrival') return EXPLORE_LIMITS;
  return BUILDING_LIMITS;
}

/**
 * The camera: one controller for every mode. Explore input (drag, touch, wheel, keys) edits a goal orbit that the
 * camera eases towards; mode changes fly (or, with reduced motion, fade) to a framing for the new mode. Every
 * position is clamped against the city's bounds and the buildings' boxes, during flights too.
 */
export function CameraRig() {
  const { store, layout } = useCityContext();
  const occupants = useContext(OfficeOccupantsContext);
  const { camera: cameraR3f, gl, scene: sceneR3f, size } = useThree();
  const camera = cameraR3f as unknown as THREE.PerspectiveCamera;
  const scene = sceneR3f as unknown as THREE.Scene;
  const bus = useMemo(() => sceneBus(store), [store]);
  const bounds = useMemo(() => cityBounds(layout), [layout]);
  const fadeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#0f1b2d',
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  const fadeRef = useRef<THREE.Mesh>(null);
  const aspect = size.width / Math.max(1, size.height);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  const rig = useRef<Rig>(null as unknown as Rig);
  if (!rig.current) {
    const start = homeShot(layout, aspect);
    const o = orbitFromPose(start.pos, start.target);
    rig.current = {
      cur: { ...o },
      goal: { ...o },
      motion: null,
      limits: EXPLORE_LIMITS,
      boxes: cityBoxes(layout),
      fade: 0,
      insets: bus.last('insets') ?? { right: 0, bottom: 0 },
      offset: { x: 0, y: 0 },
      frames: 0,
      lastProgress: -1,
    };
  }

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

    const shotFor = (mode: CityMode, prev: CityMode | null): Pose => {
      const a = aspectRef.current;
      switch (mode.kind) {
        case 'arrival':
          return homeShot(layout, a);
        case 'explore': {
          // Coming back out of a building: step back to see its block rather than jumping to the far overview.
          if (prev && 'building' in prev) {
            const b = findBuilding(layout, prev.building);
            if (b) {
              const o = { ...r.cur, target: [b.x, 2, b.z] as V3, radius: 70, phi: 0.95 };
              return poseFromOrbit(o);
            }
          }
          return homeShot(layout, a);
        }
        case 'building': {
          const b = findBuilding(layout, mode.building);
          return b ? buildingShot(b, a, othersThan(b.key)) : homeShot(layout, a);
        }
        case 'floor': {
          const b = findBuilding(layout, mode.building);
          return b ? floorShot(b, mode.level, a) : homeShot(layout, a);
        }
        case 'office': {
          const b = findBuilding(layout, mode.building);
          if (!b) return homeShot(layout, a);
          if (mode.desk !== null) {
            const d = deskWorld(b, mode.level, mode.desk, deskCount(mode));
            if (d) return deskShot(d.pos, d.facing);
          }
          return officeShot(b, mode.level, a);
        }
      }
    };

    const othersThan = (key: string) => cityBoxes(layout).filter(x => x.key !== key);

    const setCamera = (p: Pose) => {
      const o = orbitFromPose(p.pos, p.target);
      r.cur = { ...o };
      r.goal = { ...o };
    };

    const currentPose = (): Pose => ({ pos: camera.position.toArray() as V3, target: [...r.cur.target] });

    const go = (mode: CityMode, prev: CityMode | null, opts: { instant?: boolean; quick?: boolean } = {}) => {
      r.limits = limitsFor(mode);
      r.boxes = cityBoxes(
        layout,
        mode.kind === 'floor' || mode.kind === 'office' ? { building: mode.building, level: mode.level } : undefined,
      );
      const near = mode.kind === 'office' ? 0.03 : mode.kind === 'floor' ? 0.1 : 0.5;
      if (camera instanceof THREE.PerspectiveCamera && camera.near !== near) {
        camera.near = near;
        camera.updateProjectionMatrix();
      }
      const reduced = store.get().reducedMotion;
      if (mode.kind === 'arrival') {
        markArrivalPlayed(typeof window === 'undefined' ? null : window.sessionStorage);
        const end = arrivalEnd({ layout, enterable: store.get().enterable, highlight: store.get().highlight });
        const endPose = shotFor(end, null);
        const keys = arrivalKeyframes(layout, findBuilding(layout, store.get().highlight), aspectRef.current);
        keys[keys.length - 1] = endPose;
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
      const to = shotFor(mode, prev);
      if (opts.instant) {
        setCamera(to);
        r.motion = null;
        return;
      }
      if (reduced || opts.quick) {
        r.motion = fadeTo(to, reduced ? 0.5 : 0.7);
        return;
      }
      const from = currentPose();
      if (dist(from.pos, to.pos) < 0.05 && dist(from.target, to.target) < 0.05) {
        r.motion = null;
        return;
      }
      r.motion = { kind: 'flight', flight: planFlight(from, to), t: 0 };
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

    const unsub = store.subscribe(() => {
      const mode = store.get().mode;
      if (sameMode(mode, prev)) return;
      const was = prev;
      prev = mode;
      // Skipping the arrival (or anything ending it early) is a quick fade, never a long flight.
      const skipped = was.kind === 'arrival' && r.motion?.kind === 'glide';
      go(mode, was, { quick: skipped });
    });

    const offBus = bus.on(e => {
      switch (e.type) {
        case 'insets':
          r.insets = { right: e.right, bottom: e.bottom };
          break;
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
      const onControl = t && t !== document.body && tag !== 'CANVAS' && !t.dataset.cityFocus;
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
  }, [store, layout, bus]);

  useFrame((_, rawDt) => {
    const r = rig.current;
    const dt = Math.min(rawDt, 0.1);
    const reduced = store.get().reducedMotion;
    const m = r.motion;
    if (m?.kind === 'flight') {
      m.t += dt;
      const p = sampleFlight(m.flight, m.t);
      const o = orbitFromPose(p.pos, p.target);
      r.cur = o;
      r.goal = { ...o };
      if (m.t >= m.flight.duration) {
        r.motion = null;
        r.goal = clampOrbit(r.goal, r.limits);
      }
    } else if (m?.kind === 'glide') {
      m.t += dt;
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
      m.t += dt;
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
      // Explore: ease the camera towards the goal. Reduced motion settles faster (less drift after input).
      const k = dampFactor(reduced ? 22 : 9, dt);
      const c = r.cur;
      const g = r.goal;
      g.target = clampTarget(g.target, bounds);
      c.target = [
        c.target[0] + (g.target[0] - c.target[0]) * k,
        c.target[1] + (g.target[1] - c.target[1]) * k,
        c.target[2] + (g.target[2] - c.target[2]) * k,
      ];
      c.theta += (g.theta - c.theta) * k;
      c.phi += (g.phi - c.phi) * k;
      c.radius = Math.exp(Math.log(c.radius) + (Math.log(g.radius) - Math.log(c.radius)) * k);
    }

    // Never inside a building, below the street or outside the city.
    const pos = orbitPosition(r.cur);
    const safe = clampPosition(pos, r.boxes, bounds);
    if (safe[0] !== pos[0] || safe[1] !== pos[1] || safe[2] !== pos[2]) {
      r.cur = orbitFromPose(safe, r.cur.target);
      if (!r.motion) {
        const gp = clampPosition(orbitPosition(r.goal), r.boxes, bounds);
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
  });

  return (
    <>
      <mesh
        ref={fadeRef}
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
