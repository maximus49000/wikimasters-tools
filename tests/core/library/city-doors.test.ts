import { describe, expect, it } from 'vitest';
import { cityIntensity } from '../../../src/core/library/city/intensity';
import { dayContext } from '../../../src/core/library/city/calendar';
import { DOOR_WIDTH, TRIP_CYCLE, doorsFor, residentFlow, tripAt, tripHappens, tripsFor } from '../../../src/core/library/city/doors';
import { WORLD_MARGIN, citySkyline } from '../../../src/core/library/scene-world';

describe('doorsFor', () => {
  it('place les entrées sur des immeubles du premier plan, de façon déterministe', () => {
    const doors = doorsFor(720, 340, 5);
    expect(doors).toEqual(doorsFor(720, 340, 5));
    expect(doors.length).toBeGreaterThanOrEqual(4);
    const near = citySkyline(720, 340, 5).filter((b) => !b.far);
    for (const d of doors) {
      expect(near.some((b) => d.x >= b.x && d.x + 18 <= b.x + b.w)).toBe(true);
      expect([0, 1, 2]).toContain(d.variant);
    }
  });
});

describe('trajets d’habitants', () => {
  const doors = doorsFor(720, 340, 5);
  const trips = tripsFor(doors, 5);
  it('chaque entrée a un trajet de sortie et un trajet d’entrée', () => {
    for (const d of doors) {
      expect(trips.filter((t) => t.doorX === d.x + DOOR_WIDTH / 2 && t.kind === 'out')).toHaveLength(1);
      expect(trips.filter((t) => t.doorX === d.x + DOOR_WIDTH / 2 && t.kind === 'in')).toHaveLength(1);
    }
  });
  it('un habitant qui sort part de la porte, un habitant qui entre y arrive', () => {
    const out = trips.find((t) => t.kind === 'out')!;
    const inn = trips.find((t) => t.kind === 'in')!;
    const startOut = tripAt({ ...out, phase: 0 }, 720, 0)!;
    expect(startOut.x).toBeCloseTo(out.doorX, 3);
    expect(startOut.fade).toBe(0);
    const reach = out.dir > 0 ? 720 + WORLD_MARGIN - out.doorX : out.doorX + WORLD_MARGIN;
    const arrive = tripAt({ ...inn, phase: 0 }, 720, (inn.dir > 0 ? inn.doorX + WORLD_MARGIN : 720 + WORLD_MARGIN - inn.doorX) / inn.speed - 0.01);
    if (arrive) expect(Math.abs(arrive.x - inn.doorX)).toBeLessThan(inn.speed * 0.05);
    expect(reach).toBeGreaterThan(0);
  });
  it('n’existe plus une fois le monde traversé', () => {
    const out = trips[0]!;
    expect(tripAt({ ...out, phase: 0 }, 720, TRIP_CYCLE - 1)).toBeNull();
  });
  it('tripHappens est déterministe et suit le seuil', () => {
    const t = trips[0]!;
    expect(tripHappens(t, 1000, 0)).toBe(false);
    expect(tripHappens(t, 1000, 1)).toBe(true);
    expect(tripHappens(t, 1000, 0.5)).toBe(tripHappens(t, 1000, 0.5));
  });
});

describe('residentFlow', () => {
  const day = (ymd: { y: number; m: number; d: number }) => dayContext(ymd, []);
  const flow = (hours: number, ymd = { y: 2026, m: 10, d: 9 }) => {
    const minutes = Math.round(hours * 60);
    return residentFlow(cityIntensity({ minutes, day: day(ymd), precip: 0, snow: false, storm: false, daylight: 1 }), minutes);
  };
  it('on sort le matin, on rentre le soir', () => {
    expect(flow(7.8).out).toBeGreaterThan(flow(7.8).in);
    expect(flow(18.5).in).toBeGreaterThan(flow(18.5).out);
  });
});
