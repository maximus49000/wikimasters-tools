import { describe, expect, it } from 'vitest';
import { entranceOpening, farDoorX } from '../../../src/core/library/city/doorway';
import { TRIP_CYCLE, doorsFor, tripAt, tripsFor } from '../../../src/core/library/city/doors';
import { cityMetrics } from '../../../src/core/library/city/metrics';
import { YAW_BACK, YAW_FRONT } from '../../../src/core/library/figure/gait';

describe('porte au bout d’un trajet plafonné', () => {
  it('bord atteignable : pas de porte', () => {
    expect(farDoorX(100, -1, 720, [50, 300, 600])).toBeNull();
  });
  it('bord trop loin : la porte la plus lointaine dans le plafond, dans le sens de marche', () => {
    expect(farDoorX(100, 1, 3456, [50, 300, 600, 700])).toBe(600);
  });
});

describe('trajets des habitants', () => {
  const width = 3456;
  const doors = doorsFor(width, 340, 3);
  const trips = tripsFor(doors, 3, width);
  const walkOf = (trip: (typeof trips)[number]): ReturnType<typeof tripAt>[] => {
    const out: ReturnType<typeof tripAt>[] = [];
    for (let c = 0; c < TRIP_CYCLE; c += 0.1) out.push(tripAt(trip, width, c - trip.phase));
    return out;
  };
  it('un habitant qui sort commence dans l’ombre de sa porte, de face', () => {
    const trip = trips.find((t) => t.kind === 'out')!;
    const first = walkOf(trip).find((s) => s !== null)!;
    expect(first.stage).toBe('threshold');
    expect(first.yaw).toBe(YAW_FRONT);
    expect(first.depth).toBeGreaterThan(0.9);
    expect(first.x).toBeCloseTo(trip.doorX, 5);
  });
  it('un habitant qui rentre finit de dos dans l’ombre de sa porte', () => {
    const trip = trips.find((t) => t.kind === 'in')!;
    const states = walkOf(trip).filter((s) => s !== null);
    const last = states[states.length - 1]!;
    expect(last.stage).toBe('threshold');
    expect(last.yaw).toBe(YAW_BACK);
    expect(last.depth).toBeGreaterThan(0.9);
  });
  it('jamais de fin en pleine rue : chaque bout est une porte ou hors champ', () => {
    for (const trip of trips) {
      const states = walkOf(trip).filter((s) => s !== null);
      for (const end of [states[0]!, states[states.length - 1]!]) {
        const offscreen = end.x < 0 || end.x > width;
        expect(end.stage === 'threshold' || offscreen).toBe(true);
      }
    }
  });
  it('ouverture de l’entrée sous l’auvent', () => {
    const m = cityMetrics(340);
    const o = entranceOpening(doors[0]!.x, m);
    expect(o.y + o.h).toBeCloseTo(m.doorY, 5);
    expect(o.w).toBeGreaterThan(5);
  });
  it('la distance de rue cumulée ne change pas pendant les demi-tours et les seuils', () => {
    for (const trip of trips.slice(0, 20)) {
      const states = walkOf(trip).filter((s) => s !== null);
      for (let i = 1; i < states.length; i++) {
        if (states[i]!.stage !== 'street') expect(states[i]!.walked).toBeGreaterThanOrEqual(states[i - 1]!.walked);
      }
    }
  });
});
