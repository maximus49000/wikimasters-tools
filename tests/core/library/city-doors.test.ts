import { describe, expect, it } from 'vitest';
import { cityIntensity } from '../../../src/core/library/city/intensity';
import { dayContext } from '../../../src/core/library/city/calendar';
import { DOOR_MARGIN, DOOR_WIDTH, MAX_TRIP_PX, RESIDENT_DOORS_PER_720, TRIP_CYCLE, doorsFor, residentFlow, tripAt, tripHappens, tripsFor } from '../../../src/core/library/city/doors';
import { WORLD_MARGIN, citySkyline } from '../../../src/core/library/scene-world';

describe('doorsFor', () => {
  it('une entrée par immeuble visible du premier plan, à l’intérieur avec une marge, de façon déterministe', () => {
    for (const width of [360, 720, 1000, 2880]) {
      for (const seed of [1, 5, 12345]) {
        const doors = doorsFor(width, 340, seed);
        expect(doors).toEqual(doorsFor(width, 340, seed));
        // Immeubles dont la partie visible ([0, width)) peut porter une entrée avec ses marges.
        const near = citySkyline(width, 340, seed).filter((b) => !b.far && Math.min(b.x + b.w, width) - Math.max(b.x, 0) >= DOOR_WIDTH + 2 * DOOR_MARGIN);
        expect(doors).toHaveLength(near.length);
        near.forEach((b, i) => {
          const d = doors[i]!;
          expect(d.x).toBeGreaterThanOrEqual(b.x + DOOR_MARGIN - 0.1);
          expect(d.x + DOOR_WIDTH).toBeLessThanOrEqual(b.x + b.w - DOOR_MARGIN);
          expect(d.x).toBeGreaterThanOrEqual(0);
          expect(d.x + DOOR_WIDTH).toBeLessThanOrEqual(width);
          expect([0, 1, 2]).toContain(d.variant);
        });
      }
    }
  });
  it('aucune entrée sur les immeubles du fond', () => {
    const far = citySkyline(720, 340, 5).filter((b) => b.far);
    const near = citySkyline(720, 340, 5).filter((b) => !b.far);
    for (const d of doorsFor(720, 340, 5)) {
      // Chaque entrée tombe dans un immeuble du premier plan (même si un immeuble du fond se trouve derrière).
      expect(near.some((b) => d.x >= b.x && d.x + DOOR_WIDTH <= b.x + b.w)).toBe(true);
    }
    expect(far.length).toBeGreaterThan(0);
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
    const arrive = tripAt({ ...inn, phase: 0 }, 720, Math.min(inn.dir > 0 ? inn.doorX + WORLD_MARGIN : 720 + WORLD_MARGIN - inn.doorX, MAX_TRIP_PX) / inn.speed - 0.01);
    expect(arrive).not.toBeNull();
    expect(Math.abs(arrive!.x - inn.doorX)).toBeLessThan(inn.speed * 0.05);
    expect(arrive!.fade).toBeLessThan(0.05);
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

describe('trajets plafonnés sur un grand monde', () => {
  const width = 2880;
  const doors = doorsFor(width, 340, 5);
  const trips = tripsFor(doors, 5);
  it('ne parcourent jamais plus de MAX_TRIP_PX et ne sont jamais coupés par le cycle', () => {
    expect(trips.length).toBeGreaterThan(0);
    // une porte au-delà du bord du monde (dernier immeuble qui dépasse) n'a pas de trajet visible dans ce sens
    for (const trip of trips.filter((t) => (t.dir > 0 ? width + WORLD_MARGIN - t.doorX : t.doorX + WORLD_MARGIN) > 60 && (t.dir > 0 ? t.doorX + WORLD_MARGIN : width + WORLD_MARGIN - t.doorX) > 60)) {
      const base = { ...trip, phase: 0 };
      let prev: { x: number; fade: number } | null = null;
      let maxFade = 0;
      let steps = 0;
      for (let t = 0; t < TRIP_CYCLE; t += 0.05) {
        const p = tripAt(base, width, t);
        if (!p) {
          // une fois terminé, plus jamais reparti dans le même cycle
          expect(tripAt(base, width, Math.min(TRIP_CYCLE - 0.01, t + 20))).toBeNull();
          break;
        }
        if (prev) expect(Math.abs(p.x - prev.x)).toBeLessThan(trip.speed * 0.05 + 1e-6);
        expect(Math.abs(p.x - trip.doorX)).toBeLessThanOrEqual(MAX_TRIP_PX + 1);
        maxFade = Math.max(maxFade, p.fade);
        prev = p;
        steps++;
      }
      expect(steps).toBeGreaterThan(10);
      expect(maxFade).toBe(1);
      expect(prev!.fade).toBeLessThan(0.1);
      expect(tripAt(base, width, 0)!.fade).toBe(0);
    }
  });
  it('un habitant qui sort loin du bord s’efface au plafond', () => {
    const out = trips.find((t) => t.kind === 'out' && (t.dir > 0 ? width + WORLD_MARGIN - t.doorX : t.doorX + WORLD_MARGIN) > MAX_TRIP_PX + 50)!;
    expect(out).toBeDefined();
    const end = MAX_TRIP_PX / out.speed;
    expect(tripAt({ ...out, phase: 0 }, width, end - 0.01)!.fade).toBeLessThan(0.05);
    expect(tripAt({ ...out, phase: 0 }, width, end + 0.01)).toBeNull();
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

describe('densité d’habitants (une entrée par immeuble)', () => {
  const intensity = (minutes: number, d: number) => cityIntensity({ minutes, day: dayContext({ y: 2026, m: 10, d }, []), precip: 0, snow: false, storm: false, daylight: 1 });
  it('la probabilité par trajet baisse avec le nombre d’entrées, pas en deçà de la densité de référence', () => {
    const i = intensity(8 * 60, 5);
    expect(residentFlow(i, 480, RESIDENT_DOORS_PER_720, 720)).toEqual(residentFlow(i, 480));
    expect(residentFlow(i, 480, RESIDENT_DOORS_PER_720 * 2, 720).out).toBeCloseTo(residentFlow(i, 480).out / 2, 6);
    expect(residentFlow(i, 480, 2, 720)).toEqual(residentFlow(i, 480));
    // Monde deux fois plus large, deux fois plus d'entrées : même probabilité.
    expect(residentFlow(i, 480, 28, 1440).out).toBeCloseTo(residentFlow(i, 480, 14, 720).out, 6);
  });
  it('au plus 6 habitants visibles à la fois par 720 px sur une journée de semaine et de week-end', () => {
    for (const seed of [1, 5]) {
      const doors = doorsFor(720, 340, seed);
      const trips = tripsFor(doors, seed);
      let max = 0;
      for (const d of [5, 10]) {
        for (let m = 0; m < 1440; m += 10) {
          const flow = residentFlow(intensity(m, d), m, doors.length, 720);
          for (let k = 0; k < 8; k++) {
            const t = 1.76e9 + d * 1e5 + m * 60 + k * 41.7;
            const visible = trips.filter((tr) => {
              const p = tripAt(tr, 720, t);
              return p !== null && p.x >= 0 && p.x <= 720 && tripHappens(tr, t, tr.kind === 'out' ? flow.out : flow.in);
            }).length;
            max = Math.max(max, visible);
          }
        }
      }
      expect(max).toBeLessThanOrEqual(6);
    }
  });
});
