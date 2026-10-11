import { describe, expect, it } from 'vitest';
import { MIN_GREEN, RED_WALK, lightColorAt, stepLight, type PushLight } from '../../../../../src/core/library/city/traffic/crossing';
import { DT, advance, warmTraffic, type TrafficEnv } from '../../../../../src/core/library/city/traffic/engine';

const T0 = 1_800_000_000;
const env = (crowd: number, demand = 0.8): TrafficEnv => ({ demand: { near: demand, far: demand, bike: 0.2 }, closed: false, arrivals: [], deliveries: [], crowd, crossPx: 90 });

describe('feu à bouton-poussoir', () => {
  it('sans piéton : reste vert', () => {
    const l: PushLight = { x: 500, color: 'green', since: 0, pressedAt: null, log: [{ t: 0, color: 'green' }] };
    for (let t = 0; t < 600; t += DT) stepLight(l, t);
    expect(l.color).toBe('green');
  });
  it('appui : orange puis rouge, jamais avant MIN_GREEN de vert', () => {
    const l: PushLight = { x: 500, color: 'green', since: 0, pressedAt: 1, log: [{ t: 0, color: 'green' }] };
    let amberAt = -1;
    for (let t = 0; t < 60; t += DT) { stepLight(l, t); if (l.color === 'amber' && amberAt < 0) amberAt = t; }
    expect(amberAt).toBeGreaterThanOrEqual(MIN_GREEN - 1e-6);
    expect(lightColorAt(l, amberAt + 0.05)).toBe('amber');
  });
  it('dans la rue : chaque rouge suit un appui, deux rouges sont séparés d’au moins MIN_GREEN, les piétons traversent au rouge', () => {
    const e = env(1);
    const w = warmTraffic({ width: 1080, seed: 4, unit: 1, startS: T0 }, e);
    let last = w.light.color;
    let greenSince = -Infinity;
    let reds = 0;
    let crossedOnRed = 0;
    for (let t = T0; t < T0 + 900; t += DT) {
      advance(w, t, e);
      if (w.light.color !== last) {
        if (w.light.color === 'green') greenSince = w.t;
        if (w.light.color === 'amber' && Number.isFinite(greenSince)) expect(w.t - greenSince).toBeGreaterThanOrEqual(MIN_GREEN - 1e-6);
        if (w.light.color === 'red') reds++;
        last = w.light.color;
      }
      for (const p of w.walkers) if (p.stage === 'cross') { expect(w.light.color).toBe('red'); crossedOnRed++; }
    }
    expect(reds).toBeGreaterThan(3);
    expect(crossedOnRed).toBeGreaterThan(10);
    expect(RED_WALK).toBeGreaterThan(90 / 9 + 1); // le plus lent a le temps de traverser
  });
  it('aucune affluence : aucun piéton, feu toujours vert', () => {
    const e = env(0);
    const w = warmTraffic({ width: 1080, seed: 4, unit: 1, startS: T0 }, e);
    for (let t = T0; t < T0 + 300; t += 1) advance(w, t, e);
    expect(w.walkers).toHaveLength(0);
    expect(w.light.color).toBe('green');
  });
  it('les piétons arrivent et repartent hors champ', () => {
    const e = env(1);
    const w = warmTraffic({ width: 1080, seed: 6, unit: 1, startS: T0 }, e);
    const seen = new Map<string, number[]>();
    for (let t = T0; t < T0 + 600; t += 0.5) {
      advance(w, t, e);
      for (const p of w.walkers) { if (!seen.has(p.id)) seen.set(p.id, [p.x]); seen.get(p.id)!.push(p.x); }
    }
    const fresh = [...seen.entries()].filter(([id]) => Number(id.slice(3)) > 20);
    expect(fresh.length).toBeGreaterThan(3);
    for (const [, xs] of fresh) expect(xs[0]! < 0 || xs[0]! > 1080).toBe(true);
  });
});
