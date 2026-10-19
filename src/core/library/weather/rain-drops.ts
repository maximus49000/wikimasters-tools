// src/core/library/weather/rain-drops.ts
// Pluie vue de dehors : moteur pur (aucun DOM, aucune horloge, aucun Math.random).
// Porté de `RainOutside.step` de la maquette (docs/superpowers/maquettes/pluie-naturelle) : gouttes à 3 profondeurs,
// éclaboussures au sol, anneaux dans les flaques, gouttes qui tombent des bords. L'éclair n'est pas ici (couche météo).
// Tout est piloté par precip (0-1) et wind (0-1) : aucune densité réglée à part.
import { mulberry32 } from '../scene-world';

export type RainEnv = { precip: number; wind: number; daylight: number; t: number };
export type RainBudget = { drops: number; splashes: number; ripples: number };

// Budgets : téléphone (notes §Android, basse définition) / grand écran (valeurs de la maquette).
export const RAIN_BUDGET_PHONE: RainBudget = { drops: 350, splashes: 80, ripples: 40 };
export const RAIN_BUDGET_WIDE: RainBudget = { drops: 900, splashes: 160, ripples: 90 };

export type RainDripKind = 'auvent' | 'corniche' | 'toit' | 'gouttiere';
export type RainWorld = {
  width: number;
  height: number;
  /** Haut et bas de la bande de sol où les gouttes touchent (px de scène). */
  groundTop: number;
  groundBottom: number;
  puddles: readonly { x: number; y: number; rx: number }[];
  /** Points des bords qui gouttent (auvents, corniches, toits, gouttières) ; vide hors de la ville. */
  drips: readonly { x: number; y: number; kind: RainDripKind }[];
  gutter: { y: number; grateX: number } | null;
  /** Faux en mer : aucune éclaboussure au sol. */
  splashGround: boolean;
};

export type RainLayer = { name: string; part: number; v: [number, number]; len: [number, number]; w: number; a: number; blur: number; sway: number; splash: number };

// part : part de la population ; v : vitesse px/s ; len : longueur (exposition) ; w : épaisseur ; a : alpha ; blur : halo flou (proche)
export const LAYERS: readonly RainLayer[] = [
  { name: 'loin', part: 0.42, v: [170, 260], len: [5, 9], w: 0.6, a: 0.22, blur: 0, sway: 0.2, splash: 0 },
  { name: 'moyen', part: 0.36, v: [300, 420], len: [9, 16], w: 0.9, a: 0.36, blur: 0, sway: 0.5, splash: 0.25 },
  { name: 'proche', part: 0.22, v: [520, 720], len: [16, 34], w: 1.6, a: 0.46, blur: 2.6, sway: 1.1, splash: 1 },
];

export type RainDrop = {
  layer: 0 | 1 | 2;
  x: number;
  y: number;
  v: number;
  len: number;
  a: number;
  w: number;
  /** Biais d'inclinaison propre (±0,06) : plus de hachures parallèles. */
  tilt: number;
  ph: number;
  big: boolean;
  /** Ordonnée où la goutte touche le sol. */
  ground: number;
};
export type RainSplash = { x: number; y: number; age: number; k: number; parts: { x: number; y: number; vx: number; vy: number }[] };
export type RainRipple = { x: number; y: number; age: number; life: number; R: number };
export type RainFallingDrip = { x: number; y: number; vy: number; r: number; ground: number };

export type RainSim = {
  world: RainWorld;
  soft: boolean;
  budget: RainBudget;
  rng: () => number;
  t: number;
  drops: RainDrop[];
  splashes: RainSplash[];
  ripples: RainRipple[];
  /** Gouttes tombées des bords, en chute. */
  drips: RainFallingDrip[];
  /** Minuterie de chaque point de `world.drips` (phase 0-1 = perle qui grossit). */
  dripTimers: { phase: number }[];
  /** Réserve de gouttes à faire naître (montée progressive, ≤ 40/s). */
  spawnAcc: number;
};

