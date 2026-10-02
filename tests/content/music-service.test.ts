import { describe, expect, it, vi } from 'vitest';
import { createMusicService } from '../../src/content/music-service';
import { createMemoryStore, type KeyValueStore } from '../../src/core/cache/store';
import { createListenRepo } from '../../src/core/music/listen-repo';
import type { CardMusic } from '../../src/core/music/wikidata-music';
import { SpotifyError } from '../../src/core/spotify/errors';

const card = (slug: string) => ({ slug, title: slug });

type Over = {
  linked?: boolean;
  collection?: string[];
  natures?: string[];
  music?: Record<string, object>;
  launchApp?: () => void;
  // Stockage partagé entre deux services : simule deux sessions de la page.
  store?: KeyValueStore;
  // Wikidata n'a pas (encore) répondu pour la carte.
  wikidataSilent?: boolean;
  // Le dépôt des listes remplacé (stockage plein, par exemple).
  listens?: Pick<ReturnType<typeof createListenRepo>, 'load' | 'save'>;
  // Identifiants TMDB connus pour la carte (dépôt `screen-v1`).
  screen?: Record<string, { movieId?: number; tvId?: number }>;
};

function setup(over: Over = {}) {
  const api = {
    searchTracks: vi.fn(async () => []),
    searchAlbum: vi.fn(async () => null),
    searchAlbums: vi.fn(async () => [{ id: 'OST', name: 'Inception (Original Motion Picture Soundtrack)', artist: 'Hans Zimmer' }]),
    searchPlaylists: vi.fn(async () => [] as { id: string; name: string; owner: string }[]),
    albumTracks: vi.fn(async () => [{ uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' }]),
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
  };
  const sessionListeners = new Set<() => void>();
  const session = {
    isLinked: vi.fn(async () => over.linked ?? true),
    link: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
    subscribe: vi.fn((listener: () => void) => {
      sessionListeners.add(listener);
      return () => void sessionListeners.delete(listener);
    }),
  };
  const onPlayed = vi.fn();
  const store = over.store ?? createMemoryStore();
  const resolve = vi.fn(async (): Promise<Record<string, CardMusic>> => (over.wikidataSilent ? {} : { Abbey_Road: { albumId: 'A'.repeat(22), ...(over.music?.Abbey_Road ?? {}) } }));
  const service = createMusicService({
    collection: { list: async () => (over.collection ?? ['Abbey_Road']).map(card) },
    kinds: {
      resolveMissing: vi.fn(async () => undefined),
      load: async () => ({ cards: { Abbey_Road: { natures: over.natures ?? ['Q482994'], occupations: [], genres: [] } }, labels: {} }),
    },
    music: { resolve },
    listens: over.listens ?? createListenRepo(store),
    soundtracks: createListenRepo(store, undefined, 'soundtracks-v1'),
    ...(over.screen ? { screen: { load: async () => over.screen! } } : {}),
    session,
    api: api as never,
    onPlayed,
    ...(over.launchApp ? { launchApp: over.launchApp, sleep: async () => undefined } : {}),
  });
  return { service, api, session, sessionListeners, onPlayed, resolve, store };
}

describe('createMusicService.soundtrack', () => {
  it('trouve la BO, la garde, et ne redemande rien à Spotify la fois suivante (même après un rechargement)', async () => {
    const first = setup();
    const listen = await first.service.soundtrack('movie:27205', ['Inception']);
    expect(listen).toMatchObject({ albumUri: 'spotify:album:OST', album: { artist: 'Hans Zimmer' } });
    expect(first.api.searchAlbums).toHaveBeenCalledTimes(1);

    const second = setup({ store: first.store });
    expect(await second.service.soundtrack('movie:27205', ['Inception'])).toEqual(listen);
    expect(second.api.searchAlbums).not.toHaveBeenCalled();
    expect(second.api.albumTracks).not.toHaveBeenCalled();
  });

  it('garde aussi « pas de BO » : pas de nouvelle recherche', async () => {
    const { service, api } = setup();
    api.searchAlbums.mockResolvedValue([]);
    expect(await service.soundtrack('movie:1', ['Film sans BO'])).toBeNull();
    expect(await service.soundtrack('movie:1', ['Film sans BO'])).toBeNull();
    expect(api.searchAlbums).toHaveBeenCalledTimes(1);
  });

  it('ne garde pas une erreur de Spotify : la recherche est retentée', async () => {
    const { service, api } = setup();
    api.searchAlbums.mockRejectedValueOnce(new SpotifyError('rate-limited', 'limite', 5000, Date.now() + 5000));
    expect(await service.soundtrack('movie:27205', ['Inception'])).toBeNull();
    expect(await service.soundtrack('movie:27205', ['Inception'])).not.toBeNull();
    expect(api.searchAlbums).toHaveBeenCalledTimes(2);
  });

  it('ne cherche rien sans compte lié', async () => {
    const { service, api } = setup({ linked: false });
    expect(await service.soundtrack('movie:27205', ['Inception'])).toBeNull();
    expect(api.searchAlbums).not.toHaveBeenCalled();
  });
});

describe('createMusicService : réglage de la BO (pop-up)', () => {
  it('refreshSoundtrack relance la recherche malgré ce qui était gardé, et remplace', async () => {
    const { service, api } = setup();
    api.searchAlbums.mockResolvedValueOnce([]);
    expect(await service.soundtrack('movie:1', ['Inception'])).toBeNull();
    const outcome = await service.refreshSoundtrack('movie:1', ['Inception']);
    expect(outcome.listen).toMatchObject({ albumUri: 'spotify:album:OST' });
    expect(await service.soundtrack('movie:1', ['Inception'])).toEqual(outcome.listen);
  });

  it('refreshSoundtrack : une erreur rend un message et ne touche pas à ce qui était gardé', async () => {
    const { service, api } = setup();
    const kept = await service.soundtrack('movie:1', ['Inception']);
    api.searchAlbums.mockRejectedValueOnce(new SpotifyError('rate-limited', 'limite', 5000, Date.now() + 5000));
    const outcome = await service.refreshSoundtrack('movie:1', ['Inception']);
    expect(outcome.listen).toBeNull();
    expect(outcome.message).toBeTruthy();
    expect(await service.soundtrack('movie:1', ['Inception'])).toEqual(kept);
  });

  it('searchSoundtracks rend albums et playlists, ou un message en cas d’erreur', async () => {
    const { service, api } = setup();
    api.searchPlaylists.mockResolvedValueOnce([{ id: 'P', name: 'BO Nos jours Heureux', owner: 'Léa' }]);
    const found = await service.searchSoundtracks('nos jours heureux');
    expect(found.choices.map((choice) => choice.kind)).toEqual(['album', 'playlist']);
    api.searchAlbums.mockRejectedValueOnce(new SpotifyError('http', 'oups'));
    expect(await service.searchSoundtracks('x')).toMatchObject({ choices: [], message: expect.any(String) });
  });

  it('chooseSoundtrack garde le choix (playlist sans appel de pistes) et play la lance par son contexte', async () => {
    const { service, api } = setup();
    const outcome = await service.chooseSoundtrack('movie:1', { kind: 'playlist', id: 'P', name: 'BO Nos jours Heureux', by: 'Léa' });
    expect(outcome.listen).toMatchObject({ albumUri: 'spotify:playlist:P', items: [] });
    expect(api.albumTracks).not.toHaveBeenCalled();
    expect(await service.soundtrack('movie:1', ['Autre titre'])).toEqual(outcome.listen);
    expect(await service.play(null, outcome.listen!)).toBeNull();
    expect(api.play).toHaveBeenCalledWith({ contextUri: 'spotify:playlist:P' });
  });

  it('chooseSoundtrack : un album vide n’est pas gardé', async () => {
    const { service, api } = setup();
    api.albumTracks.mockResolvedValueOnce([]);
    expect(await service.chooseSoundtrack('movie:1', { kind: 'album', id: 'A', name: 'Vide', by: 'X' })).toMatchObject({ listen: null, message: expect.any(String) });
  });
});

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
    // Le délai demandé par Spotify accompagne le message : la fiche s'en sert pour recharger toute seule.
    expect(await down.service.view('Abbey_Road', 'Abbey Road')).toEqual({
      status: 'error',
      message: 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.',
      retryAfterMs: 1000,
    });
  });

  it("ne donne un délai qu'aux limites connues : les autres pannes ne se relancent pas toutes seules", async () => {
    for (const error of [new SpotifyError('http', 'x'), new SpotifyError('not-premium', 'x'), new Error('boom'), new SpotifyError('rate-limited', 'x')]) {
      const down = setup();
      down.api.albumTracks.mockRejectedValueOnce(error);
      expect(await down.service.view('Abbey_Road', 'Abbey Road')).not.toHaveProperty('retryAfterMs');
    }
  });
});

