// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore, type KeyValueStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { LibraryPanel } from '../../src/content/LibraryPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let store: KeyValueStore;
let repo: LibraryRepo;

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
const menu = (id: string) => q(`[data-menu="${id}"]`) as HTMLElement | null;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store = createMemoryStore();
  repo = createLibraryRepo(store);
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('barre du haut', () => {
  it('ouvre un seul menu à la fois', async () => {
    await click('[data-menu-button="sky"]');
    expect(menu('sky')?.hidden).toBe(false);
    expect(q('[data-menu-button="sky"]')?.getAttribute('aria-expanded')).toBe('true');
    await click('[data-menu-button="pets"]');
    expect(menu('sky')?.hidden).toBe(true);
    expect(menu('pets')?.hidden).toBe(false);
  });

  it('rappuyer sur le bouton ferme le menu', async () => {
    await click('[data-menu-button="room"]');
    await click('[data-menu-button="room"]');
    expect(menu('room')?.hidden).toBe(true);
  });

  it('Échap ferme le menu ouvert', async () => {
    await click('[data-menu-button="sky"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(menu('sky')?.hidden).toBe(true);
  });

  it('toucher hors du menu le ferme', async () => {
    await click('[data-menu-button="pets"]');
    await act(async () => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(menu('pets')?.hidden).toBe(true);
  });

  it('ciel, météo, animaux et réglages sont accessibles en mode Visiter', () => {
    expect(q('[data-action="edit"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(menu('sky')?.querySelector('[data-scene="city"]')).not.toBeNull();
    expect(menu('sky')?.querySelector('[data-time="night"]')).not.toBeNull();
    expect(menu('pets')?.querySelector('[data-action="adopt"]')).not.toBeNull();
    expect(menu('room')?.querySelector('[data-action="home"]')).not.toBeNull();
    expect(menu('room')?.querySelector('[data-action="delete-room"]')).not.toBeNull();
  });

  it.todo('les rangées empilées ont disparu');
});
