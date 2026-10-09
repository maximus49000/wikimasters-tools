import type { Glass } from './beam';
import type { Box } from './occluders';

// Point du monde : x = pixels, d = profondeur (0 = mur), z = hauteur.
export type V3 = { x: number; d: number; z: number };

const MARGE = 1e-6; // l'intérieur de la boîte est rétréci de cette marge
const EPS_T = 1e-4; // on ignore les extrémités du segment (la boîte sur laquelle `a` repose)

// Méthode des dalles : le segment a→b traverse-t-il l'intérieur de la boîte ?
export function segmentHitsBox(a: V3, b: V3, box: Box): boolean {
  let tMin = EPS_T;
  let tMax = 1 - EPS_T;
  const axes: ReadonlyArray<readonly [number, number, number, number]> = [
    [a.x, b.x - a.x, box.x0 + MARGE, box.x1 - MARGE],
    [a.d, b.d - a.d, box.d0 + MARGE, box.d1 - MARGE],
    [a.z, b.z - a.z, box.z0 + MARGE, box.z1 - MARGE],
  ];
  for (const [o, dir, lo, hi] of axes) {
    if (lo >= hi) return false;
    if (Math.abs(dir) < 1e-12) {
      // Segment parallèle à la dalle : il doit être strictement à l'intérieur.
      if (o <= lo || o >= hi) return false;
      continue;
    }
    let t0 = (lo - o) / dir;
    let t1 = (hi - o) / dir;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMin >= tMax) return false;
  }
  return tMin < tMax;
}

// Décalages unitaires fixes (x, d, z) de la source étendue : le centre puis quatre autour.
export const JITTER: ReadonlyArray<V3> = [
  { x: 0, d: 0, z: 0 },
  { x: 1, d: 0, z: 0 },
  { x: -1, d: 0, z: 0 },
  { x: 0, d: 0, z: 1 },
  { x: 0, d: 0, z: -1 },
];

// Part (0..1) des sources décalées qui atteignent `from` ; `skip` = propriétaire ignoré (corps de la lampe).
export function litFraction(from: V3, source: V3, spread: number, boxes: readonly Box[], skip?: string): number {
  const utiles = skip === undefined ? boxes : boxes.filter((b) => b.owner !== skip);
  let libres = 0;
  for (const o of JITTER) {
    const cible: V3 = { x: source.x + spread * o.x, d: source.d + spread * o.d, z: source.z + spread * o.z };
    if (!utiles.some((b) => segmentHitsBox(from, cible, b))) libres++;
  }
  return libres / JITTER.length;
}

const SUN_SPREAD = 6;

// Part (0..1) du soleil qui atteint p, à travers la fenêtre (zBottom/zTop = hauteurs du verre).
export function sunReaches(
  p: V3,
  glass: Glass & { zBottom: number; zTop: number },
  tanElev: number,
  slope: number,
  boxes: readonly Box[],
): number {
  const xw = p.x - slope * p.d;
  const zw = p.z + p.d * tanElev;
  if (xw < glass.x || xw > glass.x + glass.w || zw < glass.zBottom || zw > glass.zTop) return 0;
  let libres = 0;
  for (const o of JITTER) {
    const cible: V3 = { x: xw + SUN_SPREAD * o.x, d: 0, z: zw + SUN_SPREAD * o.z };
    if (!boxes.some((b) => segmentHitsBox(p, cible, b))) libres++;
  }
  return libres / JITTER.length;
}
