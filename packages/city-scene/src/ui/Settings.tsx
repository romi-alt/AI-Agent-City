'use client';
import { useId } from 'react';
import { useCity, useCityContext } from '../context.tsx';
import type { QualityLevel, TimeOfDay, Weather } from '../types.ts';

const TIMES: [TimeOfDay, string][] = [
  ['day', 'Day'],
  ['golden', 'Golden hour'],
  ['evening', 'Evening'],
  ['night', 'Night'],
];
const WEATHER: [Weather, string][] = [
  ['clear', 'Clear'],
  ['partly-cloudy', 'Some clouds'],
  ['overcast', 'Overcast'],
  ['light-rain', 'Light rain'],
];
const QUALITIES: ['auto' | QualityLevel, string][] = [
  ['auto', 'Auto'],
  ['ultra', 'High'],
  ['balanced', 'Balanced'],
  ['low', 'Low'],
];

function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="ac-field">
      <legend>{legend}</legend>
      <div className="ac-seg">
        {options.map(([v, label]) => (
          <label key={v}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Time of day, weather, quality (a manual choice stops the automatic quality) and reduced motion. */
export function ViewSettings() {
  const { store } = useCityContext();
  const time = useCity(s => s.timeOfDay);
  const weather = useCity(s => s.weather);
  const quality = useCity(s => (s.qualityAuto ? 'auto' : s.quality));
  const reduced = useCity(s => s.reducedMotion);
  return (
    <>
      <Segmented legend="Time of day" options={TIMES} value={time} onChange={v => store.set({ timeOfDay: v })} />
      <Segmented legend="Weather" options={WEATHER} value={weather} onChange={v => store.set({ weather: v })} />
      <Segmented
        legend="Picture quality"
        options={QUALITIES}
        value={quality}
        onChange={v => store.set(v === 'auto' ? { qualityAuto: true } : { quality: v, qualityAuto: false })}
      />
      <label className="ac-check">
        <input type="checkbox" checked={reduced} onChange={e => store.set({ reducedMotion: e.target.checked })} />
        <span>Reduce motion (fades instead of camera flights, calmer city)</span>
      </label>
    </>
  );
}
