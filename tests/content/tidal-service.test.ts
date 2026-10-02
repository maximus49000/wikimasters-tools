import { describe, expect, it, vi } from 'vitest';
import { createTidalService } from '../../src/content/tidal-service';
import { createMemoryStore } from '../../src/core/cache/store';
import { createListenRepo } from '../../src/core/music/listen-repo';
import { TidalError } from '../../src/core/tidal/errors';

function setup(over: { linked?: boolean; albums?: unknown[] } = {}) {
  const store = createMemoryStore();
  const api = {
    searchTracks: vi.fn(async () => []),
    searchAlbums: vi.fn(async () => (over.albums ?? [{ id: 'A', title: 'Abbey Road', artists: ['The Beatles'] }]) as never),
    searchArtists: vi.fn(async () => []),
    albumTracks: vi.fn(async () => [{ id: 't1', title: 'Come Together' }]),
    artistTracks: vi.fn(async () => []),
  };
  const session = {
    isLinked: vi.fn(async () => over.linked ?? true),
    link: vi.fn(async (): Promise<void> => undefined),
    unlink: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
  };
  const service = createTidalService({
    collection: { list: async () => [{ slug: 'Abbey_Road', title: 'Abbey_Road' }] },
    kinds: { resolveMissing: async () => undefined, load: async () => ({ cards: { Abbey_Road: { natures: ['Q482994'], occupations: [], genres: [] } }, labels: {} }) as never },
    music: { resolve: async () => ({ Abbey_Road: { performer: 'The Beatles' } }) as never },
    listens: createListenRepo(store, () => Date.now(), 'listens-tidal-v1'),
    session,
    api,
  });
  return { service, api, session, store };
}

describe('createTidalService', () => {
  it("rend les pistes de l'album et les garde dans le dépôt Tidal, jamais dans celui de Spotify", async () => {
    const { service, api, store } = setup();
    const view = await service.view('Abbey_Road', 'Abbey Road');
    expect(view).toMatchObject({ status: 'ready', listen: { kind: 'album', albumUri: 'tidal:album:A' } });
    await service.view('Abbey_Road', 'Abbey Road');
    expect(api.searchAlbums).toHaveBeenCalledTimes(1);
    expect(await store.get('listens-tidal-v1')).toBeTruthy();
    expect(await store.get('listens-v1')).toBeUndefined();
  });

  it("rend unlinked sans compte, notfound sans résultat, et un message Tidal en cas d'erreur", async () => {
    expect(await setup({ linked: false }).service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'unlinked' });
    expect(await setup({ albums: [] }).service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'notfound' });
    const failing = setup();
    failing.api.searchAlbums.mockRejectedValueOnce(new TidalError('rate-limited', 'x', 4_000));
    expect(await failing.service.view('Abbey_Road', 'Abbey Road')).toEqual({
      status: 'error',
      message: 'Tidal demande de patienter un instant. Réessaie dans quelques secondes.',
      retryAfterMs: 4_000,
    });
  });

  it("lie, délie et expose la liaison ; pas de titre « en cours » ni de lecture dans l'appli", async () => {
    const { service, session } = setup();
    expect(await service.link()).toBeNull();
    await service.unlink();
    expect(session.link).toHaveBeenCalledTimes(1);
    expect(session.unlink).toHaveBeenCalledTimes(1);
    expect(await service.isLinked()).toBe(true);
    expect(await service.playingSlugs()).toEqual(new Set());
  });

  it("rend la cause d'une liaison qui échoue", async () => {
    const { service, session } = setup();
    session.link.mockRejectedValueOnce(new TidalError('auth-cancelled', 'x'));
    expect(await service.link()).toBe('Liaison Tidal annulée.');
    session.link.mockRejectedValueOnce(new Error('adresse de retour refusée'));
    expect(await service.link()).toBe('Liaison Tidal impossible : adresse de retour refusée');
  });
});
