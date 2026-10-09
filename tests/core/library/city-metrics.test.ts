import { describe, expect, it } from 'vitest';
import { cityMetrics } from '../../../src/core/library/city/metrics';

describe('cityMetrics', () => {
  it('range sol, trottoir et deux files du haut vers le bas', () => {
    const m = cityMetrics(340);
    expect(m.ground).toBeCloseTo(340 * 0.78, 5);
    expect(m.walkY).toBeGreaterThan(m.ground);
    expect(m.laneY.far).toBeGreaterThan(m.walkY);
    expect(m.laneY.near).toBeGreaterThan(m.laneY.far);
    expect(m.laneY.near).toBeLessThan(340);
    expect(m.unit).toBeCloseTo(1, 5);
    expect(cityMetrics(170).unit).toBeCloseTo(0.5, 5);
  });
});
