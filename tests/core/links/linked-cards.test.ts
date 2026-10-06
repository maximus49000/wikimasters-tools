import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { EMPTY_LINKS, setLinks } from '../../../src/core/links/links-book';
import { formatViews, linkedCards } from '../../../src/core/links/linked-cards';

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

describe('formatViews', () => {
  it('abrège les milliers et les millions, et ne dit rien d’un chiffre inconnu', () => {
    expect(formatViews(undefined)).toBe('');
    expect(formatViews(842)).toBe('842');
    expect(formatViews(412_400)).toBe('412 k');
    expect(formatViews(1_250_000)).toBe('1,3 M');
    expect(formatViews(2_000_000)).toBe('2 M');
  });
});
