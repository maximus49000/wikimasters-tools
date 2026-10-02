import type { KnownCard } from '../core/collection/collection-book';
import type { TtlCache } from '../core/cache/ttl-cache';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { cleanTitle } from '../core/music/listen';
import { personRoles, screenKindOf } from '../core/screen/screen-kinds';
import type { ScreenRepo } from '../core/screen/screen-repo';
import { userMessage, type FilmographyItem, type MediaType, type ScreenDetail, type TmdbApi } from '../core/screen/tmdb-api';

export type ScreenView =
  | { status: 'none' }
  | { status: 'detail'; detail: ScreenDetail }
  | { status: 'filmography'; items: FilmographyItem[] }
  | { status: 'error'; message: string };

export type ScreenDetailResult = { status: 'detail'; detail: ScreenDetail } | { status: 'error'; message: string };

export type ScreenServiceDeps = {
  hasKey: boolean;
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  screen: Pick<ScreenRepo, 'resolve'>;
  api: Pick<TmdbApi, 'detail' | 'person' | 'search'>;
  cache: Pick<TtlCache, 'getOrLoad'>;
};

const normalize = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function createScreenService(deps: ScreenServiceDeps) {
  const { hasKey, collection, kinds, screen, api, cache } = deps;

  const detailOf = (mediaType: MediaType, id: number) => cache.getOrLoad(`screen-detail-${mediaType}-${id}`, () => api.detail(mediaType, id));

  return {
    // Les cartes (parmi `cards`) liées au cinéma (film, série, personne de cinéma) : le chargement TMDB les prend en charge. Sans clé TMDB, aucune.
    async screenSlugs(cards: Pick<KnownCard, 'slug'>[]): Promise<Set<string>> {
      if (!hasKey || cards.length === 0) return new Set();
      await kinds.resolveMissing(cards.map((card) => card.slug));
      const loaded = await kinds.load();
      return new Set(cards.filter((card) => screenKindOf(loaded.cards[card.slug]) !== null).map((card) => card.slug));
    },

    // Ce que la fiche d'une carte montre : rien, le détail d'un film ou d'une série, une filmographie, ou une erreur.
    async view(slug: string, title: string): Promise<ScreenView> {
      if (!hasKey) return { status: 'none' };
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const cardKinds = (await kinds.load()).cards[slug];
        const kind = screenKindOf(cardKinds);
        if (!kind) return { status: 'none' };
        const ids = (await screen.resolve([slug]))[slug] ?? {};
        const known = kind === 'film' ? ids.movieId : kind === 'series' ? ids.tvId : ids.personId;
        const query = cleanTitle(title);
        const id = known ?? (await cache.getOrLoad(`screen-search-${kind}-${normalize(query)}`, () => api.search(kind, query))) ?? undefined;
        if (id === undefined) return { status: 'none' };
        if (kind === 'person') {
          const roles = personRoles(cardKinds);
          const items = await cache.getOrLoad(`screen-person-${id}-${roles.acting ? 1 : 0}${roles.directing ? 1 : 0}`, () => api.person(id, roles));
          return { status: 'filmography', items };
        }
        return { status: 'detail', detail: await detailOf(kind === 'film' ? 'movie' : 'tv', id) };
      } catch (error) {
        return { status: 'error', message: userMessage(error) };
      }
    },

    // Fiche d'un titre ouvert depuis une filmographie.
    async detail(mediaType: MediaType, id: number): Promise<ScreenDetailResult> {
      try {
        return { status: 'detail', detail: await detailOf(mediaType, id) };
      } catch (error) {
        return { status: 'error', message: userMessage(error) };
      }
    },
  };
}

export type ScreenService = ReturnType<typeof createScreenService>;
