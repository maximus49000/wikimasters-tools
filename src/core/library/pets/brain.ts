import { poisOf } from '../furniture-catalog';
import type { Layout, PetAction, PetPlan, Pt, Segment, Species } from '../library-types';
import { CELL_W, ROWS, WALL_ROWS, isStanding, type Cell } from '../room-grid';
import { hashString } from '../scene-world';
import { planEndsAt, stateAt, type PetState } from './motion';
import { planRoute, scaleRoute, type Standing } from './route';
import { buildWalkMap, cellOf, isFree, nearestFreeCell, standPoint, type WalkMap } from './walk-map';

export type Rng = () => number;
// `occupied` : les places réservées (clés `<meuble>:<point>`) que le chat doit éviter ; vide tant qu'il vit seul.
export type BrainEnv = { layout: Layout; cols: number; rng: Rng; still: boolean; occupied: ReadonlySet<string>; species?: Species /* défaut : chat */ };

type Ms = readonly [number, number];
type Candidate = { weight: number; action: PetAction; route: Segment[]; at: Pt; on: string | null; hostId: string | null; facing: 'l' | 'r'; ms: Ms; key?: string };
type Dest = { pt: Pt; on: string | null; hostId: string | null };

// Signature des meubles debout : quand elle change, les itinéraires mémorisés ne sont plus fiables.
export function layoutSig(layout: Layout, cols: number): string {
  const parts = layout.filter(isStanding).map((p) => `${p.id}:${p.kind}:${p.col}:${p.row}`).sort();
  return `${cols}|${hashString(parts.join(','))}`;
}

const DOG_SPEED = 0.7;

const between = (rng: Rng, [lo, hi]: Ms): number => Math.round(lo + rng() * (hi - lo));

function freeCells(map: WalkMap): Cell[] {
  const cells: Cell[] = [];
  for (let row = WALL_ROWS; row < ROWS; row++) for (let col = 0; col < map.cols; col++) if (isFree(map, col, row)) cells.push({ col, row });
  return cells;
}

function facingOf(route: Segment[], fallback: 'l' | 'r'): 'l' | 'r' {
  for (let i = route.length - 1; i >= 0; i--) {
    const dx = route[i]!.to.x - route[i]!.from.x;
    if (Math.abs(dx) >= 1) return dx > 0 ? 'r' : 'l';
  }
  return fallback;
}

