import type { Glass } from './beam';
import type { Box } from './occluders';

// Point du monde : x = pixels, d = profondeur (0 = mur), z = hauteur.
export type V3 = { x: number; d: number; z: number };

const MARGE = 1e-6; // l'intérieur de la boîte est rétréci de cette marge
const EPS_T = 1e-4; // on ignore les extrémités du segment (la boîte sur laquelle `a` repose)

// Méthode des dalles : le segment a→b traverse-t-il l'intérieur de la boîte ?
// Sans allocation (appelée des millions de fois) : les trois axes sont déroulés à la main, dans l'ordre x, d, z.
export function segmentHitsBox(a: V3, b: V3, box: Box): boolean {
  let tMin = EPS_T;
  let tMax = 1 - EPS_T;
  // Axe x
  let lo = box.x0 + MARGE;
  let hi = box.x1 - MARGE;
  if (lo >= hi) return false;
  let dir = b.x - a.x;
  if (Math.abs(dir) < 1e-12) {
    // Segment parallèle à la dalle : il doit être strictement à l'intérieur.
    if (a.x <= lo || a.x >= hi) return false;
  } else {
    let t0 = (lo - a.x) / dir;
    let t1 = (hi - a.x) / dir;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMin >= tMax) return false;
  }
  // Axe d
  lo = box.d0 + MARGE;
  hi = box.d1 - MARGE;
  if (lo >= hi) return false;
  dir = b.d - a.d;
  if (Math.abs(dir) < 1e-12) {
    if (a.d <= lo || a.d >= hi) return false;
  } else {
    let t0 = (lo - a.d) / dir;
    let t1 = (hi - a.d) / dir;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMin >= tMax) return false;
  }
  // Axe z
  lo = box.z0 + MARGE;
  hi = box.z1 - MARGE;
  if (lo >= hi) return false;
  dir = b.z - a.z;
  if (Math.abs(dir) < 1e-12) {
    if (a.z <= lo || a.z >= hi) return false;
  } else {
    let t0 = (lo - a.z) / dir;
    let t1 = (hi - a.z) / dir;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
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

// Tampons réutilisés (le calcul est synchrone et non réentrant) : aucune allocation par appel.
const candidates: Box[] = [];
const cible: V3 = { x: 0, d: 0, z: 0 };

// Part (0..1) des sources décalées (autour de tx, td, tz) qui atteignent `from`, parmi les boîtes dont le propriétaire n'est pas `skip`.
// Les boîtes hors de l'enveloppe de tous les segments sont écartées une seule fois avant les cinq tests.
function freeFraction(from: V3, tx: number, td: number, tz: number, spread: number, boxes: readonly Box[], skip?: string): number {
  const xMin = Math.min(from.x, tx - spread);
  const xMax = Math.max(from.x, tx + spread);
  const dMin = Math.min(from.d, td - spread);
  const dMax = Math.max(from.d, td + spread);
  const zMin = Math.min(from.z, tz - spread);
  const zMax = Math.max(from.z, tz + spread);
  let n = 0;
  for (let k = 0; k < boxes.length; k++) {
    const b = boxes[k]!;
    if (b.owner === skip) continue;
    // Un segment dont l'enveloppe ne pénètre pas dans la boîte ne peut pas la traverser.
    if (b.x1 <= xMin || b.x0 >= xMax || b.d1 <= dMin || b.d0 >= dMax || b.z1 <= zMin || b.z0 >= zMax) continue;
    candidates[n++] = b;
  }
  let libres = 0;
  for (let j = 0; j < JITTER.length; j++) {
    const o = JITTER[j]!;
    cible.x = tx + spread * o.x;
    cible.d = td + spread * o.d;
    cible.z = tz + spread * o.z;
    let bloque = false;
    for (let k = 0; k < n; k++) {
      if (segmentHitsBox(from, cible, candidates[k]!)) { bloque = true; break; }
    }
    if (!bloque) libres++;
  }
  return libres / JITTER.length;
}

// Part (0..1) des sources décalées qui atteignent `from` ; `skip` = propriétaire ignoré (corps de la lampe).
export function litFraction(from: V3, source: V3, spread: number, boxes: readonly Box[], skip?: string): number {
  return freeFraction(from, source.x, source.d, source.z, spread, boxes, skip);
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
  return freeFraction(p, xw, 0, zw, SUN_SPREAD, boxes);
}
