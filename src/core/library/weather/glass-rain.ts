// src/core/library/weather/glass-rain.ts
// Pluie sur la vitre (vue pièce) : moteur pur (aucun DOM, aucune horloge, aucun Math.random).
// Porté de `GlassRain.step` de la maquette (docs/superpowers/maquettes/pluie-naturelle) : gouttes posées qui arrivent
// une à une et grossissent, coulures qui dévalent par à-coups (absorbent, sèment des perles, fusionnent, zigzaguent),
// traces de 8 s. La buée (masque raster) reste au renderer : il l'efface le long des traces exposées ici.
// Toutes les coordonnées sont celles de la pièce (mêmes que les rectangles des vitres).
import { mulberry32 } from '../scene-world';
import { gust } from './rain-drops';

export type Pane = { x: number; y: number; w: number; h: number };
export type GlassBudget = { statics: number; runners: number };

// Budgets pour toute la pièce : téléphone (notes §Android) / grand écran (maquette : 90 + 220 P au plus).
export const GLASS_BUDGET_PHONE: GlassBudget = { statics: 220, runners: 12 };
export const GLASS_BUDGET_WIDE: GlassBudget = { statics: 310, runners: 30 };

export type GlassDrop = {
  /** Indice de la vitre dans `GlassSim.panes`. */
  pane: number;
  x: number;
  y: number;
  r: number;
  /** Séchage en cours (pluie arrêtée) : rétrécit de `dry` px/s jusqu'à disparaître. */
  dry?: number;
};
export type GlassTrailPoint = { x: number; y: number; r: number; age: number };
export type GlassRunner = GlassDrop & {
  vy: number;
  /** Arrêt restant (s) : la coulure dévale par à-coups. */
  wait: number;
  trail: GlassTrailPoint[];
  /** Dérive propre (marche aléatoire) : chaque coulure zigzague à sa façon. */
  vxw: number;
  /** Distance restante avant de semer une perle. */
  bead: number;
};

export type GlassSim = {
  panes: Pane[];
  statics: GlassDrop[];
  runners: GlassRunner[];
  /** Traces des coulures terminées (la trace d'une coulure vivante est dans `runner.trail`). */
  trails: GlassTrailPoint[][];
  budget: GlassBudget;
  rng: () => number;
  /** Part de surface de chaque vitre (somme = 1, 0 pour une vitre dégénérée). */
  shares: number[];
  /** Réserve de gouttes posées à faire arriver (≤ 40/s). */
  spawnAcc: number;
  /** Réserve de coulures à faire naître. */
  runnerAcc: number;
};

const SPAWN_RATE = 40; // gouttes posées nouvelles par seconde au plus
const MAX_DT = 0.25;
const DETACH_R = 4; // une goutte posée de 4 px se décroche et devient une coulure
const TRAIL_LIFE = 8; // s
const TRAIL_MAX = 120; // points par trace (notes §Android)
const DRY_MIN = 20; // séchage d'une goutte posée : 20-60 s tirés
const DRY_MAX = 60;
const GONE_R = 0.25; // rayon sous lequel une goutte qui sèche a disparu

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v: number): number => (Number.isFinite(v) ? v : 0);

// Répartit `total` entre les vitres au prorata de leur surface (plus forts restes) : somme exacte = total.
function split(total: number, shares: readonly number[]): number[] {
  const raw = shares.map((s) => s * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).filter(([, i]) => shares[i]! > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) { const j = order[k]![1]; out[j] = out[j]! + 1; }
  return out;
}

/** Gouttes posées visées pour toute la pièce : 90 + 220 P, plafonnées au budget ; 0 sans pluie. */
function staticsTarget(P: number, budget: GlassBudget): number {
  return P > 0 ? Math.min(Math.round(90 + 220 * P), budget.statics) : 0;
}

