import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { addRoom, renameRoom } from '../../../src/core/library/library-book';
import { createLibraryRepo } from '../../../src/core/library/library-repo';

describe('createLibraryRepo', () => {
  it('charge une pièce vide quand rien n est enregistré', async () => {
    const repo = createLibraryRepo(createMemoryStore());
    expect(repo.current()).toBeNull();
    const state = await repo.load();
    expect(state.rooms).toHaveLength(1);
    expect(repo.current()).toEqual(state);
  });

  it('enregistre les changements et les relit', async () => {
    const store = createMemoryStore();
    const repo = createLibraryRepo(store);
    await repo.update(addRoom);
    const again = await createLibraryRepo(store).load();
    expect(again.rooms).toHaveLength(2);
  });

  it('sérialise deux changements simultanés', async () => {
    const repo = createLibraryRepo(createMemoryStore());
    await Promise.all([repo.update(addRoom), repo.update((s) => renameRoom(s, 'r1', 'Salon'))]);
    const state = await repo.load();
    expect(state.rooms).toHaveLength(2);
    expect(state.rooms[0]?.name).toBe('Salon');
  });

  it('prévient les abonnés et permet de se désabonner', async () => {
    const repo = createLibraryRepo(createMemoryStore());
    const listener = vi.fn();
    const off = repo.subscribe(listener);
    await repo.update(addRoom);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    await repo.update(addRoom);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reste utilisable après un échec d écriture', async () => {
    const store = createMemoryStore();
    const failing = { get: store.get.bind(store), set: vi.fn().mockRejectedValueOnce(new Error('plein')).mockImplementation(store.set.bind(store)) };
    const repo = createLibraryRepo(failing);
    await expect(repo.update(addRoom)).rejects.toThrow('plein');
    await repo.update(addRoom);
    expect((await repo.load()).rooms).toHaveLength(2);
  });

  it('ne rejette pas et n écrit rien quand la lecture échoue au chargement', async () => {
    const set = vi.fn();
    const repo = createLibraryRepo({ get: vi.fn().mockRejectedValue(new Error('illisible')), set });
    const state = await repo.load();
    expect(state.rooms).toHaveLength(1);
    expect(repo.current()).toEqual(state);
    expect(set).not.toHaveBeenCalled();
  });

  it('update rejette sans rien écrire quand la lecture échoue, puis reste utilisable', async () => {
    const store = createMemoryStore();
    const set = vi.fn(store.set.bind(store));
    const get = vi.fn().mockRejectedValueOnce(new Error('illisible')).mockImplementation(store.get.bind(store));
    const repo = createLibraryRepo({ get, set } as never);
    await expect(repo.update(addRoom)).rejects.toThrow('illisible');
    expect(set).not.toHaveBeenCalled();
    await repo.update(addRoom);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('un changement lancé pendant un chargement n est pas écrasé', async () => {
    const repo = createLibraryRepo(createMemoryStore());
    const loading = repo.load();
    const updating = repo.update(addRoom);
    await Promise.all([loading, updating]);
    expect(repo.current()?.rooms).toHaveLength(2);
  });

  it('garde la copie des cartes posées, fusionnée sans rien perdre', async () => {
    const store = createMemoryStore();
    const repo = createLibraryRepo(store);
    expect(await repo.loadCards()).toEqual({});
    expect(await repo.saveCards({ Paris: { title: 'Paris', imageUrl: 'p.png' } })).toBe(true);
    expect(await repo.saveCards({ Paris: { title: 'Paris', rarity: 'Rare' } })).toBe(true);
    expect(await repo.saveCards({ Paris: { title: 'Paris', rarity: 'Rare' } })).toBe(false);
    expect(await createLibraryRepo(store).loadCards()).toEqual({ Paris: { title: 'Paris', imageUrl: 'p.png', rarity: 'Rare' } });
  });

  // Copie de sécurité des vraies données avant la première écriture v7 (conversion des rangements) : une seule, jamais réécrite.
  describe('copie de sécurité avant la v7', () => {
    const v6 = { version: 6, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' }, rooms: [{ id: 'r1', name: 'Salon', orientation: 'landscape', cols: 24, style: 'scandinave', scene: 'city', pets: [], layout: [{ id: 'sh', kind: 'shelf', col: 0, row: 6 }, { id: 'a', kind: 'stored', shape: 'cd', shelfId: 'sh', slot: 7, slug: 'S_a' }] }] };

    it('enregistre le blob brut avant la première écriture, une seule fois', async () => {
      const store = createMemoryStore();
      await store.set('library', v6);
      const calls: string[] = [];
      const spied = { get: store.get.bind(store), set: vi.fn(async (k: string, v: unknown) => { calls.push(k); await store.set(k, v); }) };
      const repo = createLibraryRepo(spied as never);
      await repo.update(addRoom);
      expect(calls).toEqual(['library-backup-pre-v7', 'library-backup-pre-v9', 'library-backup-pre-v10', 'library']);
      expect(await store.get('library-backup-pre-v7')).toEqual(v6);
      // Les vraies données ont bien été converties puis complétées (pas remplacées par la pièce vide).
      expect((await store.get<{ rooms: { name: string }[] }>('library'))?.rooms.map((r) => r.name)).toEqual(['Salon', 'Pièce 2']);
      // 2e chargement / 2e écriture (état déjà en v7) : la copie n'est ni réécrite ni remplacée.
      await createLibraryRepo(spied as never).load();
      await createLibraryRepo(spied as never).update(addRoom);
      expect(calls.filter((k) => k === 'library-backup-pre-v7')).toHaveLength(1);
      expect(calls.filter((k) => k === 'library-backup-pre-v9')).toHaveLength(1);
      expect(await store.get('library-backup-pre-v7')).toEqual(v6);
    });

    it('le simple chargement d un état ancien écrit déjà la copie', async () => {
      const store = createMemoryStore();
      await store.set('library', v6);
      await createLibraryRepo(store).load();
      expect(await store.get('library-backup-pre-v7')).toEqual(v6);
    });

    it('une copie existante n est jamais remplacée', async () => {
      const store = createMemoryStore();
      await store.set('library-backup-pre-v7', { version: 5, ancien: true });
      await store.set('library', v6);
      await createLibraryRepo(store).update(addRoom);
      expect(await store.get('library-backup-pre-v7')).toEqual({ version: 5, ancien: true });
    });

    it('rien n est copié pour un état déjà en v7 ou absent', async () => {
      const store = createMemoryStore();
      const set = vi.fn(store.set.bind(store));
      const repo = createLibraryRepo({ get: store.get.bind(store), set } as never);
      await repo.update(addRoom);
      await repo.update(addRoom);
      expect(set.mock.calls.map((c) => c[0])).toEqual(['library', 'library']);
    });

    it('sans copie possible, rien n est écrit', async () => {
      const store = createMemoryStore();
      await store.set('library', v6);
      const set = vi.fn(async (k: string, v: unknown) => {
        if (k === 'library-backup-pre-v7') throw new Error('plein');
        await store.set(k, v);
      });
      const repo = createLibraryRepo({ get: store.get.bind(store), set } as never);
      await expect(repo.update(addRoom)).rejects.toThrow('plein');
      expect(await store.get('library')).toEqual(v6);
    });

    it('un état v8 : seule la copie d avant la v9 est faite, une seule fois', async () => {
      const v8 = { version: 8, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' }, rooms: [{ id: 'r1', name: 'Salon', orientation: 'landscape', cols: 24, style: 'scandinave', scene: 'city', pets: [], layout: [{ id: 'd', kind: 'desk', col: 0, row: 10 }, { id: 'a', kind: 'small', item: 'alarm', hostId: 'd', slot: 0 }] }] };
      const store = createMemoryStore();
      await store.set('library', v8);
      const calls: string[] = [];
      const spied = { get: store.get.bind(store), set: vi.fn(async (k: string, v: unknown) => { calls.push(k); await store.set(k, v); }) };
      await createLibraryRepo(spied as never).update(addRoom);
      await createLibraryRepo(spied as never).update(addRoom);
      expect(calls).toEqual(['library-backup-pre-v9', 'library-backup-pre-v10', 'library', 'library']);
      expect(await store.get('library-backup-pre-v9')).toEqual(v8);
      expect(await store.get('library-backup-pre-v7')).toBeUndefined();
      // Le réveil est relu en cm, à sa place.
      expect((await store.get<{ rooms: { layout: unknown[] }[] }>('library'))?.rooms[0]!.layout[1]).toEqual({ id: 'a', kind: 'small', item: 'alarm', hostId: 'd', x: 6, z: 26.5 });
    });

    it('un état v9 : seule la copie d avant la v10 est faite, une seule fois', async () => {
      const v9 = { version: 9, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' }, rooms: [{ id: 'r1', name: 'Salon', orientation: 'landscape', cols: 24, style: 'scandinave', scene: 'city', pets: [], layout: [{ id: 'd', kind: 'desk', col: 0, row: 10 }, { id: 'p', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 0, slug: 'S' }] }] };
      const store = createMemoryStore();
      await store.set('library', v9);
      const calls: string[] = [];
      const spied = { get: store.get.bind(store), set: vi.fn(async (k: string, v: unknown) => { calls.push(k); await store.set(k, v); }) };
      await createLibraryRepo(spied as never).update(addRoom);
      await createLibraryRepo(spied as never).update(addRoom);
      expect(calls).toEqual(['library-backup-pre-v10', 'library', 'library']);
      expect(await store.get('library-backup-pre-v10')).toEqual(v9);
      expect((await store.get<{ version: number }>('library'))?.version).toBe(10);
    });

    it('un état enregistré illisible n est jamais écrasé par la pièce vide', async () => {
      const store = createMemoryStore();
      const broken = { version: 7, rooms: 'abîmé' };
      await store.set('library', broken);
      const repo = createLibraryRepo(store);
      const state = await repo.load();
      expect(state.rooms).toHaveLength(1);
      await repo.update(addRoom);
      await repo.updateQuiet(addRoom);
      // Les changements restent en mémoire seulement.
      expect(repo.current()?.rooms).toHaveLength(3);
      expect(await store.get('library')).toEqual(broken);
    });
  });
});
