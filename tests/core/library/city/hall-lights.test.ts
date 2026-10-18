import { describe, expect, it } from 'vitest';
import { doorsFor, tripAt, tripsFor, type Trip } from '../../../../src/core/library/city/doors';
import { HALL_TIMER_S, crossingDoorX, hallLit, seedHallTimers, stairFloorsLit } from '../../../../src/core/library/city/hall-lights';

const W = 1440;
const trips = tripsFor(doorsFor(W, 340, 1), 1, W);

// Premier instant (au demi-seconde) où le trajet est sur un seuil, à partir de `from`.
function firstThreshold(trip: Trip, from: number): number {
  for (let s = from; s < from + 400; s += 0.5) if (tripAt(trip, W, s)?.stage === 'threshold') return s;
  throw new Error('aucun seuil');
}

describe('minuterie des halls', () => {
  it('allumé seulement de nuit, tant que la minuterie court', () => {
    const until = new Map([[100, 500]]);
    expect(hallLit(until, 100, 499, true)).toBe(true);
    expect(hallLit(until, 100, 501, true)).toBe(false);
    expect(hallLit(until, 100, 499, false)).toBe(false);
    expect(hallLit(until, 200, 0, true)).toBe(false);
  });

  it('un passage allume le hall de sa porte pendant 2 minutes, puis il s’éteint', () => {
    const trip = trips.find((tr) => tr.kind === 'out')!;
    const s0 = firstThreshold(trip, 1000);
    const only = (tr: Trip): number => (tr === trip ? 1 : 0);
    const door = crossingDoorX(trip, tripAt(trip, W, s0)!);
    expect(hallLit(seedHallTimers(trips, W, s0 + 60, only), door, s0 + 60, true)).toBe(true);
    // Le seuil dure 1 s : 2 minutes après sa fin, plus rien.
    const late = s0 + 1 + HALL_TIMER_S + 1;
    expect(hallLit(seedHallTimers(trips, W, late, only), door, late, true)).toBe(false);
  });

  it('personne ne passe : aucun hall allumé', () => {
    const until = seedHallTimers(trips, W, 5000, () => 0);
    expect(until.size).toBe(0);
  });

  it('un habitant qui arrive à une autre entrée allume le hall de cette entrée', () => {
    const trip = trips.find((tr) => tr.kind === 'out' && tr.endDoorX !== null)!;
    const leave = firstThreshold(trip, 0);
    // Après le seuil de départ, le prochain seuil est celui d'arrivée, à l'autre porte.
    let s = leave + 2;
    while (tripAt(trip, W, s)?.stage !== 'threshold') s += 0.5;
    expect(crossingDoorX(trip, tripAt(trip, W, leave)!)).toBe(trip.doorX);
    expect(crossingDoorX(trip, tripAt(trip, W, s)!)).toBe(trip.endDoorX);
  });
});

describe('cage d’escalier : étage atteint', () => {
  it('cage : étage atteint entre 1 et floors, déterministe', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const doorX = 100 + (i % 20) * 37.5;
      const until = 1000 + i * 3.5;
      const f = stairFloorsLit(doorX, until, 6);
      expect(Number.isInteger(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(6);
      expect(stairFloorsLit(doorX, until, 6)).toBe(f);
      seen.add(f);
    }
    expect(seen.size).toBe(6);
    expect(stairFloorsLit(250, 42, 1)).toBe(1);
    expect(stairFloorsLit(250, 42, 0)).toBe(0);
    expect(stairFloorsLit(250, 42, -3)).toBe(0);
  });
});
