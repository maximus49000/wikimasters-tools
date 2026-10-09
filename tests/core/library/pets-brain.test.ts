import { describe, expect, it } from 'vitest';
import type { Layout, PetPlan } from '../../../src/core/library/library-types';
import { NO_CONTEXT, type PetContext } from '../../../src/core/library/pets/context';
import { STORM_HOLD_MS, layoutSig, nextPlan, resume, spawnPlan, touchPlan, type BrainEnv } from '../../../src/core/library/pets/brain';
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

describe('robot', () => {
  const robot = (layout: Layout, seed: number, extra: Partial<BrainEnv> = {}) => env(layout, seed, { species: 'robot', ...extra });
  const furnished: Layout = [
    { id: 's', kind: 'shelf', col: 2, row: 6 },
    { id: 'd', kind: 'desk', col: 8, row: 12 },
    { id: 'f', kind: 'sofa', col: 20, row: 14 },
    { id: 'k', kind: 'kennel', col: 28, row: 15 },
    { id: 'w', kind: 'bowl', col: 14, row: 18 },
    { id: 'b', kind: 'basket', col: 6, row: 16 },
  ];

  it('reste au sol : ni perchoir, ni sommeil, ni gamelle, ni aucune action de chat ou de chien', () => {
    const banned = ['perch', 'sleep', 'eat', 'drink', 'groom', 'scratch', 'hide', 'pant', 'sniff'];
    for (const s of seeds) {
      const p = nextPlan(robot(furnished, s), from, 0);
      expect(banned).not.toContain(p.action);
      expect(p.on).toBeNull();
      expect(p.route.every((seg) => seg.on === null && seg.fromOn === null)).toBe(true);
    }
  });

  it('peut rouler, scanner et se mettre en veille dans une pièce vide', () => {
    const actions = new Set(seeds.map((s) => nextPlan(robot([], s), from, 0).action));
    expect(actions.has('scan')).toBe(true);
    expect(actions.has('standby')).toBe(true);
    expect(actions.has('sit')).toBe(true);
  });

  it('se recharge sur la station, sauf si la place est réservée', () => {
    const layout: Layout = [{ id: 'c', kind: 'charger', col: 12, row: 17 }];
    const plans = seeds.map((s) => nextPlan(robot(layout, s), from, 0)).filter((p) => p.action === 'charge');
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((p) => p.key === 'c:charge' && p.hostId === 'c')).toBe(true);
    expect(plans[0]!.at).toEqual(standPoint(12, 17));
    const occupied = new Set(['c:charge']);
    expect(seeds.some((s) => nextPlan(robot(layout, s, { occupied }), from, 0).action === 'charge')).toBe(false);
  });

  it('sans station, ne se recharge jamais ; il peut dormir en veille sur place', () => {
    expect(seeds.some((s) => nextPlan(robot([], s), from, 0).action === 'charge')).toBe(false);
    expect(seeds.some((s) => nextPlan(robot([], s), from, 0).action === 'standby')).toBe(true);
  });

  it('s arrête en veille sur un tapis', () => {
    const layout: Layout = [{ id: 'r', kind: 'rug', col: 10, row: 15 }];
    const plans = seeds.map((s) => nextPlan(robot(layout, s), from, 0)).filter((p) => p.action === 'standby' && p.route.length > 0);
    expect(plans.length).toBeGreaterThan(0);
  });

  it('un chat ou un chien n utilisent jamais la station', () => {
    const layout: Layout = [{ id: 'c', kind: 'charger', col: 12, row: 17 }];
    for (const species of ['cat', 'dog'] as const) for (const s of seeds) expect(nextPlan(env(layout, s, { species }), from, 0).hostId).not.toBe('c');
  });

  it('en mouvement réduit : assis ou en veille seulement', () => {
    for (const s of seeds) expect(['sit', 'standby']).toContain(nextPlan(robot(furnished, s, { still: true }), from, 0).action);
  });

  it('une caresse le fait bipper 3 s à la place de ronronner', () => {
    const plan = nextPlan(robot([], 3), from, 0);
    const next = touchPlan({ ...plan, action: 'sit', route: [], actMs: 8000 }, robot([], 3), 1000);
    expect(next?.action).toBe('beep');
    expect(next?.actMs).toBe(3000);
    expect(touchPlan({ ...plan, action: 'sit', route: [], actMs: 8000 }, env([], 3), 1000)?.action).toBe('purr');
  });
});

