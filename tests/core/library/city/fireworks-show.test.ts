import { describe, expect, it } from 'vitest';
import { FIREWORK_VARIANTS, fireworksShow, showBursts } from '../../../../src/core/library/city/fireworks-show';

describe('spectacle de feux d’artifice', () => {
  it('feux du 14 juillet : début entre 22 h 15 et 22 h 45, durée 18-30 min, deux graines → débuts différents ; aucun spectacle le 13 juillet', () => {
    const starts = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = fireworksShow(seed, { y: 2026, m: 7, d: 14 })!;
      expect(s).not.toBeNull();
      expect(s.start).toBeGreaterThanOrEqual(1335);
      expect(s.start).toBeLessThanOrEqual(1365);
      expect(s.end - s.start).toBeGreaterThanOrEqual(18);
      expect(s.end - s.start).toBeLessThanOrEqual(30);
      starts.add(s.start);
    }
    expect(starts.size).toBeGreaterThan(25);
    expect(fireworksShow(1, { y: 2026, m: 7, d: 14 })!.start).not.toBe(fireworksShow(2, { y: 2026, m: 7, d: 14 })!.start);
    // Même graine, autre année : autre spectacle.
    expect(fireworksShow(1, { y: 2027, m: 7, d: 14 })!.start).not.toBe(fireworksShow(1, { y: 2026, m: 7, d: 14 })!.start);
    expect(fireworksShow(1, { y: 2026, m: 7, d: 13 })).toBeNull();
    expect(fireworksShow(1, { y: 2026, m: 10, d: 19 })).toBeNull();
    expect(fireworksShow(4, { y: 2026, m: 7, d: 14 })).toEqual(fireworksShow(4, { y: 2026, m: 7, d: 14 }));
  });

  it('Nouvel An : spectacle sur la nuit du 31 décembre autour de minuit', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = fireworksShow(seed, { y: 2026, m: 12, d: 31 })!;
      expect(s.start).toBeGreaterThanOrEqual(1438);
      expect(s.start).toBeLessThanOrEqual(1445);
      expect(s.end - s.start).toBeGreaterThanOrEqual(8);
      expect(s.end - s.start).toBeLessThanOrEqual(15);
    }
    // Le 1er janvier n'a pas son propre spectacle : il appartient à la nuit de la veille.
    expect(fireworksShow(1, { y: 2027, m: 1, d: 1 })).toBeNull();
  });

  it('salves triées, toutes dans [start, end], bouquet final plus dense', () => {
    const cases = [
      [3, { y: 2026, m: 7, d: 14 }],
      [9, { y: 2026, m: 12, d: 31 }],
    ] as const;
    for (const [seed, date] of cases) {
      const s = fireworksShow(seed, date)!;
      const at = s.bursts.map((b) => b.at);
      expect(at).toEqual([...at].sort((a, b) => a - b));
      for (const b of s.bursts) {
        expect(b.at).toBeGreaterThanOrEqual(s.start);
        expect(b.at).toBeLessThanOrEqual(s.end);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(1);
        expect(b.y).toBeGreaterThanOrEqual(0.15);
        expect(b.y).toBeLessThanOrEqual(0.45);
        expect(Number.isInteger(b.variant) && b.variant >= 0 && b.variant < FIREWORK_VARIANTS).toBe(true);
      }
      // Intervalles : 6-40 s avant le bouquet, 1-3 s pendant les 2 dernières minutes.
      for (let i = 1; i < at.length; i++) {
        const g = (at[i]! - at[i - 1]!) * 60;
        if (at[i - 1]! >= s.end - 2) {
          expect(g).toBeGreaterThanOrEqual(1 - 1e-6);
          expect(g).toBeLessThanOrEqual(3 + 1e-6);
        } else if (at[i]! < s.end - 2) {
          expect(g).toBeGreaterThanOrEqual(6 - 1e-6);
          expect(g).toBeLessThanOrEqual(40 + 1e-6);
        }
      }
      const finale = s.bursts.filter((b) => b.at >= s.end - 2).length / 2;
      const body = s.bursts.filter((b) => b.at < s.end - 2).length / (s.end - 2 - s.start);
      expect(finale).toBeGreaterThan(body * 3);
      // Lecture d'une tranche [from, to) : les salves de la tranche seulement.
      const mid = (s.start + s.end) / 2;
      const part = showBursts(s, s.start, mid);
      expect(part.length).toBeGreaterThan(0);
      expect(part.every((b) => b.at >= s.start && b.at < mid)).toBe(true);
      expect(part.length + showBursts(s, mid, s.end + 1).length).toBe(s.bursts.length);
    }
  });
});
