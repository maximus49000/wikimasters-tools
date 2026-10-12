import { describe, expect, it } from 'vitest';
import { BACKS, LYRES, PALS, beamShape, concertState, flashAlpha, lyreTarget, paletteIndex } from '../../../../src/core/library/city/concert';

// Séquence lumière du concert de la Fête de la musique (G5, maquette g5-fetes notes §8) : moteur pur, déterministe en t.
describe('concert', () => {
  it('palette changée toutes les 8 s, 4 palettes en boucle', () => {
    expect(concertState(1).pal).toEqual(['#FF2FB0', '#FFB020']);
    expect(concertState(9).pal).toEqual(['#20D8FF', '#8A40FF']);
    expect(concertState(17).pal).toEqual(['#30FF80', '#FFC040']);
    expect(concertState(25).pal).toEqual(['#FF3030', '#F0F0FF']);
    expect(concertState(33).pal).toEqual(concertState(1).pal);
    expect(PALS).toHaveLength(4);
    expect(paletteIndex(7.99)).toBe(0);
    expect(paletteIndex(8)).toBe(1);
    expect(paletteIndex(-1)).toBe(3);
  });
  it('hit au premier temps de chaque mesure seulement', () => {
    expect(concertState(2.05).hit).toBeCloseTo(0.35);
    expect(concertState(2.6).hit).toBe(0);
    expect(concertState(0.5).hit).toBe(0);
    expect(concertState(4.1).hit).toBeCloseTo(0.35);
    expect(concertState(4.2).hit).toBe(0);
  });
  it('stroboscope : 0,6 s toutes les 32 s, à 3 Hz (allumé sur floor(6t) impair), α 0,5 ; rien le reste du temps', () => {
    expect(concertState(32.02).strobe).toBe(0);
    expect(concertState(32.19).strobe).toBe(0.5);
    expect(concertState(32.4).strobe).toBe(0);
    expect(concertState(32.55).strobe).toBe(0.5);
    expect(concertState(32.7).strobe).toBe(0);
    expect(concertState(10).strobe).toBe(0);
  });
  it('voile blanc plafonné à 0,5 : hit + strobe au même instant ne dépasse pas 0,5', () => {
    expect(flashAlpha({ hit: 0.35, strobe: 0.5 })).toBe(0.5);
    expect(flashAlpha({ hit: 0.35, strobe: 0 })).toBe(0.35);
    expect(flashAlpha(concertState(32.19))).toBe(0.5);
  });
  it('déterministe et 4 lyres', () => {
    expect(concertState(5.5)).toEqual(concertState(5.5));
    expect(concertState(0).lyres).toHaveLength(4);
    expect(LYRES).toEqual([-40, -14, 14, 40]);
    expect(BACKS).toEqual([-30, 0, 30]);
  });
  it('lyres : éventail croisé, deux vers le plancher et deux vers le public, couleurs alternées', () => {
    const s = concertState(1);
    expect(s.lyres.map((l) => l.target)).toEqual(['crowd', 'floor', 'floor', 'crowd']);
    expect(s.lyres.map((l) => l.color)).toEqual([s.pal[1], s.pal[0], s.pal[1], s.pal[0]]);
    for (const l of s.lyres) {
      expect(l.pan).toBeGreaterThanOrEqual(-1);
      expect(l.pan).toBeLessThanOrEqual(1);
    }
    // Pan sin(2πt/4 + i·π/2), signe alterné : à t = 1, lyre 0 → sin(π/2) · (−1) = −1, lyre 1 → sin(π) · 1 = 0.
    expect(s.lyres[0]!.pan).toBeCloseTo(-1);
    expect(s.lyres[1]!.pan).toBeCloseTo(0);
    // Période 4 s.
    expect(concertState(5).lyres[0]!.pan).toBeCloseTo(s.lyres[0]!.pan);
    // Cibles : plancher à y = −7 (±26 u), public à y = +30 (±60 u autour de 0,4 x).
    expect(lyreTarget(1, 1)).toEqual([-14 + 26, -7]);
    expect(lyreTarget(0, -1)).toEqual([-40 * 0.4 - 60, 30]);
  });
  it('rampe LED : pulsation entre 0 et 1, périodique', () => {
    for (const t of [0, 0.3, 1.7, 9]) {
      expect(concertState(t).led).toBeGreaterThanOrEqual(0);
      expect(concertState(t).led).toBeLessThanOrEqual(1);
    }
  });
  it('faisceau : quadrilatère de la source (largeur w0) à la cible (largeur w1), cœur plus étroit', () => {
    const b = beamShape(0, -55, 0, -8, 2, 10);
    expect(b.points).toBe('-2.00,-55.00 -10.00,-8.00 10.00,-8.00 2.00,-55.00');
    expect(b.core).toBe('-0.80,-55.00 -3.50,-8.00 3.50,-8.00 0.80,-55.00');
    expect(beamShape(0, 0, 0, 0, 1, 1).points).toBeTypeOf('string');
  });
});
