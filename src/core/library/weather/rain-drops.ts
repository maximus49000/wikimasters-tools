// src/core/library/weather/rain-drops.ts
// Pluie vue de dehors : moteur pur (aucun DOM, aucune horloge, aucun Math.random).
// Porté de `RainOutside.step` de la maquette (docs/superpowers/maquettes/pluie-naturelle) : gouttes à 3 profondeurs,
// éclaboussures au sol, anneaux dans les flaques, gouttes qui tombent des bords. L'éclair n'est pas ici (couche météo).
// Tout est piloté par precip (0-1) et wind (0-1) : aucune densité réglée à part.
import { mulberry32 } from '../scene-world';

/** `wet` : sol mouillé (0-1), pour les gerbes des roues ; absent = suit la pluie. */
export type RainEnv = { precip: number; wind: number; daylight: number; t: number; wet?: number };
export type RainBudget = { drops: number; splashes: number; ripples: number; sprays?: number };

// Budgets : téléphone (notes §Android, basse définition) / grand écran (valeurs de la maquette).
export const RAIN_BUDGET_PHONE: RainBudget = { drops: 350, splashes: 80, ripples: 40, sprays: 140 };
export const RAIN_BUDGET_WIDE: RainBudget = { drops: 900, splashes: 160, ripples: 90, sprays: 320 };

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
  /** Échelle des TAILLES (longueur des traits, rayons des gouttes des bords, éclaboussures, anneaux) par rapport à la maquette
   *  (scène 1000 × 460 aux grands immeubles) ; 1 par défaut. Les épaisseurs suivent √scale (un trait sous 1 px disparaît). */
  scale?: number;
  /** Bande horizontale réellement vue (vue pièce : l'englobant des vitres) ; tout le monde par défaut. Les gouttes ne naissent
   *  et ne tournent que là (même densité : population au prorata de la largeur). */
  span?: { x0: number; x1: number };
  /** Échelle des VITESSES (même durée de traversée qu'à la maquette : hauteur du monde / 460) ; 1 par défaut. */
  speed?: number;
  /** Rebords du décor (dessus des bandeaux de boutiques…) : les gouttes des couches moyenne et proche s'y écrasent. */
  ledges?: readonly RainLedge[];
};
export type RainLedge = { x0: number; x1: number; y: number };

/** Véhicule vu par la pluie (px de scène) : `y` = sol sous les roues, `roof` = haut du toit, `half` = demi-longueur,
 *  `v` = vitesse (px/s, ≥ 0), `dir` = sens. `head` / `tail` : phares et feux arrière (reflets sur le sol mouillé la nuit),
 *  `lit` : feux allumés. `far` : voie du fond (plus petit, gerbes réduites). */
export type RainCar = {
  id: string; x: number; y: number; half: number; roof: number; v: number; dir: 1 | -1;
  head: { x: number; y: number }; tail: { x: number; y: number }; lit: boolean; far: boolean;
};

const sizeOf = (w: RainWorld): number => (w.scale !== undefined && Number.isFinite(w.scale) && w.scale > 0 ? w.scale : 1);
// Bande des gouttes (x0, largeur) et part de la population qui lui revient (marges de 100 px de chaque côté comprises).
const spanOf = (w: RainWorld): [number, number] => (w.span && w.span.x1 > w.span.x0 ? [w.span.x0, w.span.x1 - w.span.x0] : [0, w.width]);
export const spanShare = (w: RainWorld): number => { const [, sw] = spanOf(w); return Math.min(1, (sw + 200) / (w.width + 200)); };
const speedOf = (w: RainWorld): number => (w.speed !== undefined && Number.isFinite(w.speed) && w.speed > 0 ? w.speed : 1);

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
/** `top` : sur un rebord ou un toit (dessinée par-dessus les acteurs, pas dans le sol). */
export type RainSplash = { x: number; y: number; age: number; k: number; parts: { x: number; y: number; vx: number; vy: number }[]; top?: boolean };
export type RainRipple = { x: number; y: number; age: number; life: number; R: number };
export type RainFallingDrip = { x: number; y: number; vy: number; r: number; ground: number };
/** Gouttelette soulevée par une roue (ou gerbe d'une flaque) ; `mist` : nuée fine, plus large et plus pâle. */
export type RainSpray = { x: number; y: number; vx: number; vy: number; age: number; life: number; r: number; floor: number; mist: boolean };

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
  /** Gerbes des roues et des flaques traversées. */
  sprays: RainSpray[];
  /** Réserve de gouttelettes à émettre par roue (clé : id du véhicule). */
  sprayAcc: Map<string, number>;
  /** Dernière gerbe de chaque flaque (s de simulation) : une seule gerbe par passage de roue. */
  puddleHit: number[];
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
export function rainTarget(precip: number, budget: RainBudget, soft: boolean, share = 1): number {
  const P = clamp01(Number.isFinite(precip) ? precip : 0);
  const full = Math.pow(P, 1.25) * 900 * share;
  return Math.min(Math.round(Math.round(full) * (soft ? 0.7 : 1)), Math.round(budget.drops * share));
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
    sprays: [],
    sprayAcc: new Map(),
    puddleHit: world.puddles.map(() => -Infinity),
  };
}

