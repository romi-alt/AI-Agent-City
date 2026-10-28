// The city presets (explore mode): Overview, Top and Orbit framings, the eased moves between them, and the zoom and
// tilt limits that keep the edge of the generated city out of sight. Pure functions, testable in node; CameraRig
// calls them through a few small hooks.
import { cityRoads, districtBounds } from '../streets/extent.ts';
import type { CityLayout } from '../types.ts';
import type { Box } from './bounds.ts';
import { boxCorners, centroid, fitPoints, projectToVisible, type Viewport } from './fit.ts';
import type { Flight } from './flight.ts';
import { clamp, type V3 } from './math.ts';
import { clampOrbit, type Orbit, type OrbitLimits, orbitPosition } from './orbit.ts';
import { poseFromOrbit, type Pose } from './shots.ts';

/** An axis-aligned rectangle on the ground. */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** What the presets need to know about the city: the downtown district and how far the generated city reaches. */
export interface CityFrame {
  /** The downtown district (the client buildings and their streets). */
  district: Rect;
  /** Road centre lines of the whole generated city: along z at each x, along x at each z. */
  roadsX: number[];
  roadsZ: number[];
  /** Half-size of the generated city: ground, roads and buildings end at ±extent. */
  extent: number;
}

/** The city frame: D1's district bounds and the extended road grid of the whole generated city. */
export function cityFrame(layout: CityLayout): CityFrame {
  const roads = cityRoads(layout);
  return { district: districtBounds(layout), roadsX: roads.roadsX, roadsZ: roads.roadsZ, extent: roads.extent };
}

const DEG = Math.PI / 180;

/** Overview: about 32° down from horizontal (as in the street reference), heading almost straight up a street. */
export const OVERVIEW_PITCH = 32 * DEG;
/** A slight turn off the street's axis, so the facades on one side read as well as the street receding. */
export const OVERVIEW_HEADING = 0.12;
/** Orbit: the same low angle, a touch higher so the turn keeps the whole district in view. */
export const ORBIT_PITCH = 35 * DEG;
/** Orbit starts from the south-east three-quarter view (fronts and east facades), then turns. */
export const ORBIT_HEADING = 0.62;
/** Top: almost straight down, north up (a hair of tilt keeps "up" on screen meaning north). */
export const TOP_PHI = 0.04;
/** Seconds for a move between presets: long enough to follow, short enough to feel direct. */
export const PRESET_SECONDS = 1.1;

/** Orbit polar angle (down from straight overhead) for a pitch below the horizontal. */
export const phiOfPitch = (pitch: number) => Math.PI / 2 - pitch;

/** Client buildings only (the background skyline's measured towers are not part of the district). */
function heroes(boxes: Box[]): Box[] {
  return boxes.filter(b => !b.key.startsWith('skyline:'));
}

function corners(boxes: Box[]): V3[] {
  return boxes.flatMap(b => boxCorners(b.minX, b.maxX, 0, b.top, b.minZ, b.maxZ));
}

/** Width / height of the part of the view the HUD leaves visible. */
export function visibleAspect(vp: Viewport): number {
  return Math.max(1, vp.width - vp.right) / Math.max(1, vp.height - vp.bottom);
}

/**
 * The client buildings a portrait view can hold at a useful size: a column of them around their centre whose width
 * follows the visible aspect (all of them on a landscape screen).
 */
export function framedHeroes(boxes: Box[], vp: Viewport): Box[] {
  const all = heroes(boxes);
  if (!all.length) return all;
  const minX = Math.min(...all.map(b => b.minX));
  const maxX = Math.max(...all.map(b => b.maxX));
  const cx = (minX + maxX) / 2;
  const reach = ((maxX - minX) / 2) * clamp(visibleAspect(vp) / 1.3, 0.3, 1);
  const column = all.filter(b => Math.abs((b.minX + b.maxX) / 2 - cx) <= reach);
  return column.length ? column : all;
}

/**
 * The street the overview looks along: the district's north–south road nearest its centre (the west one on a tie,
 * so the street sits left of the hero buildings, as in the reference).
 */
export function mainStreet(frame: CityFrame): number {
  const cx = (frame.district.minX + frame.district.maxX) / 2;
  const inside = frame.roadsX.filter(x => x > frame.district.minX && x < frame.district.maxX);
  const roads = inside.length ? inside : frame.roadsX;
  return roads.reduce((best, x) => (Math.abs(x - cx) < Math.abs(best - cx) - 1e-6 ? x : best), roads[0] ?? cx);
}