export function createGlassSim(panes: readonly Pane[], seed: number, budget: GlassBudget): GlassSim {
  const list = panes.map((p) => ({ ...p }));
  const areas = list.map((p) => (p.w > 0 && p.h > 0 ? p.w * p.h : 0));
  const sum = areas.reduce((a, b) => a + b, 0);
  return {
    panes: list,
    statics: [],
    runners: [],
    trails: [],
    budget,
    rng: mulberry32(seed),
    shares: areas.map((a) => (sum > 0 ? a / sum : 0)),
    spawnAcc: 0,
    runnerAcc: 0,
  };
}

function newStatic(sim: GlassSim, pane: number, r?: number): GlassDrop {
  const p = sim.panes[pane]!;
  const rng = sim.rng;
  return { pane, x: p.x + rng() * p.w, y: p.y + rng() * p.h, r: r ?? 0.9 + Math.pow(rng(), 1.8) * 2.6 };
}

function newRunner(sim: GlassSim, pane: number, x: number, y: number, r: number): GlassRunner {
  const rng = sim.rng;
  return { pane, x, y, r, vy: 0, wait: 0.2 + rng() * 0.5, trail: [], vxw: 0, bead: 8 + rng() * 10 };
}

const count = (list: readonly GlassDrop[], n: number): number[] => {
  const c = new Array<number>(n).fill(0);
  for (const d of list) c[d.pane] = c[d.pane]! + 1;
  return c;
};

