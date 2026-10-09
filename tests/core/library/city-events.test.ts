// tests/core/library/city-events.test.ts
import { describe, expect, it } from 'vitest';
import {
  EVENT_DEFS, HYPER_S, MAX_EVENTS, SLOT_S, activeEvents, cityEventSchedule, conditionsKey, defOf, eligible, eventX, travelSpan,
  type EventConditions, type ScheduleInput,
} from '../../../src/core/library/city/events';
import { STREET_SCALE, FAR_SHRINK } from '../../../src/core/library/city/metrics';
import { LANE_DIR, VEHICLE_HALF, laneSpeeds, vehiclesFor } from '../../../src/core/library/city/vehicles';
import { WORLD_MARGIN, loopX } from '../../../src/core/library/scene-world';

const DAY_DRY: EventConditions = { daylight: 1, wet: false, workday: true, traffic: 0.6, walkers: 0.5 };
const NIGHT_DRY: EventConditions = { daylight: 0, wet: false, workday: true, traffic: 0.2, walkers: 0.2 };
const input = (hyper: number, cond: EventConditions, minutes: number, seed = 7, width = 720): ScheduleInput => ({
  seed, width, hyper, minutesAtHyperStart: minutes, cond, vehicles: vehiclesFor(width, seed), speeds: laneSpeeds(seed),
});
const many = (cond: EventConditions, minutes: number, n = 120) => Array.from({ length: n }, (_, h) => cityEventSchedule(input(1_440_000 + h, cond, minutes))).flat();

describe('catalogue', () => {
  it('contient 16 événements, sans enseigne néon', () => {
    expect(EVENT_DEFS).toHaveLength(16);
    expect(EVENT_DEFS.map((d) => d.id)).not.toContain('neon');
    expect(new Set(EVENT_DEFS.map((d) => d.id)).size).toBe(16);
  });
  it('vitesse de laneSpeeds identique à celle des véhicules de la file', () => {
    const s = laneSpeeds(7);
    for (const v of vehiclesFor(720, 7)) expect(v.speed).toBeCloseTo(v.kind === 'bike' ? s.bike : s[v.lane], 9);
  });
});

describe('conditions', () => {
  it('pas de feu d’artifice ni d’appartement de jour, pas de cerf-volant sous la pluie', () => {
    expect(eligible(defOf('fireworks'), 22 * 60, DAY_DRY)).toBe(false);
    expect(eligible(defOf('fireworks'), 22 * 60, NIGHT_DRY)).toBe(true);
    expect(eligible(defOf('fireworks'), 22 * 60, { ...NIGHT_DRY, wet: true })).toBe(false);
    expect(eligible(defOf('apartment'), 19 * 60, DAY_DRY)).toBe(false);
    expect(eligible(defOf('kite'), 14 * 60, { ...DAY_DRY, wet: true })).toBe(false);
    expect(eligible(defOf('umbrella-group'), 14 * 60, DAY_DRY)).toBe(false);
    expect(eligible(defOf('umbrella-group'), 14 * 60, { ...DAY_DRY, wet: true })).toBe(true);
    expect(eligible(defOf('crane'), 10 * 60, { ...DAY_DRY, workday: false })).toBe(false);
    expect(eligible(defOf('garbage-truck'), 14 * 60, DAY_DRY)).toBe(false);
    expect(eligible(defOf('garbage-truck'), 7 * 60, DAY_DRY)).toBe(true);
  });
  it('les plages qui passent minuit sont respectées', () => {
    expect(eligible(defOf('tram'), 10, NIGHT_DRY)).toBe(true); // 0 h 10
    expect(eligible(defOf('tram'), 3 * 60, NIGHT_DRY)).toBe(false);
  });
  it('la clé ne change que si une condition passe un seuil', () => {
    expect(conditionsKey({ ...DAY_DRY, traffic: 0.6 })).toBe(conditionsKey({ ...DAY_DRY, traffic: 0.9 }));
    expect(conditionsKey(DAY_DRY)).not.toBe(conditionsKey({ ...DAY_DRY, wet: true }));
    expect(conditionsKey(DAY_DRY)).not.toBe(conditionsKey(NIGHT_DRY));
  });
});