const inside = ([x, y]: [number, number]) => Math.abs(x) <= 1 && Math.abs(y) <= 1;

/**
 * City Overview: low and close, looking up the main street so it recedes into the haze, with the client buildings
 * filling the visible part of the view.
 */
export function overviewPreset(boxes: Box[], frame: CityFrame, vp: Viewport): Orbit {
  const o = fitPoints(corners(framedHeroes(boxes, vp)), OVERVIEW_HEADING, phiOfPitch(OVERVIEW_PITCH), vp, 0.02);
  // Slide sideways (along the view's right axis) towards the main street, so it runs up the middle of the picture,
  // halving the slide until every client building is still inside the view.
  const pts = corners(framedHeroes(boxes, vp));
  const street = mainStreet(frame);
  const right: V3 = [Math.cos(OVERVIEW_HEADING), 0, -Math.sin(OVERVIEW_HEADING)];
  let off = (street - o.target[0]) * Math.cos(OVERVIEW_HEADING);
  for (let i = 0; i < 6; i++, off /= 2) {
    const slid: Orbit = { ...o, target: [o.target[0] + right[0] * off, o.target[1], o.target[2] + right[2] * off] };
    if (pts.every(p => inside(projectToVisible(slid, p, vp)))) return slid;
  }
  return o;
}

/**
 * City Top: straight down, tight on the client buildings (roofs included, no margin), so the blocks around them run
 * off every edge of the screen.
 */
export function topPreset(boxes: Box[], vp: Viewport): Orbit {
  return fitPoints(corners(framedHeroes(boxes, vp)), 0, TOP_PHI, vp, 0);
}

/**
 * City Orbit: a slow turn round the district's centre at the low angle, at the mean of eight headings' fits: the
 * district fills the view along its length and runs a little off the sides when seen end-on.
 */
export function orbitPreset(boxes: Box[], vp: Viewport, theta = ORBIT_HEADING): Orbit {
  const pts = corners(framedHeroes(boxes, vp));
  const c = centroid(pts);
  const phi = phiOfPitch(ORBIT_PITCH);
  let radius = 0;
  for (let k = 0; k < 8; k++) {
    const f = fitPoints(pts, theta + (k * Math.PI) / 4, phi, vp, 0.04);
    // fitPoints re-centres the target; measure from the district's own centre so the turn stays put.
    const shift = Math.hypot(f.target[0] - c[0], f.target[2] - c[2]);
    radius += (f.radius + shift) / 8;
  }
  return { target: [c[0], 0, c[2]], theta, phi, radius };
}

export type PresetView = 'overview' | 'top' | 'orbit';

/** The framing for a preset, kept inside the limits (so the edge of the city never shows, even at rest). */
export function presetPose(view: PresetView, boxes: Box[], frame: CityFrame, vp: Viewport, limits: OrbitLimits): Pose {
  const o =
    view === 'top'
      ? topPreset(boxes, vp)
      : view === 'orbit'
        ? orbitPreset(boxes, vp)
        : overviewPreset(boxes, frame, vp);
  return poseFromOrbit(clampOrbit(o, { ...limits, minPhi: Math.min(limits.minPhi, o.phi) }));
}

/** A move between presets: a fixed, short eased flight (no mid-flight pull-back: the district stays framed). */
export function presetFlight(from: Pose, to: Pose): Flight {
  return { from, to, duration: PRESET_SECONDS, pullBack: 0 };
}

/**
 * The view depth beyond which the fog hides everything (the edge included). Linear fog: its far plane. Exponential
 * fog: where it reaches 99%. No fog: nothing is hidden.
 */
export function fogHides(fog: unknown): number {
  const f = fog as { far?: number; density?: number } | null | undefined;
  if (f && typeof f.far === 'number' && f.far > 0) return f.far;
  if (f && typeof f.density === 'number' && f.density > 0) return Math.sqrt(Math.log(100)) / f.density;
  return Infinity;
}

/**
 * D1's fog follows the camera (environment/Environment.tsx): looking down from above `FOG_LIFT_FROM` it is pushed out
 * by the height times the squared downward look, the far plane by `FOG_FAR_LIFT` times that. Mirrored here so the
 * limits judge each candidate view with the fog it would really have; keep the two in step.
 */
export const FOG_LIFT_FROM = 40;
export const FOG_FAR_LIFT = 1.15;