const SPAWN_RATE = 40; // gouttes nouvelles par seconde au plus
const SPLASH_LIFE = 0.3;
const GRAVITY = 900;
const MAX_DT = 0.25;

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// Vent : rafales = somme de sinus lentes (déterministe) → facteur 0,45..1,55 appliqué à l'inclinaison et à la dérive.
export const gust = (t: number): number => 1 + 0.32 * Math.sin(t * 0.61) * Math.sin(t * 0.23 + 1.3) + 0.22 * Math.sin(t * 1.7 + 0.4) * Math.max(0, Math.sin(t * 0.13));

/** Population visée : round(P^1,25 × 900), × 0,7 derrière la vitre, plafonnée au budget. */
export function rainTarget(precip: number, budget: RainBudget, soft: boolean): number {
  const P = clamp01(Number.isFinite(precip) ? precip : 0);
  const full = Math.round(Math.pow(P, 1.25) * 900);
  return Math.min(Math.round(full * (soft ? 0.7 : 1)), budget.drops);
}

export function createRainSim(world: RainWorld, seed: number, opts: { soft: boolean; budget: RainBudget }): RainSim {
  const rng = mulberry32(seed);
  return {
    world,
    soft: opts.soft,
    budget: opts.budget,
    rng,
    t: 0,
    drops: [],
    splashes: [],
    ripples: [],
    drips: [],
    dripTimers: world.drips.map(() => ({ phase: rng() })),
    spawnAcc: 0,
  };
}

// Nouvelle goutte : au-dessus du cadre (rien n'apparaît sur place), ou n'importe où sur sa colonne (pré-remplissage).
function spawnDrop(sim: RainSim, layer: 0 | 1 | 2, fromTop = true): RainDrop {
  const L = LAYERS[layer]!;
  const r = sim.rng;
  const w = sim.world;
  const ground = w.groundTop + Math.pow(r(), 0.8) * (w.groundBottom - w.groundTop);
  return {
    layer,
    x: r() * (w.width + 200) - 100,
    y: fromTop ? -r() * 60 - 10 : r() * ground,
    v: lerp(L.v[0], L.v[1], r()),
    len: lerp(L.len[0], L.len[1], r()) * (0.6 + r() * 0.9),
    a: L.a * (0.55 + r() * 0.7),
    w: L.w * (0.8 + r() * 0.5),
    ph: r() * Math.PI * 2,
    ground,
    big: r() < 0.06,
    tilt: (r() - 0.5) * 0.12,
  };
}

function pickLayer(sim: RainSim): 0 | 1 | 2 {
  const u = sim.rng();
  const li: 0 | 1 | 2 = u < LAYERS[0]!.part ? 0 : u < LAYERS[0]!.part + LAYERS[1]!.part ? 1 : 2;
  // derrière la vitre : la moitié de la couche proche rebascule en couche moyenne (plus doux)
  return sim.soft && li === 2 && sim.rng() < 0.5 ? 1 : li;
}

function addSplash(sim: RainSim, x: number, y: number, k: number): void {
  if (!sim.world.splashGround || sim.splashes.length >= sim.budget.splashes) return;
  const r = sim.rng;
  const parts: RainSplash['parts'] = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.6;
    const v = (60 + r() * 90) * k;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
  }
  sim.splashes.push({ x, y, age: 0, k, parts });
}

/** Pluie déjà là (ouverture de la scène, redimensionnement) : pose tout de suite la population cible,
 *  à des hauteurs réparties sur toute la colonne, sans éclaboussures. La montée progressive ne vaut que pour
 *  une pluie qui commence pendant qu'on regarde. */
export function prefillRain(sim: RainSim, env: RainEnv): void {
  const target = rainTarget(env.precip, sim.budget, sim.soft);
  while (sim.drops.length < target) sim.drops.push(spawnDrop(sim, pickLayer(sim), false));
  sim.spawnAcc = 0;
}

