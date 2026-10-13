import { describe, expect, it } from 'vitest';
import { FIRST_BUS, LAST_BUS, busArrivals, headwayAt, serviceDepartures, serviceKindOf } from '../../../../../src/core/library/city/traffic/bus-timetable';
import { createStopCrowd, stepStops, type StopEnv } from '../../../../../src/core/library/city/traffic/bus-stop';

describe('horaires des bus', () => {
  it('service de 6 h 50 à 0 h 30 en semaine, 8 h le dimanche ; dernier passage à 0 h 30', () => {
    for (const kind of ['week', 'saturday', 'sunday'] as const) {
      const deps = serviceDepartures(7, 100, 'near', kind);
      expect(deps[0]).toBeGreaterThanOrEqual(FIRST_BUS[kind]);
      expect(deps[0]).toBeLessThan(FIRST_BUS[kind] + 6);
      expect(deps[deps.length - 1]).toBeLessThanOrEqual(LAST_BUS);
      expect(deps[deps.length - 1]).toBeGreaterThanOrEqual(LAST_BUS - 30);
    }
    expect(FIRST_BUS.week).toBe(6 * 60 + 50);
    expect(LAST_BUS).toBe(24 * 60 + 30);
  });
  it('peu de bus au petit matin, montée jusqu’aux pointes, espacés le soir', () => {
    expect(headwayAt(420, 'week')).toBeGreaterThan(headwayAt(480, 'week'));
    expect(headwayAt(480, 'week')).toBeLessThan(headwayAt(720, 'week'));
    expect(headwayAt(1050, 'week')).toBeLessThan(headwayAt(720, 'week'));
    expect(headwayAt(1300, 'week')).toBeGreaterThan(headwayAt(1200, 'week'));
    expect(headwayAt(480, 'saturday')).toBeGreaterThan(headwayAt(480, 'week'));
    const deps = serviceDepartures(7, 100, 'far', 'week');
    const inWindow = (a: number, b: number): number => deps.filter((m) => m >= a && m < b).length;
    expect(inWindow(480, 540)).toBeGreaterThan(inWindow(1320, 1380));
  });
  it('genre de service : dimanche et fériés, samedi, semaine', () => {
    expect(serviceKindOf(0, false)).toBe('sunday');
    expect(serviceKindOf(3, true)).toBe('sunday');
    expect(serviceKindOf(6, false)).toBe('saturday');
    expect(serviceKindOf(2, false)).toBe('week');
  });
  it('aucun bus planifié la nuit ; les passages d’après minuit viennent de la veille', () => {
    const at = (minutes: number) => busArrivals({ seed: 3, day: 200, nowS: 1000, minutes, today: 'week', yesterday: 'week', ahead: 30 });
    expect(at(3 * 60)).toEqual([]);
    const after = at(5); // 0 h 05 : passages jusqu'à 0 h 30, du service de la veille
    expect(after.length).toBeGreaterThan(0);
    for (const a of after) expect(a.key.startsWith('bus-199-')).toBe(true);
    const day = at(8 * 60);
    expect(day.some((a) => a.track === 'near')).toBe(true);
    expect(day.some((a) => a.track === 'far')).toBe(true);
    for (const a of day) expect(a.kind).toBe('bus');
  });
});

describe('voyageurs et horaires', () => {
  const env = (nextBus: StopEnv['nextBus']): StopEnv => ({ stopX: { near: 400, far: 600 }, buses: { near: null, far: null }, crowd: 1, closed: false, width: 1000, margin: 90, unit: 1, nextBus });
  it('personne ne vient attendre quand aucun bus n’est attendu (nuit)', () => {
    const c = createStopCrowd(2, 0);
    for (let t = 0; t < 900; t += 0.1) stepStops(c, env({ near: null, far: null }), t, 0.1);
    expect(c.riders).toEqual([]);
  });
  it('on ne vient que dans le quart d’heure qui précède le bus', () => {
    const c = createStopCrowd(2, 0);
    for (let t = 0; t < 600; t += 0.1) stepStops(c, env({ near: 40 * 60, far: 40 * 60 }), t, 0.1);
    expect(c.riders).toEqual([]);
    for (let t = 600; t < 1200; t += 0.1) stepStops(c, env({ near: 5 * 60, far: 5 * 60 }), t, 0.1);
    expect(c.riders.length).toBeGreaterThan(0);
  });
  it('après le dernier bus, ceux qui attendent repartent à pied par un bord', () => {
    const c = createStopCrowd(2, 0);
    for (let t = 0; t < 900; t += 0.1) stepStops(c, env({ near: 300, far: 300 }), t, 0.1);
    expect(c.riders.some((p) => p.stage === 'wait')).toBe(true);
    for (let t = 900; t < 1100; t += 0.1) stepStops(c, env({ near: null, far: null }), t, 0.1);
    expect(c.riders).toEqual([]);
  });
});

describe('panneau « Prochain bus » et ligne du bus à horaires', () => {
  it('le moteur annonce le prochain bus de chaque arrêt, avec sa ligne ; le bus porte cette ligne', async () => {
    const { warmTraffic, advance } = await import('../../../../../src/core/library/city/traffic/engine');
    const T0 = 1_800_000_000;
    const env = { demand: { near: 0, far: 0, bike: 0 }, closed: false, deliveries: [], crowd: 0.5, crossPx: 90, timetable: true, arrivals: [{ key: 'bus-x', kind: 'bus' as const, track: 'near' as const, start: T0 + 120, line: 1 }] };
    const w = warmTraffic({ width: 1080, seed: 4, unit: 1, startS: T0 }, env);
    advance(w, T0 + 1, env);
    expect(w.nextBus.near).not.toBeNull();
    expect(w.nextBus.near!.in).toBeGreaterThan(100);
    expect(w.nextBus.far).toBeNull();
    const ref = w.nextBus.near!.line.ref;
    advance(w, T0 + 125, env);
    const bus = w.agents.find((a) => a.event === 'bus-x');
    expect(bus?.special?.line?.ref).toBe(ref);
    expect(w.nextBus.near!.in).toBe(0);
  });
});
