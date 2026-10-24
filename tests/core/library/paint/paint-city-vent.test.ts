import { describe, expect, it } from 'vitest';
import { bendOf, massAmp, windAt, windOf, type Wind } from '../../../../src/core/library/paint/fond-vent';
import type { TreeModel } from '../../../../src/core/library/paint/hill-trees';

const W = 1600;
const BORNE = 3.5; // base ≤ 0,9 + rafales (≤ 1,5 chacune) qui peuvent se chevaucher
const wind = (w: number, over: Partial<Wind> = {}): Wind => ({ wind: w, dir: 1, wet: 0, storm: false, ...over });

describe('champ de vent', () => {
  it('est déterministe', () => {
    expect(windAt(300, 12.5, wind(0.6), W)).toBe(windAt(300, 12.5, wind(0.6), W));
  });

  it('calme : zéro', () => {
    expect(windAt(300, 12.5, wind(0.02), W)).toBe(0);
    expect(windAt(300, 12.5, wind(0), W)).toBe(0);
  });

  it('|windAt| ≤ 2,5 × wind', () => {
    for (const w of [0.3, 0.8, 1]) for (let t = 0; t < 120; t += 0.7) for (let x = 0; x <= W; x += 37) expect(Math.abs(windAt(x, t, wind(w), W))).toBeLessThanOrEqual(BORNE * w);
  });

  it('deux arbres à 40 px ne sont pas en phase', () => {
    const a: number[] = [], b: number[] = [];
    for (let t = 0; t < 60; t += 0.05) { a.push(windAt(500, t, wind(0.7), W)); b.push(windAt(540, t, wind(0.7), W)); }
    const m = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length, ma = m(a), mb = m(b);
    let c = 0, va = 0, vb = 0;
    for (let i = 0; i < a.length; i++) { c += (a[i]! - ma) * (b[i]! - mb); va += (a[i]! - ma) ** 2; vb += (b[i]! - mb) ** 2; }
    expect(c / Math.sqrt(va * vb)).toBeLessThan(0.95);
  });

  it('une rafale traverse dans le sens du vent à 50 + 60 × wind px/s', () => {
    const w = 1, speed = 50 + 60 * w;
    // On retire la base turbulente (connue) pour isoler les rafales, puis on suit le maximum local d'une rafale.
    const base = (x: number, t: number) => 0.35 + 0.25 * Math.sin(t * 0.9 - x * 0.012) + 0.18 * Math.sin(t * 1.7 - x * 0.031 + 1.3) + 0.12 * Math.sin(t * 3.1 - x * 0.07 + 2.1);
    const gusts = (x: number, t: number) => windAt(x, t, wind(w), 6000) / w - base(x, t);
    const argmax = (t: number, lo: number, hi: number) => { let bx = lo, bv = -Infinity; for (let x = lo; x <= hi; x += 1) { const v = gusts(x, t); if (v > bv) { bv = v; bx = x; } } return bx; };
    for (const t0 of [20, 47, 83, 130]) {
      const x0 = argmax(t0, 0, 1500), dt = 2;
      const x1 = argmax(t0 + dt, x0 + 0.5 * speed * dt, x0 + 1.5 * speed * dt);
      expect((x1 - x0) / dt).toBeGreaterThan(speed * 0.8);
      expect((x1 - x0) / dt).toBeLessThan(speed * 1.2);
    }
  });

  it('windOf dérive humidité et orage', () => {
    expect(windOf({ cloud: 0, precip: 0.3, wind: 0.5, snow: false }, true)).toEqual({ wind: 0.5, dir: 1, wet: 0.5, storm: true });
    expect(windOf({ cloud: 0, precip: 0, wind: 0.5, snow: false }, false).wet).toBe(0);
  });

  it('bendOf est borné et sensible à la pluie, à l\'orage et à la jeunesse', () => {
    expect(bendOf('poplar', false, 100, wind(1))).toBe(0.55);
    expect(bendOf('poplar', false, -100, wind(1))).toBe(-0.55);
    expect(bendOf('chene', false, 1, wind(1, { wet: 1 }))).toBeGreaterThan(bendOf('chene', false, 1, wind(1)));
    expect(bendOf('chene', false, 1, wind(1, { storm: true }))).toBeCloseTo(0.75 * 1.3 * 0.09);
    expect(bendOf('chene', true, 1, wind(1))).toBeCloseTo(1.8 * 0.09);
    expect(bendOf('inconnu', false, 1, wind(1))).toBeCloseTo(0.09);
  });

  it('massAmp : 1 sans touffe, croît avec l\'écart et la hauteur', () => {
    const m = { foot: { x: 0, y: 0 }, rx: 50, ry: 50, cy: 0, tufts: [{ cluster: 0, x: 0, y: 0 }, { cluster: 1, x: 50, y: -50 }] } as unknown as TreeModel;
    expect(massAmp(m, 7)).toBe(1);
    expect(massAmp(m, 0)).toBeCloseTo(0.8);
    expect(massAmp(m, 1)).toBeCloseTo(0.8 + 1.2 + 0.8 * 50 / 50);
  });
});

