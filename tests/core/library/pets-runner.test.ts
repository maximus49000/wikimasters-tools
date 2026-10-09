import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../../../src/core/library/library-book';
import type { Layout, PetPlan, Room } from '../../../src/core/library/library-types';
import { layoutSig } from '../../../src/core/library/pets/brain';
import { planEndsAt, routeMs } from '../../../src/core/library/pets/motion';
import { createPetRunner } from '../../../src/core/library/pets/runner';
import { proposeScene } from '../../../src/core/library/pets/scenes';
import { buildWalkMap, standPoint } from '../../../src/core/library/pets/walk-map';

const sofa: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
const roomWith = (layout: Layout, plan?: PetPlan): Room => ({
  ...createInitialState().rooms[0]!,
  layout,
  pets: [{ id: 'p1', species: 'cat', name: 'Minou', coat: 'orange', ...(plan ? { plan } : {}) }],
});
const resting = (layout: Layout, at: { x: number; y: number }): PetPlan => ({
  action: 'sit', hostId: null, at, on: null, route: [], startedAt: 0, actMs: 100_000, facing: 'r', sig: layoutSig(layout, 24),
});

describe('createPetRunner', () => {
  it('apparaît avec un nouveau plan, signalé une seule fois', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan, rng: () => 0.3 });
    const room = roomWith(sofa);
    const [frame] = runner.step(room, 1000);
    expect(frame).toMatchObject({ id: 'p1', name: 'Minou', coat: 'orange' });
    runner.step(room, 1010);
    expect(onPlan).toHaveBeenCalledTimes(1);
  });

  it('expose le support de l’animal dans l’image (null au sol)', () => {
    const runner = createPetRunner({ onPlan: vi.fn(), rng: () => 0.3 });
    const [frame] = runner.step(roomWith(sofa), 1000);
    expect(frame).toHaveProperty('on');
    expect(frame!.on === null || typeof frame!.on === 'string').toBe(true);
  });

  it('reprend un plan mémorisé sans le réécrire', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const frames = runner.step(roomWith(sofa, resting(sofa, standPoint(10, 16))), 500);
    expect(onPlan).not.toHaveBeenCalled();
    expect(frames[0]!.pos).toEqual(standPoint(10, 16));
    expect(frames[0]!.pose).toBe('sit');
  });

  it('choisit une nouvelle action quand la précédente est finie', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const plan = { ...resting(sofa, standPoint(10, 16)), actMs: 1000 };
    runner.step(roomWith(sofa, plan), 5000);
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(onPlan.mock.calls[0]![0]).toBe('p1');
  });

  it('replanifie quand un meuble est retiré', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const room = roomWith(sofa, resting(sofa, standPoint(10, 16)));
    runner.step(room, 500);
    runner.step({ ...room, layout: [] }, 600);
    expect(onPlan).toHaveBeenCalledTimes(1);
  });

  it('le rang de dessin : devant le canapé quand il est plus bas, derrière quand il est plus haut', () => {
    const runner = createPetRunner({ onPlan: vi.fn() });
    expect(runner.step(roomWith(sofa, resting(sofa, standPoint(3, 16))), 10)[0]!.behind).toBe(1);
    expect(createPetRunner({ onPlan: vi.fn() }).step(roomWith(sofa, resting(sofa, standPoint(10, 12))), 10)[0]!.behind).toBe(0);
  });

  it('une caresse le fait ronronner sur place', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const room = roomWith(sofa, resting(sofa, standPoint(10, 16)));
    runner.step(room, 500);
    expect(runner.touch(room, 'p1', 600)).toBe(true);
    expect(runner.step(room, 700)[0]!.pose).toBe('purr');
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(runner.touch(room, 'inconnu', 700)).toBe(false);
  });

  it('oublie l animal retiré et change de pièce proprement', () => {
    const runner = createPetRunner({ onPlan: vi.fn() });
    const room = roomWith([]);
    runner.step(room, 0);
    expect(runner.step({ ...room, pets: [] }, 10)).toEqual([]);
    expect(runner.touch(room, 'p1', 20)).toBe(false);
  });

  it('un plan venu du futur est remplacé', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const future: PetPlan = { ...resting(sofa, standPoint(10, 16)), startedAt: 10_000_000 };
    runner.step(roomWith(sofa, future), 1000);
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(onPlan.mock.calls[0]![1].startedAt).toBe(1000);
  });

  it('animations réduites : un trajet en cours devient un plan sur place', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan, still: true, rng: () => 0.3 });
    const walking: PetPlan = {
      ...resting(sofa, standPoint(10, 16)),
      route: [{ kind: 'walk', from: standPoint(2, 16), to: standPoint(10, 16), ms: 5000, fromOn: null, on: null }],
    };
    const [frame] = runner.step(roomWith(sofa, walking), 2500);
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(onPlan.mock.calls[0]![1].route).toEqual([]);
    expect(['sit', 'sleep']).toContain(frame!.pose);
  });

  it('top : vrai seulement perché sur un bureau ou une étagère', () => {
    const desk: Layout = [{ id: 'd', kind: 'desk', col: 2, row: 12 }];
    const perched = (layout: Layout, on: string | null): PetPlan => ({ ...resting(layout, { x: 100, y: 300 }), on, hostId: on });
    const runner = createPetRunner({ onPlan: vi.fn() });
    expect(runner.step(roomWith(desk, perched(desk, 'd')), 500)[0]!.top).toBe(true);
    expect(runner.step(roomWith(sofa, perched(sofa, 'a')), 500)[0]!.top).toBe(false);
    expect(runner.step(roomWith(sofa, perched(sofa, null)), 500)[0]!.top).toBe(false);
  });
});

