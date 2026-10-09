import { describe, expect, it } from 'vitest';
import { WEATHER_STATES } from '../../../src/core/library/library-types';
import { createWeatherClock, steadySource } from '../../../src/core/library/weather/weather-clock';
import { coherent, maxPrecipFor, minCloudFor, targetOf } from '../../../src/core/library/weather/weather-types';
import { realToWeather } from '../../../src/core/library/weather/weather-real';

describe('cohérence pluie / couverture', () => {
  it('pas de pluie sous un ciel dégagé, pluie pleine sous un ciel très couvert', () => {
    expect(maxPrecipFor(0)).toBe(0);
    expect(maxPrecipFor(0.35)).toBe(0);
    expect(maxPrecipFor(0.5)).toBeGreaterThan(0.1);
    expect(maxPrecipFor(0.5)).toBeLessThan(0.2);
    expect(maxPrecipFor(0.8)).toBeGreaterThan(0.5);
    expect(maxPrecipFor(0.95)).toBeCloseTo(1);
    expect(maxPrecipFor(1)).toBe(1);
  });
  it('est croissante', () => {
    let last = -1;
    for (let c = 0; c <= 1.0001; c += 0.05) {
      const v = maxPrecipFor(c);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
  it('minCloudFor est l’inverse de maxPrecipFor', () => {
    for (const p of [0.1, 0.25, 0.5, 0.65, 0.9]) expect(maxPrecipFor(minCloudFor(p))).toBeGreaterThanOrEqual(p - 1e-6);
    expect(minCloudFor(0)).toBeCloseTo(0.35);
    expect(minCloudFor(1)).toBeCloseTo(0.95);
  });
  it('les cibles de chaque état sont déjà cohérentes', () => {
    for (const state of WEATHER_STATES) {
      const w = targetOf(state);
      expect(w.precip).toBeLessThanOrEqual(maxPrecipFor(w.cloud) + 1e-9);
      expect(coherent(w)).toEqual(w);
    }
  });
  it('coherent plafonne et reste idempotente', () => {
    const odd = { ...targetOf('sun'), precip: 0.8 };
    const fixed = coherent(odd);
    expect(fixed.precip).toBe(0);
    expect(coherent(fixed)).toEqual(fixed);
  });
  it('pendant un fondu soleil → orage, la pluie ne devance jamais les nuages', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('sun'), 0);
    clock.setSource(steadySource('storm'), 0);
    expect(clock.read(5_000).precip).toBeLessThan(0.05);
    for (let t = 0; t <= 40_000; t += 500) {
      const w = clock.read(t);
      expect(w.precip).toBeLessThanOrEqual(maxPrecipFor(w.cloud) + 1e-9);
    }
    expect(clock.read(40_000)).toEqual(targetOf('storm'));
  });
  it('la météo réelle est cohérente : forte pluie → ciel très couvert', () => {
    const w = realToWeather({ code: 65, tempC: 10, cloud: 20, precipMm: 6, windKmh: 10, visibilityM: 10000 });
    expect(w.precip).toBeGreaterThan(0.7);
    expect(w.precip).toBeLessThanOrEqual(maxPrecipFor(w.cloud) + 1e-9);
    expect(w.cloud).toBeGreaterThanOrEqual(minCloudFor(w.precip) - 1e-9);
  });
});