/** How much D1 pushes the fog's far plane out for a camera at height `y` whose view direction has y-component `dirY`. */
export function fogFarLift(y: number, dirY: number): number {
  return Math.max(0, y - FOG_LIFT_FROM) * Math.max(0, -dirY) ** 2 * FOG_FAR_LIFT;
}

/** The fog's hiding depth for an orbit, from the base distance (the time of day and weather alone). */
export function fogAt(o: Orbit, baseDepth: number): number {
  const y = o.target[1] + o.radius * Math.cos(o.phi);
  return baseDepth + fogFarLift(y, -Math.cos(o.phi));
}

/**
 * How far from the centre (the larger of |x| and |z|) the ground the camera can see reaches, counting only ground
 * nearer than the fog's hiding depth. The visible ground is the frustum cut by the ground and the fog depth, a convex
 * shape whose corners lie on the frustum's border rays, so sampling the border (and the fog line's ends) finds it.
 * The HUD's view offset (CameraRig shifts the view by half the panel and sheet sizes) moves the frustum's window
 * right and down.
 */
export function groundReach(o: Orbit, vp: Viewport, fogDepth: number): number {
  const p = orbitPosition(o);
  const f = norm([o.target[0] - p[0], o.target[1] - p[1], o.target[2] - p[2]]);
  const r = norm([-f[2], 0, f[0]]);
  const u: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const t = Math.tan((vp.fov * DEG) / 2);
  const tx = (t * vp.width) / vp.height;
  const ty = t;
  // Window shift in units of the half-extents: setViewOffset by (right / 2, bottom / 2) pixels.
  const ox = vp.right / vp.width;
  const oy = -vp.bottom / vp.height;
  const h = p[1];
  if (h <= 0) return Infinity;
  let reach = 0;
  const visit = (x: number, z: number) => (reach = Math.max(reach, Math.abs(x), Math.abs(z)));
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const s = -1 + (2 * i) / N;
    for (const [a, b] of [
      [s, 1],
      [s, -1],
      [1, s],
      [-1, s],
    ] as const) {
      const x = (a + ox) * tx;
      const y = (b + oy) * ty;
      const d: V3 = [f[0] + r[0] * x + u[0] * y, f[1] + u[1] * y, f[2] + r[2] * x + u[2] * y];
      // d is unnormalised with d·f = 1, so the ray parameter is the view depth.
      if (d[1] >= 0) {
        if (!Number.isFinite(fogDepth)) return Infinity; // the horizon is in view and nothing hides what lies there
        continue;
      }
      const depth = h / -d[1];
      if (depth <= fogDepth) visit(p[0] + d[0] * depth, p[2] + d[2] * depth);
    }
  }
  if (Number.isFinite(fogDepth)) {
    // Where the ground meets the fog depth: a line across the view; its two ends inside the frustum are corners.
    const fh = norm([f[0], 0, f[2]]);
    const along = fh[0] * f[0] + fh[2] * f[2];
    if (along > 1e-6) {
      const s = (fogDepth + h * f[1]) / along;
      const x0: V3 = [p[0] + fh[0] * s, 0, p[2] + fh[2] * s];
      const v: V3 = [x0[0] - p[0], -h, x0[2] - p[2]];
      const sy = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / fogDepth;
      if (sy >= (oy - 1) * ty && sy <= (oy + 1) * ty) {
        for (const k of [ox - 1, ox + 1]) visit(x0[0] + r[0] * k * fogDepth * tx, x0[2] + r[2] * k * fogDepth * tx);
      }
    }
  }
  return reach;
}

function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Ground kept between the farthest visible point and the end of the city. */
export const EDGE_MARGIN = 3;
/** The margin the limits are searched with (sampling tilts and distances needs some slack). */
const SEARCH_MARGIN = 15;

/**
 * Whether a camera orbit keeps the edge out of sight from the worst place the visitor can take it: the target at
 * any corner of the area it may pan over, facing any of eight headings. `fogBase` is the fog's hiding depth before
 * the camera's own lift (see `fogAt`).
 */
export function edgeHidden(
  phi: number,
  radius: number,
  frame: CityFrame,
  vp: Viewport,
  fogBase: number,
  targetExtent: number,
  margin = EDGE_MARGIN,
): boolean {
  const limit = frame.extent - margin;
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    for (let k = 0; k < 8; k++) {
      const o: Orbit = { target: [sx * targetExtent, 0, sz * targetExtent], theta: (k * Math.PI) / 4, phi, radius };
      if (groundReach(o, vp, fogAt(o, fogBase)) > limit) return false;
    }
  }
  return true;
}

