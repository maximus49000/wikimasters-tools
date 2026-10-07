// tests/content/book-service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createBookService } from '../../src/content/book-service';
import { createBookChoiceRepo } from '../../src/core/book/book-repo';
import { BookError } from '../../src/core/book/errors';
import type { OlWork } from '../../src/core/book/openlibrary-api';
import { createMemoryStore } from '../../src/core/cache/store';
import { createTtlCache } from '../../src/core/cache/ttl-cache';

const etranger: OlWork = { id: 'OL1230613W', title: 'L’étranger', author: 'Albert Camus', year: 1942, publisher: 'Gallimard', pages: 186, isbn: '9782070360024', coverId: 13151269, popularity: 468 };

type Setup = {
  natures?: string[];
  genres?: string[];
  ids?: object;
  unreachable?: boolean;
  collection?: string[];
  byWork?: OlWork | null;
  search?: OlWork[];
  intro?: string | null | Error;
  description?: string | null;
  kindsUnknown?: boolean;
};

function setup(over: Setup = {}) {
  const openLibrary = {
    byWork: vi.fn(async (_id: string) => (over.byWork === undefined ? etranger : over.byWork)),
    searchByTitle: vi.fn(async (_title: string) => over.search ?? []),
    description: vi.fn(async (_id: string) => (over.description === undefined ? null : over.description)),
  };
  const intro = vi.fn(async (_slug: string) => {
    if (over.intro instanceof Error) throw over.intro;
    return over.intro === undefined ? 'Meursault enterre sa mère.' : over.intro;
  });
  const resolve = vi.fn(async () => (over.unreachable ? {} : { Livre: over.ids ?? { workId: 'OL1230613W' } }) as never);
  const choices = createBookChoiceRepo(createMemoryStore());
  const onChoice = vi.fn();
  const service = createBookService({
    collection: { list: async () => (over.collection ?? ['Livre']).map((slug) => ({ slug, title: slug })) },
    kinds: {
      resolveMissing: vi.fn(async () => undefined),
      load: async () => ({
        cards: (over.kindsUnknown ? {} : { Livre: { natures: over.natures ?? ['Q7725634'], occupations: [], genres: over.genres ?? [] } }) as Record<string, { natures: string[]; occupations: string[]; genres: string[] }>,
        labels: { Q1: 'roman philosophique', Q2: 'roman policier' },
      }),
    },
    books: { resolve },
    choices,
    openLibrary,
    intro,
    cache: createTtlCache(createMemoryStore()),
    onChoice,
  });
  return { service, openLibrary, intro, resolve, choices, onChoice };
}

describe('bookSlugs', () => {
  it('ne garde que les cartes dont la nature est une œuvre écrite', async () => {
    const { service } = setup();
    expect([...(await service.bookSlugs([{ slug: 'Livre' }, { slug: 'Ailleurs' }]))]).toEqual(['Livre']);
    expect((await setup({ natures: ['Q11424'] }).service.bookSlugs([{ slug: 'Livre' }])).size).toBe(0);
  });
});

