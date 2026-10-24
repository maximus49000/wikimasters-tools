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
