import { ELEV_MAX, ELEV_MIN, sunElevation } from '../core/library/light/sun-dir';
import type { Sky } from '../core/library/sky';

// Position d'un astre (soleil ou lune) selon sa fraction de course (0 = lever, 1 = coucher), dans le repère du monde :
// repli des ciels sans lieu ni date (aperçus).
export const celestialPlace = (frac: number, width: number, height: number): { x: number; y: number } => ({
  x: width * (0.04 + 0.92 * frac),
  y: height * 0.7 - Math.sin(Math.PI * frac) * height * 0.55,
});

type Place = { x: number; y: number };
// Place du soleil (null s'il est couché) : sa position réelle quand le ciel la donne (hauteur et azimut au lieu exact),
// sinon sa fraction de course.
export const sunPlace = (sky: Sky, width: number, height: number): Place | null =>
  sky.sunFrac === null ? null : sky.sunAt ? { x: width * sky.sunAt.x, y: height * sky.sunAt.y } : celestialPlace(sky.sunFrac, width, height);
export const moonPlace = (sky: Sky, width: number, height: number): Place | null =>
  sky.moonFrac === null ? null : sky.moonAt ? { x: width * sky.moonAt.x, y: height * sky.moonAt.y } : celestialPlace(sky.moonFrac, width, height);

// Clair de lune qui entre par les fenêtres : la nuit seulement (soleil couché), lune levée. Force selon l'éclat de la lune
// (pleine lune haute : 0,55 ; quartier ≈ 0,2 ; croissant : presque rien) ; élévation réelle quand le ciel la donne, sinon tirée de sa fraction de course.
export type MoonBeam = { x: number; elev: number; strength: number };
const MOON_NIGHT = 0.3;
const MOON_MIN_ELEV = 0.02;
export function moonBeam(sky: Sky, width: number, height: number): MoonBeam | null {
  if (sky.sunFrac !== null || sky.daylight >= MOON_NIGHT) return null;
  const place = moonPlace(sky, width, height);
  if (!place) return null;
  const elev = sky.moonAlt ?? sunElevation(sky.moonFrac);
  if (elev <= MOON_MIN_ELEV) return null;
  // Éclat réel (phase et hauteur) ; sans lui (aperçus), une lune gibbeuse.
  const light = sky.moonLight ?? 0.8;
  return { x: place.x, elev: Math.min(ELEV_MAX, Math.max(ELEV_MIN, elev)), strength: 0.55 * light * (1 - sky.daylight / MOON_NIGHT) };
}
