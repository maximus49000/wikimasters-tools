import { describe, expect, it } from 'vitest';
import { historyKindOf, mayBeHistory } from '../../../src/core/documentary/history-kinds';

const kinds = (natures: string[]) => ({ natures, occupations: [], genres: [] });

describe('mayBeHistory', () => {
  it('retient un événement, une œuvre, un humain ou une carte sans nature, pas le reste', () => {
    expect(mayBeHistory(kinds(['Q178561']))).toBe(true);
    expect(mayBeHistory(kinds(['Q18609875']))).toBe(true);
    expect(mayBeHistory(kinds(['Q5']))).toBe(true);
    expect(mayBeHistory(kinds([]))).toBe(true);
    expect(mayBeHistory(kinds(['Q515']))).toBe(false);
    expect(mayBeHistory(kinds(['Q16521']))).toBe(false);
    expect(mayBeHistory(undefined)).toBe(false);
  });
});

describe('historyKindOf', () => {
  it('reconnaît une bataille, une guerre, une révolution', () => {
    expect(historyKindOf(kinds(['Q178561']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q198']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q10931']), null)).toBe('event');
  });
  it('reconnaît une œuvre d’art, un monument, une civilisation, une religion', () => {
    expect(historyKindOf(kinds(['Q18609875']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q16970']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q8432']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q9174']), null)).toBe('event');
  });
  it('reconnaît un humain décédé en 1950 ou avant, jamais un vivant ni un décès récent', () => {
    expect(historyKindOf(kinds(['Q5']), 1821)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), 1950)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), 1951)).toBeNull();
    expect(historyKindOf(kinds(['Q5']), null)).toBeNull();
    expect(historyKindOf(kinds(['Q5']), null, 1800)).toBeNull();
  });
  it('une carte sans nature renseignée compte si elle date de 1950 ou avant', () => {
    expect(historyKindOf(kinds([]), null, 1794)).toBe('event');
    expect(historyKindOf(kinds([]), null, 1950)).toBe('event');
    expect(historyKindOf(kinds([]), null, 1990)).toBeNull();
    expect(historyKindOf(kinds([]), null, null)).toBeNull();
    expect(historyKindOf(kinds(['Q515']), null, 1794)).toBeNull();
  });
  it('rend null pour une carte sans rapport (ville, taxon)', () => {
    expect(historyKindOf(kinds(['Q515']), 1800)).toBeNull();
    expect(historyKindOf(kinds(['Q16521']), null)).toBeNull();
    expect(historyKindOf(undefined, 1800)).toBeNull();
  });
});
