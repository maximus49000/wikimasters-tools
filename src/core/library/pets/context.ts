import { CELL_H, CELL_W, ROWS, WALL_ROWS, type Cell } from '../room-grid';
import { beamPatch, type Glass, type Point } from '../light/beam';
import { beamSlope, sunElevation } from '../light/sun-dir';
import type { Weather } from '../weather/weather-types';

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

// Recouvrement exact (SAT) d'un quadrilatère convexe et d'un rectangle aligné sur les axes.
const overlaps = (poly: readonly Point[], x0: number, y0: number, x1: number, y1: number): boolean => {
  const sep = (nx: number, ny: number, rmin: number, rmax: number): boolean => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of poly) {
      const d = p.x * nx + p.y * ny;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return max < rmin || min > rmax;
  };
  if (sep(1, 0, x0, x1) || sep(0, 1, y0, y1)) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const nx = b.y - a.y;
    const ny = a.x - b.x;
    const c = [x0 * nx + y0 * ny, x1 * nx + y0 * ny, x0 * nx + y1 * ny, x1 * nx + y1 * ny];
    if (sep(nx, ny, Math.min(...c), Math.max(...c))) return false;
  }
  return true;
};

// Cases du sol dont le rectangle est touché par la projection du verre (la bande peut être plus fine qu'une rangée).
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
      if (patches.some((poly) => overlaps(poly, col * CELL_W, row * CELL_H, (col + 1) * CELL_W, (row + 1) * CELL_H))) cells.push({ col, row });
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
