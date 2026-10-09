import { describe, expect, it } from 'vitest';
import { BUILDING_STRETCH, FAR_WINDOW, FAR_WINDOWS_MAX, GROUND_FLOOR, cityFacades, extraFloorWindows, farWindows } from '../../../src/core/library/city/facades';
import { citySkyline } from '../../../src/core/library/scene-world';

const ground = 340 * 0.78;

describe('cityFacades', () => {
  it('ne change pas le tirage de citySkyline (mêmes immeubles avant et après)', () => {
    const before = JSON.stringify(citySkyline(720, 340, 5));
    cityFacades(720, 340, 5);
    expect(JSON.stringify(citySkyline(720, 340, 5))).toBe(before);
  });
  it('étire les immeubles, garde les fenêtres d’origine en haut et laisse un rez-de-chaussée sans fenêtre', () => {
    const raw = citySkyline(720, 340, 5);
    const facades = cityFacades(720, 340, 5);
    expect(facades).toHaveLength(raw.length);
    facades.forEach((f, i) => {
      const b = raw[i]!;
      expect(f.x).toBe(b.x);
      expect(f.w).toBe(b.w);
      expect(f.h).toBeCloseTo(b.h * BUILDING_STRETCH, 6);
      if (b.far) return;
      // Fenêtres d'origine : mêmes x, même seuil, remontées de la hauteur ajoutée.
      b.lamps.forEach((l, j) => {
        expect(f.lamps[j]!.x).toBe(l.x);
        expect(f.lamps[j]!.u).toBe(l.u);
        expect(f.lamps[j]!.y).toBeCloseTo(l.y - b.h * (BUILDING_STRETCH - 1), 6);
      });
      for (const l of f.lamps) {
        expect(l.y).toBeGreaterThanOrEqual(ground - f.h);
        expect(l.y + 7).toBeLessThanOrEqual(ground - GROUND_FLOOR + 1e-6);
      }
    });
  });
  it('ajoute des étages éclairables sur les grands immeubles (tirage propre, déterministe)', () => {
    const tall = citySkyline(720, 340, 5).filter((b) => !b.far).sort((a, b) => b.h - a.h)[0]!;
    const extra = extraFloorWindows(tall, ground, 5);
    expect(extra.length).toBeGreaterThan(0);
    expect(extra).toEqual(extraFloorWindows(tall, ground, 5));
  });
});

describe('farWindows', () => {
  const far = citySkyline(1440, 340, 7).filter((b) => b.far);
  it('quelques fenêtres par immeuble du fond (au plus 8), dans l’immeuble, petites et déterministes', () => {
    for (const b of far) {
      const wins = farWindows(b, ground, 7);
      expect(wins).toEqual(farWindows(b, ground, 7));
      expect(wins.length).toBeGreaterThan(0);
      expect(wins.length).toBeLessThanOrEqual(FAR_WINDOWS_MAX);
      expect(new Set(wins.map((w) => `${w.x},${w.y}`)).size).toBe(wins.length);
      for (const w of wins) {
        expect(w.x).toBeGreaterThanOrEqual(b.x);
        expect(w.x + FAR_WINDOW.w).toBeLessThanOrEqual(b.x + b.w);
        expect(w.y).toBeGreaterThanOrEqual(ground - b.h * BUILDING_STRETCH);
        expect(w.y + FAR_WINDOW.h).toBeLessThan(ground);
        expect(w.u).toBeGreaterThanOrEqual(0);
        expect(w.u).toBeLessThan(1);
      }
    }
  });
  it('ne dépend que de l’immeuble et de la graine', () => {
    const b = far[0]!;
    expect(farWindows({ ...b, lamps: [] }, ground, 7)).toEqual(farWindows(b, ground, 7));
    expect(farWindows(b, ground, 8)).not.toEqual(farWindows(b, ground, 7));
  });
  it('cityFacades les place sur les immeubles du fond seulement', () => {
    for (const f of cityFacades(720, 340, 5)) {
      if (f.far) expect(f.farWindows.length).toBeGreaterThan(0);
      else expect(f.farWindows).toHaveLength(0);
    }
  });
});
