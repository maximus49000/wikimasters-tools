import { describe, expect, it } from 'vitest';
import { toBadgeModel } from '../../../src/core/pricing/badge';
import type { PriceStats } from '../../../src/core/pricing/stats';

const base: PriceStats = { count: 0, median: null, min: null, max: null, trend: null, reliability: 'none' };

describe('toBadgeModel', () => {
  it("ne rend rien quand il n'y a aucune donnée", () => {
    expect(toBadgeModel(base)).toBeNull();
  });

  it('affiche un badge peu fiable pour une seule transaction', () => {
    const model = toBadgeModel({ ...base, count: 1, median: 11, min: 11, max: 11, reliability: 'low' });
    expect(model).toMatchObject({
      label: '11 WB',
      detail: '1 transaction · peu de données',
      tone: 'low',
    });
    expect(model?.tooltip).toContain('non officiel');
  });

  it('accorde « transactions » au pluriel pour un badge peu fiable', () => {
    const model = toBadgeModel({ ...base, count: 2, median: 5, min: 3, max: 6, reliability: 'low' });
    expect(model?.detail).toBe('2 transactions · peu de données');
  });

  it('affiche fourchette et tendance quand les données sont fiables', () => {
    const model = toBadgeModel({ ...base, count: 5, median: 15, min: 12, max: 20, trend: 'up', reliability: 'ok' });
    expect(model).toMatchObject({ label: '15 WB', detail: '12–20 · 5 transactions ▲', tone: 'ok' });
  });

  it('affiche une flèche vers le bas', () => {
    const model = toBadgeModel({ ...base, count: 4, median: 9, min: 5, max: 12, trend: 'down', reliability: 'ok' });
    expect(model?.detail).toBe('5–12 · 4 transactions ▼');
  });

  it("n'affiche pas de flèche quand la tendance est stable", () => {
    const model = toBadgeModel({ ...base, count: 5, median: 15, min: 12, max: 20, trend: 'flat', reliability: 'ok' });
    expect(model?.detail).toBe('12–20 · 5 transactions');
  });
});
