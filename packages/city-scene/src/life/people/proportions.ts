/**
 * Body proportions shared by the shader pose (body.ts) and the simulation (sim.ts), so the walk cycle advances by
 * exactly the distance the planted foot covers: no sliding feet.
 */
export const HIP_HEIGHT = 0.56;
/** Peak hip swing while walking (radians). */
export const HIP_SWING = 0.52;
/**
 * People are drawn at 85% of the body model: still a little larger than life next to the legacy-scale cars, so
 * they read from the default camera, but no longer giants beside them.
 */
export const PERSON_SCALE = 0.85;
/** Ground covered by one full walk cycle (two steps) for a person of scale 1: 2 × (2 · leg · sin swing). */
export const STRIDE = 4 * HIP_HEIGHT * PERSON_SCALE * Math.sin(HIP_SWING);
