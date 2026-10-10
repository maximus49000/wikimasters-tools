import { describe, expect, it } from 'vitest';
import { MOVING_STEPS, movingAt, movingPlan } from '../../../src/core/library/city/shops/moving';

describe('déménagement du matin', () => {
  it('est déterministe, commence entre 8 h et 8 h 30 et finit entre 9 h 30 et 10 h', () => {
    expect(movingPlan(3, 'shop-1', 20_000, 'relet')).toEqual(movingPlan(3, 'shop-1', 20_000, 'relet'));
    for (let day = 20_000; day < 20_200; day++) {
      const p = movingPlan(3, 'shop-1', day, 'relet');
      expect(p.start).toBeGreaterThanOrEqual(480);
      expect(p.start).toBeLessThanOrEqual(510);
      expect(p.end).toBeGreaterThanOrEqual(570);
      expect(p.end).toBeLessThanOrEqual(600);
    }
  });
  it('décale début et fin de `offsetMin`', () => {
    const a = movingPlan(3, 'shop-1', 20_000, 'relet');
    const b = movingPlan(3, 'shop-1', 20_000, 'relet', 45);
    expect(b.start).toBe(a.start + 45);
    expect(b.end).toBe(a.end + 45);
  });
  it('enchaîne les étapes sans trou et couvre [start, end[', () => {
    const p = movingPlan(3, 'shop-2', 20_010, 'relet');
    expect(p.steps.map((s) => s.step)).toEqual(MOVING_STEPS);
    expect(p.steps[0]!.from).toBe(p.start);
    for (let i = 1; i < p.steps.length; i++) expect(p.steps[i]!.from).toBe(p.steps[i - 1]!.to);
    expect(p.steps.at(-1)!.to).toBe(p.end);
    expect(p.outOnly).toBe(false);
    expect(p.inOnly).toBe(false);
  });
  it('vers « À vendre » : on sort sans rien rentrer ; depuis « À vendre » : on rentre sans rien sortir', () => {
    const out = movingPlan(3, 'shop-2', 20_010, 'to-sale');
    expect(out.outOnly).toBe(true);
    expect(out.steps.some((s) => s.step === 'carry-in' && s.to > s.from)).toBe(false);
    expect(out.steps.some((s) => s.step === 'carry-out')).toBe(true);
    const inn = movingPlan(3, 'shop-2', 20_010, 'from-sale');
    expect(inn.inOnly).toBe(true);
    expect(inn.steps.some((s) => s.step === 'carry-out' && s.to > s.from)).toBe(false);
    expect(inn.steps.some((s) => s.step === 'carry-in')).toBe(true);
    for (const p of [out, inn]) {
      expect(p.steps[0]!.from).toBe(p.start);
      for (let i = 1; i < p.steps.length; i++) expect(p.steps[i]!.from).toBe(p.steps[i - 1]!.to);
      expect(p.steps.at(-1)!.to).toBe(p.end);
    }
  });
  it('dit l’étape en cours, rien avant start ni à partir de end', () => {
    const p = movingPlan(3, 'shop-2', 20_010, 'relet');
    expect(movingAt(p, p.start - 1)).toBeNull();
    expect(movingAt(p, p.end)).toBeNull();
    for (let m = p.start; m < p.end; m += 3) {
      const at = movingAt(p, m)!;
      expect(at.progress).toBeGreaterThanOrEqual(0);
      expect(at.progress).toBeLessThan(1);
    }
    const out = p.steps.find((s) => s.step === 'carry-out')!;
    const at = movingAt(p, (out.from + out.to) / 2)!;
    expect(at.step).toBe('carry-out');
    expect(at.progress).toBeCloseTo(0.5, 1);
  });
});
