import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../../../src/core/library/library-book';
import type { Layout, PetPlan, Room } from '../../../src/core/library/library-types';
import { layoutSig } from '../../../src/core/library/pets/brain';
import { createPetRunner } from '../../../src/core/library/pets/runner';
import { standPoint } from '../../../src/core/library/pets/walk-map';

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
