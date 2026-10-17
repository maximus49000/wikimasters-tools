import { describe, expect, it } from 'vitest';
import { flocksAt } from '../../../../src/core/library/city/gulls';

const day = { minutes: 8 * 60, daylight: 1, rain: 0 };
describe('mouettes', () => {
  it('aucune la nuit ni sous la pluie forte', () => {
    for (let t = 0; t < 3600; t += 7) {
      expect(flocksAt(t, 1, 1000, 400, { ...day, daylight: 0.1 })).toEqual([]);
      expect(flocksAt(t, 1, 1000, 400, { ...day, rain: 0.8 })).toEqual([]);
    }
  });
  it('3 à 5 volées par heure de jour, dans la bande de la crête', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 3600; t += 2) for (const g of flocksAt(t, 1, 1000, 400, day)) { expect(g.y).toBeGreaterThanOrEqual(20); expect(g.y).toBeLessThanOrEqual(120); seen.add(Math.floor(t / 600)); }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
  it('déterministe', () => { expect(flocksAt(1234, 5, 800, 400, day)).toEqual(flocksAt(1234, 5, 800, 400, day)); });

  // Ajouts (branchement) : forme des poses, rythme des salves, cheminées.
  it('volées de 2 à 5, poses valides (aile, pose du battement, échelle, lointain)', () => {
    for (const seed of [1, 2, 3]) {
      for (let t = 0; t < 7200; t += 3) {
        const poses = flocksAt(t, seed, 1200, 400, day);
        for (const g of poses) {
          expect(['flap', 'glide', 'turn', 'perched']).toContain(g.wing);
          expect(Number.isInteger(g.flap) && g.flap >= 0 && g.flap < 8).toBe(true);
          if (g.wing !== 'flap') expect(g.flap).toBe(0);
          expect(g.s).toBeGreaterThan(0.2);
          expect(g.s).toBeLessThanOrEqual(1.2);
          expect(g.far).toBeGreaterThanOrEqual(0);
          expect(g.far).toBeLessThan(0.7);
          expect([1, -1]).toContain(g.dir);
        }
      }
    }
  });
  it('plus de volées de 7 h à 10 h que l\'après-midi', () => {
    const count = (minutes: number): number => {
      let n = 0;
      for (let h = 0; h < 12; h++) {
        let prev = 0;
        for (let t = h * 3600; t < (h + 1) * 3600; t += 5) {
          const k = flocksAt(t, 4, 1000, 400, { ...day, minutes: minutes + (t - h * 3600) / 60 }).length;
          if (k > 0 && prev === 0) n++;
          prev = k;
        }
      }
      return n;
    };
    expect(count(8 * 60)).toBeGreaterThan(count(15 * 60));
  });
  it('un oiseau bat des ailes par salves puis plane (battement et plané alternent)', () => {
    const wings = new Set<string>();
    const frames = new Set<number>();
    for (let t = 0; t < 3600; t += 0.05) for (const g of flocksAt(t, 1, 1000, 400, day)) {
      wings.add(g.wing);
      if (g.wing === 'flap') frames.add(g.flap);
    }
    expect(wings.has('flap')).toBe(true);
    expect(wings.has('glide')).toBe(true);
    expect(frames.size).toBe(8);
  });
  it('un oiseau sur quatre environ est lointain (petit et pâle)', () => {
    let far = 0;
    let all = 0;
    // Compté une fois par oiseau (et non au temps de présence : le lointain, lent, reste plus longtemps) : passage d'une
    // porte en x = 500 de la largeur parcourue en 1 s (vitesse selon la distance : 9, 16 ou 24 px/s).
    const speedOf = (far: number): number => (far >= 0.5 ? 9 : far > 0.1 ? 16 : 24);
    for (let seed = 1; seed <= 40; seed++) for (let t = 0; t < 3600; t += 1) for (const g of flocksAt(t, seed, 1000, 400, day)) {
      const d = g.dir * (g.x - 500);
      if (d < 0 || d >= speedOf(g.far)) continue;
      all++;
      if (g.far >= 0.5) {
        far++;
        expect(g.s).toBeLessThan(0.45);
      }
    }
    expect(far / all).toBeGreaterThan(0.15);
    expect(far / all).toBeLessThan(0.35);
  });
  it('posé sur une cheminée : immobile, ailes repliées, au haut de la cheminée', () => {
    const perch = { x: 500, y: 140, s: 0.76, haze: 0.14 };
    let perched = 0;
    let last: { t: number; x: number; y: number } | null = null;
    for (let seed = 1; seed <= 6; seed++) for (let t = 0; t < 7200; t += 1) for (const g of flocksAt(t, seed, 1000, 400, day, [perch])) {
      if (g.wing !== 'perched') continue;
      perched++;
      expect(g.x).toBeCloseTo(perch.x, 6);
      expect(g.y).toBeCloseTo(perch.y - 1.5 * g.s, 6);
      expect(g.flap).toBe(0);
      if (last && t - last.t === 1) expect([g.x, g.y]).toEqual([last.x, last.y]);
      last = { t, x: g.x, y: g.y };
    }
    expect(perched).toBeGreaterThan(0);
  });
  it('sans cheminée : jamais posé', () => {
    for (let t = 0; t < 3600; t += 1) for (const g of flocksAt(t, 1, 1000, 400, day)) expect(g.wing).not.toBe('perched');
  });
});
