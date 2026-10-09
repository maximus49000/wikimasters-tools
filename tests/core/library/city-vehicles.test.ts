import { describe, expect, it } from 'vitest';
import { LANE_DIR, vehicleGate, vehiclesFor } from '../../../src/core/library/city/vehicles';

describe('vehiclesFor', () => {
  it('roule à droite : premier plan vers la droite, fond vers la gauche', () => {
    expect(LANE_DIR.near).toBe(1);
    expect(LANE_DIR.far).toBe(-1);
    const list = vehiclesFor(720, 4);
    expect(list.some((v) => v.lane === 'near')).toBe(true);
    expect(list.some((v) => v.lane === 'far')).toBe(true);
    for (const v of list) expect(v.speed).toBeGreaterThan(0);
  });
  it('est déterministe, borné et réserve les vélos à la file du premier plan', () => {
    expect(vehiclesFor(720, 4)).toEqual(vehiclesFor(720, 4));
    expect(vehiclesFor(720, 4).length).toBeLessThanOrEqual(16);
    let bikes = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const v of vehiclesFor(2000, seed)) {
        if (v.kind === 'bike') {
          bikes++;
          expect(v.lane).toBe('near');
        }
      }
    }
    expect(bikes).toBeGreaterThan(0);
  });
  it('les voitures suivent la circulation et les vélos les piétons', () => {
    const i = { traffic: 0.7, walkers: 0.2, suits: 0, schoolTo: 0, schoolFrom: 0, kids: 0, sport: 0, umbrellas: false, weekendLike: false };
    const car = vehiclesFor(2000, 1).find((v) => v.kind === 'car')!;
    const bike = { ...car, kind: 'bike' as const, lane: 'near' as const };
    expect(vehicleGate(car, i)).toBe(0.7);
    expect(vehicleGate(bike, i)).toBeLessThan(0.2);
  });
});
