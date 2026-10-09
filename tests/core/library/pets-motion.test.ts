import { describe, expect, it } from 'vitest';
import type { PetPlan } from '../../../src/core/library/library-types';
import { planEndsAt, routeMs, stateAt } from '../../../src/core/library/pets/motion';

const walkPlan: PetPlan = {
  action: 'sit',
  hostId: null,
  at: { x: 100, y: 450 },
  on: null,
  route: [{ kind: 'walk', from: { x: 0, y: 450 }, to: { x: 100, y: 450 }, ms: 1000, fromOn: null, on: null }],
  startedAt: 10_000,
  actMs: 500,
  facing: 'r',
  sig: 's',
};

describe('stateAt', () => {
  it('interpole la marche selon le temps écoulé', () => {
    const s = stateAt(walkPlan, 10_500);
    expect(s.phase).toBe('walk');
    expect(s.pos.x).toBeCloseTo(50, 5);
    expect(s.facing).toBe('r');
  });

  it('avant le départ, il est au point de départ', () => {
    expect(stateAt(walkPlan, 5000).pos.x).toBe(0);
  });

  it('une marche vers la gauche le tourne vers la gauche', () => {
    const left: PetPlan = { ...walkPlan, route: [{ ...walkPlan.route[0]!, from: { x: 100, y: 450 }, to: { x: 0, y: 450 } }], at: { x: 0, y: 450 }, facing: 'l' };
    expect(stateAt(left, 10_300).facing).toBe('l');
  });

  it('agit sur place une fois arrivé, puis a fini', () => {
    expect(stateAt(walkPlan, 11_200)).toMatchObject({ phase: 'act', pos: { x: 100, y: 450 }, depthHosts: [null] });
    expect(stateAt(walkPlan, 20_000)).toMatchObject({ phase: 'done', pos: { x: 100, y: 450 } });
  });

  it('un saut suit un arc : plus haut que la ligne droite au milieu, et deux supports pour l ordre de dessin', () => {
    const plan: PetPlan = {
      ...walkPlan,
      on: 'a',
      hostId: 'a',
      route: [{ kind: 'jump', from: { x: 0, y: 450 }, to: { x: 40, y: 380 }, ms: 600, fromOn: null, on: 'a' }],
      at: { x: 40, y: 380 },
    };
    const mid = stateAt(plan, 10_300);
    expect(mid.phase).toBe('jump');
    expect(mid.pos.y).toBeLessThan(415);
    expect(mid.depthHosts).toEqual([null, 'a']);
    expect(mid.on).toBe('a');
  });

  it('routeMs et planEndsAt', () => {
    expect(routeMs(walkPlan.route)).toBe(1000);
    expect(planEndsAt(walkPlan)).toBe(11_500);
  });
});

describe('lag', () => {
  const walk = { kind: 'walk' as const, from: { x: 100, y: 450 }, to: { x: 300, y: 450 }, ms: 2000, fromOn: null, on: null };
  const base: PetPlan = { action: 'cower', hostId: null, at: { x: 300, y: 450 }, on: null, route: [walk], startedAt: 1000, actMs: 500, facing: 'r', sig: 's', lag: 700 };

  it('reste sur place pendant l attente, puis marche', () => {
    expect(stateAt(base, 1300)).toMatchObject({ phase: 'wait', pos: { x: 100, y: 450 }, on: null });
    expect(stateAt(base, 1700 + 1000)).toMatchObject({ phase: 'walk', pos: { x: 200, y: 450 } });
  });

  it('la fin du plan compte l attente', () => {
    expect(planEndsAt(base)).toBe(1000 + 700 + 2000 + 500);
  });

  it('sans trajet, l attente est une action sur place', () => {
    const still: PetPlan = { ...base, route: [], at: { x: 100, y: 450 } };
    expect(stateAt(still, 1300).phase).toBe('act');
  });
});
