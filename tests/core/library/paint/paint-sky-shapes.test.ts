import { describe, expect, it } from 'vitest';
import {
  CLOUD_DAY, CLOUD_DUSK, CLOUD_GREY, CLOUD_KINDS, CLOUD_MARGIN, CLOUD_NIGHT, CLOUD_STORM,
  CLOUD_VEIL_AT, cloudPalette, cloudPaletteFor, cloudShape, cloudStep, stepKey, unveilPalette, veilRgb,
} from '../../../../src/core/library/paint/sky-painter';

describe('formes des nuages', () => {
  it('12 formes distinctes, déterministes', () => {
    const shapes = Array.from({ length: CLOUD_KINDS }, (_, k) => cloudShape(1, k));
    expect(new Set(shapes.map((s) => JSON.stringify(s))).size).toBe(CLOUD_KINDS);
    expect(cloudShape(1, 3)).toEqual(cloudShape(1, 3));
    expect(cloudShape(2, 3)).not.toEqual(cloudShape(1, 3));
  });

  for (const seed of [1, 7, 99]) {
    it(`graine ${seed} : taille et bulles dans le cadre`, () => {
      for (let k = 0; k < CLOUD_KINDS; k++) {
        const s = cloudShape(seed, k);
        expect(s.w).toBeGreaterThanOrEqual(80);
        expect(s.w).toBeLessThanOrEqual(120);
        expect(s.h).toBeCloseTo(s.w * 0.85, 6);
        expect(s.puffs.length).toBeGreaterThanOrEqual(5);
        for (const p of s.puffs) {
          expect(p.x - p.r).toBeGreaterThanOrEqual(CLOUD_MARGIN - 1e-9);
          expect(p.x + p.r).toBeLessThanOrEqual(s.w - CLOUD_MARGIN + 1e-9);
          expect(p.y - p.r).toBeGreaterThanOrEqual(CLOUD_MARGIN - 1e-9);
          expect(p.y).toBeLessThanOrEqual(s.base);
        }
        // Bulles triées du haut vers le bas (les basses sont peintes par-dessus).
        expect(s.puffs.map((p) => p.y)).toEqual([...s.puffs.map((p) => p.y)].sort((a, b) => a - b));
      }
    });
  }
});

describe('palette des nuages', () => {
  it('extrêmes = palettes validées', () => {
    expect(cloudPalette(1, 0, 0)).toEqual(CLOUD_DAY);
    expect(cloudPalette(1, 1, 0)).toEqual(CLOUD_DUSK);
    expect(cloudPalette(0, 0, 0)).toEqual(CLOUD_NIGHT);
    expect(cloudPalette(1, 0, 0.6)).toEqual(CLOUD_GREY);
    expect(cloudPalette(1, 0, 1)).toEqual(CLOUD_STORM);
  });

  it('continue : un petit pas donne une petite différence', () => {
    for (const [d, t, k] of [[0.5, 0.5, 0.3], [0.9, 0.1, 0.59], [0.2, 0, 0.8]] as const) {
      const a = cloudPalette(d, t, k);
      const b = cloudPalette(d + 0.01, t, k + 0.01);
      for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) expect(Math.abs(a[i]![c]! - b[i]![c]!)).toBeLessThanOrEqual(6);
    }
  });

  it('crans au douzième, bornés', () => {
    expect(cloudStep(0.51, 0.04, 2)).toEqual({ daylight: 6 / 12, twilight: 0, dark: 1 });
    expect(stepKey(cloudStep(0.5, 0, 0.3))).toBe(stepKey(cloudStep(0.52, 0.01, 0.31)));
    expect(stepKey(cloudStep(0.5, 0, 0.3))).not.toBe(stepKey(cloudStep(0.6, 0, 0.3)));
  });

  // Nuages derrière la ville, sous le voile du ciel de la couche météo : palette compensée (sky-painter.ts).
  it('voile : sans voile, cran et clé inchangés ; avec voile, clé distincte', () => {
    expect(cloudStep(0.5, 0, 0.3, 0.02, 0.5)).toEqual(cloudStep(0.5, 0, 0.3));
    expect(stepKey(cloudStep(0.5, 0, 0.3, 0, 0))).toBe('6-0-4');
    expect(stepKey(cloudStep(0.5, 0, 0.3, 0.8, 0.5))).toBe('6-0-4-v10-6');
    expect(cloudPaletteFor(cloudStep(0.5, 0, 0.3))).toEqual(cloudPalette(0.5, 0, 4 / 12));
  });

  it('voile : la palette compensée, sous le voile, redonne la palette d’origine (nuit de pluie)', () => {
    // Pluie modérée : exact (à l'arrondi près) ; très forte pluie : le reflet du haut des nuages sature (borne 255), à peine
    // plus sombre qu'avant.
    for (const [veil, tol] of [[0.6, 1], [0.84, 5]] as const) {
      const step = cloudStep(0, 0, 0.9, veil, 0.9);
      const a = step.veil! * CLOUD_VEIL_AT;
      const v = veilRgb(step.daylight, step.veilDark!);
      const want = cloudPalette(0, 0, step.dark);
      const under = cloudPaletteFor(step).map((c) => c.map((x, i) => x * (1 - a) + v[i]! * a));
      under.forEach((c, j) => c.forEach((x, i) => expect(Math.abs(x - want[j]![i]!)).toBeLessThanOrEqual(tol)));
      expect(cloudPaletteFor(step)).toEqual(unveilPalette(want, v, a));
    }
  });
});
