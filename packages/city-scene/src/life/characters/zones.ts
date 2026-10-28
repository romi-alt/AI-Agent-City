/**
 * Character appearance and clip names, shared by the street crowd and A3's office agents. Pure data (no three.js),
 * so tests can use it.
 */

/** Zones baked into the character asset (COLOR_0.r = zone / 8); see scripts/build-characters.ts. */
export const ZONE = { skin: 0, top: 1, bottom: 2, shoes: 3, hair: 4, eyes: 5, shirt: 6, belt: 7 } as const;

export type CharacterBody = 'male' | 'female';
export type MaleHair = 'parted' | 'buzzed' | 'beard';
export type FemaleHair = 'long' | 'buns' | 'buzzed';
export type CharacterHair = MaleHair | FemaleHair;

/** Mesh names in characters.glb for each hairstyle. */
export const HAIR_MESH: Record<CharacterBody, Partial<Record<CharacterHair, string>>> = {
  male: { parted: 'Male_Hair_SimpleParted', buzzed: 'Male_Hair_Buzzed', beard: 'Male_Hair_Beard' },
  female: { long: 'Female_Hair_Long', buns: 'Female_Hair_Buns', buzzed: 'Female_Hair_Buzzed' },
};
export const HAIRS: Record<CharacterBody, CharacterHair[]> = {
  male: ['parted', 'buzzed', 'beard'],
  female: ['long', 'buns', 'buzzed'],
};

/** The clips available, by friendly name → clip name in the asset. */
export const CLIPS = {
  idle: 'Idle_Loop',
  talk: 'Idle_Talking_Loop',
  phone: 'Idle_TalkingPhone_Loop',
  foldArms: 'Idle_FoldArms_Loop',
  walk: 'Walk_Loop',
  walkFormal: 'Walk_Formal_Loop',
  carry: 'Walk_Carry_Loop',
  sit: 'Sitting_Idle_Loop',
  sitTalk: 'Sitting_Talking_Loop',
  sitDown: 'Sitting_Enter',
  standUp: 'Sitting_Exit',
  interact: 'Interact',
  type: 'Typing_Loop',
} as const;
export type CharacterClip = keyof typeof CLIPS;
/** Clips that play once and hold their last frame. */
export const ONE_SHOT: readonly CharacterClip[] = ['sitDown', 'standUp', 'interact'];

/** Colours (CSS hex) for each painted zone. */
export interface CharacterLook {
  skin: string;
  top: string;
  bottom: string;
  shoes: string;
  hair: string;
  /** Shirt showing at the neck of a jacket; omit for a plain top. */
  shirt?: string;
}

/**
 * Character height in metres is about 1.8. The city is legacy scale (1 unit ≈ 2.6 m for vehicles); people are drawn
 * at 0.4 units per metre, about 0.72 units tall, a touch over life so they read from the default camera.
 */
export const CITY_SCALE = 0.4;

const SKIN = [
  '#f3d6c1',
  '#eac4a6',
  '#e0b08c',
  '#cf9a74',
  '#b97f58',
  '#9c6646',
  '#7d4f36',
  '#5e3a28',
  '#f0cdb4',
  '#c28b66',
];
const HAIR = [
  '#141110',
  '#1f1813',
  '#2e2219',
  '#3d2a1c',
  '#55392a',
  '#6e4a30',
  '#8c6a43',
  '#b79a6b',
  '#8e8b86',
  '#c9c6c0',
];
/** City clothing: mostly navy, charcoal, black, grey, camel, white and denim, with the odd muted colour. */
const TOPS = [
  '#1e2635',
  '#232a38',
  '#2f3238',
  '#3a3d43',
  '#18191c',
  '#5f646b',
  '#8a8e94',
  '#a3865f',
  '#b39a74',
  '#e7e4dc',
  '#d9d6cf',
  '#a9b8c9',
  '#4b5d78',
  '#3f5068',
  '#5a5e48',
  '#6a3b3f',
  '#3e5f5d',
  '#8a6a55',
];
const BOTTOMS = ['#1c212b', '#24272d', '#16171a', '#3b4f6b', '#34465f', '#565b62', '#8d8068', '#3a3029', '#2c2f35'];
const JACKETS = ['#1e2635', '#232a38', '#2f3238', '#18191c', '#3a3d43', '#4b4f56', '#8a7458', '#3f5068'];
const SHIRTS = ['#f1efe9', '#e9edf2', '#c9d6e6', '#f3f0e6', '#dfe4e9'];
const SHOES = ['#17181a', '#231c18', '#3a2a20', '#1d1f24', '#e6e3dc', '#5b4636'];

function colorDistance(a: string, b: string): number {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return Math.hypot(ch(a, 0) - ch(b, 0), ch(a, 1) - ch(b, 1), ch(a, 2) - ch(b, 2));
}

/** A deterministic look, body and hairstyle from a random source in [0, 1). */
export function characterLook(rng: () => number): { body: CharacterBody; hair: CharacterHair; look: CharacterLook } {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length) % xs.length]!;
  const body: CharacterBody = rng() < 0.5 ? 'male' : 'female';
  // About half the office crowd wears a jacket over a shirt.
  const jacket = rng() < 0.45;
  const look: CharacterLook = {
    skin: pick(SKIN),
    top: '',
    bottom: pick(BOTTOMS),
    shoes: pick(SHOES),
    hair: pick(HAIR),
  };
  // A top close to the skin tone reads as bare skin at street distance, so step to the next colour.
  const tops = jacket ? JACKETS : TOPS;
  let k = Math.floor(rng() * tops.length) % tops.length;
  for (let n = 0; n < tops.length && colorDistance(tops[k]!, look.skin) < 0.22; n++) k = (k + 1) % tops.length;
  look.top = tops[k]!;
  if (jacket) look.shirt = pick(SHIRTS);
  return { body, hair: pick(HAIRS[body]), look };
}