// Choisit la prochaine action selon les meubles posés (tirage pondéré), planifie le trajet et renvoie le plan qui démarre à `now`.
export function nextPlan(env: BrainEnv, from: Standing, now: number, last?: PetAction): PetPlan {
  const dog = env.species === 'dog';
  const speed = dog ? DOG_SPEED : 1;
  const map = buildWalkMap(env.layout, env.cols);
  const cands: Candidate[] = [];
  const stay = (action: PetAction, weight: number, ms: Ms): void => {
    cands.push({ weight, action, route: [], at: from.pt, on: from.on, hostId: from.hostId, facing: from.facing, ms });
  };
  const go = (action: PetAction, weight: number, dest: Dest, ms: Ms, key?: string, facing?: 'l' | 'r'): void => {
    if (key !== undefined && env.occupied.has(key)) return;
    const raw = planRoute(map, from, dest);
    if (!raw) return;
    // Un chien ne grimpe que sur son canapé : aucun segment ne le pose sur un autre meuble (fauteuil, bureau…).
    if (dog && raw.some((s) => s.on !== null && s.on !== dest.on && s.on !== from.on)) return;
    const route = speed === 1 ? raw : scaleRoute(raw, speed);
    cands.push({ weight, action, route, at: dest.pt, on: dest.on, hostId: dest.hostId, facing: facing ?? facingOf(route, from.facing), ms, key });
  };

  if (env.still) {
    stay('sit', 2, [8000, 16000]);
    stay('sleep', 1, [20000, 40000]);
  } else if (dog) {
    stay('sit', 1.2, [4000, 9000]);
    stay('pant', 1, [3000, 6000]);
    stay('stretch', 0.8, [2500, 3500]);
    stay('yawn', 0.5, [2000, 3000]);
    stay('groom', 0.6, [4000, 7000]);
    if (from.hostId === null) stay('sleep', 0.4, [15000, 30000]);
    const cells = freeCells(map);
    for (let i = 0; i < 4 && cells.length > 0; i++) {
      const c = cells[Math.floor(env.rng() * cells.length)]!;
      go('sniff', 0.7, { pt: standPoint(c.col, c.row), on: null, hostId: null }, [3000, 5000]);
    }
    for (const p of env.layout) {
      if (!isStanding(p)) continue;
      const poi = (type: string) => poisOf(p.kind).filter((q) => q.type === type);
      const cellPt = (dx: number, dy: number): Pt => standPoint(p.col + dx, p.row + dy);
      const plat = map.platforms.find((q) => q.id === p.id);
      if (p.kind === 'basket') for (const q of poi('curl')) go('sleep', 2, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [25000, 60000], `${p.id}:curl`);
      if (p.kind === 'kennel') for (const q of poi('sleep')) go('sleep', 2.4, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [25000, 60000], `${p.id}:sleep`);
      if (p.kind === 'bowl') {
        for (const q of poi('eat')) {
          go('eat', 1.4, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [5000, 8000], `${p.id}:eat`);
          go('drink', 1, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [3000, 5000], `${p.id}:eat`);
        }
      }
      if (plat && p.kind === 'sofa') {
        for (const q of poi('sleep')) go('sleep', 1.2, { pt: { x: (p.col + q.dx + 0.5) * CELL_W, y: plat.y }, on: p.id, hostId: p.id }, [25000, 60000], `${p.id}:sleep`);
        poi('seat').forEach((q, i) => go('perch', 0.6, { pt: { x: (p.col + q.dx + 0.5) * CELL_W, y: plat.y }, on: p.id, hostId: p.id }, [10000, 25000], `${p.id}:seat${i}`));
      }
    }
  } else {
    stay('sit', 1, [4000, 9000]);
    stay('groom', 1.2, [5000, 8000]);
    stay('stretch', 0.8, [2500, 3500]);
    stay('yawn', 0.6, [2000, 3000]);
    if (from.hostId === null) stay('sleep', 0.4, [15000, 30000]);
    const cells = freeCells(map);
    for (let i = 0; i < 4 && cells.length > 0; i++) {
      const c = cells[Math.floor(env.rng() * cells.length)]!;
      go('sit', 0.45, { pt: standPoint(c.col, c.row), on: null, hostId: null }, [3000, 6000]);
    }
    for (const p of env.layout) {
      if (!isStanding(p)) continue;
      const poi = (type: string) => poisOf(p.kind).filter((q) => q.type === type);
      const cellPt = (dx: number, dy: number): Pt => standPoint(p.col + dx, p.row + dy);
      const plat = map.platforms.find((q) => q.id === p.id);
      if (p.kind === 'basket') for (const q of poi('curl')) go('sleep', 2.2, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [25000, 60000], `${p.id}:curl`);
      if (p.kind === 'kennel') for (const q of poi('sleep')) go('sleep', 2, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [25000, 60000], `${p.id}:sleep`);
      if (p.kind === 'bowl') {
        for (const q of poi('eat')) {
          go('eat', 1.4, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [5000, 8000], `${p.id}:eat`);
          go('drink', 1, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [3000, 5000], `${p.id}:eat`);
        }
      }
      if (plat && (p.kind === 'sofa' || p.kind === 'armchair' || p.kind === 'chair')) {
        for (const q of poi('sleep')) go('sleep', 1.8, { pt: { x: (p.col + q.dx + 0.5) * CELL_W, y: plat.y }, on: p.id, hostId: p.id }, [25000, 60000], `${p.id}:sleep`);
        poi('seat').forEach((q, i) => go('perch', p.kind === 'sofa' ? 0.5 : 1, { pt: { x: (p.col + q.dx + 0.5) * CELL_W, y: plat.y }, on: p.id, hostId: p.id }, [10000, 25000], `${p.id}:seat${i}`));
      }
      if (p.kind === 'sofa') go('hide', 0.7, { pt: standPoint(p.col + 2, p.row + 2), on: null, hostId: p.id }, [8000, 16000], `${p.id}:hide`);
      if (p.kind === 'armchair') {
        const left = { col: p.col - 1, row: p.row + 2 };
        const right = { col: p.col + 3, row: p.row + 2 };
        const side = isFree(map, left.col, left.row) ? { cell: left, facing: 'r' as const } : isFree(map, right.col, right.row) ? { cell: right, facing: 'l' as const } : null;
        if (side) go('scratch', 1, { pt: standPoint(side.cell.col, side.cell.row), on: null, hostId: null }, [5000, 7000], undefined, side.facing);
      }
      if (plat && (p.kind === 'shelf' || p.kind === 'desk')) {
        const x = plat.x0 + 10 + env.rng() * Math.max(0, plat.x1 - plat.x0 - 20);
        go('perch', 0.8, { pt: { x, y: plat.y }, on: p.id, hostId: p.id }, [12000, 30000]);
      }
    }
  }

  const weights = cands.map((c) => c.weight * (c.action === last ? 0.2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = env.rng() * total;
  let chosen = cands[cands.length - 1]!;
  for (let i = 0; i < cands.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) {
      chosen = cands[i]!;
      break;
    }
  }
  return {
    action: chosen.action,
    hostId: chosen.hostId,
    at: chosen.at,
    on: chosen.on,
    route: chosen.route,
    startedAt: now,
    actMs: between(env.rng, chosen.ms),
    facing: chosen.facing,
    sig: layoutSig(env.layout, env.cols),
    ...(chosen.key !== undefined ? { key: chosen.key } : {}),
  };
}

// Un chat qui apparaît (premier affichage, plan abîmé) : sur une case libre du sol, puis une première action.
export function spawnPlan(env: BrainEnv, now: number): PetPlan {
  const cells = freeCells(buildWalkMap(env.layout, env.cols));
  const cell = cells.length > 0 ? cells[Math.floor(env.rng() * cells.length)]! : { col: 0, row: ROWS - 1 };
  return nextPlan(env, { pt: standPoint(cell.col, cell.row), on: null, hostId: null, facing: 'r' }, now);
}

// Où poser le chat quand les meubles ont changé : là où il était si c'est encore valable, sinon sur la case libre la plus proche.
export function standingFrom(map: WalkMap, state: PetState): Standing {
  const { pos, on } = state;
  if (on !== null) {
    const plat = map.platforms.find((p) => p.id === on);
    if (plat && pos.x >= plat.x0 - 1 && pos.x <= plat.x1 + 1 && Math.abs(pos.y - plat.y) < 2) return { pt: pos, on, hostId: on, facing: state.facing };
  } else {
    const c = cellOf(pos);
    if (isFree(map, c.col, c.row)) return { pt: pos, on: null, hostId: null, facing: state.facing };
  }
  const cell = nearestFreeCell(map, pos);
  return { pt: cell ? standPoint(cell.col, cell.row) : pos, on: null, hostId: null, facing: state.facing };
}

// Le plan à suivre à l'instant `now` : celui en cours s'il tient encore, sinon un nouveau (`fresh`), pris là où le chat se trouve en théorie.
export function resume(plan: PetPlan | undefined, env: BrainEnv, now: number): { plan: PetPlan; fresh: boolean } {
  if (plan === undefined) return { plan: spawnPlan(env, now), fresh: true };
  const sig = layoutSig(env.layout, env.cols);
  if (plan.sig === sig && now < planEndsAt(plan)) return { plan, fresh: false };
  const state = stateAt(plan, now);
  const standing: Standing =
    plan.sig === sig
      ? { pt: plan.at, on: plan.on, hostId: plan.hostId, facing: plan.facing }
      : standingFrom(buildWalkMap(env.layout, env.cols), state);
  return { plan: nextPlan(env, standing, now, plan.action), fresh: true };
}

// Une caresse : le chat s'arrête là où il est et ronronne 3,5 s. Pas en plein saut ; un plan fini sera remplacé par la boucle.
export function touchPlan(plan: PetPlan, env: BrainEnv, now: number): PetPlan | null {
  const state = stateAt(plan, now);
  if (state.phase === 'jump' || state.phase === 'done' || plan.action === 'hide') return null;
  const hostId = state.phase === 'act' ? plan.hostId : state.on;
  return { action: 'purr', hostId, at: state.pos, on: state.on, route: [], startedAt: now, actMs: 3500, facing: state.facing, sig: layoutSig(env.layout, env.cols) };
}
