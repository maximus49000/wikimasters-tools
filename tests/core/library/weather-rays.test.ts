import { describe, expect, it } from 'vitest';
import { CLOUD_BLOBS, RAY_WINDOW_MS, godRayStrength, godRayTarget, rayWindow, sunCoverage } from '../../../src/core/library/weather/weather-rays';
import { targetOf } from '../../../src/core/library/weather/weather-types';

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

describe('godRayStrength — bande étroite (filets occasionnels)', () => {
  it('rien sous la neige, rien en vraie pluie', () => {
    expect(godRayStrength(0.5, 0.85, 0.3, 'snow')).toBe(0);
    expect(godRayStrength(0.5, 0.9, 0.65, 'rain')).toBe(0);
  });
  it('rien pour un soleil à peine voilé ou presque caché', () => {
    expect(godRayStrength(0.25, 0.8, 0.1)).toBe(0);
    expect(godRayStrength(0.9, 0.8, 0.1)).toBe(0);
  });
});

describe('godRayTarget', () => {
  const drizzle = targetOf('drizzle');
  it('trouée au-dessus du soleil en bruine, de jour : des filets', () => {
    expect(godRayTarget(0.5, drizzle, 1, true)).toBeGreaterThan(0.3);
  });
  it('rien à l’orage, sous la neige, la nuit, ou soleil couché', () => {
    expect(godRayTarget(0.5, targetOf('storm'), 1, true)).toBe(0);
    expect(godRayTarget(0.5, targetOf('snow'), 1, true)).toBe(0);
    expect(godRayTarget(0.5, drizzle, 0, true)).toBe(0);
    expect(godRayTarget(0.5, drizzle, 1, false)).toBe(0);
  });
});

describe('rayWindow (épisodes de trouées, occasionnels)', () => {
  const T0 = Date.UTC(2026, 5, 21, 12);
  it('déterministe, borné, ouvert de temps en temps seulement', () => {
    let sum = 0;
    let open = 0;
    const n = 6 * 3600;
    for (let i = 0; i < n; i++) {
      const v = rayWindow(T0 + i * 1000, 1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      sum += v;
      if (v > 0.2) open++;
    }
    expect(rayWindow(T0 + 5000, 1)).toBe(rayWindow(T0 + 5000, 1));
    expect(open / n).toBeGreaterThan(0.03);
    expect(open / n).toBeLessThan(0.3);
    expect(sum / n).toBeLessThan(0.2);
  });
  it('varie en douceur (fondu, jamais d’allumage brusque)', () => {
    for (let i = 0; i < 4 * RAY_WINDOW_MS; i += 250) expect(Math.abs(rayWindow(T0 + i + 250, 3) - rayWindow(T0 + i, 3))).toBeLessThan(0.05);
  });
  it('fermé, il éteint la cible', () => {
    const drizzle = targetOf('drizzle');
    expect(godRayTarget(0.5, drizzle, 1, true, 0)).toBe(0);
    expect(godRayTarget(0.5, drizzle, 1, true, 1)).toBe(godRayTarget(0.5, drizzle, 1, true));
  });
});
