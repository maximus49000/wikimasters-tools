import { describe, expect, it } from 'vitest';
import { EMPTY_BIRTH, needsBirthLookup, partitionByBirth, setBirths } from '../../../src/core/birth/birth-book';
import { formatYear, layoutTimeline } from '../../../src/core/birth/timeline-layout';

const card = (slug: string) => ({ slug, title: slug });

describe('birth-book', () => {
  it('mémorise aussi les articles sans date', () => {
    const state = setBirths(EMPTY_BIRTH, { A: null });
    expect(needsBirthLookup(state, 'A')).toBe(false);
    expect(needsBirthLookup(state, 'constructor')).toBe(true);
  });

  it('sépare les cartes datées (triées) des autres', () => {
    const state = setBirths(EMPTY_BIRTH, { B: 1900, A: -300, C: null });
    const { dated, undated } = partitionByBirth([card('B'), card('A'), card('C'), card('D')], state);
    expect(dated.map((d) => d.card.slug)).toEqual(['A', 'B']);
    expect(undated.map((c) => c.slug)).toEqual(['C', 'D']);
  });
});

describe('layoutTimeline', () => {
  it('place les cartes proportionnellement à leur date et évite les chevauchements', () => {
    const dated = [
      { card: card('A'), year: 1900 },
      { card: card('B'), year: 1901 },
      { card: card('C'), year: 2000 },
    ];
    const { items, lanes } = layoutTimeline(dated);
    expect(items[0]?.lane).toBe(0);
    expect(items[1]?.lane).toBe(1);
    expect(items[2]?.lane).toBe(0);
    expect(items[2]?.x ?? 0).toBeGreaterThan(items[1]?.x ?? 0);
    expect(lanes).toBe(2);
  });

  it('gère une liste vide et une seule carte', () => {
    expect(layoutTimeline([]).items).toEqual([]);
    expect(layoutTimeline([{ card: card('A'), year: 1500 }]).items).toHaveLength(1);
  });

  it('formate les années', () => {
    expect(formatYear(1889.25)).toBe('1889');
    expect(formatYear(-384)).toBe('384 av. J.-C.');
  });
});