describe('view', () => {
  it('rien pour une carte hors Collection ou qui n’est pas un livre', async () => {
    expect(await setup({ collection: [] }).service.view('Livre', 'L’Étranger')).toEqual({ status: 'none' });
    expect(await setup({ natures: ['Q5'] }).service.view('Livre', 'Camus')).toEqual({ status: 'none' });
  });

  it('un livre : faits d’Open Library, synopsis Wikipédia, genres de Wikidata, couverture, page', async () => {
    const { service, openLibrary } = setup({ genres: ['Q1', 'Q2'] });
    const view = await service.view('Livre', 'L’Étranger');
    expect(view).toEqual({
      status: 'detail',
      detail: {
        id: 'OL1230613W',
        title: 'L’étranger',
        author: 'Albert Camus',
        year: 1942,
        publisher: 'Gallimard',
        pages: 186,
        isbn: '9782070360024',
        genres: ['Roman philosophique', 'Roman policier'],
        synopsis: { text: 'Meursault enterre sa mère.', url: 'https://fr.wikipedia.org/wiki/Livre', source: 'wikipedia' },
        coverUrl: 'https://covers.openlibrary.org/b/id/13151269-L.jpg',
        pageUrl: 'https://openlibrary.org/works/OL1230613W',
      },
    });
    expect(openLibrary.byWork).toHaveBeenCalledWith('OL1230613W');
    expect(openLibrary.searchByTitle).not.toHaveBeenCalled();
  });

  it('sans article Wikipédia utile, le synopsis vient d’Open Library ; sans rien, la fiche n’a pas de synopsis', async () => {
    const withDescription = await setup({ intro: null, description: 'Un roman.' }).service.view('Livre', 'L’Étranger');
    expect(withDescription.status === 'detail' && withDescription.detail.synopsis).toEqual({ text: 'Un roman.', url: 'https://openlibrary.org/works/OL1230613W', source: 'openlibrary' });
    const none = await setup({ intro: null, description: null }).service.view('Livre', 'L’Étranger');
    expect(none.status === 'detail' && none.detail.synopsis).toBeUndefined();
  });

  it('un échec de Wikipédia ne casse pas la fiche : repli sur Open Library', async () => {
    const view = await setup({ intro: new Error('429'), description: 'Un roman.' }).service.view('Livre', 'L’Étranger');
    expect(view.status === 'detail' && view.detail.synopsis?.source).toBe('openlibrary');
  });

  it('sans identifiant Wikidata, cherche par titre : titre exact seulement, le plus connu d’abord', async () => {
    const homonym: OlWork = { id: 'OL2W', title: 'L’étranger', popularity: 3 };
    const other: OlWork = { id: 'OL3W', title: 'L’étranger au village', popularity: 900 };
    const { service, openLibrary } = setup({ ids: {}, search: [homonym, other, etranger] });
    const view = await service.view('Livre', 'L’Étranger');
    expect(view.status === 'detail' && view.detail.id).toBe('OL1230613W');
    expect(openLibrary.searchByTitle).toHaveBeenCalledWith('L’Étranger');
  });

  it('une fiche vide quand rien n’est trouvé, une erreur lisible quand Open Library échoue', async () => {
    expect(await setup({ ids: {}, search: [{ id: 'OL3W', title: 'Autre chose', popularity: 1 }] }).service.view('Livre', 'L’Étranger')).toEqual({ status: 'empty' });
    expect(await setup({ byWork: null, ids: { workId: 'OL9W' } }).service.view('Livre', 'Inconnu')).toEqual({ status: 'empty' });
    const failing = setup();
    failing.openLibrary.byWork.mockRejectedValueOnce(new BookError('rate-limited', 'x'));
    const view = await failing.service.view('Livre', 'L’Étranger');
    expect(view.status === 'error' && view.message).toContain('patienter');
  });

  it('identifiant Wikidata inconnu d’Open Library : repli par titre exact', async () => {
    const { service, openLibrary } = setup({ byWork: null, ids: { workId: 'OL9W' }, search: [etranger] });
    const view = await service.view('Livre', 'L’Étranger');
    expect(view.status).toBe('detail');
    expect(openLibrary.searchByTitle).toHaveBeenCalledTimes(1);
  });

  it('un titre sans lettre ni chiffre ne déclenche aucune recherche', async () => {
    const { service, openLibrary } = setup({ ids: {}, search: [etranger] });
    expect(await service.view('Livre', '???')).toEqual({ status: 'empty' });
    expect(openLibrary.searchByTitle).not.toHaveBeenCalled();
  });

  it('Wikidata injoignable : on cherche quand même par titre', async () => {
    const { service } = setup({ unreachable: true, search: [etranger] });
    expect((await service.view('Livre', 'L’Étranger')).status).toBe('detail');
  });
});

describe('cover', () => {
  it('la couverture d’un livre, liste vide pour une autre carte ou un livre sans couverture', async () => {
    expect(await setup().service.cover('Livre', 'L’Étranger')).toEqual(['https://covers.openlibrary.org/b/id/13151269-L.jpg']);
    expect(await setup({ natures: ['Q7889'] }).service.cover('Livre', 'Jeu')).toEqual([]);
    expect(await setup({ byWork: { id: 'OL1W', title: 'Sans couverture', popularity: 0 } }).service.cover('Livre', 'X')).toEqual([]);
  });

  it('null quand une source n’a pas répondu (natures inconnues, Wikidata injoignable, erreur)', async () => {
    expect(await setup({ kindsUnknown: true }).service.cover('Livre', 'X')).toBeNull();
    expect(await setup({ unreachable: true }).service.cover('Livre', 'X')).toBeNull();
    const failing = setup();
    failing.openLibrary.byWork.mockRejectedValueOnce(new Error('réseau'));
    expect(await failing.service.cover('Livre', 'X')).toBeNull();
  });

  it('sans identifiant Wikidata, aucune couverture par titre (auteur non vérifié) : liste vide, aucune recherche', async () => {
    const { service, openLibrary } = setup({ ids: {}, search: [etranger] });
    expect(await service.cover('Livre', 'L’Étranger')).toEqual([]);
    expect(openLibrary.searchByTitle).not.toHaveBeenCalled();
    const unknown = setup({ byWork: null, ids: { workId: 'OL9W' }, search: [etranger] });
    expect(await unknown.service.cover('Livre', 'L’Étranger')).toEqual([]);
    expect(unknown.openLibrary.searchByTitle).not.toHaveBeenCalled();
  });

  it('ne fait aucun appel réseau pour une carte qui n’est pas un livre', async () => {
    const { service, openLibrary, resolve } = setup({ natures: ['Q11424'] });
    await service.cover('Livre', 'Un film');
    expect(resolve).not.toHaveBeenCalled();
    expect(openLibrary.byWork).not.toHaveBeenCalled();
    expect(openLibrary.searchByTitle).not.toHaveBeenCalled();
  });
});

