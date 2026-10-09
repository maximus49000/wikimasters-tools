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
});
