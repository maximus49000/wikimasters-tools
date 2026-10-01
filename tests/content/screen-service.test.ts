import { describe, expect, it, vi } from 'vitest';
import { createScreenService } from '../../src/content/screen-service';
import { TmdbError } from '../../src/core/screen/tmdb-api';

const detail = { mediaType: 'movie' as const, id: 27205, title: 'Inception', overview: 'x' };

function setup(over: { collection?: string[]; natures?: string[]; occupations?: string[]; ids?: object; search?: number | null; hasKey?: boolean } = {}) {
  const api = {
    detail: vi.fn(async () => detail),
    person: vi.fn(async () => [{ mediaType: 'movie' as const, id: 1, title: 'A' }]),
    search: vi.fn(async () => (over.search === undefined ? null : over.search)),
  };
  const service = createScreenService({
    hasKey: over.hasKey ?? true,
    collection: { list: async () => (over.collection ?? ['Inception']).map((slug) => ({ slug, title: slug })) },
    kinds: {
      resolveMissing: vi.fn(async () => undefined),
      load: async () => ({ cards: { Inception: { natures: over.natures ?? ['Q11424'], occupations: over.occupations ?? [], genres: [] } }, labels: {} }),
    },
    screen: { resolve: async () => ({ Inception: over.ids ?? { movieId: 27205 } }) },
    api,
    cache: { getOrLoad: (_key, loader) => loader() },
  });
  return { service, api };
}

describe('createScreenService.view', () => {
  it("rend le détail d'un film de la collection avec l'identifiant Wikidata", async () => {
    const { service, api } = setup();
    expect(await service.view('Inception', 'Inception')).toEqual({ status: 'detail', detail });
    expect(api.detail).toHaveBeenCalledWith('movie', 27205);
    expect(api.search).not.toHaveBeenCalled();
  });

  it('une série utilise tvId', async () => {
    const { service, api } = setup({ natures: ['Q5398426'], ids: { tvId: 1396 } });
    await service.view('Inception', 'Inception');
    expect(api.detail).toHaveBeenCalledWith('tv', 1396);
  });

  it("repli : recherche par titre nettoyé quand Wikidata n'a pas d'identifiant", async () => {
    const { service, api } = setup({ ids: {}, search: 99 });
    await service.view('Inception', 'Inception_(film)');
    expect(api.search).toHaveBeenCalledWith('film', 'Inception');
    expect(api.detail).toHaveBeenCalledWith('movie', 99);
  });

  it('rien : sans clé, hors collection, carte sans rapport, ou aucun identifiant sûr', async () => {
    expect(await setup({ hasKey: false }).service.view('Inception', 'Inception')).toEqual({ status: 'none' });
    expect(await setup({ collection: [] }).service.view('Inception', 'Inception')).toEqual({ status: 'none' });
    expect(await setup({ natures: ['Q482994'] }).service.view('Inception', 'Inception')).toEqual({ status: 'none' });
    expect(await setup({ ids: {}, search: null }).service.view('Inception', 'Inception')).toEqual({ status: 'none' });
  });

  it('une personne rend sa filmographie selon ses métiers', async () => {
    const { service, api } = setup({ natures: ['Q5'], occupations: ['Q33999', 'Q2526255'], ids: { personId: 6193 } });
    expect(await service.view('Inception', 'Leonardo DiCaprio')).toEqual({ status: 'filmography', items: [{ mediaType: 'movie', id: 1, title: 'A' }] });
    expect(api.person).toHaveBeenCalledWith(6193, { acting: true, directing: true });
  });

  it('une panne TMDB devient un message', async () => {
    const { service, api } = setup();
    api.detail.mockRejectedValueOnce(new TmdbError('rate-limited', 'x'));
    expect(await service.view('Inception', 'Inception')).toMatchObject({ status: 'error', message: expect.stringContaining('patienter') });
  });
});

describe('createScreenService.detail', () => {
  it("rend la fiche d'un titre de la filmographie, ou un message", async () => {
    const { service, api } = setup();
    expect(await service.detail('movie', 1)).toEqual({ status: 'detail', detail });
    api.detail.mockRejectedValueOnce(new TmdbError('not-found', 'x'));
    expect(await service.detail('movie', 2)).toMatchObject({ status: 'error' });
  });
});
