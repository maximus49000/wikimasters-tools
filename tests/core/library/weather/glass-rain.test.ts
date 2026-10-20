// tests/core/library/weather/glass-rain.test.ts
import { describe, expect, it } from 'vitest';
import {
  GLASS_BUDGET_PHONE,
  GLASS_BUDGET_WIDE,
  createGlassSim,
  glassActive,
  prefillGlass,
  stepGlass,
  type GlassRunner,
  type GlassSim,
  type Pane,
} from '../../../../src/core/library/weather/glass-rain';

// Vitre de la maquette (coordonnées de la pièce).
const PANE: Pane = { x: 170, y: 40, w: 660, h: 362 };

const env = (precip: number, t: number, wind = 0.3) => ({ precip, wind, t });

// Fait tourner la simulation à 30 Hz ; `onStep` est appelé après chaque pas.
function run(sim: GlassSim, precip: number, seconds: number, t0 = 0, onStep?: (s: GlassSim) => void): number {
  const dt = 1 / 30;
  let t = t0;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    t += dt;
    stepGlass(sim, env(precip, t), dt);
    onStep?.(sim);
  }
  return t;
}

const runner = (pane: number, x: number, y: number, r: number, vy = 40): GlassRunner => ({ pane, x, y, r, vy, wait: 0, trail: [], vxw: 0, bead: 1e9 });

