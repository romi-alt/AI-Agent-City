/**
 * Body proportions shared by the shader pose (body.ts) and the simulation (sim.ts), so the walk cycle advances by
 * exactly the distance the planted foot covers: no sliding feet.
 */
export const HIP_HEIGHT = 0.63;
/** Peak hip swing while walking (radians). */
export const HIP_SWING = 0.52;
/**
 * People are drawn at 62% of the 1.3-unit body model, about 0.8 units tall: next to a 0.56-unit sedan that is close
 * to life (a little tall, so they still read from the default camera).
 */
export const PERSON_SCALE = 0.62;
/** Ground covered by one full walk cycle (two steps) for a person of scale 1: 2 × (2 · leg · sin swing). */
export const STRIDE = 4 * HIP_HEIGHT * PERSON_SCALE * Math.sin(HIP_SWING);
