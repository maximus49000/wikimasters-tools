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
});
