// Shared contract of the city scene (see planning/agentcity-migration/x01-cinematic-city/PLAN.md). Changing these
// types affects every workstream: coordinate first.

export type BuildingKind = 'training' | 'dealership' | 'associates' | 'rental';

export interface LayoutDesk {
  slot: number;
  kind: 'ai' | 'human';
  role: string;
  /** AI personas only. Human desks are anonymous in the public layout. */
  name: string | null;
}
export interface LayoutFloor {
  level: number;
  name: string;
  info: string | null;
  rentable: boolean;
  desks: LayoutDesk[];
}
export interface LayoutBuilding {
  /** Stable legacy id (catalog alias), e.g. "fast-sales". */
  key: string;
  /** Catalog uuid. */
  id: string;
  district: string;
  name: string;
  shortName: string;
  kind: BuildingKind;
  brand: string | null;
  color: string;
  accent: string;
  /** Lot centre and footprint in world units (1 unit ≈ 3.5 m; one floor = FLOOR_HEIGHT units). */
  x: number;
  z: number;
  w: number;
  d: number;
  floors: LayoutFloor[];
}
export interface CityLayout {
  version: 1;
  districts: { key: string; name: string }[];
  buildings: LayoutBuilding[];
  /** Street grid shared by roads, traffic and pedestrians (centre lines of the roads). */
  streets: { roadsX: number[]; roadsZ: number[]; extent: number };
}

export const FLOOR_HEIGHT = 1.4;

export type QualityLevel = 'ultra' | 'balanced' | 'low';
export type TimeOfDay = 'day' | 'golden' | 'evening' | 'night';
export type Weather = 'clear' | 'partly-cloudy' | 'overcast' | 'light-rain';

/** Where the camera/navigation is. Transitions are driven by the camera workstream. */
export type CityMode =
  | { kind: 'arrival' }
  | { kind: 'explore' }
  | { kind: 'building'; building: string }
  | { kind: 'floor'; building: string; level: number }
  | { kind: 'office'; building: string; level: number; desk: number | null };

/** How the city overview is shown (only while `mode` is explore). Building/floor/office framing follows `mode`. */
export type CityView = 'overview' | 'top' | 'orbit';

export interface CityState {
  mode: CityMode;
  /** Overview camera style: the elevated aerial view, a straight-down plan, or a slow automatic orbit. */
  view: CityView;
  /** Floors of the focused building separate vertically ("explode floors"), in building and floor modes. */
  explode: boolean;
  /** The agent selected in the office (desk focus and the agent panel), by agent id. */
  selectedAgent: string | null;
  quality: QualityLevel;
  /** True when the quality was picked automatically (the user has not overridden it). */
  qualityAuto: boolean;
  timeOfDay: TimeOfDay;
  weather: Weather;
  /** prefers-reduced-motion, or the user's own choice. Non-essential motion stops; transitions become cuts/fades. */
  reducedMotion: boolean;
  /** Tab hidden or scene off-screen: non-essential animation pauses. */
  paused: boolean;
  /** Building under the pointer (hover highlight). */
  hovered: string | null;
  /** Buildings the current viewer may enter (public: none; demo: the demo building). Others are look-only. */
  enterable: string[];
  /** A building to call out (e.g. the visitor's demo building during arrival). */
  highlight: string | null;
}
