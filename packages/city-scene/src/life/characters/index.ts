/**
 * Shared characters (A2): skinned, animated people for the street crowd and for office agents (A3).
 *
 * - `<Character clip="type" body="female" hair="long" look={{ top: '#1e2635' }} position={…} rotationY={…} />`:
 *   one SkinnedMesh with an AnimationMixer, cross-fading between clips (close-ups, offices).
 * - `useCharacterAsset()` / `loadCharacterAsset()`: the loaded asset (scene and clips per body).
 * - `bakeCrowd()` + `CrowdMesh`: many instanced characters in one draw per body type (clips baked to a texture).
 * - `characterLook(rng)`, `CLIPS`, `CITY_SCALE`: appearance and clip names.
 */
export { Character, type CharacterProps } from './Character.tsx';
export { CHARACTER_URL, loadCharacterAsset, useCharacterAsset, type CharacterAsset } from './asset.ts';
export { bakeCrowd, CROWD_FPS, CrowdMesh, STREET_CLIPS, type CrowdBake, type CrowdInstanceAnim } from './crowd.ts';
export { characterMaterial, lookUniforms, setLook, type LookUniforms } from './material.ts';
export {
  characterLook,
  CITY_SCALE,
  CLIPS,
  HAIRS,
  ONE_SHOT,
  ZONE,
  type CharacterBody,
  type CharacterClip,
  type CharacterHair,
  type CharacterLook,
} from './zones.ts';
