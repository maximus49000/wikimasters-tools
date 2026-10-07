// src/content/book-service.ts
import { articleUrl, coverUrl, normalizeTitle, workPageUrl } from '../core/book/book-format';
import type { BookDetail } from '../core/book/book-detail';
import { isBookCard } from '../core/book/book-kinds';
import type { BookRepo } from '../core/book/book-repo';
import { bookErrorMessage } from '../core/book/errors';
import type { OlWork, OpenLibraryApi } from '../core/book/openlibrary-api';
import type { TtlCache } from '../core/cache/ttl-cache';
import type { KnownCard } from '../core/collection/collection-book';
import { facetLabel } from '../core/kinds/kinds-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { cleanTitle } from '../core/music/listen';

export type BookView = { status: 'none' } | { status: 'empty' } | { status: 'detail'; detail: BookDetail } | { status: 'error'; message: string };

export type BookServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  books: Pick<BookRepo, 'resolve'>;
  openLibrary: Pick<OpenLibraryApi, 'byWork' | 'searchByTitle' | 'description'>;
  // Introduction de l'article Wikipédia FR de la carte (texte brut), null s'il n'y en a pas.
  intro: (slug: string) => Promise<string | null>;
  cache: Pick<TtlCache, 'getOrLoad'>;
};

const MAX_GENRES = 5;

export function createBookService(deps: BookServiceDeps) {
  const { collection, kinds, books, openLibrary, intro, cache } = deps;

  // Une aide facultative (synopsis) qui échoue ne doit pas faire échouer la fiche.
  const optional = async <T>(job: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await job();
    } catch {
      return null;
    }
  };

  // L'œuvre de la carte : identifiant Wikidata d'abord ; sinon recherche par titre, retenue seulement si le titre est égal
  // (accents, casse, ponctuation) ; à égalité, la plus connue (nombre d'éditions).
  async function workOf(workId: string | undefined, title: string): Promise<OlWork | null> {
    if (workId !== undefined) {
      const found = await cache.getOrLoad(`book-work-v1-${workId}`, () => openLibrary.byWork(workId));
      if (found) return found;
    }
    const query = cleanTitle(title);
    const wanted = normalizeTitle(query);
    if (wanted === '') return null;
    const candidates = await cache.getOrLoad(`book-search-v1-${wanted}`, () => openLibrary.searchByTitle(query));
    return candidates.filter((candidate) => normalizeTitle(candidate.title) === wanted).sort((a, b) => b.popularity - a.popularity)[0] ?? null;
  }

  // Synopsis : introduction de l'article Wikipédia de la carte, sinon description d'Open Library.
  async function synopsisOf(slug: string, work: OlWork): Promise<BookDetail['synopsis']> {
    const wiki = await optional(() => cache.getOrLoad(`book-intro-v1-${slug}`, () => intro(slug)));
    if (wiki) return { text: wiki, url: articleUrl(slug), source: 'wikipedia' };
    const description = await optional(() => cache.getOrLoad(`book-description-v1-${work.id}`, () => openLibrary.description(work.id)));
    return description ? { text: description, url: workPageUrl(work.id), source: 'openlibrary' } : undefined;
  }

  return {
    // Les cartes (parmi `cards`) dont la nature est une œuvre écrite : elles portent le glyphe livre. Nature seule, aucun appel à Open Library.
    async bookSlugs(cards: Pick<KnownCard, 'slug'>[]): Promise<Set<string>> {
      if (cards.length === 0) return new Set();
      await kinds.resolveMissing(cards.map((card) => card.slug));
      const loaded = await kinds.load();
      return new Set(cards.filter((card) => isBookCard(loaded.cards[card.slug])).map((card) => card.slug));
    },

    // Ce que la fiche d'une carte montre : rien (pas un livre), une fiche vide (livre introuvable), un livre, ou une erreur.
    async view(slug: string, title: string): Promise<BookView> {
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const state = await kinds.load();
        const cardKinds = state.cards[slug];
        if (!isBookCard(cardKinds)) return { status: 'none' };
        const ids = (await books.resolve([slug]))[slug] ?? {};
        const work = await workOf(ids.workId, title);
        if (!work) return { status: 'empty' };
        const genres = (cardKinds?.genres ?? []).slice(0, MAX_GENRES).map((id) => facetLabel(state, id));
        const synopsis = await synopsisOf(slug, work);
        return {
          status: 'detail',
          detail: {
            id: work.id,
            title: work.title,
            ...(work.author ? { author: work.author } : {}),
            ...(work.year !== undefined ? { year: work.year } : {}),
            ...(work.publisher ? { publisher: work.publisher } : {}),
            ...(work.pages !== undefined ? { pages: work.pages } : {}),
            ...(work.isbn ? { isbn: work.isbn } : {}),
            genres,
            ...(synopsis ? { synopsis } : {}),
            ...(work.coverId !== undefined ? { coverUrl: coverUrl(work.coverId) } : {}),
            pageUrl: workPageUrl(work.id),
          },
        };
      } catch (error) {
        return { status: 'error', message: bookErrorMessage(error) };
      }
    },

    // Couvertures possibles de la carte : liste vide si ce n'est pas un livre ou si rien n'existe ;
    // `null` si une source n'a pas pu répondre (natures, Wikidata, Open Library) : à redemander plus tard, sans rien mémoriser.
    async cover(slug: string, title: string): Promise<string[] | null> {
      try {
        await kinds.resolveMissing([slug]);
        const cardKinds = (await kinds.load()).cards[slug];
        if (cardKinds === undefined) return null;
        if (!isBookCard(cardKinds)) return [];
        const ids = (await books.resolve([slug]))[slug];
        if (ids === undefined) return null;
        const work = await workOf(ids.workId, title);
        return work?.coverId !== undefined ? [coverUrl(work.coverId)] : [];
      } catch {
        return null;
      }
    },
  };
}

export type BookService = ReturnType<typeof createBookService>;
