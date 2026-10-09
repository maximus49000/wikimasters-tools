import type { PetPlan, Pt, Segment, Species } from '../library-types';
import { CELL_W, isStanding } from '../room-grid';
import { layoutSig, type BrainEnv } from './brain';
import { routeMs } from './motion';
import { planRoute, scaleRoute, type Standing } from './route';
import { meetCell } from './scenes';
import { buildWalkMap, cellOf, isFree, nearestFreeCell, standPoint, type WalkMap } from './walk-map';

const between = (rng: () => number, lo: number, hi: number): number => Math.round(lo + rng() * (hi - lo));
// L'orage presse le pas : trajets parcourus plus vite que d'habitude.
const speedOf = (s: Species): number => (s === 'dog' ? 0.6 : 0.8);
const HOLD: readonly [number, number] = [8000, 15000];
const LAG: readonly [number, number] = [500, 4000];

// Un chien ne grimpe que sur son canapé : aucun segment ne le pose sur un autre meuble.
const dogBlocked = (route: Segment[], fromOn: string | null): boolean => route.some((s) => s.on !== null && s.on !== fromOn);

// La case libre la plus proche du mur (gauche ou droit) le plus près de l'animal ; il regarde le mur.
function wallCell(map: WalkMap, at: Pt): { pt: Pt; facing: 'l' | 'r' } | null {
  const left = at.x < (map.cols * CELL_W) / 2;
  const edge: Pt = { x: left ? CELL_W / 2 : map.cols * CELL_W - CELL_W / 2, y: at.y };
  const cell = nearestFreeCell(map, edge);
  return cell ? { pt: standPoint(cell.col, cell.row), facing: left ? 'l' : 'r' } : null;
}

const onSpot = (env: BrainEnv, from: Standing, now: number, action: 'cower' | 'shortcircuit', actMs: number): PetPlan => ({
  action, hostId: from.hostId, at: from.pt, on: from.on, route: [], startedAt: now, actMs, facing: from.facing, sig: layoutSig(env.layout, env.cols),
});

// Le plan de réaction à l'orage d'un animal, à partir de là où il se trouve : le chat file sous le canapé (ou contre un mur),
// le chien se blottit au pied du canapé (ou contre un mur), le robot fait un court-circuit sur place.
export function stormPlan(env: BrainEnv, species: Species, from: Standing, now: number): PetPlan {
  if (species === 'robot') return onSpot(env, from, now, 'shortcircuit', 3000);
  const hold = between(env.rng, ...HOLD);
  if (env.still) return onSpot(env, from, now, 'cower', hold);
  const map = buildWalkMap(env.layout, env.cols);
  const lag = between(env.rng, ...LAG);
  const speed = speedOf(species);
  const sig = layoutSig(env.layout, env.cols);
  const dog = species === 'dog';
  const sofa = env.layout.filter(isStanding).find((p) => p.kind === 'sofa' && !env.occupied.has(`${p.id}:hide`));
  if (species === 'cat' && sofa) {
    const at = standPoint(sofa.col + 2, sofa.row + 2);
    const raw = planRoute(map, from, { pt: at, on: null });
    if (raw) return { action: 'hide', hostId: sofa.id, at, on: null, route: scaleRoute(raw, speed), startedAt: now, lag, actMs: hold, facing: from.facing, sig, key: `${sofa.id}:hide` };
  }
  if (dog && sofa) {
    const at = standPoint(sofa.col, sofa.row + 2);
    const c = cellOf(at);
    const raw = isFree(map, c.col, c.row) ? planRoute(map, from, { pt: at, on: null }) : null;
    if (raw && !dogBlocked(raw, from.on)) return { action: 'cower', hostId: sofa.id, at, on: null, route: scaleRoute(raw, speed), startedAt: now, lag, actMs: hold, facing: from.facing, sig };
  }
  const wall = wallCell(map, from.pt);
  if (wall) {
    const raw = planRoute(map, from, { pt: wall.pt, on: null });
    if (raw && !(dog && dogBlocked(raw, from.on))) return { action: 'cower', hostId: null, at: wall.pt, on: null, route: scaleRoute(raw, speed), startedAt: now, lag, actMs: hold, facing: wall.facing, sig };
  }
  return onSpot(env, from, now, 'cower', hold);
}

type Who = Standing & { id: string };

// Chat et chien se serrent l'un contre l'autre : le chien va au mur le plus proche, le chat vient juste à côté, chacun tourné
// vers l'autre. Deux plans jumeaux (même `startedAt`, références croisées) qui finissent au même instant ; null si impossible.
export function huddlePlans(env: BrainEnv, cat: Who, dog: Who, now: number): { cat: PetPlan; dog: PetPlan } | null {
  if (env.still) return null;
  const map = buildWalkMap(env.layout, env.cols);
  const spot = wallCell(map, dog.pt);
  if (!spot) return null;
  const dogRaw = planRoute(map, dog, { pt: spot.pt, on: null });
  if (!dogRaw || dogBlocked(dogRaw, dog.on)) return null;
  const meet = meetCell(map, spot.pt, env.rng);
  if (!meet) return null;
  const meetPt = standPoint(meet.col, meet.row);
  const catRaw = planRoute(map, cat, { pt: meetPt, on: null });
  if (!catRaw) return null;
  const dogRoute = scaleRoute(dogRaw, speedOf('dog'));
  const catRoute = scaleRoute(catRaw, speedOf('cat'));
  const hold = between(env.rng, ...HOLD);
  const lag = between(env.rng, ...LAG);
  // Le premier arrivé attend l'autre blotti : même fin pour les deux.
  const walk = Math.max(routeMs(dogRoute), routeMs(catRoute));
  const common = { hostId: null, on: null, startedAt: now, sig: layoutSig(env.layout, env.cols), lag, action: 'cower' as const };
  return {
    // Le chat est du côté `meet.side` du chien : le chien regarde de ce côté, le chat de l'autre.
    dog: { ...common, at: spot.pt, route: dogRoute, actMs: hold + walk - routeMs(dogRoute), facing: meet.side, with: { petId: cat.id, role: 'follow', scene: 'huddle' } },
    cat: { ...common, at: meetPt, route: catRoute, actMs: hold + walk - routeMs(catRoute), facing: meet.side === 'l' ? 'r' : 'l', with: { petId: dog.id, role: 'lead', scene: 'huddle' } },
  };
}
