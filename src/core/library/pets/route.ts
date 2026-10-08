import type { Pt, Segment } from '../library-types';
import { MAX_GAP, MAX_RISE, groundLeg, isFree, standPoint, toSegments, type Platform, type WalkMap } from './walk-map';

// Où se trouve l'animal : le sol (null) ou le dessus d'un meuble (son id).
export type Support = string | null;
export type Standing = { pt: Pt; on: Support; hostId: string | null; facing: 'l' | 'r' };

type Hop = { leave: Pt; land: Pt };

const jumpMs = (a: Pt, b: Pt): number => Math.round(380 + Math.hypot(b.x - a.x, b.y - a.y) * 1.8);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const platformOf = (map: WalkMap, id: string): Platform | undefined => map.platforms.find((p) => p.id === id);

// Le point du sol d'où sauter sur (ou où retomber depuis) un meuble : la case libre la plus proche de son pied, assez près pour sauter.
function takeoff(map: WalkMap, plat: Platform, climbing: boolean): Pt | null {
  let best: Pt | null = null;
  let bestScore = Infinity;
  for (let row = plat.row + plat.h - 1; row <= plat.row + plat.h + 1; row++) {
    for (let col = plat.col - 2; col < plat.col + plat.w + 2; col++) {
      if (!isFree(map, col, row)) continue;
      const p = standPoint(col, row);
      const dx = p.x < plat.x0 ? plat.x0 - p.x : p.x > plat.x1 ? p.x - plat.x1 : 0;
      if (dx > MAX_GAP || (climbing && p.y - plat.y > MAX_RISE)) continue;
      const score = dx * 3 + Math.abs(row - (plat.row + plat.h)) * 8;
      if (score < bestScore) {
        best = p;
        bestScore = score;
      }
    }
  }
  return best;
}

// Le saut d'un support à l'autre, ou null s'il est hors de portée.
function hop(map: WalkMap, a: Support, b: Support): Hop | null {
  if (a === null && b !== null) {
    const plat = platformOf(map, b);
    const from = plat && takeoff(map, plat, true);
    return plat && from ? { leave: from, land: { x: clamp(from.x, plat.x0, plat.x1), y: plat.y } } : null;
  }
  if (a !== null && b === null) {
    const plat = platformOf(map, a);
    const to = plat && takeoff(map, plat, false);
    return plat && to ? { leave: { x: clamp(to.x, plat.x0, plat.x1), y: plat.y }, land: to } : null;
  }
  if (a === null || b === null) return null;
  const p = platformOf(map, a);
  const q = platformOf(map, b);
  if (!p || !q || p.y - q.y > MAX_RISE) return null;
  const overlap = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
  if (overlap >= 0) {
    const x = (Math.max(p.x0, q.x0) + Math.min(p.x1, q.x1)) / 2;
    return { leave: { x, y: p.y }, land: { x, y: q.y } };
  }
  if (-overlap > MAX_GAP) return null;
  const rightward = p.x1 < q.x0;
  return { leave: { x: rightward ? p.x1 : p.x0, y: p.y }, land: { x: rightward ? q.x0 : q.x1, y: q.y } };
}

// La suite de supports à franchir (largeur d'abord) ; null si le but est hors d'atteinte.
function chain(map: WalkMap, from: Support, to: Support): Support[] | null {
  if (from === to) return [from];
  const nodes: Support[] = [null, ...map.platforms.map((p) => p.id)];
  const prev = new Map<Support, Support>();
  const seen = new Set<Support>([from]);
  const queue: Support[] = [from];
  for (let i = 0; i < queue.length && !seen.has(to); i++) {
    const cur = queue[i]!;
    for (const next of nodes) {
      if (seen.has(next) || hop(map, cur, next) === null) continue;
      seen.add(next);
      prev.set(next, cur);
      queue.push(next);
    }
  }
  if (!seen.has(to)) return null;
  const out: Support[] = [to];
  for (let c: Support = to; c !== from; ) {
    c = prev.get(c) as Support;
    out.unshift(c);
  }
  return out;
}

// Marche sur un support : au sol, avec le chemin autour des meubles ; sur un dessus, en ligne droite.
function leg(map: WalkMap, on: Support, a: Pt, b: Pt): Segment[] | null {
  if (on === null) return groundLeg(map, a, b);
  return platformOf(map, on) ? toSegments([a, b], on) : null;
}

// L'itinéraire complet (marches et sauts, sans trou) de `from` à `to`, ou null.
export function planRoute(map: WalkMap, from: { pt: Pt; on: Support }, to: { pt: Pt; on: Support }): Segment[] | null {
  const hosts = chain(map, from.on, to.on);
  if (!hosts) return null;
  const route: Segment[] = [];
  let cur = from.pt;
  for (let i = 0; i < hosts.length - 1; i++) {
    const a = hosts[i]!;
    const b = hosts[i + 1]!;
    const step = hop(map, a, b)!;
    const walk = leg(map, a, cur, step.leave);
    if (!walk) return null;
    route.push(...walk, { kind: 'jump', from: step.leave, to: step.land, ms: jumpMs(step.leave, step.land), fromOn: a, on: b });
    cur = step.land;
  }
  const last = leg(map, to.on, cur, to.pt);
  return last ? [...route, ...last] : null;
}
