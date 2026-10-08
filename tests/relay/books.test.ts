import { describe, expect, it, vi } from 'vitest';
import { proxyBooks } from '../../relay/src/books';

const run = (path: string, apiKey: string | undefined = 'SECRET-BOOKS') => {
  const fetchFn = vi.fn(async (_url: string) => new Response('{"items":[]}', { status: 200 }));
  return { fetchFn, result: proxyBooks(new URL(`https://relais.test${path}`), { fetch: fetchFn, apiKey }) };
};

describe('proxyBooks', () => {
  it('ajoute la clé et transmet', async () => {
    const { fetchFn, result } = run('/books/volumes?q=Dune%20Herbert&country=FR&maxResults=10');
    expect(await result).toEqual({ status: 200, body: '{"items":[]}' });
    const upstream = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(upstream.origin + upstream.pathname).toBe('https://www.googleapis.com/books/v1/volumes');
    expect(upstream.searchParams.get('key')).toBe('SECRET-BOOKS');
    expect(upstream.searchParams.get('q')).toBe('Dune Herbert');
    expect(upstream.searchParams.get('maxResults')).toBe('10');
  });
  it('refuse un autre chemin, un autre pays, un maxResults hors 1-10, une requête vide ou trop longue', async () => {
    const cases: [string, number][] = [
      ['/books/other?q=a&country=FR&maxResults=5', 404],
      ['/books/volumes?q=a&country=US&maxResults=5', 400],
      ['/books/volumes?q=a&country=FR&maxResults=40', 400],
      ['/books/volumes?q=a&country=FR&maxResults=x', 400],
      ['/books/volumes?country=FR&maxResults=5', 400],
      [`/books/volumes?q=${'a'.repeat(201)}&country=FR&maxResults=5`, 400],
    ];
    for (const [path, status] of cases) {
      const { fetchFn, result } = run(path);
      expect((await result).status).toBe(status);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it('écrase une clé fournie par le client et répond 503 sans clé', async () => {
    const { fetchFn, result } = run('/books/volumes?q=a&country=FR&maxResults=5&key=PIRATE');
    await result;
    expect(new URL(fetchFn.mock.calls[0]?.[0] ?? '').searchParams.get('key')).toBe('SECRET-BOOKS');
    // Appel direct : la valeur par défaut de `run` remplacerait un `undefined` explicite.
    const noKeyFetch = vi.fn(async (_url: string) => new Response('{"items":[]}', { status: 200 }));
    const noKey = await proxyBooks(new URL('https://relais.test/books/volumes?q=a&country=FR&maxResults=5'), { fetch: noKeyFetch, apiKey: undefined });
    expect(noKey.status).toBe(503);
    expect(noKeyFetch).not.toHaveBeenCalled();
  });
});
