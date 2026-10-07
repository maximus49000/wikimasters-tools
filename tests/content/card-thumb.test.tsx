// tests/content/card-thumb.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CardThumb } from '../../src/content/CardThumb';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CardThumb', () => {
  it('prend la taille par défaut 34×48, ou celle demandée', async () => {
    await act(async () => root.render(<CardThumb card={{ slug: 'A', title: 'A', rarity: 'SR' }} />));
    const small = container.firstElementChild as HTMLElement;
    expect([small.style.width, small.style.height]).toEqual(['34px', '48px']);
    await act(async () => root.render(<CardThumb card={{ slug: 'A', title: 'A', rarity: 'SR' }} width={30} height={42} />));
    const custom = container.firstElementChild as HTMLElement;
    expect([custom.style.width, custom.style.height]).toEqual(['30px', '42px']);
  });

  it('colore le cadre selon la rareté et affiche l’image de la carte', async () => {
    await act(async () => root.render(<CardThumb card={{ slug: 'A', title: 'A', rarity: 'L', imageUrl: 'https://x/a.png' }} />));
    const thumb = container.firstElementChild as HTMLElement;
    expect(thumb.style.border).toContain('--color-rarity-l');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://x/a.png');
  });
});
