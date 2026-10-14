// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { measureWith } from '../../src/content/deco-fonts';

it('mesure avec la pile de polices complète (repli compris)', () => {
  const fonts: string[] = [];
  const ctx = { set font(v: string) { fonts.push(v); }, measureText: () => ({ width: 50 }) };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
  const w = measureWith('WMT Caveat', 600, '"Segoe Print", cursive')('abc', 2);
  expect(fonts[0]).toBe('600 20px "WMT Caveat", "Segoe Print", cursive');
  expect(w).toBe(5);
});
