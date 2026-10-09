import { describe, expect, it } from 'vitest';
import { WEATHER_STATES } from '../../../src/core/library/library-types';
import { WEATHER_LABEL, blend, nearestState, smooth, targetOf } from '../../../src/core/library/weather/weather-types';

describe('cibles', () => {
  it('chaque état a des valeurs entre 0 et 1', () => {
    for (const state of WEATHER_STATES) {
      const w = targetOf(state);
      for (const key of ['cloud', 'precip', 'fog', 'wind', 'lightning', 'wet', 'snowCover'] as const) {
        expect(w[key]).toBeGreaterThanOrEqual(0);
        expect(w[key]).toBeLessThanOrEqual(1);
      }
    }
  });
  it('l’orage est le seul à avoir des éclairs ; la neige couvre le sol, la pluie le mouille', () => {
    expect(WEATHER_STATES.filter((s) => targetOf(s).lightning > 0)).toEqual(['storm']);
    expect(targetOf('snow').snowCover).toBeGreaterThan(0.5);
    expect(targetOf('snow').wet).toBe(0);
    expect(targetOf('rain').wet).toBeGreaterThan(0.5);
    expect(targetOf('sun').wet).toBe(0);
  });
  it('nearestState retrouve chaque état', () => {
    for (const state of WEATHER_STATES) expect(nearestState(targetOf(state))).toBe(state);
  });
  it('un libellé français par état', () => {
    expect(WEATHER_LABEL.storm).toBe('Orage');
    expect(Object.keys(WEATHER_LABEL)).toHaveLength(WEATHER_STATES.length);
  });
});

describe('blend', () => {
  it('rend les extrémités et reste continu', () => {
    const a = targetOf('sun');
    const b = targetOf('rain');
    expect(blend(a, b, 0)).toEqual(a);
    expect(blend(a, b, 1)).toEqual(b);
    const mid = blend(a, b, 0.5);
    expect(mid.cloud).toBeCloseTo((a.cloud + b.cloud) / 2);
    expect(blend(a, b, -3)).toEqual(a);
    expect(blend(a, b, 7)).toEqual(b);
  });
  it('pluie → neige : la précipitation passe par zéro, jamais de bascule brute', () => {
    const rain = targetOf('rain');
    const snow = targetOf('snow');
    expect(blend(rain, snow, 0.5).precip).toBeCloseTo(0);
    expect(blend(rain, snow, 0.25).kind).toBe('rain');
    expect(blend(rain, snow, 0.75).kind).toBe('snow');
  });
  it('smooth est monotone entre 0 et 1', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBeCloseTo(0.5);
    expect(smooth(0.25)).toBeLessThan(smooth(0.75));
    expect(smooth(-1)).toBe(0);
    expect(smooth(2)).toBe(1);
  });
});
