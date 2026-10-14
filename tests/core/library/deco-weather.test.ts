import { describe, expect, it } from 'vitest';
import { BAROMETER_ANGLE, iconOf, shownTempC } from '../../../src/core/library/deco-weather';
import { plausibleTempC } from '../../../src/core/library/weather/weather-plan';

const now = new Date('2026-10-14T12:00:00Z');
const base = { realTempC: null, lat: 47.47, now, state: 'cloudy' as const, night: false };

describe('météo des météomètres', () => {
  it('la mesure réelle passe avant la température plausible', () => {
    expect(shownTempC({ ...base, realTempC: 9.6 })).toBe(10);
  });
  it('sinon, la température plausible du lieu, arrondie, plus fraîche la nuit', () => {
    expect(shownTempC(base)).toBe(Math.round(plausibleTempC(47.47, now)));
    expect(shownTempC({ ...base, night: true })).toBe(Math.round(plausibleTempC(47.47, now) - 2));
  });
  it('jamais au-dessus de 0 °C quand il neige', () => {
    expect(shownTempC({ ...base, state: 'snow' })).toBeLessThanOrEqual(0);
  });
  it('angle du baromètre par état, du plus mauvais au plus beau', () => {
    expect(BAROMETER_ANGLE).toEqual({ storm: -118, rain: -70, snow: -55, drizzle: -45, fog: -20, cloudy: 0, sun: 70 });
  });
  it('lune à la place du soleil la nuit', () => {
    expect(iconOf('sun', true)).toBe('moon');
    expect(iconOf('sun', false)).toBe('sun');
    expect(iconOf('rain', true)).toBe('rain');
  });
});
