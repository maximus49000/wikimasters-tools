// tests/core/documentary/format.test.ts
import { describe, expect, it } from 'vitest';
import { formatDuration, searchLinks } from '../../../src/core/documentary/format';

describe('formatDuration', () => {
  it('écrit minutes ou heures', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(3120)).toBe('52 min');
    expect(formatDuration(3900)).toBe('1 h 05');
    expect(formatDuration(null)).toBe('');
  });
});

describe('searchLinks', () => {
  it('encode le nom dans trois recherches', () => {
    const links = searchLinks('Jeanne d’Arc');
    expect(links.map((link) => link.label)).toEqual(['YouTube', 'Arte', 'INA']);
    expect(links[2]?.url).toBe('https://www.ina.fr/recherche?q=Jeanne%20d%E2%80%99Arc');
    expect(links[0]?.url).toBe('https://www.youtube.com/results?search_query=Jeanne%20d%E2%80%99Arc%20documentaire');
  });
});
