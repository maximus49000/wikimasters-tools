// tests/core/library/city-events.test.ts
import { describe, expect, it } from 'vitest';
import {
  EVENT_DEFS, HYPER_S, MAX_EVENTS, SLOT_S, activeEvents, cityEventSchedule, conditionsKey, defOf, eligible, eventX, hyperStartMinute, mergeSchedules, travelSpan, weightOf,
  type CityEvent,
  type EventConditions, type ScheduleInput,
} from '../../../src/core/library/city/events';
import { STREET_SCALE, FAR_SHRINK } from '../../../src/core/library/city/metrics';
import { LANE_DIR, VEHICLE_HALF, laneSpeeds, vehiclesFor } from '../../../src/core/library/city/vehicles';
import { santaWindowsIn } from '../../../src/core/library/city/santa';
import { WORLD_MARGIN, loopX } from '../../../src/core/library/scene-world';

const DAY_DRY: EventConditions = { daylight: 1, wet: false, workday: true, traffic: 0.6, walkers: 0.5, fests: [] };
const NIGHT_DRY: EventConditions = { daylight: 0, wet: false, workday: true, traffic: 0.2, walkers: 0.2, fests: [] };
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
  it('le feu d’artifice n’a pas de bande de hauteur (il part toujours du haut de la scène)', () => {
    expect(defOf('fireworks').y).toBeUndefined();
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

describe('minute du début du grand créneau', () => {
  // La minute de la scène est la minute entière (arrondie vers le bas) de l'horloge : le résultat ne dépend pas de la seconde.
  it('ne dépend pas de la seconde du chargement', () => {
    const hyper = 1_491_000;
    const t0 = hyper * HYPER_S;
    // 7 min 5 s puis 7 min 55 s après le début du grand créneau, scène à 8 h 07.
    expect(hyperStartMinute(487, t0 + 7 * 60 + 5, hyper)).toBe(480);
    expect(hyperStartMinute(487, t0 + 7 * 60 + 55, hyper)).toBe(480);
    expect(hyperStartMinute(487, t0 + 7 * 60, hyper)).toBe(480);
  });
  it('reste dans la journée (0 à 1439)', () => {
    const hyper = 1_491_000;
    expect(hyperStartMinute(3, hyper * HYPER_S + 10 * 60 + 30, hyper)).toBe(1433);
  });
});

describe('fusion des programmes', () => {
  const ev = (key: string, id: CityEvent['id'], start: number, end: number, track: CityEvent['track'] = null): CityEvent => ({
    key, id, layer: track ? 'street' : 'sky', start, end, dir: 1, track, speed: 10, x0: 0, y: 0, pick: 0, variant: 0, yields: [],
  });
  it('garde intacts les événements déjà partis, ne prend du nouveau programme que ceux qui partent après maintenant', () => {
    const kept = ev('a', 'plane', 100, 200);
    const previous = [kept, ev('b', 'drone', 300, 400)];
    const next = [ev('c', 'helicopter', 120, 220), ev('d', 'balloon', 260, 380)];
    const merged = mergeSchedules(previous, next, 150);
    expect(merged[0]).toBe(kept);
    expect(merged.map((e) => e.key)).toEqual(['a', 'd']);
    expect(merged.filter((e) => e !== kept).every((e) => e.start > 150)).toBe(true);
  });
  it('respecte le plafond simultané, jamais deux fois le même événement ni la même file', () => {
    const previous = [ev('a', 'plane', 100, 300), ev('b', 'bus', 110, 290, 'near')];
    const next = [
      ev('c', 'helicopter', 200, 250), // troisième en même temps : refusé
      ev('d', 'plane', 310, 400), // après la fin de « a » : accepté
      ev('e', 'tram', 320, 500, 'near'), // en même temps que « d » seulement : accepté
      ev('f', 'ambulance', 330, 360, 'near'), // même file que « e » (et déjà deux) : refusé
      ev('g', 'plane', 350, 420), // même événement que « d » : refusé
    ];
    const merged = mergeSchedules(previous, next, 150);
    expect(merged.map((e) => e.key)).toEqual(['a', 'b', 'd', 'e']);
    for (let t = 100; t < 500; t++) {
      const a = activeEvents(merged, t);
      expect(a.length).toBeLessThanOrEqual(MAX_EVENTS);
      expect(new Set(a.map((e) => e.id)).size).toBe(a.length);
      const tracks = a.map((e) => e.track).filter((x) => x !== null);
      expect(new Set(tracks).size).toBe(tracks.length);
    }
  });
  it('sans changement, la fusion rend le même programme', () => {
    const s = cityEventSchedule(input(1_440_123, DAY_DRY, 600));
    const now = 1_440_123 * HYPER_S + 600;
    expect(mergeSchedules(s, s, now)).toEqual(s);
  });
});

describe('fêtes', () => {
  const base = { daylight: 0, wet: false, workday: true, traffic: 0.5, walkers: 0.5 };
  it('le poids d’un événement monte pendant sa fête', () => {
    const fw = defOf('fireworks');
    expect(weightOf(fw, { ...base, fests: [] })).toBe(0.25);
    expect(weightOf(fw, { ...base, fests: ['new-year'] })).toBe(10);
    expect(weightOf(fw, { ...base, fests: ['bastille'] })).toBe(5);
    expect(weightOf(defOf('plane'), { ...base, fests: ['new-year'] })).toBe(3);
  });
  it('la clé de conditions change à l’entrée d’une fête', () => {
    expect(conditionsKey({ ...base, fests: [] })).not.toBe(conditionsKey({ ...base, fests: ['new-year'] }));
  });
  const fireworks = (cond: EventConditions, minutes: number, n = 40) => many(cond, minutes, n).filter((e) => e.id === 'fireworks').length;
  it('le Nouvel An donne beaucoup plus de feux d’artifice qu’un soir ordinaire (même graine, 40 grands créneaux)', () => {
    const ordinary = fireworks({ ...base, fests: [] }, 22 * 60);
    const newYear = fireworks({ ...base, fests: ['new-year'] }, 22 * 60);
    expect(newYear).toBeGreaterThanOrEqual(10);
    expect(newYear).toBeGreaterThan(3 * ordinary);
  });
  it('pas de feu d’artifice sous la pluie, même le soir de fête', () => {
    expect(fireworks({ ...base, wet: true, fests: ['new-year'] }, 22 * 60, 120)).toBe(0);
  });
});

describe('père Noël et ciel', () => {
  const eve: EventConditions = { ...NIGHT_DRY, fests: ['christmas-eve'] };
  it('pendant un passage du père Noël, aucun événement de ciel n’est tiré', () => {
    let skyAlone = 0;
    for (let h = 1_440_000; h < 1_440_040; h++) {
      const windows = santaWindowsIn(h * HYPER_S, (h + 1) * HYPER_S, 7);
      for (const e of cityEventSchedule(input(h, eve, 22 * 60))) {
        if (e.layer === 'sky') skyAlone++;
        expect(windows.some((w) => w.start < e.end && e.start < w.end && e.layer === 'sky')).toBe(false);
      }
    }
    // Le test n’est pas vide : des événements de ciel sont bien tirés en dehors des passages.
    expect(skyAlone).toBeGreaterThan(0);
  });
  it('hors fêtes, le programme est inchangé', () => {
    for (let h = 1_440_000; h < 1_440_020; h++) {
      expect(cityEventSchedule(input(h, NIGHT_DRY, 22 * 60))).toEqual(cityEventSchedule(input(h, { ...NIGHT_DRY, fests: [] }, 22 * 60)));
    }
  });
});
