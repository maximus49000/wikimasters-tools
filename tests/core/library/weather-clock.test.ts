import { describe, expect, it } from 'vitest';
import { createWeatherClock, lightningAt, rainbowOf, steadySource, weatherFlags } from '../../../src/core/library/weather/weather-clock';
import { targetOf } from '../../../src/core/library/weather/weather-types';

describe('WeatherClock', () => {
  it('rend la source telle quelle au premier réglage', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('rain'), 0);
    expect(clock.read(0)).toEqual(targetOf('rain'));
  });
  it('fond d’une source à l’autre en 30 s, sans saut', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('sun'), 0);
    clock.setSource(steadySource('storm'), 1000);
    expect(clock.read(1000)).toEqual(targetOf('sun'));
    const mid = clock.read(16_000);
    expect(mid.cloud).toBeGreaterThan(targetOf('sun').cloud);
    expect(mid.cloud).toBeLessThan(targetOf('storm').cloud);
    expect(clock.read(31_000)).toEqual(targetOf('storm'));
    expect(clock.read(90_000)).toEqual(targetOf('storm'));
  });
  it('un changement en plein fondu part de la valeur affichée', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('sun'), 0);
    clock.setSource(steadySource('storm'), 0);
    const shown = clock.read(15_000);
    clock.setSource(steadySource('fog'), 15_000);
    expect(clock.read(15_000)).toEqual(shown);
  });
});

describe('éclairs', () => {
  it('seulement par orage, brefs, et jamais plus d’un par fenêtre de 3 s', () => {
    expect(lightningAt(targetOf('rain'), 12_345, 1)).toBeNull();
    const storm = targetOf('storm');
    const STEP = 10;
    const WINDOW = 3000;
    let windowsWithFlash = 0;
    for (let win = 0; win < 200; win++) {
      const hits: { i: number; x: number; strength: number }[] = [];
      for (let t = win * WINDOW; t < (win + 1) * WINDOW; t += STEP) {
        const f = lightningAt(storm, t, 7);
        if (!f) continue;
        expect(f.strength).toBeGreaterThan(0);
        expect(f.strength).toBeLessThanOrEqual(1);
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.x).toBeLessThan(1);
        hits.push({ i: (t - win * WINDOW) / STEP, x: f.x, strength: f.strength });
      }
      if (hits.length === 0) continue;
      windowsWithFlash++;
      // un seul éclair : échantillons consécutifs, même abscisse, durée <= 150 ms
      for (let k = 1; k < hits.length; k++) {
        expect(hits[k]!.i).toBe(hits[k - 1]!.i + 1);
        expect(hits[k]!.x).toBe(hits[0]!.x);
      }
      expect((hits[hits.length - 1]!.i - hits[0]!.i) * STEP).toBeLessThanOrEqual(150);
    }
    expect(windowsWithFlash).toBeGreaterThanOrEqual(60);
    expect(windowsWithFlash).toBeLessThanOrEqual(120);
  });
  it('est déterministe', () => {
    const storm = targetOf('storm');
    for (let t = 0; t < 60_000; t += 20) expect(lightningAt(storm, t, 3)).toEqual(lightningAt(storm, t, 3));
  });
});

describe('arc-en-ciel', () => {
  it('apparaît à l’éclaircie sur sol mouillé, sous un soleil assez haut', () => {
    const after = { ...targetOf('sun'), wet: 0.7 };
    expect(rainbowOf(after, 1)).toBeGreaterThan(0.3);
    expect(rainbowOf(after, 0.2)).toBe(0);
    expect(rainbowOf(targetOf('sun'), 1)).toBe(0);
    expect(rainbowOf(targetOf('rain'), 1)).toBe(0);
  });
});

describe('drapeaux', () => {
  it('hystérésis sur le ciel sombre et la pluie', () => {
    const off = { gloom: false, rainy: false };
    expect(weatherFlags({ ...targetOf('cloudy'), cloud: 0.75 }, off).gloom).toBe(false);
    const on = weatherFlags({ ...targetOf('rain') }, off);
    expect(on).toEqual({ gloom: true, rainy: true });
    expect(weatherFlags({ ...targetOf('rain'), cloud: 0.72, precip: 0.25 }, on)).toEqual({ gloom: true, rainy: true });
    expect(weatherFlags({ ...targetOf('cloudy'), cloud: 0.6 }, on)).toEqual({ gloom: false, rainy: false });
    expect(weatherFlags(targetOf('snow'), off).rainy).toBe(false);
  });
});
