import { describe, expect, it } from 'vitest';
import { EMPTY_BIRTH, needsBirthLookup, partitionByDates, setBirths } from '../../../src/core/birth/birth-book';

const card = (slug: string) => ({ slug, title: slug });
const none = { birth: null, death: null, start: null, end: null };

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

  it('personne : de la naissance à la mort, ou jusqu’à l’année en cours pour un vivant', () => {
    const people = setBirths(EMPTY_BIRTH, {
      Dead: { ...none, birth: 1900, death: 1970 },
      Alive: { ...none, birth: 1980 },
      Old: { ...none, birth: 1700 },
    });
    const { dated } = partitionByDates(['Dead', 'Alive', 'Old'].map(card), people, 'person', 2026);
    expect(dated.map((d) => [d.card.slug, d.year, d.end])).toEqual([
      ['Old', 1700, undefined],
      ['Dead', 1900, 1970],
      ['Alive', 1980, 2026],
    ]);
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
