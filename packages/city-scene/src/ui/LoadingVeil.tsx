'use client';
import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { sceneBus } from '../camera/bus.ts';
import { useCityContext } from '../context.tsx';

/** Covers the canvas until the scene has drawn its first frames (and any assets have loaded). */
export function LoadingVeil({ label = 'Building the city…' }: { label?: string }) {
  const { store } = useCityContext();
  const { active, progress } = useProgress();
  const [ready, setReady] = useState(() => !!sceneBus(store).last('ready'));
  useEffect(() => sceneBus(store).on(e => e.type === 'ready' && setReady(true)), [store]);
  const done = ready && !active;
  const shown = active ? progress / 100 : ready ? 1 : 0.35;
  return (
    <div className="ac-veil" data-done={done} aria-hidden={done} role="status">
      <div className="ac-veil-box">
        <strong>{label}</strong>
        <div className="ac-progress">
          <i style={{ transform: `scaleX(${shown})`, transition: 'transform 0.4s ease' }} />
        </div>
      </div>
    </div>
  );
}
