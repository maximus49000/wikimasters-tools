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

  it('pas de caresse pendant qu il se cache', () => {
    expect(touchPlan({ ...sitting, action: 'hide' }, env([]), 1000)).toBeNull();
  });

  it('pas de caresse sur un plan terminé', () => {
    expect(touchPlan(sitting, env([]), 9000)).toBeNull();
  });
});

describe('chien', () => {
  const dog = (layout: Layout, seed: number, extra: Partial<BrainEnv> = {}) => env(layout, seed, { species: 'dog', ...extra });
  const furnished: Layout = [
    { id: 's', kind: 'shelf', col: 2, row: 6 },
    { id: 'd', kind: 'desk', col: 8, row: 12 },
    { id: 'a', kind: 'armchair', col: 14, row: 14 },
    { id: 'f', kind: 'sofa', col: 20, row: 14 },
    { id: 'k', kind: 'kennel', col: 28, row: 15 },
  ];

  it('ne monte jamais sur l étagère, le bureau ou le fauteuil, ne se cache ni ne griffe', () => {
    for (const s of seeds) {
      const p = nextPlan(dog(furnished, s), from, 0);
      expect(['s', 'd', 'a']).not.toContain(p.on);
      expect(['hide', 'scratch']).not.toContain(p.action);
    }
  });

  it('dort dans la niche et monte sur le canapé', () => {
    const plans = seeds.map((s) => nextPlan(dog(furnished, s), from, 0));
    expect(plans.some((p) => p.action === 'sleep' && p.hostId === 'k')).toBe(true);
    expect(plans.some((p) => p.on === 'f')).toBe(true);
  });

  it('renifle et halète (actions du chien seulement)', () => {
    const dogActions = new Set(seeds.map((s) => nextPlan(dog([], s), from, 0).action));
    expect(dogActions.has('sniff') || dogActions.has('pant')).toBe(true);
    const catActions = new Set(seeds.map((s) => nextPlan(env([], s), from, 0).action));
    expect(catActions.has('sniff')).toBe(false);
    expect(catActions.has('pant')).toBe(false);
  });

  it('va plus vite qu un chat sur le même trajet', () => {
    const layout: Layout = [{ id: 'b', kind: 'basket', col: 30, row: 16 }];
    const ms = (e: BrainEnv) => seeds.map((s) => nextPlan({ ...e, rng: seeded(s) }, from, 0)).find((p) => p.hostId === 'b')!.route.reduce((t, x) => t + x.ms, 0);
    expect(ms(dog(layout, 1))).toBeLessThan(ms(env(layout, 1)));
  });

  it('note la place réservée visée dans le plan', () => {
    const layout: Layout = [{ id: 'b', kind: 'basket', col: 10, row: 16 }];
    const plan = seeds.map((s) => nextPlan(env(layout, s), from, 0)).find((p) => p.hostId === 'b')!;
    expect(plan.key).toBe('b:curl');
  });
});

describe('chien : itinéraires', () => {
  const dogEnv = (layout: Layout, seed: number) => env(layout, seed, { species: 'dog' });
  const stepping: Layout = [
    { id: 'a', kind: 'armchair', col: 5, row: 14 },
    { id: 'd', kind: 'desk', col: 9, row: 13 },
    { id: 'f', kind: 'sofa', col: 14, row: 14 },
  ];

  it('aucun segment ne le pose sur un autre meuble que son canapé (garde-fou : aucune disposition réaliste ne le provoquait avant)', () => {
    for (const s of seeds) {
      const p = nextPlan(dogEnv(stepping, s), from, 0);
      for (const seg of p.route) expect([null, 'f']).toContain(seg.on);
    }
  });
});
