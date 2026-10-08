import { describe, expect, it, vi } from 'vitest';
import { observeFetch, serviceOf } from '../../../src/core/telemetry/fetch-observer';

describe('serviceOf', () => {
  it('reconnaît les services de la liste, rien d’autre', () => {
    expect(serviceOf('https://fr.wikipedia.org/w/api.php?x=1')).toBe('wikipedia');
    expect(serviceOf('https://api.spotify.com/v1/me')).toBe('spotify');
    expect(serviceOf('https://openapi.tidal.com/v2/x')).toBe('tidal');
    expect(serviceOf('https://wikimasters-tools.maxime-protais-baumer.workers.dev/search?q=1')).toBe('relais');
    expect(serviceOf('https://www.wiki-masters.com/api/cards')).toBeNull();
    expect(serviceOf('pas une url')).toBeNull();
  });
  it('classe les routes du relais par service', () => {
    const R = 'https://wikimasters-tools.maxime-protais-baumer.workers.dev';
    expect(serviceOf(`${R}/tmdb/movie/603?language=fr-FR`)).toBe('tmdb');
    expect(serviceOf(`${R}/igdb/games`)).toBe('igdb');
    expect(serviceOf(`${R}/books/volumes?q=x`)).toBe('googlebooks');
    expect(serviceOf(`${R}/issues`)).toBe('github');
    expect(serviceOf(`${R}/search?q=1`)).toBe('relais');
  });
  it('n’observe jamais l’envoi des statistiques lui-même', () => {
    expect(serviceOf('https://wikimasters-tools.maxime-protais-baumer.workers.dev/t')).toBeNull();
  });
});

describe('observeFetch', () => {
  const run = async (base: typeof fetch, url: string) => {
    const report = vi.fn();
    const wrapped = observeFetch(base, report);
    const outcome = await wrapped(url).then(
      (r) => r,
      (e: unknown) => e,
    );
    return { report, outcome };
  };
  it('signale 429 et 5xx avec le service, et rend la réponse intacte', async () => {
    const r429 = new Response('', { status: 429 });
    const a = await run(async () => r429, 'https://fr.wikipedia.org/x');
    expect(a.report).toHaveBeenCalledWith('api-429', 'wikipedia');
    expect(a.outcome).toBe(r429);
    const b = await run(async () => new Response('', { status: 503 }), 'https://wikimasters-tools.maxime-protais-baumer.workers.dev/tmdb/movie/1');
    expect(b.report).toHaveBeenCalledWith('api-5xx', 'tmdb');
  });
  it('signale une panne réseau et relance l’erreur ; ignore une requête annulée', async () => {
    const down = await run(async () => {
      throw new TypeError('Failed to fetch');
    }, 'https://wikimasters-tools.maxime-protais-baumer.workers.dev/igdb/games');
    expect(down.report).toHaveBeenCalledWith('api-reseau', 'igdb');
    expect(down.outcome).toBeInstanceOf(TypeError);
    const aborted = await run(async () => {
      throw new DOMException('x', 'AbortError');
    }, 'https://wikimasters-tools.maxime-protais-baumer.workers.dev/igdb/games');
    expect(aborted.report).not.toHaveBeenCalled();
  });
  it('laisse passer sans rien signaler les autres adresses et les réponses 200/404', async () => {
    expect((await run(async () => new Response('', { status: 500 }), 'https://www.wiki-masters.com/api')).report).not.toHaveBeenCalled();
    expect((await run(async () => new Response('', { status: 404 }), 'https://fr.wikipedia.org/x')).report).not.toHaveBeenCalled();
    expect((await run(async () => new Response('ok'), 'https://fr.wikipedia.org/x')).report).not.toHaveBeenCalled();
  });
});
