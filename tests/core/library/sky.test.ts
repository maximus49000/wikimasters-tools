import { describe, expect, it } from 'vitest';
import { mixHex, positionFromTimezone, skyAt, sunTimes } from '../../../src/core/library/sky';

const PARIS = { lat: 48.85, lon: 2.35 };
const near = (value: number, expected: number, tol = 8) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(tol);

describe('sunTimes', () => {
  it('Paris au solstice d’été : lever ≈ 5 h 47, coucher ≈ 21 h 58', () => {
    const t = sunTimes({ y: 2024, m: 6, d: 21 }, PARIS, 120);
    expect(t.kind).toBe('normal');
    if (t.kind === 'normal') {
      near(t.sunrise, 5 * 60 + 47);
      near(t.sunset, 21 * 60 + 58);
    }
  });

  it('Paris au solstice d’hiver : lever ≈ 8 h 42, coucher ≈ 16 h 55', () => {
    const t = sunTimes({ y: 2024, m: 12, d: 21 }, PARIS, 60);
    if (t.kind !== 'normal') throw new Error('attendu normal');
    near(t.sunrise, 8 * 60 + 42);
    near(t.sunset, 16 * 60 + 55);
  });

  it('soleil de minuit et nuit polaire', () => {
    expect(sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 78, lon: 15 }, 120)).toEqual({ kind: 'polar', polar: 'day' });
    expect(sunTimes({ y: 2024, m: 12, d: 21 }, { lat: 78, lon: 15 }, 60)).toEqual({ kind: 'polar', polar: 'night' });
  });
});

describe('positionFromTimezone', () => {
  it('déduit la longitude du fuseau, latitude 45', () => {
    expect(positionFromTimezone(120)).toEqual({ lat: 45, lon: 30 });
    expect(positionFromTimezone(-300)).toEqual({ lat: 45, lon: -75 });
  });
});

describe('mixHex', () => {
  it('mélange deux couleurs', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#102030', '#102030', 0.3)).toBe('#102030');
    expect(mixHex('#000000', '#ffffff', 2)).toBe('#ffffff');
  });
});

describe('skyAt', () => {
  const times = { kind: 'normal', sunrise: 360, sunset: 1200 } as const;

  it('plein jour à midi : soleil visible, pas d’étoiles', () => {
    const sky = skyAt(780, times);
    expect(sky.phase).toBe('day');
    expect(sky.daylight).toBe(1);
    expect(sky.stars).toBe(0);
    expect(sky.sunFrac).toBeCloseTo(0.5, 1);
    expect(sky.moonFrac).toBeNull();
  });

  it('nuit à minuit : étoiles, lune, pas de soleil', () => {
    const sky = skyAt(0, times);
    expect(sky.phase).toBe('night');
    expect(sky.daylight).toBe(0);
    expect(sky.stars).toBe(1);
    expect(sky.sunFrac).toBeNull();
    expect(sky.moonFrac).not.toBeNull();
  });

  it('au lever du soleil : aube, crépuscule fort', () => {
    const sky = skyAt(360, times);
    expect(sky.phase).toBe('dawn');
    expect(sky.twilight).toBeGreaterThan(0.8);
  });

  it('au coucher : crépuscule du soir', () => {
    expect(skyAt(1200, times).phase).toBe('dusk');
  });

  it('les couleurs changent avec la lumière', () => {
    expect(skyAt(780, times).top).not.toBe(skyAt(0, times).top);
  });

  it('polaire : jour permanent ou nuit permanente', () => {
    expect(skyAt(0, { kind: 'polar', polar: 'day' }).daylight).toBe(1);
    expect(skyAt(780, { kind: 'polar', polar: 'night' }).daylight).toBe(0);
  });
});
