import { describe, expect, it } from 'vitest';
import { NO_CONTEXT } from '../../../src/core/library/pets/context';
import { planEndsAt, routeMs } from '../../../src/core/library/pets/motion';
import { sceneIsValid } from '../../../src/core/library/pets/scenes';
import { huddlePlans, stormPlan } from '../../../src/core/library/pets/storm';
import { hideSpot, standPoint } from '../../../src/core/library/pets/walk-map';
import { groundTrace } from '../../../src/core/library/footprint';
import { pxRect, rectOf } from '../../../src/core/library/room-grid';
import { drawOrder, petSlot } from '../../../src/core/library/depth-order';

// Point dans un polygone convexe (signe constant des produits vectoriels).
const inPolygon = (poly: [number, number][], p: { x: number; y: number }): boolean => {
  const s = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    return (b[0] - a[0]) * (p.y - a[1]) - (b[1] - a[1]) * (p.x - a[0]);
  });
  return s.every((v) => v >= 0) || s.every((v) => v <= 0);
};

// Canapé de 10 × 6 cases, pied en lignes 14-15 : la ligne 16, devant lui, est libre.
const sofa = [{ id: 's', kind: 'sofa', col: 8, row: 10 }] as never;
const envOf = (layout = sofa, still = false) => ({ layout, cols: 24, rng: () => 0.5, still, occupied: new Set<string>(), ctx: { ...NO_CONTEXT, storm: { id: 1, since: 0 }, weather: 'storm' as const } });
const from = { pt: standPoint(2, 16), on: null, hostId: null, facing: 'r' as const };

describe('orage avec les nouveaux meubles', () => {
  it('le chat se cache sous le canapé deux places', () => {
    const p = stormPlan(envOf([{ id: 'l', kind: 'loveseat', col: 8, row: 12 }] as never), 'cat', from, 1000);
    expect(p.action).toBe('hide');
    expect(p.hostId).toBe('l');
  });
  it('le chien se blottit au pied de la chauffeuse', () => {
    const p = stormPlan(envOf([{ id: 'c', kind: 'club-chair', col: 8, row: 12 }] as never), 'dog', from, 1000);
    expect(p.action).toBe('cower');
    expect(p.hostId).toBe('c');
  });
});

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
  it('la cachette est sous le canapé, à tout angle : au sol sous l’avant de l’assise, dans sa trace, le canapé dessiné devant le chat', () => {
    for (const angle of [0, 1, 2, 6] as const) {
      const placed = { id: 's', kind: 'sofa', col: 8, row: angle === 0 ? 10 : 7, angle } as const;
      const p = stormPlan(envOf([placed] as never), 'cat', from, 1000);
      expect(p.action, `angle ${angle}`).toBe('hide');
      expect(p.at).toEqual(hideSpot(placed));
      const trace = groundTrace('sofa', angle, pxRect(rectOf(placed)!));
      expect(inPolygon(trace, p.at), `angle ${angle}`).toBe(true);
      // Le canapé couvre la cachette : le chat est dessiné juste avant lui (derrière).
      const order = drawOrder([placed] as never);
      expect(petSlot([placed] as never, { pos: p.at, depthHosts: [] } as never)).toBe(order.findIndex((q) => q.id === 's'));
    }
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
    expect(p.at).toEqual(standPoint(8, 16));
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
