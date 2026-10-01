import { describe, expect, it, vi } from 'vitest';
import { createMusicService } from '../../src/content/music-service';
import { SpotifyError } from '../../src/core/spotify/errors';

const card = (slug: string) => ({ slug, title: slug });

function setup(over: { linked?: boolean; collection?: string[]; natures?: string[]; music?: Record<string, object>; launchApp?: () => void } = {}) {
  const api = {
    searchTracks: vi.fn(async () => []),
    searchAlbum: vi.fn(async () => null),
    albumTracks: vi.fn(async () => [{ uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' }]),
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
  };
  const session = {
    isLinked: vi.fn(async () => over.linked ?? true),
    link: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
  };
  const service = createMusicService({
    collection: { list: async () => (over.collection ?? ['Abbey_Road']).map(card) },
    kinds: {
      resolveMissing: vi.fn(async () => undefined),
      load: async () => ({ cards: { Abbey_Road: { natures: over.natures ?? ['Q482994'], occupations: [], genres: [] } }, labels: {} }),
    },
    music: { resolve: async () => ({ Abbey_Road: { albumId: 'A'.repeat(22), ...(over.music?.Abbey_Road ?? {}) } }) },
    session,
    api: api as never,
    onPlayed: vi.fn(),
    ...(over.launchApp ? { launchApp: over.launchApp, sleep: async () => undefined } : {}),
  });
  return { service, api, session };
}

describe('createMusicService.view', () => {
  it('rend les pistes pour une carte album de la collection quand le compte est lié', async () => {
    const { service } = setup();
    const view = await service.view('Abbey_Road', 'Abbey Road');
    expect(view).toMatchObject({ status: 'ready', listen: { kind: 'album', albumUri: `spotify:album:${'A'.repeat(22)}` } });
  });

  it('rend none pour une carte hors collection ou non musicale', async () => {
    expect(await setup({ collection: [] }).service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'none' });
    expect(await setup({ natures: ['Q11424'] }).service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'none' });
  });

  it("rend unlinked sans appel à Spotify quand le compte n'est pas lié", async () => {
    const { service, api } = setup({ linked: false });
    expect(await service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'unlinked' });
    expect(api.albumTracks).not.toHaveBeenCalled();
  });

  it('rend notfound quand rien ne se retrouve sur Spotify, et error avec un message en cas de panne', async () => {
    const empty = setup();
    empty.api.albumTracks.mockResolvedValueOnce([]);
    expect(await empty.service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'notfound' });

    const down = setup();
    down.api.albumTracks.mockRejectedValueOnce(new SpotifyError('rate-limited', 'x', 1000));
    expect(await down.service.view('Abbey_Road', 'Abbey Road')).toEqual({
      status: 'error',
      message: 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.',
    });
  });
});

describe('createMusicService.play', () => {
  const track = { uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' };

  it('lance une piste d’album dans son contexte et prévient le lecteur', async () => {
    const { service, api } = setup();
    expect(await service.play(track, { kind: 'album', items: [track], albumUri: 'spotify:album:AAA' })).toBeNull();
    expect(api.play).toHaveBeenCalledWith({ contextUri: 'spotify:album:AAA', offsetUri: 'spotify:track:1' });
  });

  it('lance un morceau seul', async () => {
    const { service, api } = setup();
    await service.play(track, { kind: 'artist', items: [track] });
    expect(api.play).toHaveBeenCalledWith({ uris: ['spotify:track:1'] });
  });

  it("rend le message d'erreur, par exemple sans appareil", async () => {
    const { service, api } = setup();
    api.play.mockRejectedValueOnce(new SpotifyError('no-device', 'x'));
    expect(await service.play(track, { kind: 'track', items: [track] })).toBe('Ouvre Spotify sur un de tes appareils, puis réessaie.');
  });
});

describe('createMusicService.play, Spotify fermé', () => {
  const track = { uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' };
  const listen = { kind: 'track' as const, items: [track] };
  const noDevice = () => new SpotifyError('no-device', 'x');

  it("ouvre Spotify puis relance la lecture dès qu'un appareil répond", async () => {
    const launchApp = vi.fn();
    const { service, api } = setup({ launchApp });
    api.play.mockRejectedValueOnce(noDevice()).mockRejectedValueOnce(noDevice());
    expect(await service.play(track, listen)).toBeNull();
    expect(launchApp).toHaveBeenCalledTimes(1);
    expect(api.play).toHaveBeenCalledTimes(3);
  });

  it('abandonne avec le message habituel si Spotify ne répond jamais', async () => {
    const { service, api } = setup({ launchApp: vi.fn() });
    api.play.mockRejectedValue(noDevice());
    expect(await service.play(track, listen)).toBe('Ouvre Spotify sur un de tes appareils, puis réessaie.');
    expect(api.play).toHaveBeenCalledTimes(9);
  });

  it("n'ouvre pas Spotify pour une autre erreur", async () => {
    const launchApp = vi.fn();
    const { service, api } = setup({ launchApp });
    api.play.mockRejectedValueOnce(new SpotifyError('not-premium', 'x'));
    await service.play(track, listen);
    expect(launchApp).not.toHaveBeenCalled();
  });
});

describe('createMusicService.link', () => {
  it('lie le compte, ou rend le message de refus', async () => {
    const { service, session } = setup();
    expect(await service.link()).toBeNull();
    session.link.mockRejectedValueOnce(new SpotifyError('auth-cancelled', 'x'));
    expect(await service.link()).toBe('Liaison Spotify annulée.');
  });

  it("montre la cause d'une erreur hors Spotify (ex. fenêtre d'autorisation refusée)", async () => {
    const { service, session } = setup();
    session.link.mockRejectedValueOnce(new Error('Authorization page could not be loaded.'));
    expect(await service.link()).toBe('Liaison Spotify impossible : Authorization page could not be loaded.');
  });
});
