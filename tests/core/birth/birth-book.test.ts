import { describe, expect, it } from 'vitest';
import { EMPTY_BIRTH, needsBirthLookup, partitionByDates, setBirths } from '../../../src/core/birth/birth-book';

const card = (slug: string) => ({ slug, title: slug });
const none = { birth: null, start: null, end: null };

describe('birth-book', () => {
  it('mémorise aussi les articles sans date', () => {
    const state = setBirths(EMPTY_BIRTH, { A: none });
    expect(needsBirthLookup(state, 'A')).toBe(false);
    expect(needsBirthLookup(state, 'constructor')).toBe(true);
  });
});

describe('partitionByDates', () => {
  const state = setBirths(EMPTY_BIRTH, {
    B: { ...none, birth: 1900 },
    A: { ...none, birth: -300 },
    C: none,
    War: { ...none, start: 1939, end: 1945 },
    Party: { ...none, start: 1950 },
    Odd: { ...none, start: 1960, end: 1950 },
  });
  const cards = ['B', 'A', 'C', 'D', 'War', 'Party', 'Odd'].map(card);

  it('personne : cartes avec date de naissance, triées, sans fin', () => {
    const { dated, undated } = partitionByDates(cards, state, 'person');
    expect(dated.map((d) => d.card.slug)).toEqual(['A', 'B']);
    expect(dated.every((d) => d.end === undefined)).toBe(true);
    expect(undated.map((c) => c.slug)).toEqual(['C', 'D', 'Odd', 'Party', 'War']);
  });

  it('évènement : début, et fin seulement quand elle est connue et cohérente', () => {
    const { dated, undated } = partitionByDates(cards, state, 'event');
    expect(dated.map((d) => [d.card.slug, d.year, d.end])).toEqual([
      ['War', 1939, 1945],
      ['Party', 1950, undefined],
      ['Odd', 1960, undefined],
    ]);
    expect(undated.map((c) => c.slug)).toEqual(['A', 'B', 'C', 'D']);
  });
});
