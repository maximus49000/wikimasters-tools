import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { EMPTY_LINKS, setLinks } from '../../../src/core/links/links-book';
import { formatViews, linkedCards, linkedCardsViaArticle } from '../../../src/core/links/linked-cards';

const card = (slug: string, pageviews?: number): KnownCard => ({ slug, title: slug.replace(/_/g, ' '), ...(pageviews !== undefined ? { pageviews } : {}) });

describe('linkedCards', () => {
  const cards = [card('Paris', 5), card('Tour_Eiffel', 900), card('Seine', 300), card('Louvre', 300), card('Londres'), card('Inconnue', 9999)];

  it('rend les cartes que la carte cite et celles qui la citent, sans les articles hors Collection ni la carte elle-même', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Tour_Eiffel', 'France', 'Paris'], Seine: ['Paris'], Londres: ['Tamise'] }, 1);
    expect(linkedCards(cards, links, 'Paris').map((c) => c.slug)).toEqual(['Tour_Eiffel', 'Seine']);
  });

  it('trie par consultations décroissantes, les cartes sans chiffre en dernier, à égalité par titre', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Londres', 'Louvre', 'Seine', 'Tour_Eiffel'] }, 1);
    expect(linkedCards(cards, links, 'Paris').map((c) => c.slug)).toEqual(['Tour_Eiffel', 'Louvre', 'Seine', 'Londres']);
  });

  it('ne compte une carte qu’une fois quand les deux se citent', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Seine'], Seine: ['Paris'] }, 1);
    expect(linkedCards(cards, links, 'Paris').map((c) => c.slug)).toEqual(['Seine']);
  });

  it('rend une liste vide quand rien n’est lu ou que la carte est inconnue', () => {
    expect(linkedCards(cards, EMPTY_LINKS, 'Paris')).toEqual([]);
    expect(linkedCards(cards, setLinks(EMPTY_LINKS, { Seine: ['Paris'] }, 1), 'Absente')).toEqual([]);
  });
});

describe('linkedCardsViaArticle', () => {
  const cards = [card('Paris', 5), card('Louvre', 300), card('Seine', 900), card('Londres', 50), card('Tamise', 40)];
  const via = (links: ReturnType<typeof setLinks>) => linkedCardsViaArticle(cards, links, 'Paris').map((v) => [v.card.slug, v.via]);

  it('relie par un article hors Collection que les deux cartes citent', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['France'], Louvre: ['France', 'Musee'], Londres: ['Angleterre'] }, 1);
    expect(via(links)).toEqual([['Louvre', ['France']]]);
  });

  it('relie par une carte lue : elle cite la cible, ou la cible la cite', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Seine'], Seine: ['Louvre'], Londres: ['Seine'] }, 1);
    expect(via(links)).toEqual([['Louvre', ['Seine']], ['Londres', ['Seine']]]);
  });

  it('ne reprend pas les cartes déjà liées directement, ni la carte elle-même', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Seine', 'Louvre'], Seine: ['Louvre', 'Paris'] }, 1);
    expect(via(links)).toEqual([]);
  });

  it('range d’abord les cartes qui passent par le plus d’articles, avec leurs intermédiaires', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['France', 'Fleuve'], Louvre: ['France'], Londres: ['France', 'Fleuve'] }, 1);
    expect(via(links)).toEqual([['Londres', ['Fleuve', 'France']], ['Louvre', ['France']]]);
  });

  it('rend une liste vide sans lien lu ou pour une carte inconnue', () => {
    expect(via(EMPTY_LINKS)).toEqual([]);
    expect(linkedCardsViaArticle(cards, setLinks(EMPTY_LINKS, { Louvre: ['France'] }, 1), 'Absente')).toEqual([]);
  });
});

describe('formatViews', () => {
  it('abrège les milliers et les millions, et ne dit rien d’un chiffre inconnu', () => {
    expect(formatViews(undefined)).toBe('');
    expect(formatViews(842)).toBe('842');
    expect(formatViews(412_400)).toBe('412 k');
    expect(formatViews(1_250_000)).toBe('1,3 M');
    expect(formatViews(2_000_000)).toBe('2 M');
  });
});
