import type { WeatherState } from '../library-types';
import { mulberry32 } from '../scene-world';
import { blend, coherent, smooth, targetOf, type Weather } from './weather-types';

export type WeatherSource = (nowMs: number) => Weather;

export const FADE_MS = 30_000;

export const steadySource = (state: WeatherState): WeatherSource => {
  const w = targetOf(state);
  return () => w;
};

// Rend la météo de la source courante ; quand la source change (réglage), fond de la valeur AFFICHÉE vers la nouvelle en 30 s.
export function createWeatherClock(): { setSource(next: WeatherSource, nowMs: number): void; read(nowMs: number): Weather } {
  let source: WeatherSource | null = null;
  let from: Weather | null = null;
  let startedAt = 0;
  const read = (nowMs: number): Weather => {
    if (!source) return coherent(targetOf('cloudy'));
    const target = source(nowMs);
    if (!from) return coherent(target);
    const k = (nowMs - startedAt) / FADE_MS;
    if (k >= 1) {
      from = null;
      return coherent(target);
    }
    return coherent(blend(from, target, smooth(k)));
  };
  return {
    read,
    setSource(next, nowMs) {
      const shown = source ? read(nowMs) : null;
      source = next;
      from = shown;
      startedAt = nowMs;
    },
  };
}

const FLASH_MS = 150;
const WINDOW_MS = 3000;

// Éclair ponctuel : une fenêtre de 3 s en contient au plus un, dont l'instant, l'abscisse (0..1) et l'existence viennent de la graine.
export function lightningAt(w: Weather, nowMs: number, seed: number): { x: number; strength: number } | null {
  if (w.lightning <= 0.05) return null;
  const win = Math.floor(nowMs / WINDOW_MS);
  const rng = mulberry32(seed ^ Math.imul(win + 1, 2654435761));
  const happens = rng();
  const offset = rng() * (WINDOW_MS - FLASH_MS);
  const x = rng();
  if (happens > 0.45 * w.lightning) return null;
  const into = nowMs - win * WINDOW_MS - offset;
  if (into < 0 || into > FLASH_MS) return null;
  return { x, strength: 1 - into / FLASH_MS };
}

// Arc-en-ciel : sol encore mouillé, plus de précipitation, ciel dégagé, soleil haut.
export function rainbowOf(w: Weather, daylight: number): number {
  if (daylight < 0.6 || w.cloud >= 0.6 || w.precip >= 0.1) return 0;
  return Math.min(0.8, Math.max(0, (w.wet - 0.2) * 1.6));
}

export type WeatherFlags = { gloom: boolean; rainy: boolean };

// Deux drapeaux « tout ou rien » pour le décor fixe (lumières, parapluies), avec hystérésis pour ne pas le redessiner en boucle.
export function weatherFlags(w: Weather, previous: WeatherFlags): WeatherFlags {
  const gloom = previous.gloom ? w.cloud > 0.68 : w.cloud > 0.78;
  const raining = w.kind === 'rain';
  const rainy = previous.rainy ? raining && w.precip > 0.2 : raining && w.precip > 0.3;
  return { gloom, rainy };
}
