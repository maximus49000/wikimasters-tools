import { describe, expect, it } from 'vitest';
import { buildChart } from '../../../src/core/market/chart-model';

const BOX = { width: 100, height: 50, padX: 0, padY: 0 };
const s = (t: number, avgBid: number, minBid?: number, maxBid?: number) => ({ t, avgBid, bidCount: 1, minBid, maxBid });

describe('buildChart', () => {
  it('renvoie null sans point', () => {
    expect(buildChart([], BOX)).toBeNull();
  });

  it('trace max, moyenne et min sur la même échelle', () => {
    const model = buildChart([s(0, 150, 100, 200), s(10, 250, 200, 300)], BOX)!;
    expect([model.yMin, model.yMax]).toEqual([100, 300]);
    expect(model.max).toBe('M0.0 25.0 L100.0 0.0');
    expect(model.min).toBe('M0.0 50.0 L100.0 25.0');
    expect(model.avg).toBe('M0.0 37.5 L100.0 12.5');
    expect(model.last).toEqual({ max: 300, avg: 250, min: 200 });
    expect(model.dots).toBeNull();
  });

  it('retombe sur la moyenne pour les anciens points sans extrêmes', () => {
    const model = buildChart([s(0, 100), s(10, 200)], BOX)!;
    expect(model.max).toBe(model.avg);
    expect(model.min).toBe(model.avg);
  });

  it('gère un relevé unique en point isolé, au milieu', () => {
    const model = buildChart([s(5, 100, 80, 120)], BOX)!;
    expect(model.dots?.x).toBe(50);
  });
});
