import { ROWS, WALL_ROWS, type Cell } from '../room-grid';
import { beamPatch, type Glass, type Point } from '../light/beam';
import { beamSlope, sunElevation } from '../light/sun-dir';
import type { Weather } from '../weather/weather-types';
import { standPoint } from './walk-map';

export type PetWeather = 'clear' | 'drizzle' | 'rain' | 'storm';
export type PetContext = {
  night: boolean; // soleil couché (ciel), ou 22 h–6 h d'horloge sans ciel
  moon: boolean; // lune visible depuis une fenêtre
  weather: PetWeather;
  storm: { id: number; since: number } | null; // id change à chaque nouvel orage
  rainEndedAt: number | null; // fin de la dernière pluie (ms)
  sunCells: readonly Cell[]; // cases du sol atteintes par le soleil (projection du verre, sans ombre de meuble)
};

export const NO_CONTEXT: PetContext = { night: false, moon: false, weather: 'clear', storm: null, rainEndedAt: null, sunCells: [] };

export function weatherKindOf(w: Weather | null): PetWeather {
  if (!w || w.kind !== 'rain') return 'clear';
  if (w.lightning > 0.5) return 'storm';
  if (w.precip > 0.5) return 'rain';
  if (w.precip > 0.1) return 'drizzle';
  return 'clear';
}

export function isNight(daylight: number, minutes: number, hasSky: boolean): boolean {
  return hasSky ? daylight < 0.15 : minutes < 6 * 60 || minutes >= 22 * 60;
}

const inside = (poly: readonly Point[], x: number, y: number): boolean => {
  let in_ = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) in_ = !in_;
  }
  return in_;
};

export function sunCellsOf(i: { glasses: readonly Glass[]; wallH: number; floorH: number; cols: number; sunFrac: number | null; sunX: number | null; blocked: boolean }): Cell[] {
  if (i.blocked || i.sunFrac === null || i.sunX === null || i.glasses.length === 0) return [];
  const elev = sunElevation(i.sunFrac);
  const patches = i.glasses
    .map((g) => beamPatch(g, i.wallH, i.floorH, elev, beamSlope(i.sunX!, g.x + g.w / 2, i.wallH)))
    .filter((p): p is Point[] => p !== null);
  if (patches.length === 0) return [];
  const cells: Cell[] = [];
  for (let row = WALL_ROWS; row < ROWS; row++) {
    for (let col = 0; col < i.cols; col++) {
      const p = standPoint(col, row);
      if (patches.some((poly) => inside(poly, p.x, p.y))) cells.push({ col, row });
    }
  }
  return cells;
}

// Suit l'orage (id, début) et la fin de la pluie d'une image à l'autre ; l'orage se termine quand l'éclair retombe sous 0,2 (hystérésis).
export function createContextTracker() {
  let stormId = 0;
  let stormSince = 0;
  let inStorm = false;
  let raining = false;
  let rainEndedAt: number | null = null;
  return {
    update(now: number, i: { night: boolean; moon: boolean; weather: Weather | null; sunCells: readonly Cell[] }): PetContext {
      const kind = weatherKindOf(i.weather);
      const lightning = i.weather?.lightning ?? 0;
      if (!inStorm && kind === 'storm') {
        inStorm = true;
        stormId += 1;
        stormSince = now;
      } else if (inStorm && lightning < 0.2) inStorm = false;
      const wet = kind === 'drizzle' || kind === 'rain' || kind === 'storm';
      if (raining && !wet) rainEndedAt = now;
      else if (!raining && wet) rainEndedAt = null;
      raining = wet;
      return { night: i.night, moon: i.moon, weather: kind, storm: inStorm ? { id: stormId, since: stormSince } : null, rainEndedAt, sunCells: i.sunCells };
    },
  };
}
