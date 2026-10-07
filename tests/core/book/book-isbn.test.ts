import { describe, expect, it } from 'vitest';
import { isbn10Of } from '../../../src/core/book/book-isbn';

describe('isbn10Of', () => {
  it('convertit un ISBN-13 en 978 en ISBN-10 avec sa clé de contrôle', () => {
    expect(isbn10Of('9782070360024')).toBe('2070360024');
    expect(isbn10Of('9780679720201')).toBe('0679720200');
    expect(isbn10Of('9780306406157')).toBe('0306406152');
  });
  it('écrit la clé 10 avec un X', () => {
    expect(isbn10Of('9780804429573')).toBe('080442957X');
  });
  it('rend undefined hors du préfixe 978, ou pour une valeur mal formée', () => {
    expect(isbn10Of('9791032000000')).toBeUndefined();
    expect(isbn10Of('2070360024')).toBeUndefined();
    expect(isbn10Of('97820703600X4')).toBeUndefined();
    expect(isbn10Of('')).toBeUndefined();
  });
});
