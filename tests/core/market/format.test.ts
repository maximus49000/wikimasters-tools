import { describe, expect, it } from 'vitest';
import { formatAge, formatRemaining } from '../../../src/core/market/format';

const MIN = 60_000;

describe('formatAge', () => {
  it('exprime l’ancienneté d’une observation', () => {
    expect(formatAge(20_000)).toBe('à l’instant');
    expect(formatAge(5 * MIN)).toBe('il y a 5 min');
    expect(formatAge(3 * 60 * MIN)).toBe('il y a 3 h');
    expect(formatAge(50 * 60 * MIN)).toBe('il y a 2 j');
  });
});

describe('formatRemaining', () => {
  it('exprime le temps restant avant la fin d’une enchère', () => {
    expect(formatRemaining(20_000)).toBe('moins d’1 min');
    expect(formatRemaining(12 * MIN)).toBe('12 min');
    expect(formatRemaining(125 * MIN)).toBe('2 h 05');
  });
});
