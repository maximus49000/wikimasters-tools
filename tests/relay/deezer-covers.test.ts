import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyDeezerCovers, resetDeezerCacheForTests } from '../../relay/src/deezer';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const album = (title: string, artist: string, cover: unknown) => ({ id: 1, title, artist: { name: artist }, cover_xl: cover });
const deezer = (results: unknown[]) => vi.fn(async (_url: string) => reply({ data: results }));
const call = (params: string, fetchFn: (url: string) => Promise<Response>, now: () => number = () => 0) =>
  proxyDeezerCovers(new URL(`https://relais.test/deezer-covers${params}`), { fetch: fetchFn, now });
const q = (title: string, artist?: string) => `?title=${encodeURIComponent(title)}${artist === undefined ? '' : `&artist=${encodeURIComponent(artist)}`}`;

beforeEach(() => resetDeezerCacheForTests());

describe('proxyDeezerCovers', () => {
  it('titre manquant, vide ou trop long (ou artiste trop long) → 400 sans appel amont', async () => {
    const fetchFn = deezer([]);
    for (const params of ['', '?artist=A', q(' ', 'A'), q('x'.repeat(201)), q('T', 'x'.repeat(201))]) {
      expect((await call(params, fetchFn)).status, params).toBe(400);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('cherche les albums (« artiste titre ») et renvoie les cover_xl des albums correspondants, https seulement, sans doublon', async () => {
    const fetchFn = deezer([
      album('Discovery', 'Daft Punk', 'https://cdn-images.dzcdn.net/images/cover/a/1000x1000.jpg'),
      album('Discovery (Deluxe)', 'DAFT PUNK', 'https://cdn-images.dzcdn.net/images/cover/b/1000x1000.jpg'),
      album('Discovery', 'Daft Punk', 'https://cdn-images.dzcdn.net/images/cover/a/1000x1000.jpg'),
      album('Discovery', 'Daft Punk', 'http://cdn-images.dzcdn.net/images/cover/c/1000x1000.jpg'),
      album('Discovery', 'Daft Punk', null),
      album('Homework', 'Daft Punk', 'https://cdn-images.dzcdn.net/images/cover/d/1000x1000.jpg'),
      album('Discovery', 'Quelqu’un d’autre', 'https://cdn-images.dzcdn.net/images/cover/e/1000x1000.jpg'),
    ]);
    const out = await call(q('Discovery', 'Daft Punk'), fetchFn);
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toEqual({
      covers: ['https://cdn-images.dzcdn.net/images/cover/a/1000x1000.jpg', 'https://cdn-images.dzcdn.net/images/cover/b/1000x1000.jpg'],
    });
    const search = new URL(fetchFn.mock.calls[0]![0]);
    expect(search.origin + search.pathname).toBe('https://api.deezer.com/search/album');
    expect(search.searchParams.get('q')).toBe('Daft Punk Discovery');
  });

  it('sans artiste : le titre seul suffit ; au plus 12 pochettes', async () => {
    const fetchFn = deezer(Array.from({ length: 20 }, (_, i) => album('Best Of', `Artiste ${i}`, `https://cdn-images.dzcdn.net/images/cover/${i}/1000x1000.jpg`)));
    const out = JSON.parse((await call(q('Best Of'), fetchFn)).body) as { covers: string[] };
    expect(out.covers).toHaveLength(12);
    expect(new URL(fetchFn.mock.calls[0]![0]).searchParams.get('q')).toBe('Best Of');
  });

  it('pose le cache 30 jours (réponse vide comprise) : un seul appel amont', async () => {
    let now = 1_000;
    const fetchFn = deezer([album('Discovery', 'Daft Punk', 'https://cdn-images.dzcdn.net/images/cover/a/1000x1000.jpg')]);
    const first = await call(q('Discovery', 'Daft Punk'), fetchFn, () => now);
    const second = await call(q(' DISCOVERY ', 'daft punk'), fetchFn, () => now);
    expect(second.body).toBe(first.body);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 30 * 86_400_000 + 1;
    await call(q('Discovery', 'Daft Punk'), fetchFn, () => now);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const none = deezer([]);
    await call(q('Rien', 'Personne'), none);
    await call(q('Rien', 'Personne'), none);
    expect(none).toHaveBeenCalledTimes(1);
  });

  it('panne amont, réponse illisible ou 200 { error } → 502, jamais mis en cache ; 429 transmis', async () => {
    expect((await call(q('T', 'A'), async () => { throw new Error('x'); })).status).toBe(502);
    expect((await call(q('T', 'A'), async () => new Response('pas du json'))).status).toBe(502);
    const quota = vi.fn(async (_url: string) => reply({ error: { code: 4 } }));
    expect((await call(q('T', 'A'), quota)).status).toBe(502);
    expect((await call(q('T', 'A'), quota)).status).toBe(502);
    expect(quota).toHaveBeenCalledTimes(2);
    expect((await call(q('T', 'A'), async () => reply({}, 429))).status).toBe(429);
  });
});
