import { describe, expect, it } from 'vitest';
import type { Layout, PetPlan } from '../../../src/core/library/library-types';
import { layoutSig, nextPlan, resume, spawnPlan, touchPlan, type BrainEnv } from '../../../src/core/library/pets/brain';
import { buildWalkMap, cellOf, isFree, standPoint } from '../../../src/core/library/pets/walk-map';

// mulberry32 : un LCG simple donne des suites corrélées pour des graines consécutives (seuls 3 tirages différents sur 200 graines).
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};
const env = (layout: Layout, seed = 1, extra: Partial<BrainEnv> = {}): BrainEnv => ({ layout, cols: 36, rng: seeded(seed), still: false, occupied: new Set(), ...extra });
const from = { pt: standPoint(2, 16), on: null, hostId: null, facing: 'r' as const };
const seeds = Array.from({ length: 200 }, (_, i) => i + 1);

describe('nextPlan', () => {
  it('dans une pièce vide : un plan au sol qui démarre maintenant', () => {
    const plan = nextPlan(env([]), from, 1234);
    expect(plan.startedAt).toBe(1234);
    expect(plan.sig).toBe(layoutSig([], 36));
    expect(plan.route.every((s) => s.kind === 'walk')).toBe(true);
    expect(plan.actMs).toBeGreaterThan(0);
  });

  it('dort dans le panier, à son point de pelotonnement', () => {
    const layout: Layout = [{ id: 'b', kind: 'basket', col: 10, row: 16 }];
    const plans = seeds.map((s) => nextPlan(env(layout, s), from, 0)).filter((p) => p.action === 'sleep' && p.hostId === 'b');
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0]!.at).toEqual(standPoint(11, 17));
  });

  it('respecte les places réservées', () => {
    const layout: Layout = [{ id: 'b', kind: 'basket', col: 10, row: 16 }];
    const occupied = new Set(['b:curl']);
    expect(seeds.some((s) => nextPlan(env(layout, s, { occupied }), from, 0).hostId === 'b')).toBe(false);
  });

  it('monte dormir ou s asseoir sur le canapé par un saut', () => {
    const layout: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
    const plans = seeds.map((s) => nextPlan(env(layout, s), from, 0)).filter((p) => p.on === 'a');
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((p) => p.route.some((r) => r.kind === 'jump'))).toBe(true);
    expect(new Set(plans.map((p) => p.action))).toContain('sleep');
  });

  it('mange et boit à la gamelle, se cache sous le canapé, griffe le fauteuil', () => {
    const layout: Layout = [
      { id: 'a', kind: 'sofa', col: 2, row: 12 },
      { id: 'g', kind: 'armchair', col: 12, row: 13 },
      { id: 'w', kind: 'bowl', col: 20, row: 17 },
    ];
    const actions = new Set(seeds.map((s) => nextPlan(env(layout, s), from, 0)).map((p) => `${p.action}:${p.hostId}`));
    expect(actions).toContain('eat:w');
    expect(actions).toContain('drink:w');
    expect(actions).toContain('hide:a');
    expect(Array.from(actions).some((a) => a.startsWith('scratch'))).toBe(true);
  });

  it('en mouvement réduit : jamais de trajet', () => {
    const layout: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
    for (const s of seeds.slice(0, 50)) {
      const plan = nextPlan(env(layout, s, { still: true }), from, 0);
      expect(plan.route).toEqual([]);
      expect(['sit', 'sleep']).toContain(plan.action);
    }
  });
});

describe('resume', () => {
  const layout: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
  const sig = layoutSig(layout, 36);
  const resting: PetPlan = { action: 'sit', hostId: null, at: standPoint(10, 16), on: null, route: [], startedAt: 1000, actMs: 5000, facing: 'r', sig };

  it('sans plan : apparaît sur une case libre du sol', () => {
    const r = resume(undefined, env(layout), 0);
    expect(r.fresh).toBe(true);
    const map = buildWalkMap(layout, 36);
    const start = r.plan.route[0]?.from ?? r.plan.at;
    const c = cellOf(start);
    expect(isFree(map, c.col, c.row)).toBe(true);
  });

  it('plan en cours : reprise telle quelle', () => {
    const r = resume(resting, env(layout), 3000);
    expect(r.fresh).toBe(false);
    expect(r.plan).toBe(resting);
  });

  it('plan fini : une nouvelle action, qui part de là où il était', () => {
    const r = resume(resting, env(layout), 9000);
    expect(r.fresh).toBe(true);
    expect(r.plan.startedAt).toBe(9000);
    const start = r.plan.route[0]?.from ?? r.plan.at;
    expect(start).toEqual(resting.at);
  });

  it('meuble retiré pendant qu il dort dessus : il est reposé au sol puis replanifié', () => {
    const onSofa: PetPlan = { action: 'sleep', hostId: 'a', at: { x: 105, y: 378 }, on: 'a', route: [], startedAt: 0, actMs: 60_000, facing: 'r', sig };
    const r = resume(onSofa, env([]), 500);
    expect(r.fresh).toBe(true);
    expect(r.plan.on).toBeNull();
    const start = r.plan.route[0]?.from ?? r.plan.at;
    const c = cellOf(start);
    expect(isFree(buildWalkMap([], 36), c.col, c.row)).toBe(true);
  });

  it('spawnPlan sur une pièce entièrement bloquée ne plante pas', () => {
    expect(() => spawnPlan(env([]), 0)).not.toThrow();
  });
});

describe('touchPlan', () => {
  const sig = layoutSig([], 36);
  const sitting: PetPlan = { action: 'sit', hostId: null, at: standPoint(5, 15), on: null, route: [], startedAt: 0, actMs: 5000, facing: 'l', sig };

  it('ronronne sur place, 3,5 s', () => {
    const plan = touchPlan(sitting, env([]), 1000)!;
    expect(plan).toMatchObject({ action: 'purr', at: sitting.at, route: [], startedAt: 1000, actMs: 3500, facing: 'l' });
  });

  it('pas de caresse en plein saut', () => {
    const jumping: PetPlan = { ...sitting, route: [{ kind: 'jump', from: { x: 0, y: 450 }, to: { x: 40, y: 380 }, ms: 1000, fromOn: null, on: null }] };
    expect(touchPlan(jumping, env([]), 500)).toBeNull();
  });
});