/**
 * Whether the edge stays hidden at this tilt for every distance from `lo` out to `radius`. Every distance, not just
 * the farthest: zooming in on a target near the district's corner moves the camera towards the edge.
 */
function hiddenUpTo(phi: number, lo: number, radius: number, ok: (phi: number, radius: number) => boolean): boolean {
  for (let i = 0; i <= 8; i++) if (!ok(phi, lo + ((radius - lo) * i) / 8)) return false;
  return true;
}

/** Largest radius (up to `hi`) at which every tilt from `phiLo` to `phi` and every nearer distance hide the edge. */
function safeRadius(
  phiLo: number,
  phi: number,
  lo: number,
  hi: number,
  ok: (phi: number, radius: number) => boolean,
): number {
  const phis: number[] = [];
  for (let a = phiLo; a < phi; a += 0.025) phis.push(a);
  phis.push(phi);
  const all = (radius: number) => phis.every(a => hiddenUpTo(a, lo, radius, ok));
  if (all(hi)) return hi;
  if (!all(lo)) return 0;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 14; i++) {
    const m = (a + b) / 2;
    if (all(m)) a = m;
    else b = m;
  }
  return a;
}

const cache = new Map<string, OrbitLimits>();

/**
 * Explore-mode zoom and tilt limits that keep the edge of the generated city out of sight. The tilt towards the
 * horizon stops where the edge would come into view at the widest preset's distance; the zoom then stops a little
 * beyond that preset, or sooner if the edge would show at any allowed tilt.
 */
export function edgeLimits(
  base: OrbitLimits,
  frame: CityFrame,
  vp: Viewport,
  fogBase: number,
  targetExtent: number,
  presetRadius: number,
): OrbitLimits {
  const key = [base.minRadius, base.maxRadius, base.minPhi, base.maxPhi, frame.extent, vp.width, vp.height, vp.right]
    .concat([vp.bottom, vp.fov, Math.round(fogBase), targetExtent, Math.round(presetRadius)])
    .join(',');
  const hit = cache.get(key);
  if (hit) return hit;
  // A wider margin than the check's: the search samples tilts and distances, the margin covers what lies between.
  const ok = (phi: number, radius: number) => edgeHidden(phi, radius, frame, vp, fogBase, targetExtent, SEARCH_MARGIN);
  const presetPhi = Math.min(phiOfPitch(OVERVIEW_PITCH), base.maxPhi);
  const want = Math.min(base.maxRadius, Math.max(presetRadius * 1.35, base.minRadius));
  const preset = Math.min(want, Math.max(base.minRadius, presetRadius));
  // First the tilt: as low as the edge allows at every distance out to the widest preset's (never above the
  // overview's own tilt).
  let maxPhi = presetPhi;
  for (let a = presetPhi + 0.01; a <= base.maxPhi + 1e-9; a += 0.01) {
    if (!hiddenUpTo(a, base.minRadius, preset, ok)) break;
    maxPhi = a;
  }
  // Then the zoom: as far out as every allowed tilt keeps the edge hidden. A city too small to hide its edge at all
  // (no generated rings yet) keeps the presets' distance rather than a view squeezed onto one block.
  const safe = safeRadius(base.minPhi, maxPhi, base.minRadius, want, ok);
  const maxRadius = safe < preset * 0.5 ? preset : Math.max(base.minRadius, safe);
  const out: OrbitLimits = { ...base, maxRadius, maxPhi };
  if (cache.size > 32) cache.clear();
  cache.set(key, out);
  return out;
}

/**
 * The limits CameraRig applies while exploring: its own explore limits, narrowed so the edge of the generated city
 * stays out of sight around the current presets, in this viewport and fog. Cached, so it is cheap every frame.
 */
export function exploreLimits(
  base: OrbitLimits,
  frame: CityFrame,
  boxes: Box[],
  vp: Viewport,
  fog: unknown,
  targetExtent: number,
  camera: { y: number; dirY: number },
): OrbitLimits {
  const widest = Math.max(overviewPreset(boxes, frame, vp).radius, orbitPreset(boxes, vp).radius);
  // Undo the camera's own fog lift to get the base distance, rounded up (more fog depth hides less, so rounding up
  // is the safe side) so the cached limits survive small changes and the 3 s time-of-day transitions.
  const depth = fogHides(fog) - fogFarLift(camera.y, camera.dirY);
  const baseDepth = Number.isFinite(depth) ? Math.ceil(depth / 20) * 20 : depth;
  return edgeLimits(base, frame, vp, baseDepth, targetExtent, widest);
}
