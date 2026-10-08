import { describe, expect, it, vi } from 'vitest';
import { proxyTmdb } from '../../relay/src/tmdb';

const run = (path: string, apiKey: string | undefined = 'SECRET-TMDB') => {
  const fetchFn = vi.fn(async (_url: string) => new Response('{"id":1}', { status: 200 }));
  return { fetchFn, result: proxyTmdb(new URL(`https://relais.test${path}`), { fetch: fetchFn, apiKey }) };
};

describe('proxyTmdb', () => {
  it('ajoute la clé et transmet la réponse', async () => {
    const { fetchFn, result } = run('/tmdb/movie/603?language=fr-FR&append_to_response=videos,watch/providers&include_video_language=fr,en,null');
    expect(await result).toEqual({ status: 200, body: '{"id":1}' });
    const upstream = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(upstream.origin + upstream.pathname).toBe('https://api.themoviedb.org/3/movie/603');
    expect(upstream.searchParams.get('api_key')).toBe('SECRET-TMDB');
    expect(upstream.searchParams.get('append_to_response')).toBe('videos,watch/providers');
  });
  it('accepte les chemins de recherche et de filmographie', async () => {
    for (const path of ['/tmdb/search/movie?query=Alien', '/tmdb/search/tv?query=x', '/tmdb/search/person?query=x', '/tmdb/search/multi?query=x', '/tmdb/person/6193/combined_credits', '/tmdb/tv/1399']) {
      const { fetchFn, result } = run(path);
      expect((await result).status).toBe(200);
      expect(fetchFn).toHaveBeenCalledOnce();
    }
  });
  it('refuse tout autre chemin sans appel amont', async () => {
    for (const path of ['/tmdb/account', '/tmdb/movie/abc', '/tmdb/movie/1/credits', '/tmdb/../3/account', '/tmdb/authentication/token/new']) {
      const { fetchFn, result } = run(path);
      expect((await result).status).toBe(404);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it('ignore les paramètres inconnus et écrase api_key', async () => {
    const { fetchFn, result } = run('/tmdb/search/movie?query=Alien&api_key=PIRATE&include_adult=true');
    await result;
    const upstream = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(upstream.searchParams.get('api_key')).toBe('SECRET-TMDB');
    expect(upstream.searchParams.has('include_adult')).toBe(false);
  });
  it('refuse une valeur de paramètre invalide', async () => {
    const { fetchFn, result } = run(`/tmdb/search/movie?query=${'a'.repeat(201)}`);
    expect((await result).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('répond 503 sans clé configurée', async () => {
    // Appel direct : la valeur par défaut de `run` remplacerait un `undefined` explicite.
    const fetchFn = vi.fn(async (_url: string) => new Response('{"id":1}', { status: 200 }));
    const result = await proxyTmdb(new URL('https://relais.test/tmdb/movie/1'), { fetch: fetchFn, apiKey: undefined });
    expect(result.status).toBe(503);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('ne laisse jamais le secret dans la réponse d’erreur', async () => {
    const fetchFn = async () => new Response('SECRET-TMDB mal formé', { status: 401 });
    const result = await proxyTmdb(new URL('https://relais.test/tmdb/movie/1'), { fetch: fetchFn, apiKey: 'SECRET-TMDB' });
    expect(result.status).toBe(502);
    expect(result.body).not.toContain('SECRET-TMDB');
  });
});
