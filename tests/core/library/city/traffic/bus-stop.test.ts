import { describe, expect, it } from 'vitest';
import { advance, warmTraffic, MARGIN, type TrafficEnv, type TrafficWorld } from '../../../../../src/core/library/city/traffic/engine';
import { createStopCrowd, stepStops, STOP_WAIT_MAX, type StopEnv } from '../../../../../src/core/library/city/traffic/bus-stop';

const T0 = 1_800_000_000;
const env = (extra: Partial<TrafficEnv> = {}): TrafficEnv => ({ demand: { near: 0.2, far: 0.2, bike: 0 }, closed: false, arrivals: [], deliveries: [], crowd: 0.9, crossPx: 90, ...extra });
const stopEnv = (extra: Partial<StopEnv> = {}): StopEnv => ({ stopX: { near: 400, far: 600 }, buses: { near: null, far: null }, crowd: 1, closed: false, width: 1000, margin: 90, unit: 1, ...extra });
const run = (c: ReturnType<typeof createStopCrowd>, e: StopEnv, from: number, secs: number) => {
  const holds = new Set<string>();
  for (let t = from; t < from + secs; t += 0.1) for (const id of stepStops(c, e, t, 0.1).hold) holds.add(id);
  return holds;
};

describe('voyageurs des arrêts de bus', () => {
  it('arrivent à pied par un bord et attendent au poteau, 5 au plus par arrêt', () => {
    const c = createStopCrowd(3, 0);
    const born = new Map<string, number>();
    for (let t = 0; t < 900; t += 0.1) {
      stepStops(c, stopEnv(), t, 0.1);
      for (const p of c.riders) if (!born.has(p.id)) born.set(p.id, p.x);
    }
    for (const x of born.values()) expect(Math.min(Math.abs(x + 90), Math.abs(x - 1090))).toBeLessThan(2);
    for (const side of ['near', 'far'] as const) {
      const waiting = c.riders.filter((p) => p.side === side && p.stage === 'wait');
      expect(waiting.length).toBeGreaterThan(0);
      expect(waiting.length).toBeLessThanOrEqual(STOP_WAIT_MAX);
      for (const p of waiting) expect(Math.abs(p.x - (side === 'near' ? 400 : 600))).toBeLessThanOrEqual(23.5);
      expect(new Set(waiting.map((p) => Math.round(p.x))).size).toBe(waiting.length);
    }
  });
  it('montent par la porte quand un bus marque l’arrêt ; 0 à 3 descendent et repartent vers un bord ; le bus est retenu', () => {
    const c = createStopCrowd(5, 0);
    run(c, stopEnv(), 0, 600);
    const waiting = c.riders.filter((p) => p.side === 'near' && p.stage === 'wait').length;
    expect(waiting).toBeGreaterThan(0);
    const bus = stopEnv({ buses: { near: { id: 'b1', door: 410 }, far: null } });
    const holds = run(c, bus, 600, 4);
    expect(holds.has('b1')).toBe(true);
    // Pendant l'arrêt : marche jusqu'à la porte, montée, descente.
    run(c, bus, 604, 12);
    expect(c.riders.filter((p) => p.side === 'near' && (p.stage === 'wait' || p.stage === 'board' || p.stage === 'step'))).toEqual([]);
    expect(stepStops(c, bus, 616, 0.1).hold.has('b1')).toBe(false);
    // Bus reparti : ceux qui sont descendus repartent à pied et sortent par un bord.
    const leaving = c.riders.filter((p) => p.side === 'near' && p.stage === 'leave');
    for (const p of leaving) expect([-90, 1090]).toContain(p.target);
    run(c, stopEnv({ crowd: 0 }), 616, 200);
    expect(c.riders.filter((p) => p.stage === 'leave')).toEqual([]);
  });
  it('route fermée : plus personne ne vient attendre', () => {
    const c = createStopCrowd(1, 0);
    run(c, stopEnv({ closed: true }), 0, 600);
    expect(c.riders).toEqual([]);
  });
});

describe('arrêt de bus dans le moteur', () => {
  const world = (e: TrafficEnv): TrafficWorld => warmTraffic({ width: 1080, seed: 4, unit: 1, startS: T0 }, e);
  it('un bus planifié marque l’arrêt, les voyageurs montent, il repart ; déterministe', () => {
    const e = env({ arrivals: [{ key: 'bus-1', kind: 'bus', track: 'near', start: T0 + 1 }] });
    const w = world(e);
    const w2 = world(e);
    let boarded = false;
    let stoppedWithRiders = false;
    for (let t = T0; t < T0 + 120; t += 0.5) {
      advance(w, t, e);
      advance(w2, t, e);
      const bus = w.agents.find((a) => a.event === 'bus-1');
      if (bus?.stop === 'bus' && w.stopCrowd.riders.some((p) => p.side === 'near' && (p.stage === 'board' || p.stage === 'step'))) stoppedWithRiders = true;
      if (w.stopCrowd.riders.some((p) => p.stage === 'step')) boarded = true;
    }
    expect(stoppedWithRiders).toBe(true);
    expect(boarded).toBe(true);
    expect(w.agents.some((a) => a.event === 'bus-1')).toBe(false);
    expect(w.stopCrowd.riders.map((p) => [p.id, p.stage, Math.round(p.x)])).toEqual(w2.stopCrowd.riders.map((p) => [p.id, p.stage, Math.round(p.x)]));
  });
  it('lignes réelles : le bus en prend une dans le sens de sa voie ; arrêt de la scène nommé', () => {
    const line = { ref: '30', from: 'Hôtel de Ville', to: 'Louise Michel', colour: '#e6007e', stops: ['Hôtel de Ville', 'Lutin', 'Brisepotière', 'Louise Michel'] };
    const e = env({ busLines: [line], arrivals: [{ key: 'b-near', kind: 'bus', track: 'near', start: T0 + 1 }, { key: 'b-far', kind: 'bus', track: 'far', start: T0 + 1 }] });
    const w = world(e);
    advance(w, T0 + 5, e);
    expect(w.agents.find((a) => a.event === 'b-near')?.special?.line).toMatchObject({ ref: '30', to: 'Louise Michel' });
    expect(w.agents.find((a) => a.event === 'b-far')?.special?.line).toMatchObject({ ref: '30', to: 'Hôtel de Ville', stops: ['Louise Michel', 'Brisepotière', 'Lutin', 'Hôtel de Ville'] });
    expect(['Lutin', 'Brisepotière']).toContain(w.stopNames.near);
    expect(['Lutin', 'Brisepotière']).toContain(w.stopNames.far);
    expect(MARGIN).toBeGreaterThan(0);
  });
  it('sans ligne réelle : lignes de repli ; car scolaire au nom de l’établissement', () => {
    const e = env({ school: 'Lycée Mounier', arrivals: [{ key: 's', kind: 'school-bus', track: 'near', start: T0 + 1 }] });
    const w = world(e);
    advance(w, T0 + 5, e);
    expect(w.lines.length).toBe(3);
    expect(w.stopNames.near.length).toBeGreaterThan(0);
    expect(w.agents.find((a) => a.event === 's')?.special).toMatchObject({ id: 'school-bus', label: 'Lycée Mounier' });
  });
});
