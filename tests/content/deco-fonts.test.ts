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

it('PanelText charge la police du panneau, re-mesure ensuite et passe le repli', async () => {
  vi.resetModules();
  const fonts: string[] = [];
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ set font(v: string) { fonts.push(v); }, measureText: () => ({ width: 5 }) })) as never;
  let done!: () => void;
  const load = vi.fn(() => new Promise<void>((r) => { done = r; }));
  Object.defineProperty(document, 'fonts', { value: { load }, configurable: true });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const { DecoArt } = await import('../../src/content/deco-art');
  const { paletteOf } = await import('../../src/core/library/styles');
  const placed = { id: 'p', kind: 'deco', deco: 'panel-chalk', text: 'Bonjour', col: 0, row: 0 } as never;
  const view = { time: { h: 10, m: 0, s: 0 }, weather: { state: 'sun', label: 'Soleil', tempC: 18, night: false }, daylight: 1, editing: false } as never;
  const host = document.createElement('div');
  await act(async () => {
    createRoot(host).render(React.createElement('svg', null, React.createElement(DecoArt, { placed, rect: { x: 0, y: 0, w: 120, h: 90 }, style: 'scandinave', palette: paletteOf('scandinave'), view })));
  });
  expect(load).toHaveBeenCalledWith('600 16px "WMT Caveat"');
  const before = fonts.length;
  expect(fonts[0]).toContain('"Segoe Print"');
  await act(async () => { done(); });
  expect(fonts.length).toBeGreaterThan(before);
});