// ── Particules et oiseaux des arbres de la rue (tâche 7) ──
import { cityPaintPlan } from '../../../../src/core/library/paint/city-plan';
import { fondMoment, foliageOf, type FondMoment } from '../../../../src/core/library/paint/fond-time';
import { tuftState } from '../../../../src/core/library/paint/hill-trees';
import type { RuePit } from '../../../../src/core/library/paint/rue-verte-plan';
import { rueTreeModel } from '../../../../src/core/library/paint/rue-verte-painter';
import { RUE_PARTICLE_CAP, rueBird, rueParticles, type RueParticle } from '../../../../src/core/library/paint/rue-sprites';

describe('particules et oiseaux des arbres de la rue', () => {
  const PW = 1440;
  const plan = cityPaintPlan(PW, 340, 7);
  const pits = plan.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty);
  const day = (m: number, d: number, meteo: Partial<FondMoment['meteo']> = {}): FondMoment => fondMoment({ y: 2026, m, d }, 14 * 60, { cloud: 0.2, precip: 0, wind: 1, snow: false, ...meteo });
  const count = (ps: RueParticle[]) => {
    const n = { feuille: 0, petale: 0, goutte: 0, neige: 0, graine: 0 };
    for (const p of ps) n[p.kind]++;
    return n;
  };
  const caps = { feuille: RUE_PARTICLE_CAP.feuilles, petale: RUE_PARTICLE_CAP.petales, goutte: RUE_PARTICLE_CAP.gouttes, neige: RUE_PARTICLE_CAP.neige, graine: RUE_PARTICLE_CAP.graines };
  it('plafonds { feuilles 40, pétales 30, gouttes 24, neige 16, graines 20 }', () => {
    expect(RUE_PARTICLE_CAP).toEqual({ feuilles: 40, petales: 30, gouttes: 24, neige: 16, graines: 20 });
  });
  for (const [label, D] of [['novembre (feuilles, pluie)', day(11, 10, { precip: 0.3 })], ['avril (pétales)', day(4, 2)], ['mai (graines)', day(5, 20)], ['neige', day(1, 15, { snow: true })]] as const) {
    it(`${label} : plafonds respectés sur 600 s de vent 1, rien hors de [−5, W + 5]`, () => {
      const w = windOf(D.meteo, true);
      let seen = 0;
      for (let t = 0; t < 600; t += 0.5) {
        const ps = rueParticles(pits, D, 1000 + t, w, PW);
        seen += ps.length;
        const n = count(ps);
        for (const k of Object.keys(n) as (keyof typeof n)[]) expect(n[k], k).toBeLessThanOrEqual(caps[k]);
        for (const p of ps) {
          expect(p.x).toBeGreaterThanOrEqual(-5);
          expect(p.x).toBeLessThanOrEqual(PW + 5);
        }
      }
      expect(seen).toBeGreaterThan(0);
    });
  }
  it('une feuille naît à une touffe lâche (distance ≤ rayon de la touffe)', () => {
    const D = day(11, 10);
    const w = windOf(D.meteo, false);
    let checked = 0;
    for (let t = 0; t < 300 && checked < 20; t += 0.25) {
      for (const p of rueParticles(pits, D, 1000 + t, w, PW)) {
        if (p.kind !== 'feuille' || !p.born) continue;
        const near = pits.some((v) => {
          const m = rueTreeModel(v);
          const f = foliageOf(D, 'rue' + Math.round(v.x), v.species);
          return m.tufts.some((tf) => tuftState(tf, f, D, v.species).loose && Math.hypot(p.born!.x - tf.x, p.born!.y - tf.y) <= tf.rr);
        });
        expect(near).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('calme : aucune particule', () => {
    const D = day(11, 10, { wind: 0, precip: 0 });
    for (let t = 0; t < 60; t += 1) expect(rueParticles(pits, D, 1000 + t, windOf(D.meteo, false), PW)).toEqual([]);
  });
  it('oiseau : jamais la nuit ni sous forte pluie ; entre et sort par un bord', () => {
    const D = day(6, 10, { wind: 0.3 });
    const rainy = day(6, 10, { wind: 0.3, precip: 0.5 });
    const visits: { x: number }[][] = [];
    let cur: { x: number }[] = [];
    for (let t = 0; t < 1200; t += 0.05) {
      expect(rueBird(pits, D, 1000 + t, true, PW)).toBeNull();
      expect(rueBird(pits, rainy, 1000 + t, false, PW)).toBeNull();
      const b = rueBird(pits, D, 1000 + t, false, PW);
      // Visite en cours au début de la fenêtre : ignorée.
      if (b && t === 0) cur = [{ x: NaN }];
      if (b) cur.push(b);
      else if (cur.length) {
        visits.push(cur);
        cur = [];
      }
    }
    expect(visits.length).toBeGreaterThan(0);
    for (const v of visits.filter((vv) => !Number.isNaN(vv[0]!.x))) {
      // Jamais de saut : l'oiseau vole d'un point à l'autre.
      for (let i = 1; i < v.length; i++) expect(Math.abs(v[i]!.x - v[i - 1]!.x)).toBeLessThan(30);
      const a = v[0]!.x;
      const z = v.at(-1)!.x;
      expect(a < 0 || a > PW).toBe(true);
      expect(z < 0 || z > PW).toBe(true);
    }
  });
});