describe('contexte (6d)', () => {
  const layout = [{ id: 'b', kind: 'basket', col: 6, row: 14 }] as never;
  const start = { pt: standPoint(10, 16), on: null, hostId: null, facing: 'r' as const };
  const envOf = (species: 'cat' | 'dog' | 'robot', ctx: Partial<PetContext>, rng: () => number = () => 0.5, extra = {}) => ({ layout, cols: 24, rng, still: false, occupied: new Set<string>(), species, ctx: { ...NO_CONTEXT, ...ctx }, ...extra }) as BrainEnv;
  const tally = (e: BrainEnv) => {
    const rng = seeded(7);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const p = nextPlan({ ...e, rng }, start, 1000 + i);
      counts[p.action] = (counts[p.action] ?? 0) + 1;
    }
    return counts;
  };

  it('sans ctx le comportement est inchangé', () => {
    const a = nextPlan({ ...envOf('cat', {}), ctx: undefined, rng: seeded(3) }, start, 0);
    const b = nextPlan({ ...envOf('cat', {}), rng: seeded(3) }, start, 0);
    expect(a.action).toBe(b.action);
  });
  it('la nuit les animaux dorment bien plus', () => {
    expect(tally(envOf('cat', { night: true })).sleep ?? 0).toBeGreaterThan((tally(envOf('cat', {})).sleep ?? 0) * 2);
  });
  it('le robot préfère la veille la nuit', () => {
    expect(tally(envOf('robot', { night: true })).standby ?? 0).toBeGreaterThan(tally(envOf('robot', {})).standby ?? 0);
  });
  it('le chien hurle à la lune seulement la nuit avec la lune', () => {
    expect(tally(envOf('dog', { night: true, moon: true })).howl ?? 0).toBeGreaterThan(0);
    expect(tally(envOf('dog', { night: true, moon: false })).howl ?? 0).toBe(0);
    expect(tally(envOf('cat', { night: true, moon: true })).howl ?? 0).toBe(0);
  });
  it('chat et chien se couchent dans la tache de soleil le jour', () => {
    const sunCells = [{ col: 12, row: 16 }, { col: 13, row: 16 }];
    expect(tally(envOf('cat', { sunCells })).sunbathe ?? 0).toBeGreaterThan(0);
    expect(tally(envOf('dog', { sunCells })).sunbathe ?? 0).toBeGreaterThan(0);
    expect(tally(envOf('robot', { sunCells })).sunbathe ?? 0).toBe(0);
    expect(tally(envOf('cat', { sunCells, night: true })).sunbathe ?? 0).toBe(0);
    const xs = sunCells.map((c) => standPoint(c.col, c.row).x);
    const plans = Array.from({ length: 200 }, (_, i) => nextPlan(envOf('cat', { sunCells }, seeded(i + 1)), start, 0)).filter((p) => p.action === 'sunbathe');
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) expect(xs).toContain(p.at.x);
  });
  it('le robot ouvre son parapluie sous la pluie, pas par temps clair', () => {
    expect(tally(envOf('robot', { weather: 'rain' })).umbrella ?? 0).toBeGreaterThan(0);
    expect(tally(envOf('robot', {})).umbrella ?? 0).toBe(0);
  });
  it('après le maintien, un orage qui dure donne le parapluie au robot et le biais de pluie', () => {
    expect(tally(envOf('robot', { weather: 'storm' })).umbrella ?? 0).toBeGreaterThan(0);
    const lively = (w: 'clear' | 'storm') => {
      const t = tally(envOf('dog', { weather: w }));
      return (t.sniff ?? 0) + (t.play ?? 0) + (t.perch ?? 0) + (t.scratch ?? 0);
    };
    expect(lively('storm')).toBeLessThan(lively('clear'));
  });
  it('le chien se secoue après la pluie, une fois', () => {
    const ended = { rainEndedAt: 1000 };
    expect(tally(envOf('dog', ended, undefined, { canShake: true })).shake ?? 0).toBeGreaterThan(0);
    expect(tally(envOf('dog', ended, undefined, { canShake: false })).shake ?? 0).toBe(0);
    expect(tally(envOf('dog', { rainEndedAt: null }, undefined, { canShake: true })).shake ?? 0).toBe(0);
    expect(tally(envOf('dog', { rainEndedAt: -10_000_000 }, undefined, { canShake: true })).shake ?? 0).toBe(0);
  });
  it('pendant l’orage (60 s) chat et chien restent blottis sur place, puis repartent', () => {
    const ctx = { storm: { id: 1, since: 1000 }, weather: 'storm' as const };
    const p = nextPlan(envOf('cat', ctx), start, 5000, 'cower');
    expect(p.action).toBe('cower');
    expect(p.route).toEqual([]);
    expect(p.actMs).toBeGreaterThanOrEqual(8000);
    expect(p.actMs).toBeLessThanOrEqual(15000);
    const after = Array.from({ length: 50 }, (_, i) => nextPlan(envOf('cat', ctx, seeded(i + 1)), start, 1000 + STORM_HOLD_MS + 1, 'cower'));
    expect(after.some((q) => q.route.length > 0)).toBe(true);
    expect(after.some((q) => q.action !== 'cower')).toBe(true);
  });
  it('le robot redémarre après son court-circuit', () => {
    const p = nextPlan(envOf('robot', {}), start, 0, 'shortcircuit');
    expect(p.action).toBe('reboot');
    expect(p.actMs).toBe(1500);
  });
});
