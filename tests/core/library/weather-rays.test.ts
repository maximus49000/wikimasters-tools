import { describe, expect, it } from 'vitest';
import { CLOUD_BLOBS, godRayStrength, sunCoverage } from '../../../src/core/library/weather/weather-rays';

describe('godRayStrength', () => {
  it('nul quand le soleil est entièrement dégagé ou entièrement caché', () => {
    expect(godRayStrength(0, 0.8, 0.25)).toBe(0);
    expect(godRayStrength(1, 0.8, 0.25)).toBe(0);
  });
  it('positif dans une trouée d’un ciel épais en pluie fine', () => {
    expect(godRayStrength(0.5, 0.8, 0.25)).toBeGreaterThan(0.2);
  });
  it('nul à l’orage et par ciel clair', () => {
    expect(godRayStrength(0.5, 1, 1)).toBe(0);
    expect(godRayStrength(0.5, 0.1, 0)).toBe(0);
  });
  it('croît avec la couverture, décroît avec la pluie', () => {
    let previous = -1;
    for (let cloud = 0; cloud <= 1.0001; cloud += 0.05) {
      const s = godRayStrength(0.5, cloud, 0.2);
      expect(s).toBeGreaterThanOrEqual(previous);
      previous = s;
    }
    previous = 2;
    for (let precip = 0; precip <= 1.0001; precip += 0.05) {
      const s = godRayStrength(0.5, 0.9, precip);
      expect(s).toBeLessThanOrEqual(previous);
      previous = s;
    }
  });
  it('borné entre 0 et 1', () => {
    for (const hidden of [-1, 0, 0.3, 0.6, 0.9, 2])
      for (const cloud of [-1, 0, 0.5, 1, 2])
        for (const precip of [-1, 0, 0.5, 1, 2]) {
          const s = godRayStrength(hidden, cloud, precip);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(1);
        }
  });
});

describe('sunCoverage', () => {
  const W = 720;
  it('aucun nuage : soleil dégagé', () => {
    expect(sunCoverage(100, 60, [], 0, W)).toBe(0);
  });
  it('nuage centré sur le soleil : caché', () => {
    expect(sunCoverage(100, 60, [{ x: 100, y: 60, s: 1.5 }], 0, W)).toBeGreaterThan(0.95);
  });
  it('nuage à moitié sur le soleil : entre les deux', () => {
    // Bord droit du gros lobe central (rx 34) passe par le centre du soleil.
    const c = sunCoverage(100, 60, [{ x: 100 - 34, y: 60, s: 1 }], 0, W);
    expect(c).toBeGreaterThan(0.3);
    expect(c).toBeLessThan(0.7);
  });
  it('la dérive déplace les nuages', () => {
    expect(sunCoverage(100, 60, [{ x: 50, y: 60, s: 1.5 }], 50, W)).toBeGreaterThan(0.95);
  });
  it('la copie de bouclage (à −largeur) compte aussi', () => {
    // Nuage en x = 700, dérive 120 : sa copie bouclée est en 700 + 120 − 720 = 100.
    expect(sunCoverage(100, 60, [{ x: 700, y: 60, s: 1.5 }], 120, W)).toBeGreaterThan(0.95);
  });
  it('les lobes dessinés sont ceux de la couverture', () => {
    expect(CLOUD_BLOBS.length).toBe(3);
  });
});
