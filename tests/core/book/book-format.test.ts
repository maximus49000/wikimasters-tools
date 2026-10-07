import { describe, expect, it } from 'vitest';
import { articleUrl, coverThumbUrl, coverUrl, firstIsbn13, isWorkId, normalizeTitle, workPageUrl } from '../../../src/core/book/book-format';

describe('book-format', () => {
  it('construit les adresses Open Library et Wikipédia', () => {
    expect(coverUrl(13151269)).toBe('https://covers.openlibrary.org/b/id/13151269-L.jpg');
    expect(workPageUrl('OL1230613W')).toBe('https://openlibrary.org/works/OL1230613W');
    expect(articleUrl("L'Étranger_(roman)")).toBe("https://fr.wikipedia.org/wiki/L'%C3%89tranger_(roman)");
  });
  it('choisit le premier ISBN-13', () => {
    expect(firstIsbn13(['2070360024', '9782070360024', '9780679720201'])).toBe('9782070360024');
    expect(firstIsbn13(['2070360024'])).toBeUndefined();
    expect(firstIsbn13(undefined)).toBeUndefined();
  });
  it('reconnaît un identifiant d’œuvre Open Library', () => {
    expect(isWorkId('OL1230613W')).toBe(true);
    expect(isWorkId('OL1230613A')).toBe(false);
    expect(isWorkId('../etc')).toBe(false);
  });
  it('construit l’adresse de la miniature de couverture', () => {
    expect(coverThumbUrl(13151269)).toBe('https://covers.openlibrary.org/b/id/13151269-S.jpg');
  });
  it('compare les titres sans accents, casse ni ponctuation', () => {
    expect(normalizeTitle('L’étranger')).toBe(normalizeTitle("L'Étranger"));
  });
});
