// tests/core/library/weather/rain-drops.test.ts
import { describe, expect, it } from 'vitest';
import {
  RAIN_BUDGET_PHONE,
  RAIN_BUDGET_WIDE,
  createRainSim,
  gust,
  prefillRain,
  rainTarget,
  stepRain,
  type RainBudget,
  type RainCar,
  type RainEnv,
  type RainSim,
  type RainWorld,
} from '../../../../src/core/library/weather/rain-drops';

// Rue de la maquette : scène 1000 × 460, trottoir à 300, flaques et bords qui gouttent.
const RUE: RainWorld = {
  width: 1000,
  height: 460,
  groundTop: 300,
  groundBottom: 460,
  puddles: [{ x: 240, y: 330, rx: 40 }, { x: 610, y: 420, rx: 70 }, { x: 880, y: 400, rx: 50 }],
  drips: [{ x: 400, y: 262, kind: 'auvent' }, { x: 300, y: 244, kind: 'corniche' }, { x: 120, y: 120, kind: 'toit' }, { x: 690, y: 180, kind: 'gouttiere' }],
  gutter: { y: 346, grateX: 700 },
  splashGround: true,
};
const MER: RainWorld = { ...RUE, puddles: [], drips: [], gutter: null, splashGround: false };

const env = (precip: number, t: number, wind = 0.4): RainEnv => ({ precip, wind, daylight: 0.2, t });

// Fait tourner la simulation à 30 Hz ; `onStep` est appelé après chaque pas.
function run(sim: RainSim, precip: number, seconds: number, t0 = 0, onStep?: (s: RainSim) => void): number {
  const dt = 1 / 30;
  let t = t0;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    t += dt;
    stepRain(sim, env(precip, t), dt);
    onStep?.(sim);
  }
  return t;
}

const make = (world: RainWorld = RUE, seed = 7, budget: RainBudget = RAIN_BUDGET_WIDE, soft = false): RainSim => createRainSim(world, seed, { soft, budget });

