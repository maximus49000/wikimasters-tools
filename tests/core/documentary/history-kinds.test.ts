import { describe, expect, it } from 'vitest';
import { historyKindOf, mayBeHistory } from '../../../src/core/documentary/history-kinds';

const kinds = (natures: string[]) => ({ natures, occupations: [], genres: [] });

describe('mayBeHistory', () => {
  it('retient un événement ou un humain, pas le reste', () => {
    expect(mayBeHistory(kinds(['Q178561']))).toBe(true);
    expect(mayBeHistory(kinds(['Q5']))).toBe(true);
    expect(mayBeHistory(kinds(['Q515']))).toBe(false);
    expect(mayBeHistory(undefined)).toBe(false);
  });
});

describe('historyKindOf', () => {
  it('reconnaît une bataille, une guerre, une révolution', () => {
    expect(historyKindOf(kinds(['Q178561']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q198']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q10931']), null)).toBe('event');
  });
  it('reconnaît un humain décédé en 1950 ou avant, jamais un vivant ni un décès récent', () => {
    expect(historyKindOf(kinds(['Q5']), 1821)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), 1950)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), 1951)).toBeNull();
    expect(historyKindOf(kinds(['Q5']), null)).toBeNull();
  });
  it('rend null pour une carte sans rapport', () => {
    expect(historyKindOf(kinds(['Q515']), 1800)).toBeNull();
    expect(historyKindOf(undefined, 1800)).toBeNull();
  });
});
