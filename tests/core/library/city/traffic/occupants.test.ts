import { describe, expect, it } from 'vitest';
import { occupantPose } from '../../../../../src/core/library/city/traffic/occupants';

describe('occupants', () => {
  it('regard devant en roulant ; regards variés à l’arrêt ; tête changée au plus 4 fois par seconde', () => {
    const heads = new Set<number>();
    for (let t = 0; t < 60; t += 0.05) heads.add(occupantPose({ role: 'driver', seed: 3, t, v: 60, dist: t * 60, lean: 0, unit: 1 }).head);
    expect([...heads].every((h) => h === 0 || h === 1)).toBe(true);
    const still = new Set<number>();
    let changes = 0;
    let prev = 0;
    for (let t = 0; t < 120; t += 0.05) {
      const h = occupantPose({ role: 'driver', seed: 3, t, v: 0, dist: 0, lean: 0, unit: 1 }).head;
      still.add(h);
      if (h !== prev) changes++;
      prev = h;
    }
    expect(still.size).toBeGreaterThan(1);
    expect(changes).toBeLessThanOrEqual(120 * 4);
  });
  it('inertie : buste vers l’avant au freinage (lean > 0), pavés seulement en roulant', () => {
    expect(occupantPose({ role: 'front', seed: 1, t: 1, v: 30, dist: 40, lean: 1, unit: 1 }).dx).toBeGreaterThan(0);
    const a = occupantPose({ role: 'front', seed: 1, t: 1, v: 0, dist: 40, lean: 0, unit: 1 });
    expect(a.dx).toBe(0);
    expect(a.dy).toBe(0);
  });
  it('passagers : regardent aussi ailleurs que devant', () => {
    const heads = new Set<number>();
    for (let t = 0; t < 60; t += 0.25) heads.add(occupantPose({ role: 'front', seed: 9, t, v: 40, dist: t * 40, lean: 0, unit: 1 }).head);
    expect(heads.size).toBeGreaterThan(1);
  });
});
