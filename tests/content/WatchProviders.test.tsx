// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WatchProviders } from '../../src/content/WatchProviders';
import type { WatchInfo } from '../../src/core/screen/tmdb-api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const render = (watch: WatchInfo) => act(async () => root.render(<WatchProviders watch={watch} />));

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('WatchProviders', () => {
  it('affiche les logos (nom en alt), les deux lignes et le lien vers la page TMDB', async () => {
    await render({
      link: 'https://www.themoviedb.org/movie/1/watch?locale=FR',
      stream: [{ id: 8, name: 'Netflix', logoPath: '/n.jpg' }],
      rentBuy: [{ id: 2, name: 'Apple TV' }],
    });
    expect(container.querySelector('img[alt="Netflix"]')?.getAttribute('src')).toBe('https://image.tmdb.org/t/p/w92/n.jpg');
    expect(container.querySelector('[aria-label="Apple TV"]')?.textContent).toBe('Ap');
    expect(container.querySelector('[aria-label="Abonnement ou gratuit"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Location ou achat"]')).not.toBeNull();
    const link = container.querySelector<HTMLAnchorElement>('a');
    expect(link?.href).toBe('https://www.themoviedb.org/movie/1/watch?locale=FR');
    expect(link?.rel).toContain('noopener');
  });

  it('sans offre : le dit ; sans lien : pas de bouton ; ligne vide masquée', async () => {
    await render({ stream: [], rentBuy: [] });
    expect(container.textContent).toContain('Aucune offre en France connue');
    expect(container.querySelector('a')).toBeNull();
    await render({ stream: [{ id: 8, name: 'Netflix' }], rentBuy: [] });
    expect(container.querySelector('[aria-label="Location ou achat"]')).toBeNull();
    expect(container.textContent).not.toContain('Aucune offre');
  });
});
