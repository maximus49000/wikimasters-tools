import { describe, expect, it } from 'vitest';
import { fallbackLine } from '../../../../../src/core/library/city/traffic/bus-lines';

describe('lignes de bus de repli', () => {
  it('déterministes et plausibles', () => {
    for (let s = 0; s < 200; s++) {
      const l = fallbackLine(s);
      expect(fallbackLine(s)).toEqual(l);
      expect(l.ref).toMatch(/^([1-9]\d?|[A-Z][1-9])$/);
      expect(l.to.length).toBeGreaterThan(2);
      expect(l.colour).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(new Set(Array.from({ length: 50 }, (_, s) => fallbackLine(s).ref)).size).toBeGreaterThan(20);
    expect(new Set(Array.from({ length: 50 }, (_, s) => fallbackLine(s).to)).size).toBeGreaterThan(5);
  });
});
