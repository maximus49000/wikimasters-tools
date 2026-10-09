import { describe, expect, it } from 'vitest';
import { NO_CONTEXT } from '../../../src/core/library/pets/context';
import { planEndsAt, routeMs } from '../../../src/core/library/pets/motion';
import { sceneIsValid } from '../../../src/core/library/pets/scenes';
import { huddlePlans, stormPlan } from '../../../src/core/library/pets/storm';
import { standPoint } from '../../../src/core/library/pets/walk-map';

const sofa = [{ id: 's', kind: 'sofa', col: 8, row: 12 }] as never;
const envOf = (layout = sofa, still = false) => ({ layout, cols: 24, rng: () => 0.5, still, occupied: new Set<string>(), ctx: { ...NO_CONTEXT, storm: { id: 1, since: 0 }, weather: 'storm' as const } });
const from = { pt: standPoint(2, 16), on: null, hostId: null, facing: 'r' as const };

describe('stormPlan', () => {
  it('le chat file sous le canapé (hide) avec un délai', () => {
    const p = stormPlan(envOf(), 'cat', from, 1000);
    expect(p.action).toBe('hide');
    expect(p.hostId).toBe('s');
    expect(p.key).toBe('s:hide');
    expect(p.lag).toBeGreaterThanOrEqual(500);
    expect(p.lag).toBeLessThanOrEqual(4000);
    expect(p.route.length).toBeGreaterThan(0);
  });
  it('sans canapé le chat se blottit contre un mur', () => {
    const p = stormPlan(envOf([] as never), 'cat', from, 1000);
    expect(p.action).toBe('cower');
    expect(p.route.length).toBeGreaterThanOrEqual(0);
  });
  it('le chien se blottit (cower), le robot fait un court-circuit sur place', () => {
    expect(stormPlan(envOf(), 'dog', from, 0).action).toBe('cower');
    const r = stormPlan(envOf(), 'robot', from, 0);
    expect(r.action).toBe('shortcircuit');
    expect(r.route).toEqual([]);
    expect(r.actMs).toBe(3000);
  });
  it('le chien va au pied du canapé, même si le chat s y cache déjà', () => {
    const p = stormPlan({ ...envOf(), occupied: new Set(['s:hide']) }, 'dog', from, 0);
    expect(p.action).toBe('cower');
    expect(p.hostId).toBe('s');
    expect(p.at).toEqual(standPoint(8, 15));
    expect(p.key).toBeUndefined();
  });
  it('mouvement réduit : sur place', () => {
    const p = stormPlan(envOf(sofa, true), 'cat', from, 0);
    expect(p.action).toBe('cower');
    expect(p.route).toEqual([]);
    expect(p.at).toEqual(from.pt);
  });
  it('le canapé déjà pris pour s y cacher : le chat va contre un mur', () => {
    const p = stormPlan({ ...envOf(), occupied: new Set(['s:hide']) }, 'cat', from, 0);
    expect(p.action).toBe('cower');
  });
});

describe('huddlePlans', () => {
  const cat = { ...from, id: 'p1' };
  const dog = { pt: standPoint(20, 16), on: null, hostId: null, facing: 'l' as const, id: 'p2' };

  it('donne deux plans jumeaux (même départ, scène huddle, rôles croisés)', () => {
    const h = huddlePlans(envOf(), cat, dog, 1000);
    expect(h).not.toBeNull();
    expect(h!.cat.startedAt).toBe(h!.dog.startedAt);
    expect(h!.cat.with).toMatchObject({ scene: 'huddle', role: 'lead', petId: 'p2' });
    expect(h!.dog.with).toMatchObject({ scene: 'huddle', role: 'follow', petId: 'p1' });
    expect(h!.cat.action).toBe('cower');
    expect(h!.dog.action).toBe('cower');
    expect(Math.abs(h!.cat.at.x - h!.dog.at.x)).toBeLessThanOrEqual(40);
    expect(routeMs(h!.cat.route)).toBeGreaterThanOrEqual(0);
  });
  it('chacun regarde l autre, et les deux finissent ensemble', () => {
    const h = huddlePlans(envOf(), cat, dog, 1000)!;
    expect(h.cat.facing).toBe(h.dog.at.x > h.cat.at.x ? 'r' : 'l');
    expect(h.dog.facing).toBe(h.cat.at.x > h.dog.at.x ? 'r' : 'l');
    expect(planEndsAt(h.cat)).toBe(planEndsAt(h.dog));
  });
  it('les plans jumeaux passent sceneIsValid', () => {
    const h = huddlePlans(envOf(), cat, dog, 1000)!;
    expect(sceneIsValid(h.cat, h.dog, true)).toBe(true);
    expect(sceneIsValid(h.dog, h.cat, true)).toBe(true);
  });
  it('rien en mouvement réduit', () => {
    expect(huddlePlans(envOf(sofa, true), cat, dog, 1000)).toBeNull();
  });
});