// Vitre la plus en retard sur sa part (écart rapporté au quota), ou -1 si toutes sont servies.
function neediest(have: readonly number[], quota: readonly number[]): number {
  let best = -1;
  let bestGap = 0;
  for (let i = 0; i < quota.length; i++) {
    if (quota[i]! <= 0 || have[i]! >= quota[i]!) continue;
    const gap = 1 - have[i]! / quota[i]!;
    if (gap > bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return best;
}

const startDrying = (sim: GlassSim, d: GlassDrop): void => {
  if (d.dry === undefined) d.dry = d.r / lerp(DRY_MIN, DRY_MAX, sim.rng());
};

/** Pluie déjà là (ouverture de la pièce, redimensionnement) : la vitre est tout de suite couverte de ses gouttes posées
 *  et de quelques traces récentes. L'arrivée une à une ne vaut que pour une pluie qui commence pendant qu'on regarde. */
export function prefillGlass(sim: GlassSim, env: { precip: number; wind: number; t: number }): void {
  const P = clamp01(num(env.precip));
  if (P <= 0 || sim.panes.length === 0) return;
  const rng = sim.rng;
  const quota = split(staticsTarget(P, sim.budget), sim.shares);
  const have = count(sim.statics, sim.panes.length);
  quota.forEach((q, i) => {
    for (let k = have[i]!; k < q; k++) sim.statics.push(newStatic(sim, i));
  });
  // quelques traces récentes : filets presque droits, plus vieux en haut qu'en bas
  split(Math.round(2 + 6 * P), sim.shares).forEach((n, i) => {
    const p = sim.panes[i]!;
    for (let k = 0; k < n; k++) {
      const x0 = p.x + rng() * p.w;
      const y0 = p.y + rng() * p.h * 0.35;
      const len = Math.min(p.y + p.h - y0, 40 + rng() * p.h * 0.6);
      const r = 1.4 + rng() * 1.6;
      const ageEnd = 0.5 + rng() * 5; // âge du point le plus bas
      const speed = 30 + rng() * 40; // px/s : âge croissant vers le haut
      const tr: GlassTrailPoint[] = [];
      let x = x0;
      for (let d = 0; d <= len && tr.length < TRAIL_MAX; d += 2) {
        x += (rng() - 0.5) * 0.8;
        tr.push({ x, y: y0 + d, r, age: ageEnd + (len - d) / speed });
      }
      while (tr.length > 1 && tr[0]!.age >= TRAIL_LIFE) tr.shift();
      if (tr.length > 1) sim.trails.push(tr);
    }
  });
  sim.spawnAcc = 0;
}

export function stepGlass(sim: GlassSim, env: { precip: number; wind: number; t: number }, dtIn: number): void {
  const dt = Number.isFinite(dtIn) ? Math.min(MAX_DT, Math.max(0, dtIn)) : 0;
  if (dt === 0 || sim.panes.length === 0) return;
  const P = clamp01(num(env.precip));
  const W = clamp01(num(env.wind));
  const rng = sim.rng;
  const n = sim.panes.length;
  const target = staticsTarget(P, sim.budget);
  const quota = split(target, sim.shares); // arrivées de pluie
  const cap = split(sim.budget.statics, sim.shares); // plafond absolu de chaque vitre (perles comprises)
  const runCap = split(sim.budget.runners, sim.shares);
  const have = count(sim.statics, n);

  // gouttes posées : arrivent une à une (≤ 40/s) vers 90 + 220 P, chacune dans la vitre la plus en retard ;
  // sans pluie, plus aucune n'arrive
  if (target > 0) {
    sim.spawnAcc = Math.min(sim.spawnAcc + SPAWN_RATE * dt, SPAWN_RATE * MAX_DT);
    while (sim.spawnAcc >= 1) {
      const i = neediest(have, quota);
      if (i < 0) { sim.spawnAcc = Math.min(sim.spawnAcc, 1); break; } // vitres servies : pas de réserve (sinon rafale après absorption)
      sim.statics.push(newStatic(sim, i));
      have[i] = have[i]! + 1;
      sim.spawnAcc -= 1;
    }
  } else sim.spawnAcc = 0;

  // pluie arrêtée, ou trop de gouttes pour une pluie plus faible : les gouttes en trop sèchent (jamais d'un coup)
  for (let i = 0; i < n; i++) {
    let extra = P > 0 ? have[i]! - quota[i]! - 40 : Infinity;
    for (const d of sim.statics) {
      if (extra <= 0) break;
      if (d.pane !== i) continue;
      startDrying(sim, d);
      extra--;
    }
  }
  if (P > 0) for (const d of sim.statics) if (d.dry !== undefined && have[d.pane]! <= quota[d.pane]!) d.dry = undefined; // la pluie reprend

  // elles grossissent très lentement (0,08 P px/s) ; à 4 px elles se décrochent et deviennent une coulure ;
  // celles qui sèchent rétrécissent puis disparaissent
  const runHave = count(sim.runners, n);
  let write = 0;
  for (const s of sim.statics) {
    if (s.dry !== undefined) {
      s.r -= s.dry * dt;
      if (s.r <= GONE_R) continue;
    } else s.r += dt * 0.08 * P;
    if (s.r > DETACH_R) {
      if (runHave[s.pane]! < runCap[s.pane]!) {
        sim.runners.push(newRunner(sim, s.pane, s.x, s.y, s.r));
        runHave[s.pane] = runHave[s.pane]! + 1;
        continue;
      }
      s.r = DETACH_R; // plus de place pour une coulure : la goutte attend, pendue
    }
    sim.statics[write++] = s;
  }
  sim.statics.length = write;

  // coulures : naissance lerp(0,08/s, 0,55/s, P²) par vitre, réparties au prorata de la surface ; aucune sans pluie
  if (P > 0) {
    sim.runnerAcc += dt * lerp(0.08, 0.55, P * P) * n;
    while (sim.runnerAcc >= 1) {
      sim.runnerAcc -= 1;
      const i = neediest(runHave, runCap);
      if (i < 0) break;
      const p = sim.panes[i]!;
      sim.runners.push(newRunner(sim, i, p.x + rng() * p.w, p.y + rng() * p.h * 0.35, 1.6 + rng() * 1.4));
      runHave[i] = runHave[i]! + 1;
    }
  } else sim.runnerAcc = 0;

  const lean = W * gust(num(env.t)) * 0.35; // le vent penche (peu) les traînées
  const dead = new Set<GlassRunner>();
  for (const R of sim.runners) {
    if (dead.has(R)) continue;
    const p = sim.panes[R.pane]!;
    // marche-arrêt : une goutte dévale par à-coups (0,1-0,6 s d'arrêt, puis accélération ∝ taille)
    R.wait -= dt;
    if (R.wait > 0) R.vy = Math.max(0, R.vy - 400 * dt);
    else {
      R.vy = Math.min(R.vy + (30 + R.r * 55) * dt * 4, 25 + R.r * R.r * 9);
      if (rng() < dt * (1.6 - Math.min(1.2, R.r * 0.25))) R.wait = 0.1 + rng() * 0.5;
    }
    // dérive : un peu de vent + marche aléatoire
    R.vxw = R.vxw * (1 - 1.5 * dt) + (rng() - 0.5) * 220 * dt;
    const vx = R.vy > 2 ? R.vy * lean * 0.35 + R.vxw * Math.min(1, R.vy / 20) : 0;
    R.x = Math.min(p.x + p.w, Math.max(p.x, R.x + vx * dt));
    R.y += R.vy * dt;
    if (R.vy > 2) {
      // trace : un point tous les 2 px
      const last = R.trail[R.trail.length - 1];
      if (!last || Math.hypot(R.x - last.x, R.y - last.y) > 2) {
        R.trail.push({ x: R.x, y: R.y, r: R.r, age: 0 });
        if (R.trail.length > TRAIL_MAX) R.trail.shift();
      }
      // absorbe les gouttes posées sur son passage (la coulure grossit)
      for (let i = sim.statics.length - 1; i >= 0; i--) {
        const s = sim.statics[i]!;
        if (s.pane === R.pane && Math.abs(s.x - R.x) < R.r + s.r && Math.abs(s.y - R.y) < R.r + s.r) {
          R.r = Math.min(5.2, Math.sqrt(R.r * R.r + s.r * s.r * 0.7));
          sim.statics.splice(i, 1);
        }
      }
      // sème une perle derrière elle (toutes les 10-60 px) et s'amincit
      R.bead -= R.vy * dt;
      if (R.bead <= 0) {
        R.bead = 10 + Math.pow(rng(), 0.5) * 50;
        const nPane = sim.statics.reduce((a, s) => a + (s.pane === R.pane ? 1 : 0), 0);
        if (nPane < Math.min(cap[R.pane]!, quota[R.pane]! + 60)) { // comme la maquette : 60 perles au-delà de la cible au plus
          const bead: GlassDrop = { pane: R.pane, x: R.x + (rng() - 0.5) * R.r * 1.5, y: R.y - R.r, r: 0.6 + rng() * 1.1 };
          if (P <= 0) startDrying(sim, bead);
          sim.statics.push(bead);
        }
        R.r = Math.max(1.2, R.r - 0.12);
      }
      // fusion de deux coulures de la même vitre qui se touchent
      for (const O of sim.runners) {
        if (O === R || dead.has(O) || O.pane !== R.pane) continue;
        if (O.y > R.y - 2 && Math.abs(O.x - R.x) < R.r + O.r && Math.abs(O.y - R.y) < R.r + O.r + 4) {
          R.r = Math.min(5.5, Math.sqrt(R.r * R.r + O.r * O.r));
          R.vy = Math.max(R.vy, O.vy);
          dead.add(O);
        }
      }
    }
    if (R.y > p.y + p.h + 4) dead.add(R);
  }
  for (const R of sim.runners) if (dead.has(R) && R.trail.length > 1) sim.trails.push(R.trail);
  sim.runners = sim.runners.filter((R) => !dead.has(R));

  // traces : vieillissent, s'effacent en 8 s (les plus vieux points d'abord)
  for (const R of sim.runners) {
    for (const q of R.trail) q.age += dt;
    while (R.trail.length > 0 && R.trail[0]!.age >= TRAIL_LIFE) R.trail.shift();
  }
  for (const tr of sim.trails) for (const q of tr) q.age += dt;
  sim.trails = sim.trails.filter((tr) => tr[tr.length - 1]!.age < TRAIL_LIFE);
}

/** Vrai tant qu'il reste quelque chose sur la vitre (gouttes, coulures ou traces) : la boucle peut s'arrêter sinon. */
export function glassActive(sim: GlassSim): boolean {
  return sim.statics.length > 0 || sim.runners.length > 0 || sim.trails.length > 0;
}