const twoPets = (layout: Layout, a: PetPlan, b: PetPlan): Room => ({
  ...createInitialState().rooms[0]!,
  layout,
  pets: [
    { id: 'p1', species: 'cat', name: 'Minou', coat: 'orange', plan: a },
    { id: 'p2', species: 'dog', name: 'Rex', coat: 'brown', plan: b },
  ],
});

describe('plusieurs animaux', () => {
  it('renvoie une image par animal, avec l espèce', () => {
    const runner = createPetRunner({ onPlan: vi.fn() });
    const room = twoPets(sofa, resting(sofa, standPoint(10, 16)), resting(sofa, standPoint(20, 16)));
    const frames = runner.step(room, 100);
    expect(frames.map((f) => [f.id, f.species])).toEqual([['p1', 'cat'], ['p2', 'dog']]);
  });

  it('un animal évite la place réservée par l autre', () => {
    const layout: Layout = [{ id: 'b', kind: 'basket', col: 10, row: 16 }];
    const taken: PetPlan = { ...resting(layout, standPoint(11, 17)), action: 'sleep', hostId: 'b', key: 'b:curl' };
    let hits = 0;
    for (let i = 0; i < 80; i++) {
      const onPlan = vi.fn();
      const runner = createPetRunner({ onPlan, rng: Math.random });
      const room = twoPets(layout, { ...resting(layout, standPoint(2, 16)), actMs: 10 }, taken);
      runner.step(room, 5000);
      const plan = onPlan.mock.calls.find((c) => c[0] === 'p1')?.[1] as PetPlan | undefined;
      if (plan && plan.key === 'b:curl') hits++;
    }
    expect(hits).toBe(0);
  });
});

describe('scènes à deux', () => {
  const lead: PetPlan = { ...resting([], standPoint(3, 16)), startedAt: 0, actMs: 1000 };
  const idle: PetPlan = { ...resting([], standPoint(12, 16)), startedAt: 0, actMs: 1_000_000 };

  it('une scène démarre pour les deux animaux, avec les mêmes horodatages, et chacun est signalé une fois', () => {
    let started = 0;
    for (let seed = 1; seed <= 60 && started === 0; seed++) {
      const onPlan = vi.fn();
      let n = seed;
      const rng = () => ((n = (n * 16807) % 2147483647) / 2147483647);
      const runner = createPetRunner({ onPlan, rng });
      runner.step(twoPets([], lead, idle), 5000);
      const plans = new Map(onPlan.mock.calls.map((c) => [c[0] as string, c[1] as PetPlan]));
      if (plans.get('p1')?.with && plans.get('p2')?.with) {
        started++;
        expect(plans.get('p1')!.startedAt).toBe(plans.get('p2')!.startedAt);
        expect(plans.get('p1')!.with!.petId).toBe('p2');
        expect(plans.get('p2')!.with!.petId).toBe('p1');
      }
    }
    expect(started).toBe(1);
  });

  it('jamais de scène en animations réduites', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const onPlan = vi.fn();
      let n = seed;
      const rng = () => ((n = (n * 16807) % 2147483647) / 2147483647);
      createPetRunner({ onPlan, rng, still: true }).step(twoPets([], lead, idle), 5000);
      expect(onPlan.mock.calls.every((c) => (c[1] as PetPlan).with === undefined)).toBe(true);
    }
  });

  it('une scène dont le partenaire a été retiré est abandonnée sans téléportation', () => {
    const paired: PetPlan = { ...resting([], standPoint(5, 16)), startedAt: 1000, actMs: 20_000, with: { petId: 'p2', role: 'lead', scene: 'greet' } };
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const solo: Room = { ...createInitialState().rooms[0]!, pets: [{ id: 'p1', species: 'cat', name: 'Minou', coat: 'orange', plan: paired }] };
    const [frame] = runner.step(solo, 2000);
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(onPlan.mock.calls[0]![1].with).toBeUndefined();
    expect(Math.abs(frame!.pos.x - standPoint(5, 16).x)).toBeLessThan(1);
  });

  it('la caresse de l un fait abandonner la scène de l autre', () => {
    const a: PetPlan = { ...resting([], standPoint(3, 16)), startedAt: 1000, actMs: 20_000, with: { petId: 'p2', role: 'lead', scene: 'greet' } };
    const b: PetPlan = { ...resting([], standPoint(4, 16)), startedAt: 1000, actMs: 20_000, with: { petId: 'p1', role: 'follow', scene: 'greet' } };
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const room = twoPets([], a, b);
    runner.step(room, 2000);
    expect(onPlan).not.toHaveBeenCalled();
    expect(runner.touch(room, 'p1', 2100)).toBe(true);
    runner.step(room, 2200);
    const ids = onPlan.mock.calls.map((c) => c[0]);
    expect(ids).toContain('p2');
    expect(onPlan.mock.calls.find((c) => c[0] === 'p2')![1].with).toBeUndefined();
  });
});