describe('vitre : moteur des gouttes', () => {
  it('gouttes posées : arrivent progressivement, jamais plus que le budget de la pièce', () => {
    expect(GLASS_BUDGET_PHONE).toEqual({ statics: 220, runners: 12 });
    expect(GLASS_BUDGET_WIDE).toEqual({ statics: 310, runners: 30 });
    const sim = createGlassSim([PANE], 5, GLASS_BUDGET_WIDE);
    expect(sim.statics.length).toBe(0);
    let prev = 0;
    let max = 0;
    run(sim, 1, 40, 0, (s) => {
      expect(s.statics.length - prev).toBeLessThanOrEqual(2 + s.runners.length); // ≤ 40/s (+ perles semées)
      prev = s.statics.length;
      max = Math.max(max, s.statics.length);
      expect(s.runners.length).toBeLessThanOrEqual(30);
      for (const d of s.statics) {
        expect(d.x).toBeGreaterThanOrEqual(PANE.x - 6);
        expect(d.x).toBeLessThanOrEqual(PANE.x + PANE.w + 6);
      }
    });
    expect(max).toBeLessThanOrEqual(310);
    expect(sim.statics.length).toBeGreaterThan(250); // cible 90 + 220 P = 310 atteinte (au fil des absorptions)
    // budget téléphone : 220 posées et 12 coulures au plus
    const phone = createGlassSim([PANE], 5, GLASS_BUDGET_PHONE);
    run(phone, 1, 40, 0, (s) => {
      expect(s.statics.length).toBeLessThanOrEqual(220);
      expect(s.runners.length).toBeLessThanOrEqual(12);
    });
    // bruine : cible plus basse (90 + 220 × 0,15 = 123 arrivées, + 60 perles semées au plus)
    const drizzle = createGlassSim([PANE], 5, GLASS_BUDGET_WIDE);
    run(drizzle, 0.15, 30);
    expect(drizzle.statics.length).toBeLessThanOrEqual(123 + 60);
    expect(drizzle.statics.length).toBeGreaterThan(90);
  });

  it('après une absorption, les gouttes reviennent une à une (pas de rafale de réserve)', () => {
    const sim = createGlassSim([PANE], 9, GLASS_BUDGET_WIDE);
    prefillGlass(sim, env(1, 0));
    sim.runners = [];
    sim.runnerAcc = -1e9; // aucune coulure : seule l'arrivée des gouttes posées compte
    run(sim, 1, 2); // vitre servie : la réserve ne doit pas s'accumuler pendant ce temps
    sim.statics.splice(0, 12); // une coulure vient d'absorber 12 gouttes
    const before = sim.statics.length;
    stepGlass(sim, env(1, 3), 1 / 30);
    expect(sim.statics.length - before).toBeLessThanOrEqual(2); // 40/s × 1/30 s ≈ 1,33
  });

  it('les coulures descendent et absorbent les gouttes sur leur passage', () => {
    const sim = createGlassSim([PANE], 9, GLASS_BUDGET_WIDE);
    const x = PANE.x + 300;
    const column = [0, 1, 2, 3, 4].map((i) => ({ pane: 0, x, y: PANE.y + 60 + i * 30, r: 1.5 }));
    sim.statics.push(...column);
    const R = runner(0, x, PANE.y + 20, 2);
    sim.runners.push(R);
    const y0 = R.y;
    const r0 = R.r;
    run(sim, 0, 2, 0, () => {
      R.vxw = 0; // pas de zigzag : la coulure reste sur la colonne
      R.x = x;
    });
    expect(R.y).toBeGreaterThan(y0 + 100);
    expect(R.trail.length).toBeGreaterThan(10);
    for (const d of column) if (d.y < R.y - 4) expect(sim.statics).not.toContain(d);
    expect(R.r).toBeGreaterThan(r0);
  });

  it('deux coulures qui se touchent fusionnent', () => {
    const sim = createGlassSim([PANE], 11, GLASS_BUDGET_WIDE);
    const a = runner(0, PANE.x + 200, PANE.y + 50, 2);
    const b = runner(0, PANE.x + 200, PANE.y + 54, 2);
    sim.runners.push(a, b);
    stepGlass(sim, env(0, 1), 1 / 30);
    expect(sim.runners.length).toBe(1);
    expect(sim.runners[0]!.r).toBeCloseTo(Math.min(5.5, Math.sqrt(8)), 1);
    // deux vitres différentes : jamais de fusion d'une vitre à l'autre
    const two = createGlassSim([PANE, { ...PANE, x: PANE.x }], 11, GLASS_BUDGET_WIDE);
    two.runners.push(runner(0, PANE.x + 200, PANE.y + 50, 2), runner(1, PANE.x + 200, PANE.y + 54, 2));
    stepGlass(two, env(0, 1), 1 / 30);
    expect(two.runners.length).toBe(2);
  });

  it('pluie arrêtée : gouttes qui sèchent progressivement, glassActive finit à faux', () => {
    const sim = createGlassSim([PANE], 13, GLASS_BUDGET_WIDE);
    let t = run(sim, 0.8, 30);
    expect(glassActive(sim)).toBe(true);
    const n0 = sim.statics.length;
    expect(n0).toBeGreaterThan(200);
    // pas de naissance, et rien ne disparaît d'un coup : au plus quelques gouttes par pas (absorbées ou séchées)
    let prev = n0;
    let prevRunners = sim.runners.length;
    t = run(sim, 0, 10, t, (s) => {
      expect(s.runners.length).toBeLessThanOrEqual(prevRunners);
      prevRunners = s.runners.length;
      expect(prev - s.statics.length).toBeLessThanOrEqual(6);
      prev = s.statics.length;
    });
    // 10 s après : les gouttes ont rétréci, aucune n'a encore disparu en masse (séchage 20-60 s)
    expect(sim.statics.length).toBeGreaterThan(n0 * 0.6);
    t = run(sim, 0, 80, t);
    expect(sim.statics.length).toBe(0);
    expect(sim.runners.length).toBe(0);
    expect(sim.trails.length).toBe(0);
    expect(glassActive(sim)).toBe(false);
    // la pluie reprend : les gouttes reviennent une à une
    run(sim, 0.8, 1, t);
    expect(sim.statics.length).toBeGreaterThan(0);
    expect(sim.statics.length).toBeLessThanOrEqual(45);
  });

  it('plusieurs vitres : budget réparti au prorata, total respecté ; aucune vitre : aucun plantage', () => {
    const big: Pane = { x: 0, y: 0, w: 600, h: 400 };
    const small: Pane = { x: 700, y: 0, w: 200, h: 400 };
    const sim = createGlassSim([big, small], 17, GLASS_BUDGET_PHONE);
    run(sim, 1, 40, 0, (s) => {
      expect(s.statics.length).toBeLessThanOrEqual(220);
      expect(s.runners.length).toBeLessThanOrEqual(12);
      for (const d of [...s.statics, ...s.runners]) {
        const p = d.pane === 0 ? big : small;
        expect(d.x).toBeGreaterThanOrEqual(p.x - 8);
        expect(d.x).toBeLessThanOrEqual(p.x + p.w + 8);
      }
    });
    const nBig = sim.statics.filter((d) => d.pane === 0).length;
    const nSmall = sim.statics.filter((d) => d.pane === 1).length;
    expect(nBig + nSmall).toBeGreaterThan(180);
    expect(nBig / (nBig + nSmall)).toBeGreaterThan(0.65); // 75 % de la surface
    expect(nBig / (nBig + nSmall)).toBeLessThan(0.85);
    // aucune vitre, ou vitre dégénérée : rien ne plante, rien n'apparaît
    const none = createGlassSim([], 1, GLASS_BUDGET_PHONE);
    run(none, 1, 5);
    prefillGlass(none, env(1, 0));
    expect(glassActive(none)).toBe(false);
    const flat = createGlassSim([{ x: 0, y: 0, w: 0, h: 300 }], 1, GLASS_BUDGET_PHONE);
    run(flat, 1, 5);
    expect(flat.statics.length).toBe(0);
    // dt hors bornes : ignoré ou borné à 0,25 s
    stepGlass(sim, env(1, 50), Number.NaN);
    stepGlass(sim, env(1, 50), -3);
    stepGlass(sim, env(1, 50), 1000);
    expect(sim.statics.length).toBeLessThanOrEqual(220);
  });

  it('pluie déjà là à l’ouverture : vitre déjà couverte de gouttes et de quelques traces', () => {
    const sim = createGlassSim([PANE], 19, GLASS_BUDGET_WIDE);
    prefillGlass(sim, env(0.6, 0));
    expect(sim.statics.length).toBe(Math.round(90 + 220 * 0.6));
    expect(sim.trails.length).toBeGreaterThan(0);
    for (const tr of sim.trails) {
      expect(tr.length).toBeGreaterThan(1);
      expect(tr[tr.length - 1]!.age).toBeLessThan(8);
    }
    // la suite continue sans à-coup
    let prev = sim.statics.length;
    run(sim, 0.6, 3, 0, (s) => {
      expect(Math.abs(s.statics.length - prev)).toBeLessThanOrEqual(6);
      prev = s.statics.length;
    });
    // sans pluie : rien n'est posé
    const dry = createGlassSim([PANE], 19, GLASS_BUDGET_WIDE);
    prefillGlass(dry, env(0, 0));
    expect(glassActive(dry)).toBe(false);
    // budget téléphone respecté
    const phone = createGlassSim([PANE], 19, GLASS_BUDGET_PHONE);
    prefillGlass(phone, env(1, 0));
    expect(phone.statics.length).toBe(220);
  });

  it('déterministe à graine égale', () => {
    const a = createGlassSim([PANE], 23, GLASS_BUDGET_WIDE);
    const b = createGlassSim([PANE], 23, GLASS_BUDGET_WIDE);
    prefillGlass(a, env(0.7, 0));
    prefillGlass(b, env(0.7, 0));
    run(a, 0.7, 15);
    run(b, 0.7, 15);
    const snap = (s: GlassSim) => JSON.stringify({ st: s.statics, ru: s.runners, tr: s.trails });
    expect(snap(a)).toBe(snap(b));
    const c = createGlassSim([PANE], 24, GLASS_BUDGET_WIDE);
    prefillGlass(c, env(0.7, 0));
    run(c, 0.7, 15);
    expect(snap(c)).not.toBe(snap(a));
  });
});
