import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { adoptPet, createInitialState, parseLibraryState, removePet, renamePet, setPetPlan } from '../../../src/core/library/library-book';
import { createLibraryRepo } from '../../../src/core/library/library-repo';
import type { PetPlan } from '../../../src/core/library/library-types';

const plan: PetPlan = {
  action: 'sit',
  hostId: null,
  at: { x: 100, y: 450 },
  on: null,
  route: [{ kind: 'walk', from: { x: 10, y: 450 }, to: { x: 100, y: 450 }, ms: 1000, fromOn: null, on: null }],
  startedAt: 5000,
  actMs: 4000,
  facing: 'r',
  sig: '24|1',
};

describe('état v4', () => {
  it('une pièce vide commence en v4 sans animal', () => {
    const state = createInitialState();
    expect(state.version).toBe(4);
    expect(state.rooms[0]!.pets).toEqual([]);
  });

  it('migre un état v3 : les pièces reçoivent une liste d animaux vide', () => {
    const v3 = { version: 3, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, rooms: [{ id: 'r1', name: 'Salon', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, layout: [] }] };
    const state = parseLibraryState(v3);
    expect(state.version).toBe(4);
    expect(state.rooms[0]!.pets).toEqual([]);
  });

  it('un animal abîmé est ignoré sans perdre la pièce, un plan abîmé est oublié', () => {
    const base = createInitialState();
    const room = { ...base.rooms[0]!, pets: [{ id: 'p1', species: 'cat', name: 'Minou', coat: 'orange', plan: { action: 'bogus' } }, { id: 'p2', species: 'dog', name: 'X', coat: 'orange' }] };
    const state = parseLibraryState({ ...base, rooms: [room] });
    expect(state.rooms[0]!.pets).toEqual([{ id: 'p1', species: 'cat', name: 'Minou', coat: 'orange' }]);
  });

  it('garde au plus trois animaux par pièce', () => {
    const base = createInitialState();
    const pets = [1, 2, 3, 4].map((n) => ({ id: `p${n}`, species: 'cat', name: `C${n}`, coat: 'black' }));
    expect(parseLibraryState({ ...base, rooms: [{ ...base.rooms[0]!, pets }] }).rooms[0]!.pets).toHaveLength(3);
  });

  it('lit un chien et refuse un pelage qui n est pas de son espèce', () => {
    const base = createInitialState();
    const pets = [
      { id: 'p1', species: 'dog', name: 'Rex', coat: 'spotted' },
      { id: 'p2', species: 'dog', name: 'Bad', coat: 'tabby' },
      { id: 'p3', species: 'cat', name: 'Bad2', coat: 'brown' },
    ];
    expect(parseLibraryState({ ...base, rooms: [{ ...base.rooms[0]!, pets }] }).rooms[0]!.pets).toEqual([{ id: 'p1', species: 'dog', name: 'Rex', coat: 'spotted' }]);
  });

  it('relit un plan de scène (lag, key, with)', () => {
    const scene: PetPlan = { ...plan, lag: 1200, key: 'b:curl', with: { petId: 'p2', role: 'follow', scene: 'shoo' } };
    const once = adoptPet(createInitialState(), 'r1', 'A', 'white');
    const saved = setPetPlan(once, 'r1', 'p1', scene);
    expect(parseLibraryState(JSON.parse(JSON.stringify(saved))).rooms[0]!.pets[0]!.plan).toEqual(scene);
  });
});