describe('trois animaux', () => {
  it('aucun partenaire ne se retrouve dans deux scènes', () => {
    const idle = (x: number): PetPlan => ({ ...resting([], standPoint(x, 16)), startedAt: 0, actMs: 1_000_000 });
    const lead = (x: number): PetPlan => ({ ...resting([], standPoint(x, 16)), startedAt: 0, actMs: 1000 });
    let scenes = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const last = new Map<string, PetPlan>();
      let n = seed;
      const rng = () => ((n = (n * 16807) % 2147483647) / 2147483647);
      const runner = createPetRunner({ onPlan: (id, plan) => last.set(id, plan), rng });
      const room: Room = {
        ...createInitialState().rooms[0]!,
        layout: [],
        pets: [
          { id: 'p1', species: 'cat', name: 'A', coat: 'orange', plan: lead(3) },
          { id: 'p2', species: 'dog', name: 'B', coat: 'brown', plan: lead(4) },
          { id: 'p3', species: 'cat', name: 'C', coat: 'orange', plan: idle(12) },
        ],
      };
      runner.step(room, 5000);
      const partners = [...last.values()].filter((p) => p.with).map((p) => p.with!.petId);
      const paired = [...last.entries()].filter(([, p]) => p.with).map(([id]) => id);
      // chaque animal en scène a pour partenaire un animal dont le plan le désigne en retour
      for (const id of paired) {
        const w = last.get(id)!.with!;
        expect(last.get(w.petId)?.with?.petId).toBe(id);
      }
      expect(new Set(paired).size).toBe(paired.length);
      expect(partners.length).toBe(paired.length);
      scenes += paired.length / 2;
    }
    expect(scenes).toBeGreaterThan(0);
  });
});

