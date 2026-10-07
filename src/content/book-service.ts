// src/content/book-service.ts
import { articleUrl, coverUrl, isWorkId, normalizeTitle, workPageUrl } from '../core/book/book-format';
import type { AmazonPrice } from '../core/book/amazon-price';
import type { BookDetail } from '../core/book/book-detail';
import { isBookCard } from '../core/book/book-kinds';
import type { ArchiveApi } from '../core/book/archive-api';
import type { BookChoiceRepo, BookRepo } from '../core/book/book-repo';
import { BookError, bookErrorMessage } from '../core/book/errors';
import type { GoogleBooksApi } from '../core/book/google-books-api';
import type { OlWork, OpenLibraryApi } from '../core/book/openlibrary-api';
import { archiveUrl, gutenbergUrl, protectedUntil, readingLinks, wikisourceUrl, type ReadingLink } from '../core/book/reading';
import type { WikisourceApi } from '../core/book/wikisource-api';
import { paperShopLinks, type PriceLine, type ShopLink } from '../core/book/shops';
import type { TtlCache } from '../core/cache/ttl-cache';
import type { KnownCard } from '../core/collection/collection-book';
import { facetLabel, type KindsState } from '../core/kinds/kinds-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { CardKinds } from '../core/kinds/wikidata-kinds';
import { cleanTitle } from '../core/music/listen';

// `none: true` : l'utilisateur a choisi « aucun livre » pour cette carte.
export type BookView = { status: 'none' } | { status: 'empty'; none?: true } | { status: 'detail'; detail: BookDetail } | { status: 'error'; message: string };
export type BookCandidates = { works: OlWork[]; message?: string };
export type BookPreview = { work?: OlWork; message?: string };
// Les offres d'un livre : les liens du papier (toujours là), l'ebook s'il existe, et le prix papier de référence quand il a été lu.
export type BookOffers = { shops: ShopLink[]; paperPrice?: PriceLine };
// La lecture gratuite d'un livre : les sources libres trouvées ; sans source, l'année jusqu'à laquelle il est protégé quand elle est connue.
// `complete: false` : une source n'a pas répondu (« rien trouvé » ne serait pas la vérité) ; rien n'est alors mémorisé pour elle.
export type BookReading = { links: ReadingLink[]; protectedUntil?: number; complete: boolean };

export type BookServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  books: Pick<BookRepo, 'resolve'>;
  choices: Pick<BookChoiceRepo, 'load' | 'save' | 'clear'>;
  openLibrary: Pick<OpenLibraryApi, 'byWork' | 'searchByTitle' | 'description'>;
  // Introduction de l'article Wikipédia FR de la carte (texte brut), null s'il n'y en a pas.
  intro: (slug: string) => Promise<string | null>;
  cache: Pick<TtlCache, 'getOrLoad'>;
  // Le livre d'une carte vient de changer : l'image retenue pour elle est à oublier.
  onChoice?: (slug: string) => void;
  // Lecture du prix papier (Amazon.fr) et prix de l'ebook (Google Books) : absents (null / non fournis), seuls les liens restent.
  amazon?: Pick<AmazonPrice, 'read'> | null;
  googleBooks?: Pick<GoogleBooksApi, 'findEbook'> | null;
  // Lecture gratuite : Wikisource FR (recherche stricte) et Internet Archive (scans libres) ; absents, seules les données de Wikidata comptent.
  wikisource?: Pick<WikisourceApi, 'find'> | null;
  archive?: Pick<ArchiveApi, 'firstFree'> | null;
  now?: () => number;
};

const MAX_GENRES = 5;

