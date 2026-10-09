import { describe, expect, it } from 'vitest';
import { STREET_SCALE } from '../../../src/core/library/city/metrics';
import { LANE_DIR, MIN_VEHICLE_GAP, VEHICLE_HALF, vehicleGate, vehiclesFor, type Vehicle } from '../../../src/core/library/city/vehicles';
import { WORLD_MARGIN, loopX } from '../../../src/core/library/scene-world';

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

describe('pas de chevauchement sur une même file', () => {
  // Piste : file du fond, voitures du premier plan, vélos (au bord de la file du premier plan).
  const track = (v: Vehicle): string => (v.kind === 'bike' ? 'bike' : v.lane);
  const half = (v: Vehicle): number => VEHICLE_HALF[v.kind] * STREET_SCALE.vehicle * v.scale * (v.lane === 'far' ? 0.9 : 1);
  it('une seule vitesse par piste', () => {
    for (const seed of [1, 2, 3, 5, 8]) {
      const list = vehiclesFor(720, seed);
      for (const key of ['near', 'far', 'bike']) expect(new Set(list.filter((v) => track(v) === key).map((v) => v.speed)).size).toBeLessThanOrEqual(1);
    }
  });
  it('à tout instant, deux véhicules d’une même piste ne se recouvrent pas (positions dessinées)', () => {
    for (const width of [170, 360, 720, 1440, 2880]) {
      const loop = width + 2 * WORLD_MARGIN;
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 12345]) {
        const list = vehiclesFor(width, seed);
        for (const t of [0, 0.7, 3.1, 17.9, 123.4, 999.9, 1.76e9 + 0.33, 1.76e9 + 41.2]) {
          for (const key of ['near', 'far', 'bike']) {
            const same = list.filter((v) => track(v) === key);
            for (let a = 0; a < same.length; a++) {
              for (let b = a + 1; b < same.length; b++) {
                const va = same[a]!;
                const vb = same[b]!;
                const xa = loopX(va.phase, LANE_DIR[va.lane] * va.speed, width, t);
                const xb = loopX(vb.phase, LANE_DIR[vb.lane] * vb.speed, width, t);
                // Distance sur la boucle (un véhicule qui sort d'un côté réapparaît de l'autre).
                const d = Math.abs(xa - xb);
                const gap = Math.min(d, loop - d);
                expect(gap).toBeGreaterThan(half(va) + half(vb) + 4);
              }
            }
          }
        }
      }
    }
  });
  it('l’écart minimal laisse passer le plus long véhicule', () => {
    expect(MIN_VEHICLE_GAP).toBeGreaterThan(2 * VEHICLE_HALF.bus * STREET_SCALE.vehicle * 1.1);
  });
  it('chaque vélo a un cycliste, déterministe', () => {
    const bikes = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => vehiclesFor(2000, seed)).filter((v) => v.kind === 'bike');
    expect(bikes.length).toBeGreaterThan(0);
    for (const b of bikes) expect(b.rider).toBeDefined();
    expect(vehiclesFor(2000, 3)).toEqual(vehiclesFor(2000, 3));
    for (const v of vehiclesFor(2000, 3)) if (v.kind !== 'bike') expect(v.rider).toBeUndefined();
  });
});
