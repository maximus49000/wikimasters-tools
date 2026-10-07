import { describe, expect, it } from 'vitest';
import { paperShopLinks } from '../../../src/core/book/shops';

describe('paperShopLinks', () => {
  it('avec un ISBN : page du livre chez Amazon (ISBN-10), recherche par ISBN ailleurs, dans cet ordre', () => {
    const links = paperShopLinks({ isbn: '9782070360024', title: 'L’étranger', author: 'Albert Camus' });
    expect(links.map((link) => [link.shop, link.label, link.kind, link.url])).toEqual([
      ['amazon', 'Amazon.fr', 'paper', 'https://www.amazon.fr/dp/2070360024'],
      ['fnac', 'Fnac', 'paper', 'https://www.fnac.com/SearchResult/ResultList.aspx?Search=9782070360024'],
      ['decitre', 'Decitre', 'paper', 'https://www.decitre.fr/rechercher/result?q=9782070360024'],
      ['libraire', 'Librairie indépendante', 'paper', 'https://www.placedeslibraires.fr/listeliv.php?base=allbooks&mots_recherche=9782070360024'],
    ]);
    expect(links.every((link) => link.price === undefined)).toBe(true);
  });

  it('sans ISBN : recherche par titre et auteur, encodée', () => {
    const links = paperShopLinks({ title: 'L’étranger', author: 'Albert Camus' });
    const query = encodeURIComponent('L’étranger Albert Camus');
    expect(links[0]?.url).toBe(`https://www.amazon.fr/s?k=${query}`);
    expect(links[1]?.url).toBe(`https://www.fnac.com/SearchResult/ResultList.aspx?Search=${query}`);
  });

  it('sans ISBN ni auteur : recherche par titre seul ; un ISBN hors 978 reste utilisable en recherche', () => {
    expect(paperShopLinks({ title: 'Poèmes' })[2]?.url).toBe(`https://www.decitre.fr/rechercher/result?q=${encodeURIComponent('Poèmes')}`);
    expect(paperShopLinks({ isbn: '9791032000000', title: 'X' })[0]?.url).toBe('https://www.amazon.fr/s?k=9791032000000');
  });
});