// Nouvelle goutte : au-dessus du cadre (rien n'apparaît sur place), ou n'importe où sur sa colonne (pré-remplissage).
function spawnDrop(sim: RainSim, layer: 0 | 1 | 2, fromTop = true): RainDrop {
  const L = LAYERS[layer]!;
  const r = sim.rng;
  const w = sim.world;
  const ground = w.groundTop + Math.pow(r(), 0.8) * (w.groundBottom - w.groundTop);
  const k = sizeOf(w), sp = speedOf(w);
  return {
    layer,
    x: spanOf(w)[0] + r() * (spanOf(w)[1] + 200) - 100,
    y: fromTop ? -r() * 60 - 10 : r() * ground,
    v: lerp(L.v[0], L.v[1], r()) * sp,
    len: lerp(L.len[0], L.len[1], r()) * (0.6 + r() * 0.9) * k,
    a: L.a * (0.55 + r() * 0.7),
    w: L.w * (0.8 + r() * 0.5) * Math.sqrt(k),
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

function addSplash(sim: RainSim, x: number, y: number, k: number, onTop = false): void {
  if ((!sim.world.splashGround && !onTop) || sim.splashes.length >= sim.budget.splashes) return;
  k *= sizeOf(sim.world); // couronne, gouttelettes et leur envol à l'échelle du monde
  const r = sim.rng;
  const parts: RainSplash['parts'] = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.6;
    const v = (60 + r() * 90) * k;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
  }
  sim.splashes.push(onTop ? { x, y, age: 0, k, parts, top: true } : { x, y, age: 0, k, parts });
}

/** Pluie déjà là (ouverture de la scène, redimensionnement) : pose tout de suite la population cible,
 *  à des hauteurs réparties sur toute la colonne, sans éclaboussures. La montée progressive ne vaut que pour
 *  une pluie qui commence pendant qu'on regarde. */
export function prefillRain(sim: RainSim, env: RainEnv): void {
  const target = rainTarget(env.precip, sim.budget, sim.soft, spanShare(sim.world));
  while (sim.drops.length < target) sim.drops.push(spawnDrop(sim, pickLayer(sim), false));
  sim.spawnAcc = 0;
}

// Haut d'un obstacle sous la goutte (rebord du décor, toit d'un véhicule) franchi pendant ce pas : son ordonnée, sinon NaN.
function hitTop(world: RainWorld, cars: readonly RainCar[], x: number, y0: number, y1: number): number {
  const ledges = world.ledges;
  if (ledges) for (const l of ledges) if (y0 < l.y && y1 >= l.y && x >= l.x0 && x <= l.x1) return l.y;
  for (const c of cars) if (y0 < c.roof && y1 >= c.roof && x >= c.x - c.half * 0.7 && x <= c.x + c.half * 0.7) return c.roof;
  return NaN;
}

const NO_CARS: readonly RainCar[] = [];

/** Un pas de la pluie. `cars` : véhicules de la scène (gouttes sur les toits, gerbes des roues, flaques traversées). */
export function stepRain(sim: RainSim, env: RainEnv, dtIn: number, cars: readonly RainCar[] = NO_CARS): void {
  const dt = Number.isFinite(dtIn) ? Math.min(MAX_DT, Math.max(0, dtIn)) : 0;
  if (dt === 0) return;
  sim.t += dt;
  const P = clamp01(Number.isFinite(env.precip) ? env.precip : 0);
  const W = clamp01(Number.isFinite(env.wind) ? env.wind : 0);
  const t = env.t;
  const w = sim.world;
  const r = sim.rng;
  const K = sizeOf(w), SP = speedOf(w);

  // population : monte au plus de 40/s vers la cible ; en trop, les gouttes finissent leur chute avant de partir
  const target = rainTarget(P, sim.budget, sim.soft, spanShare(w));
  const [sx0, sw] = spanOf(w);
  if (sim.drops.length < target) {
    sim.spawnAcc = Math.min(sim.spawnAcc + SPAWN_RATE * dt, SPAWN_RATE * MAX_DT);
    while (sim.drops.length < target && sim.spawnAcc >= 1) {
      sim.drops.push(spawnDrop(sim, pickLayer(sim)));
      sim.spawnAcc -= 1;
    }
  } else sim.spawnAcc = 0;

  const lean = W * gust(t); // dérive horizontale = fraction de la vitesse
  const hasLedges = (w.ledges?.length ?? 0) > 0;
  let excess = sim.drops.length - target;
  let write = 0;
  for (let i = 0; i < sim.drops.length; i++) {
    const d = sim.drops[i]!;
    const L = LAYERS[d.layer]!;
    const vx = d.v * (0.08 + lean * 0.55) + Math.sin(t * 3.1 + d.ph) * L.sway * 18 * SP; // dérive + léger balancement (proche)
    const y0 = d.y;
    d.y += d.v * dt;
    // couches moyenne et proche : la goutte s'écrase sur un rebord ou un toit de voiture (plus de chute derrière lui)
    if (d.layer > 0 && !sim.soft && (hasLedges || cars.length > 0) && d.y < d.ground) {
      const top = hitTop(w, cars, d.x, y0, d.y);
      if (top === top) {
        if (r() < 0.7) addSplash(sim, d.x, top, d.layer === 2 ? 0.8 : 0.55, true);
        if (excess > 0) { excess--; continue; }
        Object.assign(d, spawnDrop(sim, d.layer));
        sim.drops[write++] = d;
        continue;
      }
    }
    d.x += vx * dt;
    if (d.x > sx0 + sw + 60) d.x -= sw + 160;
    if (d.x < sx0 - 100) d.x += sw + 160;
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
      p.vy += GRAVITY * K * dt; // gravité à l'échelle du monde (comme l'envol des gouttelettes)
    }
  }
  sim.splashes = sim.splashes.filter((s) => s.age < SPLASH_LIFE);

  // anneaux dans les flaques : probabilité par flaque et par seconde = P² × rx × 0,11
  for (const p of w.puddles) {
    if (sim.ripples.length >= sim.budget.ripples) break;
    if (r() < P * P * dt * p.rx * 0.11) {
      const u = r() * 2 - 1;
      sim.ripples.push({ x: p.x + u * p.rx * 0.85, y: p.y + (r() * 2 - 1) * p.rx * 0.12, age: 0, life: 0.7 + r() * 0.5, R: (5 + r() * 7) * K });
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
        const ground = pt.kind === 'auvent' ? w.groundTop + (8 + r() * 30) * K : w.groundTop + r() * 40 * K;
        sim.drips.push({ x: pt.x, y: pt.y, vy: 20 * SP, r: (1.3 + r() * 0.9) * K, ground });
      }
    });
  }
  const g = gust(t);
  sim.drips = sim.drips.filter((d) => {
    d.vy += GRAVITY * SP * dt;
    d.y += d.vy * dt;
    d.x += W * g * 14 * SP * dt;
    if (d.y < d.ground) return true;
    addSplash(sim, d.x, d.ground, 1.3);
    return false;
  });

  stepSprays(sim, env, P, dt, cars);
}

