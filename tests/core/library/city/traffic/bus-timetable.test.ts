import { describe, expect, it } from 'vitest';
import { FIRST_BUS, LAST_BUS, MIN_GAP, PEAK_HEADWAY, busArrivals, headwayAt, lineHeadwayAt, serviceDepartures, serviceKindOf, stopDepartures } from '../../../../../src/core/library/city/traffic/bus-timetable';
import { createStopCrowd, stepStops, type StopEnv } from '../../../../../src/core/library/city/traffic/bus-stop';

describe('horaires des bus', () => {
  it('service de 6 h 50 à 0 h 30 en semaine, 8 h le dimanche ; dernier passage à 0 h 30', () => {
    for (const kind of ['week', 'saturday', 'sunday'] as const) {
      const deps = serviceDepartures(7, 100, 'near', kind);
      expect(deps[0]).toBeGreaterThanOrEqual(FIRST_BUS[kind]);
      expect(deps[0]).toBeLessThan(FIRST_BUS[kind] + 8);
      expect(deps[deps.length - 1]).toBeLessThanOrEqual(LAST_BUS);
      expect(deps[deps.length - 1]).toBeGreaterThan(LAST_BUS - 40);
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

describe('lignes de l’arrêt, chacune à sa fréquence', () => {
  it('seules les lignes de la plaque passent, chacune avec sa grille et sa fréquence', () => {
    const day = busArrivals({ seed: 3, day: 200, nowS: 0, minutes: 12 * 60, today: 'week', yesterday: 'week', ahead: 45, lines: 3 });
    expect(new Set(day.map((a) => a.line))).toEqual(new Set([0, 1, 2]));
    expect(busArrivals({ seed: 3, day: 200, nowS: 0, minutes: 12 * 60, today: 'week', yesterday: 'week', lines: 2 }).every((a) => a.line! < 2)).toBe(true);
    // Arrivées triées par heure : deux lignes peuvent se suivre à une minute d'écart.
    for (let i = 1; i < day.length; i++) expect(day[i]!.start).toBeGreaterThanOrEqual(day[i - 1]!.start);
    // La première ligne est la plus fréquente ; jamais plus d'une heure entre deux bus d'une ligne.
    expect(lineHeadwayAt(720, 'week', 0)).toBeLessThan(lineHeadwayAt(720, 'week', 2));
    for (let line = 0; line < 3; line++) {
      const deps = serviceDepartures(5, 90, 'near', 'week', line);
      for (let i = 1; i < deps.length; i++) expect(deps[i]! - deps[i - 1]!).toBeLessThanOrEqual(60);
    }
  });
});

describe('pointes et écart entre les bus', () => {
  it('aux heures de pointe de la semaine, chaque ligne passe toutes les 8 minutes (pas le samedi ni le dimanche)', () => {
    for (const m of [480, 540, 1000, 1100]) for (let line = 0; line < 3; line++) expect(lineHeadwayAt(m, 'week', line)).toBe(PEAK_HEADWAY);
    expect(PEAK_HEADWAY).toBe(8);
    expect(lineHeadwayAt(480, 'saturday', 0)).toBeGreaterThan(8);
    expect(lineHeadwayAt(720, 'sunday', 0)).toBeGreaterThan(8);
    const deps = serviceDepartures(3, 50, 'near', 'week', 2).filter((m) => m >= 500 && m < 560);
    for (let i = 1; i < deps.length; i++) expect(deps[i]! - deps[i - 1]!).toBe(8);
  });
  it('jamais deux bus à la même heure à un arrêt : au moins 2 minutes entre deux passages, toutes lignes confondues', () => {
    for (let seed = 1; seed < 40; seed++) {
      for (const kind of ['week', 'saturday', 'sunday'] as const) {
        for (const side of ['near', 'far'] as const) {
          const deps = stopDepartures(seed, 200 + seed, side, kind, 3);
          expect(deps.length).toBeGreaterThan(30);
          for (let i = 1; i < deps.length; i++) expect(deps[i]!.m - deps[i - 1]!.m).toBeGreaterThanOrEqual(MIN_GAP);
        }
      }
    }
    const arr = busArrivals({ seed: 9, day: 300, nowS: 0, minutes: 8 * 60, today: 'week', yesterday: 'week', lines: 3 });
    for (const side of ['near', 'far'] as const) {
      const s = arr.filter((a) => a.track === side);
      for (let i = 1; i < s.length; i++) expect(s[i]!.start - s[i - 1]!.start).toBeGreaterThanOrEqual(MIN_GAP * 60);
    }
  });
});

describe('grille cadencée validée (2026-10-13)', () => {
  const h = (m: number, kind: 'week' | 'saturday' | 'sunday') => [0, 1, 2].map((l) => lineHeadwayAt(m, kind, l));
  it('semaine, samedi plus fourni en journée, dimanche réduit', () => {
    expect(h(420, 'week')).toEqual([24, 32, 40]);
    expect(h(500, 'week')).toEqual([8, 8, 8]);
    expect(h(720, 'week')).toEqual([16, 24, 32]);
    expect(h(1050, 'week')).toEqual([8, 8, 8]);
    expect(h(1200, 'week')).toEqual([24, 32, 40]);
    expect(h(1300, 'week')).toEqual([40, 48, 56]);
    expect(h(500, 'saturday')).toEqual([24, 32, 40]);
    expect(h(720, 'saturday')).toEqual([16, 16, 24]);
    expect(h(1050, 'saturday')).toEqual([16, 16, 24]);
    expect(h(1200, 'saturday')).toEqual([24, 24, 32]);
    expect(h(1300, 'saturday')).toEqual([32, 40, 48]);
    expect(h(600, 'sunday')).toEqual([32, 40, 48]);
    expect(h(900, 'sunday')).toEqual([24, 32, 40]);
    expect(h(1200, 'sunday')).toEqual([40, 48, 56]);
    expect(serviceDepartures(1, 9, 'near', 'sunday', 2)[0]).toBeGreaterThanOrEqual(8 * 60);
  });
  it('aucun bus retardé : chaque ligne garde sa minute dans le cycle de 8, et les lignes ne se croisent jamais', () => {
    for (let seed = 1; seed < 20; seed++) {
      for (const kind of ['week', 'saturday', 'sunday'] as const) {
        const phases = [0, 1, 2].map((l) => new Set(serviceDepartures(seed, 400 + seed, 'far', kind, l).map((m) => m % 8)));
        for (const p of phases) expect(p.size).toBe(1);
        expect(new Set(phases.map((p) => [...p][0])).size).toBe(3);
        const all = stopDepartures(seed, 400 + seed, 'far', kind, 3);
        expect(all.map((d) => d.m)).toEqual([0, 1, 2].flatMap((l) => serviceDepartures(seed, 400 + seed, 'far', kind, l)).sort((x, y) => x - y));
      }
    }
  });
});

describe('voyageurs et horaires', () => {
  const env = (nextBus: StopEnv['nextBus'], buses: StopEnv['buses'] = { near: null, far: null }): StopEnv => ({ stopX: { near: 400, far: 600 }, buses, crowd: 1, closed: false, width: 1000, margin: 90, unit: 1, nextBus });
  const both = (list: { line: string; in: number }[]): StopEnv['nextBus'] => ({ near: list, far: list });
  it('personne ne vient attendre quand aucun bus n’est attendu (nuit)', () => {
    const c = createStopCrowd(2, 0);
    for (let t = 0; t < 900; t += 0.1) stepStops(c, env(both([])), t, 0.1);
    expect(c.riders).toEqual([]);
  });
  it('on ne vient que dans le quart d’heure qui précède le bus', () => {
    const c = createStopCrowd(2, 0);
    for (let t = 0; t < 600; t += 0.1) stepStops(c, env(both([{ line: '3', in: 40 * 60 }])), t, 0.1);
    expect(c.riders).toEqual([]);
    for (let t = 600; t < 1200; t += 0.1) stepStops(c, env(both([{ line: '3', in: 5 * 60 }])), t, 0.1);
    expect(c.riders.length).toBeGreaterThan(0);
  });
  it('après le dernier bus, ceux qui attendent repartent à pied par un bord', () => {
    const c = createStopCrowd(2, 0);
    for (let t = 0; t < 900; t += 0.1) stepStops(c, env(both([{ line: '3', in: 300 }])), t, 0.1);
    expect(c.riders.some((p) => p.stage === 'wait')).toBe(true);
    for (let t = 900; t < 1100; t += 0.1) stepStops(c, env(both([])), t, 0.1);
    expect(c.riders).toEqual([]);
  });
  it('chacun attend une ligne dont le bus passe bientôt, et laisse passer les bus des autres lignes', () => {
    const c = createStopCrowd(6, 0);
    const soon = both([{ line: '15', in: 120 }, { line: '16', in: 60 }, { line: '9', in: 40 * 60 }]);
    for (let t = 0; t < 600; t += 0.1) stepStops(c, env(soon), t, 0.1);
    const waiting = c.riders.filter((p) => p.side === 'near' && p.stage === 'wait');
    expect(waiting.length).toBeGreaterThan(1);
    for (const p of c.riders) expect(['15', '16']).toContain(p.line);
    // Le 16 marque l'arrêt : seuls ceux du 16 montent, ceux du 15 restent au poteau.
    const for15 = waiting.filter((p) => p.line === '15').map((p) => p.id);
    const for16 = waiting.filter((p) => p.line === '16').map((p) => p.id);
    expect(for15.length).toBeGreaterThan(0);
    const at = env(soon, { near: { id: 'b16', door: 420, line: '16' }, far: null });
    let held = false;
    for (let t = 600; t < 640; t += 0.1) held = stepStops(c, at, t, 0.1).hold.has('b16') || held;
    const ids = new Set(c.riders.map((p) => p.id));
    for (const id of for15) expect(c.riders.find((p) => p.id === id)?.stage).toBe('wait');
    for (const id of for16) expect(ids.has(id)).toBe(false);
    if (for16.length > 0) expect(held).toBe(true);
  });
  it('quand sa ligne n’a plus de bus, le voyageur renonce ; ceux des autres lignes restent', () => {
    const c = createStopCrowd(6, 0);
    for (let t = 0; t < 600; t += 0.1) stepStops(c, env(both([{ line: '15', in: 300 }, { line: '16', in: 300 }])), t, 0.1);
    for (let t = 600; t < 800; t += 0.1) stepStops(c, env(both([{ line: '16', in: 100 }])), t, 0.1);
    const left = c.riders.filter((p) => p.stage === 'arrive' || p.stage === 'wait');
    expect(left.length).toBeGreaterThan(0);
    for (const p of left) expect(p.line).toBe('16');
  });
});

describe('panneau « Prochain bus » et ligne du bus à horaires', () => {
  const line = (ref: string) => ({ ref, from: 'A', to: 'B', colour: '#2f7d64', stops: ['A', 'M', 'B'] });
  it('le moteur annonce le prochain bus de chaque ligne de l’arrêt, du plus proche au plus lointain ; le bus porte sa ligne', async () => {
    const { warmTraffic, advance } = await import('../../../../../src/core/library/city/traffic/engine');
    const T0 = 1_800_000_000;
    const env = {
      demand: { near: 0, far: 0, bike: 0 }, closed: false, deliveries: [], crowd: 0.5, crossPx: 90, timetable: true,
      busLines: [line('3'), line('6'), line('9'), line('15'), line('16')],
      arrivals: [
        { key: 'bus-a', kind: 'bus' as const, track: 'near' as const, start: T0 + 300, line: 1 },
        { key: 'bus-b', kind: 'bus' as const, track: 'near' as const, start: T0 + 120, line: 2 },
        { key: 'bus-c', kind: 'bus' as const, track: 'near' as const, start: T0 + 900, line: 1 },
      ],
    };
    const w = warmTraffic({ width: 1080, seed: 4, unit: 1, startS: T0 }, env);
    advance(w, T0 + 1, env);
    expect(w.nextBus.near.map((n) => n.line.ref)).toEqual(['9', '6']);
    expect(w.nextBus.near[0]!.in).toBeGreaterThan(100);
    expect(w.nextBus.far).toEqual([]);
    advance(w, T0 + 125, env);
    const bus = w.agents.find((a) => a.event === 'bus-b');
    expect(bus?.special?.line?.ref).toBe('9');
    expect(w.nextBus.near[0]).toMatchObject({ in: 0, line: { ref: '9' } });
  });
  it('route coupée (fête de la musique, 14 Juillet) : aucun bus ne passe, l’arrêt est annoncé non desservi', async () => {
    const { warmTraffic, advance } = await import('../../../../../src/core/library/city/traffic/engine');
    const T0 = 1_800_000_000;
    const env = {
      demand: { near: 0, far: 0, bike: 0 }, closed: true, deliveries: [], crowd: 0, crossPx: 90, timetable: true,
      busLines: [line('3'), line('6'), line('9')],
      arrivals: [0, 1, 2].map((i) => ({ key: `bus-${i}`, kind: 'bus' as const, track: 'near' as const, start: T0 + 30 + i * 200, line: i })),
    };
    const w = warmTraffic({ width: 1080, seed: 4, unit: 1, startS: T0 }, env);
    for (let t = T0 + 1; t < T0 + 800; t += 20) {
      advance(w, t, env);
      expect(w.agents.some((a) => a.kind === 'bus')).toBe(false);
      expect(w.nextBus.near).toEqual([]);
      expect(w.stopClosed).toBe(true);
    }
  });
  it('une ligne hors de la plaque (au-delà des 3 premières) ne passe jamais', async () => {
    const { warmTraffic, advance } = await import('../../../../../src/core/library/city/traffic/engine');
    const T0 = 1_800_000_000;
    const env = {
      demand: { near: 0, far: 0, bike: 0 }, closed: false, deliveries: [], crowd: 0, crossPx: 90, timetable: true,
      busLines: [line('3'), line('6'), line('9'), line('15')],
      arrivals: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `bus-${i}`, kind: 'bus' as const, track: 'far' as const, start: T0 + 60 + i * 400, line: i })),
    };
    const w = warmTraffic({ width: 1080, seed: 4, unit: 1, startS: T0 }, env);
    for (let t = T0 + 1; t < T0 + 2600; t += 50) {
      advance(w, t, env);
      for (const n of w.nextBus.far) expect(['3', '6', '9']).toContain(n.line.ref);
      for (const a of w.agents) if (a.kind === 'bus') expect(['3', '6', '9']).toContain(a.special?.line?.ref);
    }
  });
});
