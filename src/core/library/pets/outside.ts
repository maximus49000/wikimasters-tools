import type { PetPlan, Species } from '../library-types';
import { CELL_W, WALL_ROWS } from '../room-grid';
import { layoutSig, type BrainEnv } from './brain';
import { planRoute, scaleRoute, type Standing } from './route';
import { stormPlan } from './storm';
import { buildWalkMap, nearestFreeCell, standPoint } from './walk-map';

// Vague 1c (spec ville vivante §1c, Halloween §5.6) : un passage dans la rue dans l'axe d'une fenêtre de la pièce (groupe déguisé,
// promeneur de chien). Le chien éveillé court à la fenêtre, se dresse et aboie quelques secondes ; le chat éveillé près d'un
// chien qui aboie sursaute (dos rond), ou une fois sur trois file sous le canapé. Endormi : rien. Robot : rien.

const between = (rng: () => number, lo: number, hi: number): number => Math.round(lo + rng() * (hi - lo));
export const BARK_MS: readonly [number, number] = [3000, 5000];
export const STARTLE_MS = 1400;
// Le chat ne réagit qu'à un chien à moins de cette distance (px).
export const STARTLE_NEAR = 6 * CELL_W;
// Vers la fenêtre, le chien court.
const DOG_RUN = 0.55;

const onSpot = (env: BrainEnv, from: Standing, now: number, action: 'bark' | 'startle', actMs: number, facing = from.facing): PetPlan => ({
  action, hostId: from.hostId, at: from.pt, on: from.on, route: [], startedAt: now, actMs, facing, sig: layoutSig(env.layout, env.cols),
});

// Le chien va à la case libre du sol la plus proche du pied de la fenêtre (centre x `windowX`) et aboie ; s'il ne peut pas
// y aller (meubles, il est sur un autre support), il aboie sur place, tourné vers elle.
export function barkPlan(env: BrainEnv, from: Standing, windowX: number, now: number): PetPlan {
  const actMs = between(env.rng, ...BARK_MS);
  const facing = windowX >= from.pt.x ? 'r' : 'l';
  if (env.still) return onSpot(env, from, now, 'bark', actMs, facing);
  const map = buildWalkMap(env.layout, env.cols);
  const cell = nearestFreeCell(map, standPoint(Math.floor(windowX / CELL_W), WALL_ROWS), 4);
  const at = cell ? standPoint(cell.col, cell.row) : null;
  const raw = at ? planRoute(map, from, { pt: at, on: null }) : null;
  if (!at || !raw || raw.some((s) => s.on !== null && s.on !== from.on)) return onSpot(env, from, now, 'bark', actMs, facing);
  return { action: 'bark', hostId: null, at, on: null, route: scaleRoute(raw, DOG_RUN), startedAt: now, actMs, facing: at.x >= from.pt.x ? 'r' : 'l', sig: layoutSig(env.layout, env.cols) };
}

// Le chat : sursaut sur place, ou (`hide`) cachette sous le canapé comme pendant l'orage.
export function startlePlan(env: BrainEnv, from: Standing, now: number, hide: boolean): PetPlan {
  if (hide && !env.still) {
    const p = stormPlan(env, 'cat', from, now);
    if (p.action === 'hide') return { ...p, lag: 0, actMs: between(env.rng, 6000, 10000) };
  }
  return onSpot(env, from, now, 'startle', STARTLE_MS);
}

export const reactsToStreet = (s: Species): boolean => s !== 'robot';

// Passage retenu dans l'axe d'une vitre : `passes` (x dans le repère de la pièce, la ville y est dessinée à la même échelle),
// `glasses` (bords x des vitres). Rend le centre de la vitre, ou null.
export function windowOf(x: number, glasses: readonly { x: number; w: number }[], margin = 6): number | null {
  for (const g of glasses) if (x >= g.x - margin && x <= g.x + g.w + margin) return g.x + g.w / 2;
  return null;
}

// Passage de la rue publié par la scène Ville : `kind` (groupe déguisé, passant déguisé, promeneur de chien), `x` (px, repère
// de la pièce). `id` : un par passage (un même passant qui repasse au tour suivant a un autre id).
export type StreetPass = { id: string; kind: 'costumed' | 'dog-walker'; x: number };
// Part des passages qui font réagir (tirée de l'id : un tirage par passage) ; délai entre deux réactions.
const REACT: Readonly<Record<StreetPass['kind'], number>> = { costumed: 0.5, 'dog-walker': 0.7 };
export const OUTSIDE_COOLDOWN_MS = 45_000;
const hash01 = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};
// Suit les passages d'une image à l'autre : le premier passage retenu dans l'axe d'une vitre devient l'événement `outside`
// du contexte des animaux (gardé tel quel jusqu'au suivant).
export function createOutsideWatch(cooldownMs = OUTSIDE_COOLDOWN_MS) {
  const seen = new Set<string>();
  let last: { id: string; since: number; window: number } | null = null;
  return {
    update(now: number, passes: readonly StreetPass[], glasses: readonly { x: number; w: number }[]): { id: string; since: number; window: number } | null {
      if (seen.size > 2000) seen.clear();
      for (const p of passes) {
        if (seen.has(p.id)) continue;
        const w = windowOf(p.x, glasses);
        if (w === null) continue;
        seen.add(p.id);
        if (last && now - last.since < cooldownMs) continue;
        if (hash01(p.id) >= REACT[p.kind]) continue;
        last = { id: p.id, since: now, window: w };
      }
      return last;
    },
  };
}
