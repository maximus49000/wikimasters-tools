// tests/core/library/weather/bolt.test.ts
import { describe, expect, it } from 'vitest';
import { boltPath } from '../../../../src/core/library/weather/bolt';

const points = (d: string): [number, number][] => d.split(/[ML]/).filter((s) => s.trim() !== '').map((s) => s.trim().split(' ').map(Number) as [number, number]);

describe('éclair peint', () => {
  it('part du haut en x, descend jusqu’à 55 % de la hauteur, par petits segments', () => {
    const p = points(boltPath(300, 216, 42));
    expect(p[0]).toEqual([300, 0]);
    expect(p[p.length - 1]![1]).toBeCloseTo(216 * 0.55, 1);
    expect(p.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < p.length; i++) {
      expect(p[i]![1]).toBeGreaterThan(p[i - 1]![1]);
      expect(Math.abs(p[i]![0] - p[i - 1]![0])).toBeLessThanOrEqual(10.01);
    }
  });

  it('même éclair, même tracé ; autre éclair, autre tracé', () => {
    expect(boltPath(300, 216, 42)).toBe(boltPath(300, 216, 42));
    expect(boltPath(300, 216, 43)).not.toBe(boltPath(300, 216, 42));
  });
});