describe('programme', () => {
  it('est déterministe', () => {
    expect(cityEventSchedule(input(1_440_123, DAY_DRY, 600))).toEqual(cityEventSchedule(input(1_440_123, DAY_DRY, 600)));
  });
  it('ne déborde jamais de son grand créneau et respecte le plafond simultané', () => {
    for (let h = 1_440_000; h < 1_440_060; h++) {
      const s = cityEventSchedule(input(h, DAY_DRY, 600));
      for (const e of s) {
        expect(e.start).toBeGreaterThanOrEqual(h * HYPER_S);
        expect(e.end).toBeLessThanOrEqual((h + 1) * HYPER_S);
      }
      for (let t = h * HYPER_S; t < (h + 1) * HYPER_S; t += 1) {
        const a = activeEvents(s, t);
        expect(a.length).toBeLessThanOrEqual(MAX_EVENTS);
        expect(new Set(a.map((e) => e.id)).size).toBe(a.length);
        const tracks = a.map((e) => e.track).filter((x) => x !== null);
        expect(new Set(tracks).size).toBe(tracks.length);
      }
    }
  });
  it('« de temps en temps » : entre 5 % et 20 % des créneaux lancent un événement', () => {
    const n = 200;
    const count = many(DAY_DRY, 600, n).length;
    expect(count / (n * (HYPER_S / SLOT_S))).toBeGreaterThan(0.05);
    expect(count / (n * (HYPER_S / SLOT_S))).toBeLessThan(0.2);
  });
  it('la nuit à 22 h il n’y a ni cerf-volant ni drone ; de jour aucun feu d’artifice', () => {
    expect(many(NIGHT_DRY, 22 * 60).some((e) => e.id === 'kite' || e.id === 'drone')).toBe(false);
    expect(many(DAY_DRY, 12 * 60).some((e) => e.id === 'fireworks')).toBe(false);
  });
});

describe('trajets', () => {
  it('une traversée avance à vitesse constante, de bord à bord', () => {
    const e = many(DAY_DRY, 600).find((x) => x.layer === 'sky')!;
    expect(eventX(e, 720, e.start + 1) - eventX(e, 720, e.start)).toBeCloseTo(e.dir * e.speed, 6);
    expect(eventX(e, 720, e.start)).toBeCloseTo(e.dir > 0 ? -WORLD_MARGIN : 720 + WORLD_MARGIN, 6);
    expect(e.end - e.start).toBeCloseTo(travelSpan(720) / e.speed, 6);
  });
  it('un événement fixe reste à sa place', () => {
    const e = many(DAY_DRY, 600).find((x) => x.layer === 'fixed')!;
    expect(eventX(e, 720, e.start)).toBe(eventX(e, 720, e.end - 1));
  });
  it('un véhicule d’événement à la vitesse de sa file efface les voitures collées à lui, à distance constante', () => {
    const all = many(DAY_DRY, 8 * 60, 300);
    const e = all.find((x) => (x.id === 'bus' || x.id === 'tram') && x.yields.length > 0);
    expect(e).toBeDefined();
    const vehicles = vehiclesFor(720, 7);
    const L = travelSpan(720);
    const dist = (vx: number, ex: number) => { const d = (((vx - ex) % L) + L) % L; return Math.min(d, L - d); };
    for (const id of e!.yields) {
      const v = vehicles.find((x) => x.id === id)!;
      expect(v.lane).toBe(e!.track);
      expect(v.kind).not.toBe('bike');
      const at = (t: number) => dist(loopX(v.phase, LANE_DIR[v.lane] * v.speed, 720, t), eventX(e!, 720, t));
      expect(at(e!.start)).toBeLessThan(defOf(e!.id).half + VEHICLE_HALF[v.kind] * STREET_SCALE.vehicle * v.scale * (v.lane === 'far' ? FAR_SHRINK : 1) + 10.001);
      expect(at((e!.start + e!.end) / 2)).toBeCloseTo(at(e!.start), 4);
    }
  });
  it('l’ambulance n’efface personne (les voitures se rangent)', () => {
    for (const e of many(DAY_DRY, 600, 300).filter((x) => x.id === 'ambulance')) expect(e.yields).toEqual([]);
  });
});
