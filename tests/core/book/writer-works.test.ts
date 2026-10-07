import { describe, expect, it, vi } from 'vitest';
import { fetchWriterWorks, parseWriterWorks, writerQuery, writerThumbUrl } from '../../../src/core/book/writer-works';

const row = (id: string, label: string, extra: Record<string, string> = {}) => ({
  w: { value: `http://www.wikidata.org/entity/${id}` },
  wLabel: { value: label },
  ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, { value }])),
});
const sparql = (...bindings: object[]) => ({ results: { bindings } });

describe('parseWriterWorks', () => {
  it('lit titre, année, article (= slug de la carte) et œuvre Open Library ; une édition « …M » n’est pas une œuvre', () => {
    const works = parseWriterWorks(
      sparql(
        row('Q1', 'Les Misérables', { date: '1862-01-01T00:00:00Z', olid: 'OL1063588W', frTitle: 'Les Misérables' }),
        row('Q2', 'Quatrevingt-treize', { olid: 'OL607832M', frTitle: 'Notre-Dame de Paris (roman)' }),
      ),
    );
    expect(works).toEqual([
      { id: 'Q1', title: 'Les Misérables', year: 1862, slug: 'Les_Misérables', workId: 'OL1063588W' },
      { id: 'Q2', title: 'Quatrevingt-treize', slug: 'Notre-Dame_de_Paris_(roman)' },
    ]);
  });
  it('trie du plus récent au plus ancien, sans date en dernier, à égalité l’ordre de renommée', () => {
    const works = parseWriterWorks(
      sparql(row('Q1', 'A', { date: '1830-01-01T00:00:00Z' }), row('Q2', 'B'), row('Q3', 'C', { date: '1870-01-01T00:00:00Z' }), row('Q4', 'D', { date: '1830-06-01T00:00:00Z' })),
    );
    expect(works.map((work) => work.title)).toEqual(['C', 'A', 'D', 'B']);
  });
  it('regroupe les titres identiques (accents, casse), écarte les titres illisibles et plafonne à 40', () => {
    expect(parseWriterWorks(sparql(row('Q1', 'Les Misérables'), row('Q2', 'les miserables'), row('Q3', 'Q12345'))).map((work) => work.id)).toEqual(['Q1']);
    const many = Array.from({ length: 60 }, (_, index) => row(`Q${index + 1}`, `Livre ${String.fromCharCode(97 + (index % 26))}${index}`));
    expect(parseWriterWorks(sparql(...many))).toHaveLength(40);
  });
  it('lève sur un format inattendu', () => {
    expect(() => parseWriterWorks({ pas: 'sparql' })).toThrow();
  });
});

describe('fetchWriterWorks', () => {
  const pages = (item?: string) => Response.json({ query: { pages: [{ title: 'Victor Hugo', ...(item ? { pageprops: { wikibase_item: item } } : {}) }] } });
  const many = (count: number) => sparql(...Array.from({ length: count }, (_, index) => row(`Q${index + 1}`, `Livre ${index}`)));
  const thresholdOf = (url: string): number => Number(/FILTER\(\?sl >= (\d+)\)/.exec(new URL(url).searchParams.get('query') ?? '')?.[1]);

  it('une seule requête SPARQL quand il y a assez d’œuvres, avec le seuil de 8', async () => {
    const fetchFn = vi.fn(async (url: string) => (url.startsWith('https://fr.wikipedia.org') ? pages('Q535') : Response.json(many(10))));
    expect(await fetchWriterWorks(fetchFn, 'Victor_Hugo')).toHaveLength(10);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(new URL(fetchFn.mock.calls[1]![0]).searchParams.get('query')).toBe(writerQuery('Q535', 8));
  });
  it('moins de six œuvres : seconde requête au seuil de 3', async () => {
    const fetchFn = vi.fn(async (url: string) => (url.startsWith('https://fr.wikipedia.org') ? pages('Q535') : Response.json(many(thresholdOf(url) === 3 ? 12 : 2))));
    expect(await fetchWriterWorks(fetchFn, 'Victor_Hugo')).toHaveLength(12);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
  it('sans élément Wikidata : liste vide sans requête SPARQL ; erreur HTTP : lève', async () => {
    const none = vi.fn(async () => pages());
    expect(await fetchWriterWorks(none, 'Inconnu')).toEqual([]);
    expect(none).toHaveBeenCalledTimes(1);
    const down = async (url: string) => (url.startsWith('https://fr.wikipedia.org') ? pages('Q535') : new Response('', { status: 429 }));
    await expect(fetchWriterWorks(down, 'Victor_Hugo')).rejects.toThrow('429');
  });
});

describe('writerThumbUrl', () => {
  it('construit la couverture de l’œuvre', () => {
    expect(writerThumbUrl('OL1063588W')).toBe('https://covers.openlibrary.org/w/olid/OL1063588W-S.jpg?default=false');
  });
});
