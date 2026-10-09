// tests/core/library/weather-plan.test.ts
import { describe, expect, it } from 'vitest';
import { WEATHER_STATES } from '../../../src/core/library/library-types';
import { EPOCH_TICKS, TICK_MS, WEATHER_SEED, epochStates, plausibleTempC, weatherAtRandom } from '../../../src/core/library/weather/weather-plan';

const EPOCH_MS = EPOCH_TICKS * TICK_MS;
const ctx = { seed: WEATHER_SEED, lat: 48 };

describe('température plausible', () => {
  it('froid l’hiver, doux l’été, chaud sous les tropiques, inversé au sud', () => {
    expect(plausibleTempC(48, new Date(2026, 0, 15))).toBeLessThan(2);
    expect(plausibleTempC(48, new Date(2026, 6, 15))).toBeGreaterThan(14);
    expect(plausibleTempC(5, new Date(2026, 0, 15))).toBeGreaterThan(20);
    expect(plausibleTempC(-40, new Date(2026, 6, 15))).toBeLessThan(plausibleTempC(-40, new Date(2026, 0, 15)));
  });
});

describe('saison en UTC', () => {
  it('même jour UTC, même température, quelle que soit l’heure', () => {
    expect(plausibleTempC(48, new Date(Date.UTC(2026, 0, 1, 0, 30)))).toBe(plausibleTempC(48, new Date(Date.UTC(2026, 0, 1, 23, 30))));
  });
  it('au passage d’une année UTC, le jour de l’année est continu (pas de saut d’un an)', () => {
    const a = plausibleTempC(48, new Date(Date.UTC(2025, 11, 31, 23, 30)));
    const b = plausibleTempC(48, new Date(Date.UTC(2026, 0, 1, 0, 30)));
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });
});

describe('époque', () => {
  it('commence et finit par « nuageux » et ne saute jamais un palier', () => {
    for (let epoch = 1000; epoch < 1060; epoch++) {
      const states = epochStates(WEATHER_SEED, epoch, 48);
      expect(states).toHaveLength(EPOCH_TICKS);
      expect(states[0]).toBe('cloudy');
      expect(states[EPOCH_TICKS - 1]).toBe('cloudy');
      for (let i = 1; i < states.length; i++) {
        expect(!(states[i - 1] === 'sun' && states[i] === 'storm')).toBe(true);
        expect(!(states[i - 1] === 'storm' && states[i] === 'sun')).toBe(true);
        expect(!(states[i - 1] === 'sun' && states[i] === 'rain')).toBe(true);
      }
    }
  });
  it('est déterministe', () => {
    expect(epochStates(WEATHER_SEED, 4242, 48)).toEqual(epochStates(WEATHER_SEED, 4242, 48));
  });
  it('varie : sur 400 époques on voit les sept états', () => {
    const seen = new Set<string>();
    // Latitude 60 : froid une partie de l'année → la neige est possible ; le reste vient de l'été et de l'hiver tirés par l'époque.
    for (let epoch = 1; epoch <= 400; epoch++) for (const s of epochStates(WEATHER_SEED, epoch * 37, 60)) seen.add(s);
    expect([...seen].sort()).toEqual([...WEATHER_STATES].sort());
  });
  it('jamais de neige sous les tropiques', () => {
    for (let epoch = 0; epoch < 200; epoch++) expect(epochStates(WEATHER_SEED, epoch * 11, 5)).not.toContain('snow');
  });
});

describe('weatherAtRandom', () => {
  it('est continu : deux instants voisins donnent des valeurs voisines, y compris aux frontières de tick et d’époque', () => {
    const edges = [0, 1, 2, 17, 89, 90, 91].map((n) => 5000 * EPOCH_MS + n * TICK_MS);
    for (const edge of edges) {
      const before = weatherAtRandom(ctx, edge - 50);
      const after = weatherAtRandom(ctx, edge + 50);
      for (const key of ['cloud', 'precip', 'fog', 'wind', 'lightning', 'wet', 'snowCover'] as const) {
        expect(Math.abs(before[key] - after[key])).toBeLessThan(0.02);
      }
    }
  });
  it('est déterministe et borné', () => {
    const now = 1_790_000_000_000;
    expect(weatherAtRandom(ctx, now)).toEqual(weatherAtRandom(ctx, now));
    for (let i = 0; i < 300; i++) {
      const w = weatherAtRandom(ctx, now + i * 97_000);
      for (const key of ['cloud', 'precip', 'fog', 'wind', 'lightning', 'wet', 'snowCover'] as const) {
        expect(w[key]).toBeGreaterThanOrEqual(0);
        expect(w[key]).toBeLessThanOrEqual(1);
      }
    }
  });
  it('le sol se mouille sous la pluie puis sèche', () => {
    // Époque d'été (mi-juillet 1972) : à 48° la pluie ne gèle pas.
    let wettest = 0;
    let afterRain = 1;
    let sawRain = false;
    for (let i = 0; i < EPOCH_TICKS * 40 && !(sawRain && afterRain < 0.05); i++) {
      const w = weatherAtRandom(ctx, 3720 * EPOCH_MS + i * TICK_MS);
      if (w.precip > 0.5 && w.kind === 'rain') {
        sawRain = true;
        wettest = Math.max(wettest, w.wet);
      }
      if (sawRain && w.precip === 0) afterRain = Math.min(afterRain, w.wet);
    }
    expect(sawRain).toBe(true);
    expect(wettest).toBeGreaterThan(0.4);
    expect(afterRain).toBeLessThan(0.05);
  });
  it('ne dépend pas de l’ordre des appels pour deux latitudes du même degré', () => {
    // Époques d'hiver où 47,6° et 48,4° n'ont pas la même température par rapport aux seuils (-1, 0, 2 °C) de byTemperature.
    const straddle = (epoch: number): boolean => {
      const date = new Date(epoch * EPOCH_MS);
      const lo = plausibleTempC(47.6, date);
      const hi = plausibleTempC(48.4, date);
      return [-1, 0, 2].some((threshold) => Math.min(lo, hi) < threshold && threshold <= Math.max(lo, hi));
    };
    const epochs: number[] = [];
    for (let epoch = 10_000; epochs.length < 12 && epoch < 14_000; epoch++) if (straddle(epoch)) epochs.push(epoch);
    expect(epochs.length).toBe(12);
    const evict = (): void => {
      for (let k = 0; k < 80; k++) epochStates(WEATHER_SEED, 500_000 + k, 48);
    };
    for (const epoch of epochs) {
      evict();
      const lowFirst = epochStates(WEATHER_SEED, epoch, 47.6);
      const highSecond = epochStates(WEATHER_SEED, epoch, 48.4);
      evict();
      const highFirst = epochStates(WEATHER_SEED, epoch, 48.4);
      const lowSecond = epochStates(WEATHER_SEED, epoch, 47.6);
      expect(highSecond).toEqual(lowFirst);
      expect(highFirst).toEqual(lowFirst);
      expect(lowSecond).toEqual(lowFirst);
    }
  });
  it('reste continu à la frontière d’une époque qui finit sur un sol encore mouillé', () => {
    let found = false;
    for (let epoch = 3720; epoch < 3900 && !found; epoch++) {
      const edge = (epoch + 1) * EPOCH_MS;
      const before = weatherAtRandom(ctx, edge - 50);
      if (before.wet <= 0.05) continue;
      found = true;
      const after = weatherAtRandom(ctx, edge + 50);
      expect(Math.abs(before.wet - after.wet)).toBeLessThan(0.02);
    }
    expect(found).toBe(true);
  });
});