const SPRAY_LIFE: [number, number] = [0.35, 0.75];
const SPRAY_V_REF = 160; // vitesse (px/s à l'échelle 1) d'une gerbe pleine

function pushSpray(sim: RainSim, s: RainSpray): void {
  if (sim.sprays.length < (sim.budget.sprays ?? 200)) sim.sprays.push(s);
}

// Gerbes des roues : gouttelettes soulevées derrière chaque roue (plus nombreuses et plus hautes avec la vitesse et le sol
// mouillé), nuée fine derrière la voiture ; flaque traversée : grande gerbe des deux côtés et anneaux. Voie du fond : × 0,55.
function stepSprays(sim: RainSim, env: RainEnv, P: number, dt: number, cars: readonly RainCar[]): void {
  const w = sim.world, r = sim.rng, K = sizeOf(w), SP = speedOf(w);
  const wet = clamp01(env.wet !== undefined && Number.isFinite(env.wet) ? env.wet : Math.min(1, P * 4));
  if (wet > 0.15 && w.splashGround) {
    const seen = new Set<string>();
    for (const c of cars) {
      seen.add(c.id);
      const vn = Math.min(1.4, c.v / (SPRAY_V_REF * SP));
      if (vn < 0.08) { sim.sprayAcc.delete(c.id); continue; }
      const kf = c.far ? 0.55 : 1;
      let acc = (sim.sprayAcc.get(c.id) ?? 0) + dt * 70 * wet * vn * kf;
      const wheels = [c.x - c.half * 0.62, c.x + c.half * 0.62];
      while (acc >= 1) {
        acc -= 1;
        const wx = wheels[r() < 0.5 ? 0 : 1]!;
        const mist = r() < 0.3;
        const up = (40 + 110 * r()) * K * kf * Math.sqrt(vn);
        pushSpray(sim, {
          x: wx - c.dir * 2 * K * kf, y: c.y - 0.5,
          vx: -c.dir * c.v * (0.12 + 0.3 * r()) + (r() - 0.5) * 30 * K, vy: -up,
          age: 0, life: lerp(SPRAY_LIFE[0], SPRAY_LIFE[1], r()) * (mist ? 1.4 : 1),
          r: (mist ? 2.6 + 2 * r() : 0.7 + 0.5 * r()) * K * kf, floor: c.y + 1, mist,
        });
      }
      sim.sprayAcc.set(c.id, acc);
      // flaque traversée par une roue : une grande gerbe par passage
      if (vn < 0.25) continue;
      w.puddles.forEach((p, i) => {
        if (sim.t - sim.puddleHit[i]! < 0.8) return;
        if (Math.abs(p.y - c.y) > p.rx * 0.18 + 3 * K) return;
        if (!wheels.some((x) => Math.abs(x - p.x) < p.rx * 0.8)) return;
        sim.puddleHit[i] = sim.t;
        const n = Math.round((10 + 10 * vn) * kf);
        for (let k = 0; k < n; k++) {
          const side = r() < 0.6 ? -c.dir : c.dir; // surtout vers l'arrière
          pushSpray(sim, {
            x: p.x + (r() - 0.5) * p.rx * 0.6, y: c.y - 0.5,
            vx: side * (30 + c.v * 0.35 * r()) * (0.6 + 0.4 * kf), vy: -(110 + 170 * r()) * K * kf * Math.sqrt(vn),
            age: 0, life: 0.55 + 0.35 * r(), r: (0.9 + 0.7 * r()) * K * kf, floor: c.y + 2, mist: false,
          });
        }
        if (sim.ripples.length < sim.budget.ripples) sim.ripples.push({ x: p.x, y: p.y, age: 0, life: 0.9, R: p.rx * 0.7 });
      });
    }
    if (sim.sprayAcc.size > seen.size) for (const id of sim.sprayAcc.keys()) if (!seen.has(id)) sim.sprayAcc.delete(id);
  }
  if (sim.sprays.length === 0) return;
  let write = 0;
  for (const s of sim.sprays) {
    s.age += dt;
    if (s.age >= s.life) continue;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += GRAVITY * K * (s.mist ? 0.25 : 0.75) * dt;
    s.vx *= 1 - Math.min(1, (s.mist ? 3 : 1.2) * dt); // freinée par l'air
    if (s.y > s.floor) { s.y = s.floor; s.vy = 0; }
    sim.sprays[write++] = s;
  }
  sim.sprays.length = write;
}