describe('abandon d une scène', () => {
  const lastPlanOf = (onPlan: ReturnType<typeof vi.fn>, id: string): PetPlan => onPlan.mock.calls.filter((c) => c[0] === id).at(-1)![1] as PetPlan;
  const startOf = (plan: PetPlan) => ({ pt: plan.route[0]?.from ?? plan.at, on: plan.route[0] ? plan.route[0].fromOn : plan.on });

  it('meubles retirés pendant une scène, partenaire traité en premier : le meneur repart d une case libre, pas du canapé disparu', () => {
    const onSofa = { x: 100, y: 200 };
    const lead: PetPlan = {
      ...resting(sofa, onSofa), action: 'greet', on: 'a', hostId: 'a', at: { x: 140, y: 200 }, startedAt: 0,
      route: [{ kind: 'walk', from: onSofa, to: { x: 140, y: 200 }, ms: 10_000, fromOn: 'a', on: 'a' }],
      with: { petId: 'p1', role: 'lead', scene: 'greet' },
    };
    const partner: PetPlan = { ...resting(sofa, standPoint(8, 16)), action: 'greet', actMs: 20_000, with: { petId: 'p2', role: 'follow', scene: 'greet' } };
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    runner.step(twoPets([], partner, lead), 5000);
    const next = lastPlanOf(onPlan, 'p2');
    expect(next.with).toBeUndefined();
    expect(next.startedAt).toBe(5000);
    expect(startOf(next).on).toBeNull();
    expect(startOf(next).pt).not.toEqual(onSofa);
  });

  it('abandon en plein saut : le nouveau plan part du point d atterrissage', () => {
    const plat = buildWalkMap(sofa, 24).platforms[0]!;
    const to = { x: plat.x0 + 20, y: plat.y };
    const lead: PetPlan = {
      ...resting(sofa, to), action: 'greet', on: 'a', hostId: 'a', startedAt: 0,
      route: [{ kind: 'jump', from: standPoint(1, 16), to, ms: 1000, fromOn: null, on: 'a' }],
      with: { petId: 'ghost', role: 'lead', scene: 'greet' },
    };
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    runner.step(roomWith(sofa, lead), 500);
    const next = lastPlanOf(onPlan, 'p1');
    expect(next.with).toBeUndefined();
    expect(startOf(next)).toEqual({ pt: to, on: 'a' });
  });

  it('toucher le dormeur annule la sieste du meneur', () => {
    const nap: PetPlan = { ...resting(sofa, standPoint(9, 16)), action: 'sleep', with: { petId: 'p2', role: 'lead', scene: 'nap' } };
    const sleeper: PetPlan = { ...resting(sofa, standPoint(10, 16)), action: 'sleep' };
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const room = twoPets(sofa, nap, sleeper);
    runner.step(room, 500);
    expect(onPlan).not.toHaveBeenCalled();
    expect(runner.touch(room, 'p2', 600)).toBe(true);
    runner.step(room, 700);
    const next = onPlan.mock.calls.find((c) => c[0] === 'p1')![1] as PetPlan;
    expect(next.with).toBeUndefined();
    expect(next.startedAt).toBe(700);
  });

  it('partenaire disparu avec les meubles inchangés : le plan est remplacé sur place', () => {
    const lead: PetPlan = { ...resting(sofa, standPoint(9, 16)), action: 'greet', with: { petId: 'ghost', role: 'lead', scene: 'greet' } };
    const onPlan = vi.fn();
    createPetRunner({ onPlan }).step(roomWith(sofa, lead), 500);
    expect(lastPlanOf(onPlan, 'p1').with).toBeUndefined();
  });
});

