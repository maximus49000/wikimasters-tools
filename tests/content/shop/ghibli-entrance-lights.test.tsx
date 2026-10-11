// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { GhibliEntranceLights } from '../../../src/content/shop/ghibli-entrance-lights';
import { doorsFor } from '../../../src/core/library/city/doors';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});
const mount = (dark: boolean): HTMLElement => {
  const host = document.createElement('div');
  root = createRoot(host);
  act(() => root!.render(<svg><GhibliEntranceLights doors={doorsFor(1080, 340, 1)} unit={1} doorY={240} dark={dark} /></svg>));
  return host;
};

describe('impostes allumées', () => {
  it('la nuit, une par hall éclairé ; le jour, aucune', () => {
    const lit = doorsFor(1080, 340, 1).filter((d) => d.hallU < 0.6).length;
    expect(lit).toBeGreaterThan(0);
    expect(mount(true).querySelectorAll('[data-entrance-light]').length).toBe(lit);
    act(() => root?.unmount());
    expect(mount(false).querySelectorAll('[data-entrance-light]').length).toBe(0);
  });
});