const autre: OlWork = { id: 'OL9W', title: 'Un autre livre', author: 'Quelqu’un', year: 2001, coverId: 4242, popularity: 5 };
const byWorkId = (openLibrary: { byWork: { mockImplementation: (fn: (id: string) => Promise<OlWork | null>) => unknown } }) =>
  openLibrary.byWork.mockImplementation(async (id: string) => (id === 'OL9W' ? autre : etranger));

describe('candidates et preview', () => {
  it('candidates cherche par titre nettoyé et rend les œuvres telles quelles', async () => {
    const { service, openLibrary } = setup({ search: [etranger, autre] });
    expect(await service.candidates('L’Étranger (roman)')).toEqual({ works: [etranger, autre] });
    expect(openLibrary.searchByTitle).toHaveBeenCalledTimes(1);
  });

  it('candidates rend une liste vide sans appel pour un titre vide, et un message si la recherche échoue', async () => {
    const { service, openLibrary } = setup();
    expect(await service.candidates('   ')).toEqual({ works: [] });
    expect(openLibrary.searchByTitle).not.toHaveBeenCalled();
    openLibrary.searchByTitle.mockRejectedValueOnce(new BookError('rate-limited', 'x'));
    const failed = await service.candidates('Titre jamais cherché');
    expect(failed.works).toEqual([]);
    expect(failed.message).toContain('patienter');
  });

  it('preview rend l’œuvre, ou un message pour une œuvre inconnue, un identifiant invalide ou une erreur', async () => {
    const { service, openLibrary } = setup();
    byWorkId(openLibrary);
    expect(await service.preview('OL9W')).toEqual({ work: autre });
    expect((await service.preview('../x')).message).toBe('Ce livre est introuvable.');
    openLibrary.byWork.mockResolvedValueOnce(null);
    expect((await service.preview('OL404W')).message).toBe('Ce livre est introuvable.');
    openLibrary.byWork.mockRejectedValueOnce(new BookError('http', 'x'));
    expect((await service.preview('OL500W')).message).toContain('Open Library');
  });
});

describe('choix manuel', () => {
  it('un livre choisi prime sur Wikidata et sur le repli par titre, pour la fiche et pour la couverture', async () => {
    const { service, openLibrary, onChoice } = setup({ ids: { workId: 'OL1230613W' } });
    byWorkId(openLibrary);
    await service.choose('Livre', 'OL9W');
    expect(onChoice).toHaveBeenCalledWith('Livre');
    const view = await service.view('Livre', 'L’Étranger');
    expect(view.status === 'detail' && view.detail.id).toBe('OL9W');
    expect(await service.cover('Livre', 'L’Étranger')).toEqual(['https://covers.openlibrary.org/b/id/4242-L.jpg']);
  });

  it('le livre choisi compte pour la couverture même sans identifiant Wikidata, et sans attendre Wikidata ni les natures', async () => {
    const { service, openLibrary, resolve } = setup({ ids: {}, kindsUnknown: true });
    byWorkId(openLibrary);
    await service.choose('Livre', 'OL9W');
    expect(await service.cover('Livre', 'X')).toEqual(['https://covers.openlibrary.org/b/id/4242-L.jpg']);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('« aucun livre » vide la fiche (none: true) et la couverture, sans appel à Open Library', async () => {
    const { service, openLibrary } = setup();
    await service.chooseNone('Livre');
    expect(await service.view('Livre', 'L’Étranger')).toEqual({ status: 'empty', none: true });
    expect(await service.cover('Livre', 'L’Étranger')).toEqual([]);
    expect(openLibrary.byWork).not.toHaveBeenCalled();
    expect(openLibrary.searchByTitle).not.toHaveBeenCalled();
  });

  it('un livre choisi qu’Open Library ne connaît plus donne une fiche vide (pas « aucun livre »)', async () => {
    const { service, openLibrary } = setup();
    openLibrary.byWork.mockResolvedValue(null);
    await service.choose('Livre', 'OL9W');
    expect(await service.view('Livre', 'L’Étranger')).toEqual({ status: 'empty' });
    expect(await service.cover('Livre', 'L’Étranger')).toEqual([]);
  });

  it('« revenir au choix automatique » efface le choix et prévient', async () => {
    const { service, openLibrary, onChoice, choices } = setup();
    byWorkId(openLibrary);
    await service.choose('Livre', 'OL9W');
    await service.reset('Livre');
    expect(await choices.load()).toEqual({});
    expect(onChoice).toHaveBeenCalledTimes(2);
    const view = await service.view('Livre', 'L’Étranger');
    expect(view.status === 'detail' && view.detail.id).toBe('OL1230613W');
  });

  it('refuse un identifiant mal formé sans rien enregistrer', async () => {
    const { service, choices, onChoice } = setup();
    await expect(service.choose('Livre', '../x')).rejects.toBeInstanceOf(BookError);
    expect(await choices.load()).toEqual({});
    expect(onChoice).not.toHaveBeenCalled();
  });

  it('un choix ne fait pas apparaître la section sur une carte qui n’est pas un livre', async () => {
    const { service } = setup({ natures: ['Q5'] });
    await service.chooseNone('Livre');
    expect(await service.view('Livre', 'Camus')).toEqual({ status: 'none' });
  });
});
