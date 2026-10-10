import { describe, expect, it } from 'vitest';
import { WORK_STEPS, worksAt, worksPlan } from '../../../src/core/library/city/shops/works';

describe('chantier du matin', () => {
  it('commence entre 8 h 30 et 9 h 30 et finit entre 11 h 45 et 12 h 20', () => {
    for (let day = 20_000; day < 20_200; day++) {
      const p = worksPlan(3, 'shop-1', day);
      expect(p.start).toBeGreaterThanOrEqual(510);
      expect(p.start).toBeLessThanOrEqual(570);
      expect(p.end).toBeGreaterThanOrEqual(705);
      expect(p.end).toBeLessThanOrEqual(740);
    }
  });
  it('enchaîne toutes les étapes dans l’ordre, sans trou', () => {
    const p = worksPlan(3, 'shop-2', 20_010);
    expect(p.steps.map((s) => s.step)).toEqual(WORK_STEPS);
    expect(p.steps[0]!.from).toBe(p.start);
    for (let i = 1; i < p.steps.length; i++) expect(p.steps[i]!.from).toBe(p.steps[i - 1]!.to);
    expect(p.steps.at(-1)!.to).toBe(p.end);
  });
  it('dit l’étape en cours et son avancement, rien hors du chantier', () => {
    const p = worksPlan(3, 'shop-2', 20_010);
    expect(worksAt(p, p.start - 1)).toBeNull();
    expect(worksAt(p, p.end)).toBeNull();
    const install = p.steps.find((s) => s.step === 'install')!;
    const at = worksAt(p, (install.from + install.to) / 2)!;
    expect(at.step).toBe('install');
    expect(at.progress).toBeCloseTo(0.5, 1);
  });
  it('sans borne basse : identique au comportement d’origine (valeurs figées)', () => {
    const frozen = [
      [3, 'shop-1', 20_000, 518, 731, 587.732],
      [3, 'shop-2', 20_010, 514, 737, 587.006],
      [1, 'shop-0', 20_500, 562, 727, 616.018],
      [7, 'shop-4', 20_123, 536, 726, 598.202],
    ] as const;
    for (const [seed, id, day, start, end, pauseEnd] of frozen) {
      const p = worksPlan(seed, id, day);
      expect(p.start).toBe(start);
      expect(p.end).toBe(end);
      expect(Math.round(p.steps[3]!.to * 1000) / 1000).toBe(pauseEnd);
    }
  });
  it('avec une borne basse : commence après elle (jusqu’à 30 min de plus) et dure au moins 2 h', () => {
    for (let day = 20_000; day < 20_200; day++) {
      const p = worksPlan(3, 'shop-1', day, 600);
      expect(p.start).toBeGreaterThanOrEqual(600);
      expect(p.start).toBeLessThanOrEqual(630);
      expect(p.end - p.start).toBeGreaterThanOrEqual(120);
      expect(p.steps[0]!.from).toBe(p.start);
      expect(p.steps.at(-1)!.to).toBe(p.end);
    }
  });
});
