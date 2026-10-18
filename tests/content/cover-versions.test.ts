import { afterEach, describe, expect, it, vi } from 'vitest';
import { RELAY_BASE } from '../../src/core/documentary/config';
import { coverVersions, createCoverVersions, setCoverVersions, type CoverVersionSources } from '../../src/content/cover-versions';
import type { TgdbVersion } from '../../src/core/game/tgdb-api';

const deezerReply = (covers: string[]) => vi.fn(async (_url: string) => Response.json({ covers }));
const spotify = (covers: string[] | Error, linked = true) => ({
  api: { findCovers: vi.fn(async () => (covers instanceof Error ? Promise.reject(covers) : covers)) },
  session: { isLinked: vi.fn(async () => linked) },
});
const card = { slug: 'Discovery_(album)', title: 'Discovery (album)', performer: 'Daft Punk' };
const version = (id: number, front?: string): TgdbVersion => ({ id, title: 'Zelda', platformId: 1, platformName: 'NES', format: 'nes', style: 'cardboard', ...(front ? { front } : {}) }) as unknown as TgdbVersion;

afterEach(() => setCoverVersions(null));

describe('coverVersions — CD', () => {
  it('Spotify lié avec des pochettes : elles seules, Deezer jamais appelé', async () => {
    const sp = spotify(['https://i.scdn.co/1', 'https://i.scdn.co/2', 'https://i.scdn.co/3']);
    const fetchFn = deezerReply(['https://cdn-images.dzcdn.net/x.jpg']);
    const versions = createCoverVersions({ sources: { spotify: sp }, fetch: fetchFn });
    expect(await versions(card, 'cd')).toEqual(['https://i.scdn.co/1', 'https://i.scdn.co/2', 'https://i.scdn.co/3']);
    expect(sp.api.findCovers).toHaveBeenCalledWith('Discovery', 'Daft Punk');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('Spotify vide, en erreur ou non lié (ou absent) → Deezer par le relais, ses pochettes renvoyées', async () => {
    for (const sources of [{ spotify: spotify([]) }, { spotify: spotify(new Error('limite')) }, { spotify: spotify(['https://i.scdn.co/1'], false) }, {}] as CoverVersionSources[]) {
      const fetchFn = deezerReply(['https://cdn-images.dzcdn.net/a.jpg', 'https://cdn-images.dzcdn.net/b.jpg']);
      expect(await createCoverVersions({ sources, fetch: fetchFn })(card, 'cd')).toEqual(['https://cdn-images.dzcdn.net/a.jpg', 'https://cdn-images.dzcdn.net/b.jpg']);
      const url = new URL(fetchFn.mock.calls[0]![0]);
      expect(`${url.origin}${url.pathname}`).toBe(`${RELAY_BASE}/deezer-covers`);
      expect(Object.fromEntries(url.searchParams)).toEqual({ title: 'Discovery', artist: 'Daft Punk' });
    }
  });

  it('interprète absent de la carte : lu dans Wikidata (dépôt musique), sinon recherche sur le titre seul', async () => {
    const sp = spotify(['https://i.scdn.co/1']);
    const music = { resolve: vi.fn(async () => ({ X: { performer: 'Daft Punk' } })) };
    await createCoverVersions({ sources: { spotify: sp, music } as unknown as CoverVersionSources, fetch: deezerReply([]) })({ slug: 'X', title: 'Discovery' }, 'cd');
    expect(sp.api.findCovers).toHaveBeenCalledWith('Discovery', 'Daft Punk');
    const fetchFn = deezerReply([]);
    await createCoverVersions({ sources: {}, fetch: fetchFn })({ slug: 'X', title: 'Discovery' }, 'cd');
    expect(Object.fromEntries(new URL(fetchFn.mock.calls[0]![0]).searchParams)).toEqual({ title: 'Discovery' });
  });

  it('relais en erreur (404 tant qu’il n’est pas redéployé, panne, réponse illisible, délai dépassé) → []', async () => {
    for (const fetchFn of [
      async () => new Response('{"ok":false}', { status: 404 }),
      async () => Promise.reject(new TypeError('offline')),
      async () => new Response('pas du json'),
      async () => Response.json({ covers: 'x' }),
    ]) {
      expect(await createCoverVersions({ sources: {}, fetch: fetchFn })(card, 'cd')).toEqual([]);
    }
    const never = createCoverVersions({ sources: {}, fetch: () => new Promise<Response>(() => {}), timeoutMs: 5 });
    expect(await never(card, 'cd')).toEqual([]);
  });

  it('Spotify a son propre délai, plus court (file d’attente occupée) : Deezer est encore essayé avant le délai global', async () => {
    vi.useFakeTimers();
    try {
      const sp = { api: { findCovers: vi.fn(() => new Promise<string[]>(() => {})) }, session: { isLinked: vi.fn(async () => true) } };
      const fetchFn = deezerReply(['https://cdn-images.dzcdn.net/a.jpg']);
      let out: string[] | null = null;
      void createCoverVersions({ sources: { spotify: sp }, fetch: fetchFn })(card, 'cd').then((v) => { out = v; });
      await vi.advanceTimersByTimeAsync(7_900);
      expect(fetchFn).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(out).toEqual(['https://cdn-images.dzcdn.net/a.jpg']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('jamais d’adresse inventée : https seulement, sans doublon, 12 au plus', async () => {
    const many = Array.from({ length: 15 }, (_, i) => `https://cdn-images.dzcdn.net/${i}.jpg`);
    const fetchFn = deezerReply(['http://x.test/a.jpg', 'javascript:alert(1)', 'pas une adresse', many[0]!, many[0]!, ...many]);
    const out = await createCoverVersions({ sources: {}, fetch: fetchFn })(card, 'cd');
    expect(out).toEqual(many.slice(0, 12));
  });
});

describe('coverVersions — DVD, jeu, livre', () => {
  it('DVD : affiches TMDB (ordre fr, en, sans langue donné par posterVersions), erreur → []', async () => {
    const tmdb = { posterVersions: vi.fn(async () => ['https://image.tmdb.org/t/p/w500/fr.jpg', 'https://image.tmdb.org/t/p/w500/en.jpg']) };
    const versions = createCoverVersions({ sources: { tmdb }, fetch: deezerReply([]) });
    expect(await versions({ slug: 'Matrix', title: 'Matrix (film)' }, 'dvd')).toEqual(['https://image.tmdb.org/t/p/w500/fr.jpg', 'https://image.tmdb.org/t/p/w500/en.jpg']);
    expect(tmdb.posterVersions).toHaveBeenCalledWith('Matrix');
    tmdb.posterVersions.mockRejectedValueOnce(new Error('404'));
    expect(await versions({ slug: 'Matrix', title: 'Matrix' }, 'dvd')).toEqual([]);
    expect(await createCoverVersions({ sources: {}, fetch: deezerReply([]) })({ slug: 'Matrix', title: 'Matrix' }, 'dvd')).toEqual([]);
  });

  it('jeu : jaquettes des versions TheGamesDB (versions sans jaquette ignorées)', async () => {
    const game = { versions: vi.fn(async () => [version(1, 'boxart/front/1.jpg'), version(2), version(3, 'boxart/front/3.jpg')]) };
    const out = await createCoverVersions({ sources: { game }, fetch: deezerReply([]) })({ slug: 'Zelda', title: 'Zelda' }, 'game');
    expect(out).toEqual([`${RELAY_BASE}/tgdb-img/medium/boxart/front/1.jpg`, `${RELAY_BASE}/tgdb-img/medium/boxart/front/3.jpg`]);
    expect(game.versions).toHaveBeenCalledWith('Zelda', 'Zelda');
  });

  it('livre : couvertures Open Library des candidats (sans couverture ignorés)', async () => {
    const book = { candidates: vi.fn(async () => ({ works: [{ id: 'OL1W', title: 'Dune', popularity: 3, coverId: 11 }, { id: 'OL2W', title: 'Dune', popularity: 2 }, { id: 'OL3W', title: 'Dune', popularity: 1, coverId: 33 }] })) };
    const out = await createCoverVersions({ sources: { book }, fetch: deezerReply([]) })({ slug: 'Dune', title: 'Dune (roman)' }, 'book');
    expect(out).toEqual(['https://covers.openlibrary.org/b/id/11-L.jpg', 'https://covers.openlibrary.org/b/id/33-L.jpg']);
    expect(book.candidates).toHaveBeenCalledWith('Dune (roman)');
  });

  it('point d’entrée coverVersions : [] tant que rien n’est enregistré, puis le service enregistré', async () => {
    expect(await coverVersions(card, 'cd')).toEqual([]);
    setCoverVersions(createCoverVersions({ sources: {}, fetch: deezerReply(['https://cdn-images.dzcdn.net/a.jpg']) }));
    expect(await coverVersions(card, 'cd')).toEqual(['https://cdn-images.dzcdn.net/a.jpg']);
  });
});
