import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyDeezerPreview, resetDeezerCacheForTests } from '../../relay/src/deezer';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const hit = (id: number, title: string, artist: string) => ({ id, title, artist: { name: artist } });
const trackBody = { id: 42, preview: 'https://cdnt-preview.dzcdn.net/api/1/1/x.mp3?hdnea=sig', bpm: 123.4 };

// Faux Deezer : /search puis /track/<id>.
function deezer(results: unknown[], track: unknown = trackBody) {
  return vi.fn(async (url: string) => (new URL(url).pathname === '/search' ? reply({ data: results }) : reply(track)));
}
const call = (title: string, artist: string, deps: { fetch: (url: string) => Promise<Response>; now?: () => number }) =>
  proxyDeezerPreview(new URL(`https://relais.test/deezer-preview?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`), {
    fetch: deps.fetch,
    now: deps.now ?? (() => 0),
  });

beforeEach(() => resetDeezerCacheForTests());

describe('proxyDeezerPreview', () => {
  it('refuse un titre ou un artiste vide ou de plus de 200 caractères, sans appel amont', async () => {
    const fetchFn = deezer([]);
    for (const [t, a] of [['', 'A'], ['T', ''], [' ', 'A'], ['T', ' '], ['x'.repeat(201), 'A'], ['T', 'x'.repeat(201)]] as const) {
      expect((await call(t, a, { fetch: fetchFn })).status, `${t}/${a}`).toBe(400);
    }
    expect((await proxyDeezerPreview(new URL('https://relais.test/deezer-preview'), { fetch: fetchFn, now: () => 0 })).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('cherche « artiste titre » (limit 5) puis lit /track/<id> du premier résultat correspondant', async () => {
    const fetchFn = deezer([hit(7, 'Autre chose', 'Daft Punk'), hit(42, 'One More Time', 'Daft Punk')]);
    const out = await call('One More Time', 'Daft Punk', { fetch: fetchFn });
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toEqual({ previewUrl: trackBody.preview, deezerBpm: 123.4 });
    const search = new URL(fetchFn.mock.calls[0]![0]);
    expect(search.origin + search.pathname).toBe('https://api.deezer.com/search');
    expect(Object.fromEntries(search.searchParams)).toEqual({ q: 'Daft Punk One More Time', limit: '5' });
    expect(fetchFn.mock.calls[1]![0]).toBe('https://api.deezer.com/track/42');
  });

  it('bpm 0 → deezerBpm null', async () => {
    const out = await call('One More Time', 'Daft Punk', { fetch: deezer([hit(42, 'One More Time', 'Daft Punk')], { ...trackBody, bpm: 0 }) });
    expect(JSON.parse(out.body)).toEqual({ previewUrl: trackBody.preview, deezerBpm: null });
  });

  it('autre artiste → previewUrl null, sans appel /track', async () => {
    const fetchFn = deezer([hit(1, 'One More Time', 'Quelqu\'un d\'autre')]);
    const out = await call('One More Time', 'Daft Punk', { fetch: fetchFn });
    expect(JSON.parse(out.body)).toEqual({ previewUrl: null, deezerBpm: null });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('« One More Time (Remastered) » / « Daft Punk » correspond (suffixes, accents, casse)', async () => {
    const fetchFn = deezer([hit(42, 'One More Time', 'DAFT PUNK')]);
    const out = await call('One More Time (Remastered)', 'Daft Punk', { fetch: fetchFn });
    expect(JSON.parse(out.body).previewUrl).toBe(trackBody.preview);
    const f2 = deezer([hit(42, 'Été - Remastered 2011', 'Artiste feat. Invité')]);
    expect((JSON.parse((await call('Ete (feat. Truc)', 'Artiste', { fetch: f2 })).body) as { previewUrl: string | null }).previewUrl).toBe(trackBody.preview);
  });

  it('titre contenu dans l\'autre, mais pas un titre sans rapport', async () => {
    expect(JSON.parse((await call('Time', 'Daft Punk', { fetch: deezer([hit(42, 'One More Time', 'Daft Punk')]) })).body).previewUrl).toBe(trackBody.preview);
    expect(JSON.parse((await call('Voyage', 'Daft Punk', { fetch: deezer([hit(42, 'One More Time', 'Daft Punk')]) })).body).previewUrl).toBeNull();
  });

  it('panne amont (search ou track) ou réponse illisible → 502 upstream', async () => {
    const down = await call('T', 'A', { fetch: async () => { throw new Error('x'); } });
    expect(down.status).toBe(502);
    expect(JSON.parse(down.body)).toEqual({ ok: false, reason: 'upstream' });
    expect((await call('T2', 'A', { fetch: async () => new Response('pas du json') })).status).toBe(502);
    const trackDown = vi.fn(async (url: string) => (new URL(url).pathname === '/search' ? reply({ data: [hit(5, 'T3', 'A')] }) : reply({}, 500)));
    expect((await call('T3', 'A', { fetch: trackDown })).status).toBe(502);
  });

  it('cache l\'identifiant 30 jours (un seul /search) mais rappelle /track à chaque fois (URL fraîche)', async () => {
    let now = 1_000;
    const fetchFn = deezer([hit(42, 'One More Time', 'Daft Punk')]);
    await call('One More Time', 'Daft Punk', { fetch: fetchFn, now: () => now });
    await call('  ONE MORE TIME ', 'daft punk', { fetch: fetchFn, now: () => now });
    const paths = fetchFn.mock.calls.map((c) => new URL(c[0]).pathname);
    expect(paths).toEqual(['/search', '/track/42', '/track/42']);
    now += 30 * 86_400_000 + 1;
    await call('One More Time', 'Daft Punk', { fetch: fetchFn, now: () => now });
    expect(fetchFn.mock.calls.map((c) => new URL(c[0]).pathname)).toEqual(['/search', '/track/42', '/track/42', '/search', '/track/42']);
  });

  it('met aussi en cache l\'absence de correspondance, et garde au plus 500 entrées', async () => {
    const fetchFn = deezer([]);
    await call('Rien', 'Personne', { fetch: fetchFn });
    await call('Rien', 'Personne', { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 500; i += 1) await call(`t${i}`, 'a', { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(501);
    await call('Rien', 'Personne', { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(502);
  });
});
