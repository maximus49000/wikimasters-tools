import { describe, expect, it } from 'vitest';
import { ageLabel, buildChart, niceStep } from '../../../src/core/market/chart-model';

const BOX = { width: 100, height: 50, left: 0, right: 0, top: 0, bottom: 0 };
const DAY = 86_400_000;
const NOW = 10 * DAY;
const s = (t: number, avgBid: number, minBid?: number, maxBid?: number) => ({ t, avgBid, bidCount: 1, minBid, maxBid });

describe('niceStep', () => {
  it('choisit un pas rond', () => {
    expect(niceStep(1000, 4)).toBe(500);
    expect(niceStep(2200, 3)).toBe(1000);
    expect(niceStep(90, 3)).toBe(50);
  });
});

describe('ageLabel', () => {
  it('exprime l’âge en jours, heures, ou maintenant', () => {
    expect(ageLabel(2 * 60_000)).toBe('maintenant');
    expect(ageLabel(20 * 60_000)).toBe('il y a 20 min');
    expect(ageLabel(5 * 3_600_000)).toBe('il y a 5 h');
    expect(ageLabel(3 * DAY + 1)).toBe('il y a 3 j');
    expect(ageLabel(300 * DAY)).toBe('il y a 10 mois');
  });
});

describe('buildChart', () => {
  it('renvoie null sans point', () => {
    expect(buildChart([], BOX, NOW)).toBeNull();
  });

  it('trace sur une échelle à graduations rondes qui englobe toutes les valeurs', () => {
    const model = buildChart([s(NOW - 4 * DAY, 150, 100, 200), s(NOW, 250, 200, 300)], BOX, NOW)!;
    expect(model.yTicks.map((t) => t.value)).toEqual([100, 200, 300]);
    expect(model.yTicks.map((t) => t.y)).toEqual([50, 25, 0]);
    expect(model.max).toBe('M0.0 25.0 L100.0 0.0');
    expect(model.min).toBe('M0.0 50.0 L100.0 25.0');
    expect(model.avg).toBe('M0.0 37.5 L100.0 12.5');
    expect(model.last).toEqual({ max: 300, avg: 250, min: 200 });
    expect(model.dots).toBeNull();
  });

  it('élargit l’échelle à la graduation ronde la plus proche', () => {
    const model = buildChart([s(0, 1340, 1210, 1490), s(10, 1400, 1250, 1560)], BOX, NOW)!;
    expect(model.yTicks[0]!.value).toBeLessThanOrEqual(1210);
    expect(model.yTicks.at(-1)!.value).toBeGreaterThanOrEqual(1560);
  });

  it('place trois repères de temps datés', () => {
    const model = buildChart([s(NOW - 6 * DAY, 1), s(NOW - 3 * DAY, 2), s(NOW, 3)], BOX, NOW)!;
    expect(model.xTicks.map((t) => t.label)).toEqual(['il y a 6 j', 'il y a 3 j', 'maintenant']);
  });

  it('retombe sur la moyenne pour les anciens points sans extrêmes', () => {
    const model = buildChart([s(0, 100), s(10, 200)], BOX, NOW)!;
    expect(model.max).toBe(model.avg);
    expect(model.min).toBe(model.avg);
  });

  it('gère un relevé unique en point isolé, au milieu, même sans variation', () => {
    const model = buildChart([s(NOW, 100, 100, 100)], BOX, NOW)!;
    expect(model.dots?.x).toBe(50);
    expect(model.yTicks.length).toBeGreaterThanOrEqual(2);
  });
});
