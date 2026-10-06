import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { DEFAULT_PAGE_SIZE, pageSizeOf, pageSlice, sortCards } from '../../../src/core/collection/homemade-page';

const card = (title: string, rarity?: string): KnownCard => ({ slug: title, title, ...(rarity ? { rarity } : {}) });

describe('sortCards', () => {
  it('trie par rareté (L en tête), puis par titre, les cartes sans rareté à la fin', () => {
    const sorted = sortCards([card('B', 'C'), card('Z'), card('A', 'C'), card('M', 'L'), card('K', 'UR')]);
    expect(sorted.map((c) => c.title)).toEqual(['M', 'K', 'A', 'B', 'Z']);
  });

  it("départage une même rareté par date d'obtention, la plus récente d'abord (comme le site)", () => {
    const cards = [{ ...card('A', 'C'), obtainedAt: 1 }, { ...card('Z', 'C'), obtainedAt: 9 }, card('B', 'C'), { ...card('M', 'C'), obtainedAt: 5 }];
    expect(sortCards(cards).map((c) => c.title)).toEqual(['Z', 'M', 'A', 'B']);
  });

  it('ne modifie pas la liste reçue', () => {
    const input = [card('B', 'C'), card('A', 'L')];
    sortCards(input);
    expect(input.map((c) => c.title)).toEqual(['B', 'A']);
  });
});

describe('sortCards par prix', () => {
  it('trie par prix décroissant, les cartes sans prix à la fin (rareté, puis titre à prix égal)', () => {
    const prices: Record<string, number | null> = { A: 100, B: 500, C: null, D: 100, E: null };
    const sorted = sortCards([card('E', 'C'), card('D', 'C'), card('C', 'L'), card('B', 'C'), card('A', 'UR')], (slug) => prices[slug] ?? null);
    expect(sorted.map((c) => c.title)).toEqual(['B', 'A', 'D', 'C', 'E']);
  });
});

describe('sortCards selon le tri du site', () => {
  it('trie par nom', () => {
    expect(sortCards([card('b', 'L'), card('A', 'C'), card('C', 'UR')], undefined, 'name').map((c) => c.title)).toEqual(['A', 'b', 'C']);
  });

  it('ne tient pas compte de la rareté ni des nombres dans le tri par nom (comme le site)', () => {
    const titles = ['(13345) B', '(129881) A', 'Zèbre', 'abc'].map((t) => card(t, t === 'Zèbre' ? 'L' : 'C'));
    expect(sortCards(titles, undefined, 'name').map((c) => c.title)).toEqual(['(129881) A', '(13345) B', 'abc', 'Zèbre']);
  });

  it("met les favoris en tête, puis par date d'obtention la plus récente (sans rareté)", () => {
    const cards = [
      { ...card('A', 'L'), obtainedAt: 9 },
      { ...card('B', 'C'), starred: true, obtainedAt: 1 },
      { ...card('C', 'C'), starred: true, obtainedAt: 5 },
      { ...card('D', 'UR'), starred: false, obtainedAt: 7 },
    ];
    expect(sortCards(cards, undefined, 'starred').map((c) => c.title)).toEqual(['C', 'B', 'A', 'D']);
  });

  it("trie par date d'ajout, la plus récente d'abord, les cartes sans date à la fin", () => {
    const cards = [{ ...card('A', 'C'), obtainedAt: 1 }, card('X', 'L'), { ...card('B', 'C'), obtainedAt: 5 }];
    expect(sortCards(cards, undefined, 'added').map((c) => c.title)).toEqual(['B', 'A', 'X']);
  });
});

describe('pageSizeOf', () => {
  it('retient la plus grande des deux sources', () => {
    expect(pageSizeOf(24, 20)).toBe(24);
    expect(pageSizeOf(undefined, 20)).toBe(20);
    expect(pageSizeOf(10, 0)).toBe(10);
  });

  it('retombe sur la valeur par défaut sans aucune information', () => {
    expect(pageSizeOf(undefined, 0)).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe('pageSlice', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it('découpe en pages de la taille voulue, dernière page partielle', () => {
    expect(pageSlice(items, 1, 12)).toEqual({ items: items.slice(0, 12), page: 1, pages: 3 });
    expect(pageSlice(items, 3, 12)).toEqual({ items: [24], page: 3, pages: 3 });
  });

  it('ramène une page hors limites dans la plage (filtre qui réduit le nombre de pages)', () => {
    expect(pageSlice(items, 9, 12).page).toBe(3);
    expect(pageSlice(items, 0, 12).page).toBe(1);
  });

  it('une liste vide compte une page vide', () => {
    expect(pageSlice([], 1, 12)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
