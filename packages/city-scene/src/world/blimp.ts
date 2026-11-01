/** The advertising blimp's flight path: a slow circle over the middle of the city. Pure, so a test can pin it down. */
export const BLIMP = { radius: 190, height: 105, period: 420, cx: 0, cz: -40 } as const;

export interface BlimpPose {
  x: number;
  y: number;
  z: number;
  /** Rotation about y so local +x points along the flight. */
  yaw: number;
}

export function blimpPose(t: number): BlimpPose {
  const a = (t / BLIMP.period) * Math.PI * 2;
  return {
    x: BLIMP.cx + Math.cos(a) * BLIMP.radius,
    y: BLIMP.height + Math.sin(t * 0.4) * 1.5,
    z: BLIMP.cz + Math.sin(a) * BLIMP.radius,
    // Heading is the tangent (-sin a, cos a); yaw maps +x onto it.
    yaw: Math.atan2(-Math.cos(a), -Math.sin(a)),
  };
}