describe('sieste du chat sur le robot (ride)', () => {
  const at = standPoint(12, 16);
  const robotPlan: PetPlan = { ...resting([], at), action: 'standby', actMs: 60_000 };
  const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const start = 1000;
  const ride = (() => {
    for (let s = 1; s < 200; s++) {
      const r = proposeScene({ layout: [], cols: 24, rng: seeded(s), still: false, occupied: new Set() }, { pet: { id: 'p1', species: 'cat', name: 'Minou', coat: 'orange' }, from: { pt: standPoint(2, 16), on: null, hostId: null, facing: 'r' } }, [{ pet: { id: 'p2', species: 'robot', name: 'Robi', coat: 'blue' }, plan: robotPlan }], start);
      if (r?.scene === 'ride') return r;
    }
    throw new Error('pas de ride');
  })();
  const top = ride.lead.at;
  const landingOf = (plan: PetPlan) => plan.route[plan.route.length - 1]!.from;
  const roomOf = (cat?: PetPlan, robot?: PetPlan, layout: Layout = []): Room => ({
    ...createInitialState().rooms[0]!,
    layout,
    pets: [
      { id: 'p1', species: 'cat', name: 'Minou', coat: 'orange', ...(cat ? { plan: cat } : {}) },
      { id: 'p2', species: 'robot', name: 'Robi', coat: 'blue', ...(robot ? { plan: robot } : {}) },
    ],
  });
  const asleepAt = planEndsAt(ride.lead) - 3000;
  const lastPlanOf = (onPlan: ReturnType<typeof vi.fn>, id: string): PetPlan => onPlan.mock.calls.filter((c) => c[0] === id).at(-1)![1] as PetPlan;
  const dismounted = (plan: PetPlan) => {
    expect(plan.with).toBeUndefined();
    expect(plan.route[0]!.kind).toBe('jump');
    expect(plan.route[0]!.from).toEqual(top);
    expect(plan.route[0]!.to.y).toBeGreaterThan(top.y);
    expect(plan.route[0]!.on).toBeNull();
  };

  it('en pleine sieste : le chat dort sur le dos, devant le robot (même rang, +0,1), sans rien réécrire', () => {
    const onPlan = vi.fn();
    const [cat, robot] = createPetRunner({ onPlan }).step(roomOf(ride.lead, ride.partner!), asleepAt);
    expect(onPlan).not.toHaveBeenCalled();
    expect(cat!.pose).toBe('sleep');
    expect(cat!.pos).toEqual(top);
    expect(robot!.pose).toBe('standby');
    expect(cat!.behind).toBe(robot!.behind);
    expect(cat!.depthY).toBeCloseTo(robot!.depthY + 0.1);
  });

  it('fin normale : le plan suivant du chat commence par un saut de descente depuis son dos', () => {
    const onPlan = vi.fn();
    const end = planEndsAt(ride.lead);
    const [cat] = createPetRunner({ onPlan }).step(roomOf(ride.lead, ride.partner!), end + 5);
    dismounted(lastPlanOf(onPlan, 'p1'));
    expect(lastPlanOf(onPlan, 'p1').startedAt).toBe(end + 5);
    expect(cat!.pose).toBe('jump');
    expect(Math.abs(cat!.pos.y - top.y)).toBeLessThan(5);
    expect(lastPlanOf(onPlan, 'p2').with).toBeUndefined();
  });

  it('robot retiré : le chat saute à terre sans téléportation', () => {
    const onPlan = vi.fn();
    const solo = { ...roomOf(ride.lead), pets: roomOf(ride.lead).pets.slice(0, 1) };
    const [cat] = createPetRunner({ onPlan }).step(solo, asleepAt);
    dismounted(lastPlanOf(onPlan, 'p1'));
    expect(cat!.pos).toEqual(top);
  });

  it('robot touché : il bipe et le chat saute à terre', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const room = roomOf(ride.lead, ride.partner!);
    runner.step(room, asleepAt);
    expect(runner.touch(room, 'p2', asleepAt + 100)).toBe(true);
    expect(lastPlanOf(onPlan, 'p2').action).toBe('beep');
    runner.step(room, asleepAt + 200);
    dismounted(lastPlanOf(onPlan, 'p1'));
    expect(lastPlanOf(onPlan, 'p1').startedAt).toBe(asleepAt + 200);
  });

  it('chat touché : il saute à terre puis ronronne, le robot reprend sa route', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const room = roomOf(ride.lead, ride.partner!);
    runner.step(room, asleepAt);
    expect(runner.touch(room, 'p1', asleepAt + 100)).toBe(true);
    const purr = lastPlanOf(onPlan, 'p1');
    expect(purr.action).toBe('purr');
    dismounted(purr);
    expect(purr.at).toEqual(purr.route[0]!.to);
    runner.step(room, asleepAt + 200);
    expect(lastPlanOf(onPlan, 'p2').with).toBeUndefined();
  });

  it('meubles changés pendant la sieste : le chat saute à terre sur une case libre, pas en l air', () => {
    const onPlan = vi.fn();
    const layout: Layout = [{ id: 'k', kind: 'basket', col: 20, row: 16 }];
    const [cat] = createPetRunner({ onPlan }).step(roomOf(ride.lead, ride.partner!, layout), asleepAt);
    dismounted(lastPlanOf(onPlan, 'p1'));
    expect(cat!.pos).toEqual(top);
  });

  it('au rechargement en pleine sieste : le plan continue, interpolé, jusqu à la descente', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const room = roomOf(ride.lead, ride.partner!);
    const mid = start + routeMs(ride.lead.route) + 1000;
    expect(runner.step(room, mid)[0]!.pose).toBe('sleep');
    expect(onPlan).not.toHaveBeenCalled();
    const jumping = start + routeMs(ride.lead.route) - 100;
    const frame = runner.step(room, jumping)[0]!;
    expect(frame.pose).toBe('jump');
    expect(onPlan).not.toHaveBeenCalled();
  });

  it('un chat qui n est pas encore monté (approche) est repris au sol', () => {
    const onPlan = vi.fn();
    const solo = { ...roomOf(ride.lead), pets: roomOf(ride.lead).pets.slice(0, 1) };
    const early = start + 50;
    const [cat] = createPetRunner({ onPlan }).step(solo, early);
    const next = lastPlanOf(onPlan, 'p1');
    expect(next.with).toBeUndefined();
    expect(next.route.every((s) => s.kind === 'walk')).toBe(true);
    expect(cat!.pos.y).toBeGreaterThan(top.y);
  });

  it('au sol : le point de saut est une case libre voisine du robot', () => {
    const from = landingOf(ride.lead);
    expect(Math.abs(from.x - at.x)).toBeLessThanOrEqual(30);
  });
});