describe('adoption', () => {
  it('adopte un chat avec son nom nettoyé', () => {
    const state = adoptPet(createInitialState(), 'r1', '  Moustache  ', 'tabby');
    expect(state.rooms[0]!.pets).toEqual([{ id: 'p1', species: 'cat', name: 'Moustache', coat: 'tabby' }]);
  });

  it('nom vide : Minou ; nom trop long : coupé à 20 caractères', () => {
    expect(adoptPet(createInitialState(), 'r1', '   ', 'gray').rooms[0]!.pets[0]!.name).toBe('Minou');
    expect(adoptPet(createInitialState(), 'r1', 'x'.repeat(40), 'gray').rooms[0]!.pets[0]!.name).toHaveLength(20);
  });

  it('adopte un chien, avec des identifiants libres, et refuse un quatrième animal', () => {
    let state = adoptPet(createInitialState(), 'r1', 'Rex', 'brown', 'dog');
    state = adoptPet(state, 'r1', 'Minou', 'white');
    state = adoptPet(state, 'r1', '', 'red', 'dog');
    expect(state.rooms[0]!.pets.map((p) => [p.id, p.species, p.name])).toEqual([['p1', 'dog', 'Rex'], ['p2', 'cat', 'Minou'], ['p3', 'dog', 'Rex']]);
    expect(adoptPet(state, 'r1', 'Z', 'black')).toBe(state);
    const freed = removePet(state, 'r1', 'p2');
    expect(adoptPet(freed, 'r1', 'N', 'gray').rooms[0]!.pets.map((p) => p.id)).toEqual(['p1', 'p3', 'p2']);
  });

  it('un pelage qui n est pas de l espèce devient le premier de l espèce', () => {
    expect(adoptPet(createInitialState(), 'r1', 'R', 'tabby', 'dog').rooms[0]!.pets[0]!.coat).toBe('brown');
  });

  it('renomme, retire, et ignore une pièce ou un animal inconnu', () => {
    const once = adoptPet(createInitialState(), 'r1', 'A', 'white');
    expect(renamePet(once, 'r1', 'p1', 'Bob').rooms[0]!.pets[0]!.name).toBe('Bob');
    expect(renamePet(once, 'r1', 'p1', '   ')).toBe(once);
    expect(renamePet(once, 'r9', 'p1', 'Bob')).toBe(once);
    expect(removePet(once, 'r1', 'p1').rooms[0]!.pets).toEqual([]);
  });

  it('mémorise le plan d un animal et le relit', () => {
    const once = adoptPet(createInitialState(), 'r1', 'A', 'white');
    const withPlan = setPetPlan(once, 'r1', 'p1', plan);
    expect(parseLibraryState(JSON.parse(JSON.stringify(withPlan))).rooms[0]!.pets[0]!.plan).toEqual(plan);
  });
});

describe('updateQuiet', () => {
  it('écrit sans prévenir les abonnés', async () => {
    const store = createMemoryStore();
    const repo = createLibraryRepo(store);
    await repo.load();
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.updateQuiet((s) => adoptPet(s, 'r1', 'A', 'white'));
    expect(listener).not.toHaveBeenCalled();
    expect(repo.current()!.rooms[0]!.pets).toHaveLength(1);
    expect((await createLibraryRepo(store).load()).rooms[0]!.pets).toHaveLength(1);
  });
});

describe('robot', () => {
  const withPets = (pets: unknown[]) => {
    const base = createInitialState();
    return parseLibraryState({ ...base, rooms: [{ ...base.rooms[0]!, pets }] }).rooms[0]!.pets;
  };

  it('lit un robot de coloris valable et refuse un coloris d une autre espèce', () => {
    const pets = withPets([
      { id: 'p1', species: 'robot', name: 'Robi', coat: 'blue' },
      { id: 'p2', species: 'robot', name: 'Bad', coat: 'orange' },
      { id: 'p3', species: 'cat', name: 'Bad2', coat: 'mint' },
    ]);
    expect(pets).toEqual([{ id: 'p1', species: 'robot', name: 'Robi', coat: 'blue' }]);
  });

  it('accepte un mélange chat, chien, robot et plafonne à trois', () => {
    const pets = withPets([
      { id: 'p1', species: 'cat', name: 'A', coat: 'white' },
      { id: 'p2', species: 'dog', name: 'B', coat: 'red' },
      { id: 'p3', species: 'robot', name: 'C', coat: 'red' },
      { id: 'p4', species: 'robot', name: 'D', coat: 'white' },
    ]);
    expect(pets.map((p) => p.species)).toEqual(['cat', 'dog', 'robot']);
  });

  it('relit un plan de sieste sur le robot (ride)', () => {
    const ride: PetPlan = { ...plan, action: 'sleep', with: { petId: 'p2', role: 'lead', scene: 'ride' } };
    const saved = setPetPlan(adoptPet(createInitialState(), 'r1', 'A', 'white'), 'r1', 'p1', ride);
    expect(parseLibraryState(JSON.parse(JSON.stringify(saved))).rooms[0]!.pets[0]!.plan).toEqual(ride);
  });

  it('adopte un robot : id libre, coloris gardé ou premier coloris', () => {
    const state = adoptPet(createInitialState(), 'r1', 'Robi', 'blue', 'robot');
    expect(state.rooms[0]!.pets[0]).toEqual({ id: 'p1', species: 'robot', name: 'Robi', coat: 'blue' });
    expect(adoptPet(createInitialState(), 'r1', '', 'tabby', 'robot').rooms[0]!.pets[0]).toMatchObject({ name: 'Robi', coat: 'white' });
  });
});