export function stepRain(sim: RainSim, env: RainEnv, dtIn: number): void {
  const dt = Number.isFinite(dtIn) ? Math.min(MAX_DT, Math.max(0, dtIn)) : 0;
  if (dt === 0) return;
  sim.t += dt;
  const P = clamp01(Number.isFinite(env.precip) ? env.precip : 0);
  const W = clamp01(Number.isFinite(env.wind) ? env.wind : 0);
  const t = env.t;
  const w = sim.world;
  const r = sim.rng;

  // population : monte au plus de 40/s vers la cible ; en trop, les gouttes finissent leur chute avant de partir
  const target = rainTarget(P, sim.budget, sim.soft);
  if (sim.drops.length < target) {
    sim.spawnAcc = Math.min(sim.spawnAcc + SPAWN_RATE * dt, SPAWN_RATE * MAX_DT);
    while (sim.drops.length < target && sim.spawnAcc >= 1) {
      sim.drops.push(spawnDrop(sim, pickLayer(sim)));
      sim.spawnAcc -= 1;
    }
  } else sim.spawnAcc = 0;

  const lean = W * gust(t); // dérive horizontale = fraction de la vitesse
  let excess = sim.drops.length - target;
  let write = 0;
  for (let i = 0; i < sim.drops.length; i++) {
    const d = sim.drops[i]!;
    const L = LAYERS[d.layer]!;
    const vx = d.v * (0.08 + lean * 0.55) + Math.sin(t * 3.1 + d.ph) * L.sway * 18; // dérive + léger balancement (proche)
    d.y += d.v * dt;
    d.x += vx * dt;
    if (d.x > w.width + 60) d.x -= w.width + 160;
    if (d.x < -100) d.x += w.width + 160;
    if (d.y >= d.ground) {
      if (L.splash > 0 && r() < L.splash * (sim.soft ? 0.4 : 1)) addSplash(sim, d.x, d.ground, d.big ? 1.6 : 1);
      if (excess > 0) {
        excess--; // goutte en trop : elle a fini sa chute, elle part
        continue;
      }
      Object.assign(d, spawnDrop(sim, d.layer));
    }
    sim.drops[write++] = d;
  }
  sim.drops.length = write;

  // éclaboussures (gerbe de 3-5 gouttelettes + couronne) : vie 0,3 s
  for (const s of sim.splashes) {
    s.age += dt;
    for (const p of s.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += GRAVITY * dt;
    }
  }
  sim.splashes = sim.splashes.filter((s) => s.age < SPLASH_LIFE);

  // anneaux dans les flaques : probabilité par flaque et par seconde = P² × rx × 0,11
  for (const p of w.puddles) {
    if (sim.ripples.length >= sim.budget.ripples) break;
    if (r() < P * P * dt * p.rx * 0.11) {
      const u = r() * 2 - 1;
      sim.ripples.push({ x: p.x + u * p.rx * 0.85, y: p.y + (r() * 2 - 1) * p.rx * 0.12, age: 0, life: 0.7 + r() * 0.5, R: 5 + r() * 7 });
    }
  }
  for (const rp of sim.ripples) rp.age += dt;
  sim.ripples = sim.ripples.filter((rp) => rp.age < rp.life);

  // gouttes des bords : période 3,2 s (bruine) → 0,45 s (averse), × 0,6 gouttière, × 1,6 toit, déphasées par point ;
  // sans pluie, la perle en cours ne grossit plus (aucune nouvelle goutte)
  if (P > 0) {
    w.drips.forEach((pt, i) => {
      const tm = sim.dripTimers[i]!;
      const period = lerp(3.2, 0.45, P) * (pt.kind === 'gouttiere' ? 0.6 : pt.kind === 'toit' ? 1.6 : 1) * (0.7 + 0.6 * ((i * 0.37) % 1));
      tm.phase += dt / period;
      if (tm.phase >= 1) {
        tm.phase -= 1;
        const ground = pt.kind === 'auvent' ? w.groundTop + 8 + r() * 30 : w.groundTop + r() * 40;
        sim.drips.push({ x: pt.x, y: pt.y, vy: 20, r: 1.3 + r() * 0.9, ground });
      }
    });
  }
  const g = gust(t);
  sim.drips = sim.drips.filter((d) => {
    d.vy += GRAVITY * dt;
    d.y += d.vy * dt;
    d.x += W * g * 14 * dt;
    if (d.y < d.ground) return true;
    addSplash(sim, d.x, d.ground, 1.3);
    return false;
  });
}
