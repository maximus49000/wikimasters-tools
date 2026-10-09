import { describe, expect, it } from 'vitest';
import { beamGain } from '../../../src/core/library/light/attenuation';
import { lampNeed, skyLevel, skylightAt } from '../../../src/core/library/light/ambient';

const E45 = Math.PI / 4;
describe('beamGain', () => {
  it('est nul sans soleil et plus fort quand le soleil est haut', () => {
    expect(beamGain(0, 0, 0)).toBe(0);
    expect(beamGain(1.0, 0, 0)).toBeGreaterThan(beamGain(0.15, 0, 0));
  });
  it('baisse avec les nuages, où qu’ils soient, et proportionnellement au soleil masqué', () => {
    expect(beamGain(E45, 1, 0)).toBeLessThan(beamGain(E45, 0.3, 0));
    expect(beamGain(E45, 0, 0.5)).toBeCloseTo(beamGain(E45, 0, 0) * 0.5, 5);
    expect(beamGain(E45, 0, 1)).toBe(0);
  });
});
describe('skyLevel et lampNeed', () => {
  it('le ciel éclaire peu la nuit, fort le jour, moins sous les nuages', () => {
    expect(skyLevel(0, 0)).toBeLessThan(0.1);
    expect(skyLevel(1, 0)).toBeGreaterThan(0.9);
    expect(skyLevel(1, 1)).toBeLessThan(skyLevel(1, 0));
  });
  it('les lampes sont négligeables en plein jour clair, utiles sous les nuages, la pluie et la nuit', () => {
    expect(lampNeed(1, 0.1, 0)).toBeLessThan(0.15);
    expect(lampNeed(1, 1, 0)).toBeGreaterThan(0.6);
    expect(lampNeed(1, 1, 1)).toBeGreaterThan(lampNeed(1, 1, 0));
    expect(lampNeed(0, 0, 0)).toBe(1);
  });
});
describe('skylightAt', () => {
  const win = { x: 100, y: 60, w: 60, h: 100 };
  it('décroît avec la distance à la fenêtre', () => {
    const near = skylightAt(130, 110, [win]);
    const mid = skylightAt(430, 110, [win]);
    const far = skylightAt(900, 110, [win]);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(skylightAt(130, 110, [])).toBe(0);
  });
  it('plusieurs fenêtres s’additionnent sans dépasser 1', () => {
    const two = skylightAt(130, 110, [win, { ...win, x: 110 }]);
    expect(two).toBeGreaterThanOrEqual(skylightAt(130, 110, [win]));
    expect(two).toBeLessThanOrEqual(1);
  });
});
