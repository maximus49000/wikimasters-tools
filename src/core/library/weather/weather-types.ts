import type { WeatherState } from '../library-types';

// Valeurs continues (toutes entre 0 et 1) décrivant le ciel à un instant.
export type Weather = {
  cloud: number; // couverture nuageuse
  precip: number; // intensité des gouttes ou des flocons
  kind: 'rain' | 'snow';
  fog: number;
  wind: number;
  lightning: number; // probabilité d'éclairs (orage)
  wet: number; // sol mouillé (flaques)
  snowCover: number; // neige au sol
};

type Target = Omit<Weather, 'wet' | 'snowCover'>;

const TARGETS: Record<WeatherState, Target> = {
  sun: { cloud: 0.1, precip: 0, kind: 'rain', fog: 0, wind: 0.2, lightning: 0 },
  cloudy: { cloud: 0.65, precip: 0, kind: 'rain', fog: 0.05, wind: 0.4, lightning: 0 },
  drizzle: { cloud: 0.8, precip: 0.25, kind: 'rain', fog: 0.15, wind: 0.3, lightning: 0 },
  rain: { cloud: 0.92, precip: 0.65, kind: 'rain', fog: 0.2, wind: 0.5, lightning: 0 },
  storm: { cloud: 1, precip: 1, kind: 'rain', fog: 0.15, wind: 0.9, lightning: 1 },
  snow: { cloud: 0.85, precip: 0.5, kind: 'snow', fog: 0.25, wind: 0.2, lightning: 0 },
  fog: { cloud: 0.55, precip: 0, kind: 'rain', fog: 0.85, wind: 0.05, lightning: 0 },
};

export const WEATHER_LABEL: Record<WeatherState, string> = {
  sun: 'Soleil',
  cloudy: 'Nuageux',
  drizzle: 'Bruine',
  rain: 'Pluie',
  storm: 'Orage',
  snow: 'Neige',
  fog: 'Brume',
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const smooth = (k: number): number => {
  const x = clamp01(k);
  return x * x * (3 - 2 * x);
};

// Pluie et nuages sont liés : un ciel très couvert peut rester sans pluie, mais une forte pluie exige beaucoup de nuages.
export const maxPrecipFor = (cloud: number): number => clamp01((cloud - 0.35) / 0.6) ** 1.5;
export const minCloudFor = (precip: number): number => Math.min(1, 0.35 + 0.6 * clamp01(precip) ** (2 / 3));
export const coherent = (w: Weather): Weather => {
  const cap = maxPrecipFor(w.cloud);
  return w.precip <= cap ? w : { ...w, precip: cap };
};

// Sol à l'équilibre sous cet état (utilisé en mode forcé et pour les cibles).
export const steadyWet = (t: Target): number => (t.kind === 'rain' ? clamp01(t.precip * 1.4) : 0);
export const steadySnow = (t: Target): number => (t.kind === 'snow' ? clamp01(t.precip * 1.6) : 0);

export function targetOf(state: WeatherState): Weather {
  const t = TARGETS[state];
  return { ...t, wet: steadyWet(t), snowCover: steadySnow(t) };
}

const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

export function blend(from: Weather, to: Weather, k: number): Weather {
  const x = clamp01(k);
  const sameKind = from.kind === to.kind;
  return {
    cloud: mix(from.cloud, to.cloud, x),
    precip: sameKind ? mix(from.precip, to.precip, x) : mix(from.precip, to.precip, x) * Math.abs(2 * x - 1),
    kind: x < 0.5 ? from.kind : to.kind,
    fog: mix(from.fog, to.fog, x),
    wind: mix(from.wind, to.wind, x),
    lightning: mix(from.lightning, to.lightning, x),
    wet: mix(from.wet, to.wet, x),
    snowCover: mix(from.snowCover, to.snowCover, x),
  };
}

// L'état logique le plus proche (légende du panneau).
export function nearestState(w: Weather): WeatherState {
  let best: WeatherState = 'cloudy';
  let bestDistance = Infinity;
  for (const state of Object.keys(TARGETS) as WeatherState[]) {
    const t = TARGETS[state];
    const d =
      (w.cloud - t.cloud) ** 2 +
      (w.precip - t.precip) ** 2 * 2 +
      (w.fog - t.fog) ** 2 +
      (w.lightning - t.lightning) ** 2 * 2 +
      (w.kind === t.kind || (w.precip < 0.05 && t.precip === 0) ? 0 : 1);
    if (d < bestDistance) {
      bestDistance = d;
      best = state;
    }
  }
  return best;
}