describe('createMusicService, listes gardées', () => {
  const come = { uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' };
  const something = { uri: 'spotify:track:2', title: 'Something', artist: 'The Beatles' };

  it("n'interroge Spotify ni Wikidata une seconde fois pour la même carte", async () => {
    const { service, api, resolve } = setup();
    await service.view('Abbey_Road', 'Abbey Road');
    const again = await service.view('Abbey_Road', 'Abbey Road');
    expect(again).toMatchObject({ status: 'ready', listen: { kind: 'album', items: [come] } });
    expect(api.albumTracks).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("retrouve la liste à la session suivante, sans aucun appel à Spotify", async () => {
    const first = setup();
    await first.service.view('Abbey_Road', 'Abbey Road');
    const next = setup({ store: first.store });
    expect(await next.service.view('Abbey_Road', 'Abbey Road')).toMatchObject({ status: 'ready' });
    expect(next.api.albumTracks).not.toHaveBeenCalled();
    expect(next.resolve).not.toHaveBeenCalled();
  });

  it('garde aussi « introuvable » : pas de nouvelle recherche à chaque ouverture', async () => {
    const { service, api } = setup();
    api.albumTracks.mockResolvedValueOnce([]);
    expect(await service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'notfound' });
    expect(await service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'notfound' });
    expect(api.albumTracks).toHaveBeenCalledTimes(1);
  });

  it("ne garde pas une erreur : la fiche réessaie à l'ouverture suivante", async () => {
    const { service, api } = setup();
    api.albumTracks.mockRejectedValueOnce(new SpotifyError('rate-limited', 'x', 1000));
    expect(await service.view('Abbey_Road', 'Abbey Road')).toMatchObject({ status: 'error' });
    expect(await service.view('Abbey_Road', 'Abbey Road')).toMatchObject({ status: 'ready' });
    expect(api.albumTracks).toHaveBeenCalledTimes(2);
  });

  it("ne garde pas un « introuvable » dû à Wikidata muet : sans l'interprète, Spotify n'a pas été interrogé", async () => {
    const silent = setup({ wikidataSilent: true });
    expect(await silent.service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'notfound' });
    expect(await silent.service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'notfound' });
    expect(silent.api.albumTracks).not.toHaveBeenCalled();
    // Wikidata finit par répondre : la carte est enfin résolue, rien de faux n'a été gardé.
    const answered = setup({ store: silent.store });
    expect(await answered.service.view('Abbey_Road', 'Abbey Road')).toMatchObject({ status: 'ready' });
  });

  it("garde la liste quand on délie puis relie Spotify : ce sont des données de catalogue, pas du compte", async () => {
    const { service, api, sessionListeners } = setup();
    await service.view('Abbey_Road', 'Abbey Road');
    sessionListeners.forEach((listener) => listener());
    expect(await service.view('Abbey_Road', 'Abbey Road')).toMatchObject({ status: 'ready' });
    expect(api.albumTracks).toHaveBeenCalledTimes(1);
  });

  it("n'affiche toujours rien de la liste tant que le compte n'est pas lié", async () => {
    const first = setup();
    await first.service.view('Abbey_Road', 'Abbey Road');
    const unlinked = setup({ store: first.store, linked: false });
    expect(await unlinked.service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'unlinked' });
  });

  it("montre quand même la liste quand le stockage refuse l'écriture (plein)", async () => {
    const full = { load: async () => new Map(), save: vi.fn(async () => Promise.reject(new Error('QuotaExceededError'))) };
    const { service, api } = setup({ listens: full });
    expect(await service.view('Abbey_Road', 'Abbey Road')).toMatchObject({ status: 'ready' });
    // Sans mémoire, on retombe sur le comportement d'avant : Spotify est réinterrogé.
    await service.view('Abbey_Road', 'Abbey Road');
    expect(api.albumTracks).toHaveBeenCalledTimes(2);
  });

  it("ne lance aucune recherche en lançant la lecture : le seul appel est `play`", async () => {
    const { service, api } = setup();
    const view = await service.view('Abbey_Road', 'Abbey Road');
    if (view.status !== 'ready') throw new Error('liste attendue');
    api.albumTracks.mockClear();
    await service.play(come, view.listen, { slug: 'Abbey_Road', title: 'Abbey Road' });
    expect(api.albumTracks).not.toHaveBeenCalled();
    expect(api.searchTracks).not.toHaveBeenCalled();
    expect(api.play).toHaveBeenCalledTimes(1);
  });

  describe('refresh', () => {
    it("redemande à Spotify et remplace la liste gardée, que les ouvertures suivantes reprennent sans appel", async () => {
      const { service, api } = setup();
      await service.view('Abbey_Road', 'Abbey Road');
      api.albumTracks.mockResolvedValue([come, something]);
      expect(await service.refresh('Abbey_Road', 'Abbey Road')).toMatchObject({ status: 'ready', listen: { items: [come, something] } });
      expect(api.albumTracks).toHaveBeenCalledTimes(2);
      expect(await service.view('Abbey_Road', 'Abbey Road')).toMatchObject({ status: 'ready', listen: { items: [come, something] } });
      expect(api.albumTracks).toHaveBeenCalledTimes(2);
    });

    it("garde l'ancienne liste quand Spotify est indisponible : seule une réponse la remplace", async () => {
      const { service, api } = setup();
      await service.view('Abbey_Road', 'Abbey Road');
      api.albumTracks.mockRejectedValueOnce(new SpotifyError('rate-limited', 'x', 1000));
      expect(await service.refresh('Abbey_Road', 'Abbey Road')).toMatchObject({ status: 'error', retryAfterMs: 1000 });
      expect(await service.view('Abbey_Road', 'Abbey Road')).toMatchObject({ status: 'ready', listen: { items: [come] } });
      expect(api.albumTracks).toHaveBeenCalledTimes(2);
    });

    it("rend la liste gardée sans interroger Spotify quand Wikidata n'a pas répondu : l'interprète manque, l'actualisation serait faussée", async () => {
      const first = setup();
      await first.service.view('Abbey_Road', 'Abbey Road');
      const silent = setup({ store: first.store, wikidataSilent: true });
      expect(await silent.service.refresh('Abbey_Road', 'Abbey Road')).toMatchObject({ status: 'ready', listen: { items: [come] } });
      expect(silent.api.albumTracks).not.toHaveBeenCalled();
    });

    it("rend none hors collection, comme view", async () => {
      expect(await setup({ collection: [] }).service.refresh('Abbey_Road', 'Abbey Road')).toEqual({ status: 'none' });
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

  it("enchaîne les titres suivants d'un artiste", async () => {
    const { service, api } = setup();
    const items = ['1', '2', '3'].map((id) => ({ uri: `spotify:track:${id}`, title: id, artist: 'A' }));
    await service.play(items[1]!, { kind: 'artist', items });
    expect(api.play).toHaveBeenCalledWith({ uris: ['spotify:track:2', 'spotify:track:3'] });
  });

  it("rend le message d'erreur, par exemple sans appareil", async () => {
    const { service, api } = setup();
    api.play.mockRejectedValueOnce(new SpotifyError('no-device', 'x'));
    expect(await service.play(track, { kind: 'track', items: [track] })).toBe('Ouvre Spotify sur un de tes appareils, puis réessaie.');
  });

  it('une fois la lecture lancée, donne au lecteur la carte qui l’a demandée', async () => {
    const { service, onPlayed } = setup();
    await service.play(track, { kind: 'album', items: [track], albumUri: 'spotify:album:AAA' }, { slug: 'Abbey_Road', title: 'Abbey Road' });
    expect(onPlayed).toHaveBeenCalledTimes(1);
    expect(onPlayed).toHaveBeenCalledWith({ slug: 'Abbey_Road', title: 'Abbey Road' });
  });

  it('prévient quand même le lecteur sans carte', async () => {
    const { service, onPlayed } = setup();
    await service.play(track, { kind: 'track', items: [track] });
    expect(onPlayed).toHaveBeenCalledTimes(1);
    expect(onPlayed).toHaveBeenCalledWith(undefined);
  });

  it("ne dit rien au lecteur quand la lecture échoue : la carte reste celle d'avant", async () => {
    const { service, api, onPlayed } = setup();
    api.play.mockRejectedValueOnce(new SpotifyError('no-device', 'x'));
    await service.play(track, { kind: 'track', items: [track] }, { slug: 'Abbey_Road', title: 'Abbey Road' });
    expect(onPlayed).not.toHaveBeenCalled();
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

describe('createMusicService.playingSlugs', () => {
  const cards = [card('Abbey_Road')];

  it("reconnaît la carte dont la liste contient le titre joué, par URI ou par titre et artiste", async () => {
    const { service } = setup();
    expect([...(await service.playingSlugs(cards, { uri: 'spotify:track:1', title: 'x', artist: 'y' }))]).toEqual(['Abbey_Road']);
    expect([...(await service.playingSlugs(cards, { uri: 'spotify:track:9', title: 'come together', artist: 'The Beatles, X' }))]).toEqual(['Abbey_Road']);
  });

  it("ne reconnaît ni un autre titre, ni une carte non musicale, ni un compte non lié", async () => {
    expect((await setup().service.playingSlugs(cards, { uri: 'spotify:track:2', title: 'Something', artist: 'The Beatles' })).size).toBe(0);
    expect((await setup({ natures: ['Q11424'] }).service.playingSlugs(cards, { uri: 'spotify:track:1', title: 'x', artist: 'y' })).size).toBe(0);
    expect((await setup({ linked: false }).service.playingSlugs(cards, { uri: 'spotify:track:1', title: 'x', artist: 'y' })).size).toBe(0);
  });

  it("garde la liste d'une carte : pas de nouvelle recherche au titre suivant", async () => {
    const { service, api } = setup();
    await service.playingSlugs(cards, { uri: 'spotify:track:1', title: 'x', artist: 'y' });
    await service.playingSlugs(cards, { uri: 'spotify:track:2', title: 'z', artist: 'y' });
    expect(api.albumTracks).toHaveBeenCalledTimes(1);
  });
});

describe('createMusicService.playingSlugs, BO de film', () => {
  const cards = [card('Abbey_Road')];
  const film = { natures: ['Q11424'], screen: { Abbey_Road: { movieId: 27205 } } };

  it('reconnaît la carte du film dont la BO gardée contient le titre joué', async () => {
    const { service } = setup(film);
    await service.soundtrack('movie:27205', ['Inception']);
    expect([...(await service.playingSlugs(cards, { uri: 'spotify:track:1', title: 'x', artist: 'y' }))]).toEqual(['Abbey_Road']);
    expect((await service.playingSlugs(cards, { uri: 'spotify:track:2', title: 'Autre', artist: 'z' })).size).toBe(0);
  });

  it("n'interroge pas Spotify : une BO jamais trouvée ne fait rien", async () => {
    const { service, api } = setup(film);
    expect((await service.playingSlugs(cards, { uri: 'spotify:track:1', title: 'x', artist: 'y' })).size).toBe(0);
    expect(api.searchAlbums).not.toHaveBeenCalled();
  });
});

describe('createMusicService.musicSlugs', () => {
  it('rend les cartes de nature musicale, sans compte lié', async () => {
    const { service } = setup({ linked: false });
    expect([...(await service.musicSlugs([card('Abbey_Road'), card('Paris')]))]).toEqual(['Abbey_Road']);
  });

  it('ignore une carte non musicale', async () => {
    const { service } = setup({ natures: ['Q11424'] });
    expect((await service.musicSlugs([card('Abbey_Road')])).size).toBe(0);
  });
});