describe('pluie dehors : moteur', () => {
  it('nombre de gouttes : cible P^1,25 × 900 plafonnée au budget, ×0,7 en doux', () => {
    expect(RAIN_BUDGET_PHONE).toEqual({ drops: 350, splashes: 80, ripples: 40, sprays: 140 });
    expect(RAIN_BUDGET_WIDE).toEqual({ drops: 900, splashes: 160, ripples: 90, sprays: 320 });
    expect(rainTarget(1, RAIN_BUDGET_WIDE, false)).toBe(900);
    expect(rainTarget(0.5, RAIN_BUDGET_WIDE, false)).toBe(378);
    expect(rainTarget(0.5, RAIN_BUDGET_WIDE, true)).toBe(265);
    expect(rainTarget(0.15, RAIN_BUDGET_WIDE, false)).toBe(84);
    expect(rainTarget(1, RAIN_BUDGET_PHONE, false)).toBe(350);
    expect(rainTarget(0, RAIN_BUDGET_WIDE, false)).toBe(0);
    // la population monte progressivement (≤ 40/s) puis atteint la cible
    const sim = make();
    let prev = 0;
    run(sim, 1, 30, 0, (s) => {
      expect(s.drops.length - prev).toBeLessThanOrEqual(2); // 40/s × 1/30 s ≈ 1,33
      prev = s.drops.length;
    });
    expect(sim.drops.length).toBe(900);
    const phone = make(RUE, 7, RAIN_BUDGET_PHONE, true);
    run(phone, 1, 15);
    expect(phone.drops.length).toBe(350);
  });

  it('inclinaisons dispersées : écart-type des tilts > 0,02', () => {
    const sim = make();
    run(sim, 0.8, 20);
    const tilts = sim.drops.map((d) => d.tilt);
    const mean = tilts.reduce((a, b) => a + b, 0) / tilts.length;
    const sd = Math.sqrt(tilts.reduce((a, b) => a + (b - mean) ** 2, 0) / tilts.length);
    expect(sd).toBeGreaterThan(0.02);
    // trois couches présentes
    expect(new Set(sim.drops.map((d) => d.layer))).toEqual(new Set([0, 1, 2]));
  });

  it('P passe à 0 : plus de nouvelles gouttes, les présentes finissent leur chute, puis 0', () => {
    const sim = make();
    const t = run(sim, 1, 30);
    const before = sim.drops.length;
    expect(before).toBe(900);
    // un pas après l'arrêt : rien ne disparaît d'un coup
    stepRain(sim, env(0, t + 1 / 30), 1 / 30);
    expect(sim.drops.length).toBeGreaterThan(before * 0.9);
    let prev = sim.drops.length;
    const kept = new Set(sim.drops);
    run(sim, 0, 10, t + 1 / 30, (s) => {
      expect(s.drops.length).toBeLessThanOrEqual(prev); // jamais de nouvelle goutte
      for (const d of s.drops) expect(kept.has(d)).toBe(true);
      prev = s.drops.length;
    });
    expect(sim.drops.length).toBe(0);
    expect(sim.drips.length).toBe(0);
    expect(sim.splashes.length).toBe(0);
    expect(sim.ripples.length).toBe(0);
    // à la reprise, les gouttes reviennent progressivement, par le haut
    stepRain(sim, env(1, t + 20), 1 / 30);
    expect(sim.drops.length).toBeLessThanOrEqual(2);
    for (const d of sim.drops) expect(d.y).toBeLessThan(0);
  });

  it('éclaboussures et anneaux jamais au-dessus du budget', () => {
    for (const budget of [RAIN_BUDGET_PHONE, RAIN_BUDGET_WIDE]) {
      const sim = make(RUE, 3, budget);
      let maxS = 0;
      let maxR = 0;
      run(sim, 1, 25, 0, (s) => {
        maxS = Math.max(maxS, s.splashes.length);
        maxR = Math.max(maxR, s.ripples.length);
      });
      expect(maxS).toBeGreaterThan(0);
      expect(maxR).toBeGreaterThan(0);
      expect(maxS).toBeLessThanOrEqual(budget.splashes);
      expect(maxR).toBeLessThanOrEqual(budget.ripples);
    }
  });

  it('mer : aucune éclaboussure au sol', () => {
    const sim = make(MER);
    run(sim, 1, 25, 0, (s) => expect(s.splashes.length).toBe(0));
    expect(sim.drops.length).toBe(900);
    expect(sim.drips.length).toBe(0);
  });

  it('déterministe à graine égale', () => {
    const a = make(RUE, 42);
    const b = make(RUE, 42);
    run(a, 0.6, 8);
    run(b, 0.6, 8);
    expect(JSON.stringify({ d: a.drops, s: a.splashes, r: a.ripples, f: a.drips })).toBe(JSON.stringify({ d: b.drops, s: b.splashes, r: b.ripples, f: b.drips }));
    const c = make(RUE, 43);
    run(c, 0.6, 8);
    expect(JSON.stringify(c.drops)).not.toBe(JSON.stringify(a.drops));
  });

  it('pas de temps borné : dt négatif ou énorme sans dégât', () => {
    const sim = make();
    run(sim, 0.7, 5);
    const snap = JSON.stringify(sim.drops);
    stepRain(sim, env(0.7, 5), -1);
    expect(JSON.stringify(sim.drops)).toBe(snap);
    stepRain(sim, env(0.7, 6), 10);
    for (const d of sim.drops) {
      expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
      expect(d.y).toBeLessThanOrEqual(d.ground + 720 * 0.25);
    }
  });

  it('pluie déjà là à l’ouverture : prefillRain pose la cible, étalée sur la hauteur, sans éclaboussure', () => {
    const sim = make();
    prefillRain(sim, env(1, 0));
    expect(sim.drops.length).toBe(900);
    expect(sim.splashes.length).toBe(0);
    const ys = sim.drops.map((d) => d.y);
    for (const d of sim.drops) expect(d.y).toBeLessThanOrEqual(d.ground);
    expect(Math.min(...ys)).toBeLessThan(40);
    expect(Math.max(...ys)).toBeGreaterThan(300);
    // une moitié au moins sous le tiers haut : pas toutes en haut
    expect(ys.filter((y) => y > RUE.height / 3).length).toBeGreaterThan(sim.drops.length / 2);
    // le pas suivant ne rajoute rien (cible déjà atteinte)
    stepRain(sim, env(1, 1 / 30), 1 / 30);
    expect(sim.drops.length).toBe(900);
    const phone = make(RUE, 7, RAIN_BUDGET_PHONE, true);
    prefillRain(phone, env(1, 0));
    expect(phone.drops.length).toBe(350);
  });

  it('échelle du monde : tailles × scale (épaisseurs × √scale), vitesses × speed, même durée de traversée', () => {
    const big = make(RUE, 7);
    const small = make({ ...RUE, scale: 0.5, speed: 0.74 }, 7);
    prefillRain(big, env(1, 0));
    prefillRain(small, env(1, 0));
    big.drops.forEach((d, i) => {
      const s = small.drops[i]!;
      expect(s.len).toBeCloseTo(d.len * 0.5, 6);
      expect(s.w).toBeCloseTo(d.w * Math.SQRT1_2, 6);
      expect(s.v).toBeCloseTo(d.v * 0.74, 6);
    });
    // gouttes des bords, éclaboussures et anneaux plus petits
    run(small, 1, 6);
    for (const d of small.drips) expect(d.r).toBeLessThanOrEqual(2.2 * 0.5 + 1e-9);
    for (const rp of small.ripples) expect(rp.R).toBeLessThanOrEqual(12 * 0.5 + 1e-9);
    for (const sp of small.splashes) expect(sp.k).toBeLessThanOrEqual(1.6 * 0.5 + 1e-9);
  });

  it('bande vue (vue pièce) : gouttes seulement au-dessus d’elle, même densité', () => {
    const span = { x0: 300, x1: 500 };
    const sim = make({ ...RUE, span }, 7);
    prefillRain(sim, env(1, 0));
    expect(sim.drops.length).toBe(Math.round(900 * (200 + 200) / (1000 + 200)));
    run(sim, 1, 5, 0, (s) => { for (const d of s.drops) { expect(d.x).toBeGreaterThanOrEqual(span.x0 - 100); expect(d.x).toBeLessThanOrEqual(span.x1 + 100); } });
    expect(rainTarget(1, RAIN_BUDGET_PHONE, false, 0.5)).toBe(175); // budget téléphone au prorata
  });

  it('rafales : gust entre 0,45 et 1,55', () => {
    for (let t = 0; t < 200; t += 0.37) {
      expect(gust(t)).toBeGreaterThanOrEqual(0.45);
      expect(gust(t)).toBeLessThanOrEqual(1.55);
    }
  });

  describe('interactions avec les voitures et le décor', () => {
    const car = (x: number, v: number, over: Partial<RainCar> = {}): RainCar => ({
      id: 'c1', x, y: 330, half: 20, roof: 314, v, dir: 1, head: { x: x + 19, y: 323 }, tail: { x: x - 19, y: 321 }, lit: true, far: false, ...over,
    });
    const runCars = (sim: RainSim, cars: (t: number) => RainCar[], seconds: number, onStep?: (s: RainSim) => void): void => {
      for (let i = 0, t = 0; i < seconds * 30; i++) { t += 1 / 30; stepRain(sim, { ...env(1, t), wet: 1 }, 1 / 30, cars(t)); onStep?.(sim); }
    };

    it('les gouttes s’écrasent sur le toit d’une voiture et sur les rebords (éclaboussures « dessus »)', () => {
      const sim = make({ ...RUE, ledges: [{ x0: 500, x1: 600, y: 200 }] });
      prefillRain(sim, env(1, 0));
      let roof = 0, ledge = 0;
      runCars(sim, () => [car(300, 0)], 3, (s) => {
        for (const sp of s.splashes) if (sp.top && sp.age < 1 / 30 + 1e-9) { if (Math.abs(sp.y - 314) < 0.01) roof++; else if (Math.abs(sp.y - 200) < 0.01) ledge++; }
      });
      expect(roof).toBeGreaterThan(5);
      expect(ledge).toBeGreaterThan(5);
      // derrière la vitre (doux) : rien ne s'écrase sur le décor
      const soft = make({ ...RUE, ledges: [{ x0: 500, x1: 600, y: 200 }] }, 7, RAIN_BUDGET_WIDE, true);
      prefillRain(soft, env(1, 0));
      let top = 0;
      runCars(soft, () => [car(300, 0)], 2, (s) => { top += s.splashes.filter((sp) => sp.top).length; });
      expect(top).toBe(0);
    });

    it('gerbes des roues : seulement en roulant sur sol mouillé, plus nombreuses avec la vitesse, au budget', () => {
      const count = (v: number, wet: number): number => {
        const sim = make({ ...RUE, puddles: [] });
        let n = 0;
        for (let i = 0, t = 0; i < 60; i++) { t += 1 / 30; stepRain(sim, { ...env(1, t), wet }, 1 / 30, [car(300 + v * t, v)]); n = Math.max(n, sim.sprays.length); }
        return n;
      };
      expect(count(0, 1)).toBe(0);
      expect(count(150, 0)).toBe(0);
      expect(count(150, 1)).toBeGreaterThan(count(40, 1));
      expect(count(400, 1)).toBeLessThanOrEqual(RAIN_BUDGET_WIDE.sprays!);
      // gouttelettes vers l'arrière de la voiture (sens 1 : vers la gauche), jamais sous le sol
      const sim = make({ ...RUE, puddles: [] });
      runCars(sim, (t) => [car(300 + 150 * t, 150)], 1);
      expect(sim.sprays.length).toBeGreaterThan(0);
      expect(sim.sprays.every((p) => p.y <= p.floor + 1e-9)).toBe(true);
      expect(sim.sprays.filter((p) => !p.mist && p.vx < 0).length).toBeGreaterThan(sim.sprays.filter((p) => !p.mist && p.vx > 0).length);
    });

    it('flaque traversée : une grande gerbe par passage, pas à chaque image', () => {
      const world: RainWorld = { ...RUE, puddles: [{ x: 400, y: 330, rx: 30 }] };
      const sim = make(world);
      let bursts = 0, last = -1;
      runCars(sim, (t) => [car(300 + 120 * t, 120)], 2, (s) => { if (s.puddleHit[0] !== last) { last = s.puddleHit[0]!; bursts++; } });
      expect(bursts).toBeGreaterThanOrEqual(1);
      expect(bursts).toBeLessThanOrEqual(3);
      // voiture loin de la flaque (autre voie) : aucune gerbe
      const far = make(world);
      runCars(far, (t) => [car(300 + 120 * t, 120, { y: 400 })], 2);
      expect(far.puddleHit[0]).toBe(-Infinity);
    });
  });
});