export function createBookService(deps: BookServiceDeps) {
  const { collection, kinds, books, choices, openLibrary, intro, cache, onChoice, amazon = null, googleBooks = null, wikisource = null, archive = null, now = () => Date.now() } = deps;

  // Le choix est enregistré, puis l'image mémorisée de la carte est oubliée.
  const changed = async (slug: string, saved: Promise<void>): Promise<void> => {
    await saved;
    onChoice?.(slug);
  };

  // Une aide facultative (synopsis) qui échoue ne doit pas faire échouer la fiche.
  const optional = async <T>(job: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await job();
    } catch {
      return null;
    }
  };

  const workById = (workId: string): Promise<OlWork | null> => cache.getOrLoad(`book-work-v1-${workId}`, () => openLibrary.byWork(workId));
  const searchTitle = (query: string, wanted: string): Promise<OlWork[]> => cache.getOrLoad(`book-search-v1-${wanted}`, () => openLibrary.searchByTitle(query));
  const coverOf = (work: OlWork | null): string[] => (work?.coverId !== undefined ? [coverUrl(work.coverId)] : []);

  // L'œuvre de la carte : identifiant Wikidata d'abord ; sinon (si `byTitle`) recherche par titre, retenue seulement si le titre est égal
  // (accents, casse, ponctuation) ; à égalité, la plus connue (nombre d'éditions).
  async function workOf(workId: string | undefined, title: string, { byTitle }: { byTitle: boolean }): Promise<OlWork | null> {
    if (workId !== undefined) {
      const found = await workById(workId);
      if (found) return found;
    }
    if (!byTitle) return null;
    const query = cleanTitle(title);
    const wanted = normalizeTitle(query);
    if (wanted === '') return null;
    const candidates = await searchTitle(query, wanted);
    return candidates.filter((candidate) => normalizeTitle(candidate.title) === wanted).sort((a, b) => b.popularity - a.popularity)[0] ?? null;
  }

  // Synopsis : introduction de l'article Wikipédia de la carte, sinon description d'Open Library.
  async function synopsisOf(slug: string, work: OlWork): Promise<BookDetail['synopsis']> {
    const wiki = await optional(() => cache.getOrLoad(`book-intro-v1-${slug}`, () => intro(slug)));
    if (wiki) return { text: wiki, url: articleUrl(slug), source: 'wikipedia' };
    const description = await optional(() => cache.getOrLoad(`book-description-v1-${work.id}`, () => openLibrary.description(work.id)));
    return description ? { text: description, url: workPageUrl(work.id), source: 'openlibrary' } : undefined;
  }

  async function detailOf(slug: string, work: OlWork, state: KindsState, cardKinds: CardKinds | undefined): Promise<BookDetail> {
    const genres = (cardKinds?.genres ?? []).slice(0, MAX_GENRES).map((id) => facetLabel(state, id));
    const synopsis = await synopsisOf(slug, work);
    return {
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
    };
  }

  return {
    // Les cartes (parmi `cards`) dont la nature est une œuvre écrite : elles portent le glyphe livre. Nature seule, aucun appel à Open Library.
    async bookSlugs(cards: Pick<KnownCard, 'slug'>[]): Promise<Set<string>> {
      if (cards.length === 0) return new Set();
      await kinds.resolveMissing(cards.map((card) => card.slug));
      const loaded = await kinds.load();
      return new Set(cards.filter((card) => isBookCard(loaded.cards[card.slug])).map((card) => card.slug));
    },

    // Ce que la fiche d'une carte montre : rien (pas un livre), une fiche vide (livre introuvable ou « aucun livre »), un livre, ou une erreur.
    async view(slug: string, title: string): Promise<BookView> {
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const state = await kinds.load();
        const cardKinds = state.cards[slug];
        if (!isBookCard(cardKinds)) return { status: 'none' };
        const choice = (await choices.load())[slug];
        if (choice) {
          if ('none' in choice) return { status: 'empty', none: true };
          const chosen = await workById(choice.workId);
          return chosen ? { status: 'detail', detail: await detailOf(slug, chosen, state, cardKinds) } : { status: 'empty' };
        }
        const ids = (await books.resolve([slug]))[slug] ?? {};
        const work = await workOf(ids.workId, title, { byTitle: true });
        return work ? { status: 'detail', detail: await detailOf(slug, work, state, cardKinds) } : { status: 'empty' };
      } catch (error) {
        return { status: 'error', message: bookErrorMessage(error) };
      }
    },

    // Couvertures possibles de la carte : liste vide si ce n'est pas un livre ou si rien n'existe ;
    // `null` si une source n'a pas pu répondre (natures, Wikidata, Open Library) : à redemander plus tard, sans rien mémoriser.
    async cover(slug: string, title: string): Promise<string[] | null> {
      try {
        // Le livre choisi par l'utilisateur ne dépend ni de Wikidata ni des natures : il reste affiché, et sa couverture compte.
        // Choix d’abord, voulu : un choix manuel est respecté même si la carte n’est plus classée « livre » (la section et son bouton ⇄ disparaissent alors ; cas rare).
        const choice = (await choices.load())[slug];
        if (choice) return 'none' in choice ? [] : coverOf(await workById(choice.workId));
        await kinds.resolveMissing([slug]);
        const cardKinds = (await kinds.load()).cards[slug];
        if (cardKinds === undefined) return null;
        if (!isBookCard(cardKinds)) return [];
        const ids = (await books.resolve([slug]))[slug];
        if (ids === undefined) return null;
        // Jamais par titre : tant que l'auteur n'est pas vérifié, un homonyme ou un titre générique donnerait une mauvaise couverture par défaut,
        // pire que pas de couverture (la fiche, elle, garde le repli par titre et montre ce qu'elle a trouvé).
        return coverOf(await workOf(ids.workId, title, { byTitle: false }));
      } catch {
        return null;
      }
    },

    // Les propositions de la fenêtre « Changer de livre » : les œuvres d'Open Library dont le titre ressemble à la recherche.
    async candidates(query: string): Promise<BookCandidates> {
      const text = cleanTitle(query);
      const wanted = normalizeTitle(text);
      if (wanted === '') return { works: [] };
      try {
        return { works: await searchTitle(text, wanted) };
      } catch (error) {
        return { works: [], message: bookErrorMessage(error) };
      }
    },

    // Aperçu d'une œuvre proposée, avant validation.
    async preview(workId: string): Promise<BookPreview> {
      try {
        const work = isWorkId(workId) ? await workById(workId) : null;
        return work ? { work } : { message: 'Ce livre est introuvable.' };
      } catch (error) {
        return { message: bookErrorMessage(error) };
      }
    },

    // Les liens d'achat du livre, puis les prix quand ils se lisent : l'ebook (Google Books) et le prix papier (Amazon.fr, qui devient le prix de référence).
    // Ne lève jamais ; un prix lu est mémorisé (7 jours), un échec ne l'est pas (la ligne reste sur « voir le prix »).
    async offers(book: { title: string; author?: string; isbn?: string }): Promise<BookOffers> {
      const shops = paperShopLinks(book);
      const isbn = book.isbn;
      const [paper, ebook] = await Promise.all([
        amazon && isbn ? optional(() => cache.getOrLoad(`book-amazon-v1-${isbn}`, async () => ({ amount: await amazon.read(isbn), readAt: now() }))) : null,
        googleBooks
          ? optional(() =>
              cache.getOrLoad(`book-ebook-v1-${normalizeTitle(book.title)}-${normalizeTitle(book.author ?? '')}`, async () => {
                const found = await googleBooks.findEbook({ title: book.title, ...(book.author ? { author: book.author } : {}) });
                return found ? { ...found, readAt: now() } : null;
              }),
            )
          : null,
      ]);
      const paperPrice: PriceLine | undefined = paper ? { amount: paper.amount, currency: 'EUR', source: 'Amazon.fr', readAt: paper.readAt } : undefined;
      const all: ShopLink[] = shops.map((shop) => (shop.shop === 'amazon' && paperPrice ? { ...shop, price: paperPrice } : shop));
      if (ebook) {
        all.push({ shop: 'google-play', label: 'Google Play Livres', kind: 'ebook', url: ebook.url, price: { amount: ebook.amount, currency: 'EUR', source: 'Google Play Livres', readAt: ebook.readAt } });
      }
      return { shops: all, ...(paperPrice ? { paperPrice } : {}) };
    },

    // Les sources de lecture gratuite d'un livre. Wikidata (Wikisource, Gutenberg, décès de l'auteur) ne vaut que pour le livre trouvé
    // automatiquement : avec un livre choisi à la main, seules la recherche Wikisource et les scans d'Open Library comptent.
    // Ne lève jamais ; une source qui échoue n'est pas mémorisée comme « rien ».
    async reading(slug: string, book: Pick<BookDetail, 'id' | 'title' | 'author'>): Promise<BookReading> {
      let complete = true;
      const attempt = async <T>(job: () => Promise<T | null>): Promise<T | null> => {
        try {
          return await job();
        } catch {
          complete = false;
          return null;
        }
      };
      const manual = (await attempt(async () => (await choices.load())[slug] ?? null)) !== null;
      const ids = manual ? {} : (await attempt(async () => (await books.resolve([slug]))[slug] ?? null)) ?? {};
      const wikisourceTitle =
        ids.wikisource ??
        (wikisource ? await attempt(() => cache.getOrLoad(`book-wikisource-v1-${normalizeTitle(book.title)}-${normalizeTitle(book.author ?? '')}`, () => wikisource.find(book.title, book.author))) : null);
      const work = isWorkId(book.id) ? await attempt(() => workById(book.id)) : null;
      const archiveId = archive && work?.scans?.length ? await attempt(() => cache.getOrLoad(`book-archive-v1-${work.id}`, () => archive.firstFree(work.scans ?? []))) : null;
      const links = readingLinks({
        ...(wikisourceTitle ? { wikisource: wikisourceUrl(wikisourceTitle) } : {}),
        ...(ids.gutenberg ? { gutenberg: gutenbergUrl(ids.gutenberg) } : {}),
        ...(archiveId ? { archive: archiveUrl(archiveId) } : {}),
      });
      const death = ids.authorDeath;
      return { links, ...(links.length === 0 && death !== undefined ? { protectedUntil: protectedUntil(death) } : {}), complete };
    },

    choose(slug: string, workId: string): Promise<void> {
      if (!isWorkId(workId)) return Promise.reject(new BookError('not-found', 'identifiant d’œuvre invalide'));
      return changed(slug, choices.save(slug, { workId }));
    },
    chooseNone: (slug: string): Promise<void> => changed(slug, choices.save(slug, { none: true })),
    reset: (slug: string): Promise<void> => changed(slug, choices.clear(slug)),
  };
}

export type BookService = ReturnType<typeof createBookService>;
