import { describe, expect, it } from 'vitest';
import { archiveUrl, gutenbergUrl, protectedUntil, readingLinks, wikisourceUrl } from '../../../src/core/book/reading';

describe('reading', () => {
  it('construit les adresses, encodées', () => {
    expect(wikisourceUrl('Les Misérables')).toBe('https://fr.wikisource.org/wiki/Les_Mis%C3%A9rables');
    expect(gutenbergUrl('135')).toBe('https://www.gutenberg.org/ebooks/135');
    expect(archiveUrl('lesmisrables1903hugo')).toBe('https://archive.org/details/lesmisrables1903hugo');
  });
  it('ordonne les sources : Wikisource, Gutenberg, Internet Archive, et omet les absentes', () => {
    const links = readingLinks({ archive: 'a', wikisource: 'w' });
    expect(links.map((link) => link.source)).toEqual(['wikisource', 'archive']);
    expect(readingLinks({})).toEqual([]);
  });
  it('protège 70 ans après le décès', () => {
    expect(protectedUntil(1960)).toBe(2030);
  });
});
