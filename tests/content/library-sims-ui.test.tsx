// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore, type KeyValueStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';
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

});

const drawer = () => q('[data-drawer]') as HTMLElement | null;
const panel = (id: string) => q(`[data-drawer-panel="${id}"]`) as HTMLElement | null;

describe('tiroir de construction', () => {
  it('n’existe qu’en Aménager, dans la scène (donc visible en plein écran)', async () => {
    expect(drawer()).toBeNull();
    await click('[data-action="edit"]');
    expect(drawer()).not.toBeNull();
    expect(drawer()?.closest('[data-stage]')).not.toBeNull();
  });

  it('montre les vignettes de la catégorie puis des sous-catégories de la Déco', async () => {
    await click('[data-action="edit"]');
    expect(q('[data-kind="shelf"] [data-thumb="shelf"]')).not.toBeNull();
    await click('[data-category="deco"]');
    expect(q('[data-subcategory="plants"]')?.getAttribute('aria-pressed')).toBe('true');
    await click('[data-subcategory="lights"]');
    expect(q('[data-kind="lamp"]')).not.toBeNull();
    expect(q('[data-kind="plant"]')).toBeNull();
  });

  it('marque la vignette dont l’outil est actif', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    expect(q('[data-kind="desk"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('l’onglet Pièce porte le style, l’orientation et les dimensions', async () => {
    await click('[data-action="edit"]');
    expect(panel('room')?.hidden).toBe(true);
    await click('[data-drawer-tab="room"]');
    expect(panel('room')?.hidden).toBe(false);
    expect(panel('furniture')?.hidden).toBe(true);
    expect(panel('room')?.querySelector('[data-style]')).not.toBeNull();
    expect(panel('room')?.querySelector('[data-orient="portrait"]')).not.toBeNull();
    expect(panel('room')?.querySelector('[data-action="extend-right"]')).not.toBeNull();
  });

  it('se réduit en poignée et se rouvre au même endroit', async () => {
    await click('[data-action="edit"]');
    await click('[data-category="seats"]');
    await click('[data-action="drawer-reduce"]');
    expect(drawer()?.dataset.reduced).toBe('true');
    expect(q('[data-category]')).toBeNull();
    await click('[data-action="drawer-open"]');
    expect(q('[data-category="seats"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('reste réduit au changement de pièce', async () => {
    await click('[data-action="add-room"]');
    await click('[data-action="edit"]');
    await click('[data-action="drawer-reduce"]');
    await click('[data-room="r1"]');
    expect(drawer()?.dataset.reduced).toBe('true');
  });

  it('revient sur la première catégorie quand une pièce Steampunk change de style', async () => {
    await click('[data-action="edit"]');
    await click('[data-style="steampunk"]');
    await click('[data-category="steampunk"]');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('[data-style="scandinave"]');
    expect(q('[data-category="steampunk"]')).toBeNull();
    expect(q('[data-category="storage"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('sans Collection, pas d’onglet Cartes', async () => {
    await click('[data-action="edit"]');
    expect(q('[data-drawer-tab="cards"]')).toBeNull();
  });

  it('pas de tiroir dans la vue de la rue', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true })); // mouvement réduit : la sortie est immédiate
    await click('[data-action="outside"]');
    expect(q('[data-action="inside"]')).not.toBeNull();
    expect(drawer()).toBeNull();
    // Aménager fait rentrer dans la pièce : le tiroir revient.
    await click('[data-action="edit"]');
    expect(drawer()).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it('les rangées empilées ont disparu', async () => {
    await click('[data-action="edit"]');
    expect(container.querySelectorAll('.wmt-lib-row').length).toBe(1);
  });
});

describe('tiroir avec la Collection', () => {
  beforeEach(async () => {
    const fakeCollection = { list: async () => [], subscribe: () => () => undefined } as unknown as CollectionRepo;
    await act(async () => { root.render(<LibraryPanel library={repo} collection={fakeCollection} />); });
    await settle();
  });

  it('l’onglet Cartes lance la pose d’une carte', async () => {
    await click('[data-action="edit"]');
    await click('[data-drawer-tab="cards"]');
    expect(panel('cards')?.hidden).toBe(false);
    await click('[data-action="add-card"]');
    expect(q('.wmt-lib-dialog')).not.toBeNull();
  });
});

describe('bulle d’actions', () => {
  async function selectShelf() {
    await click('[data-action="edit"]');
    await click('[data-category="storage"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-13"]');
    await click('[data-furniture="shelf"]');
  }

  it('apparaît sur la sélection avec ses actions', async () => {
    await click('[data-action="edit"]');
    expect(q('[data-action-bubble]')).toBeNull();
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-13"]');
    await click('[data-furniture="shelf"]');
    const bubble = q('[data-action-bubble]');
    expect(bubble?.closest('[data-stage]')).not.toBeNull();
    expect(bubble?.querySelector('[data-action="move"]')).not.toBeNull();
    expect(bubble?.querySelector('[data-action="remove"]')).not.toBeNull();
    expect(bubble?.querySelector('[data-action="depth-front"]')).not.toBeNull();
    expect(bubble?.querySelector('[data-action="lamp"]')).toBeNull();
    expect(bubble?.querySelector('[data-action="win-w+"]')).toBeNull();
  });

  it('propose la lampe pour une lampe', async () => {
    await click('[data-action="edit"]');
    await click('[data-category="deco"]');
    await click('[data-subcategory="lights"]');
    await click('[data-kind="lamp"]');
    await click('[data-cell="3-13"]');
    await click('[data-furniture="lamp"]');
    expect(q('[data-action-bubble] [data-action="lamp"]')).not.toBeNull();
  });

  it('propose la taille pour une fenêtre', async () => {
    await click('[data-action="edit"]');
    await click('[data-category="deco"]');
    await click('[data-subcategory="walls"]');
    await click('[data-kind="window"]');
    await click('[data-cell="3-6"]');
    await click('[data-furniture="window"]');
    expect(q('[data-action-bubble] [data-action="win-w+"]')).not.toBeNull();
    expect(q('[data-action-bubble] [data-action="win-h-full"]')).not.toBeNull();
  });

  it('disparaît après le retrait et en Visiter', async () => {
    await selectShelf();
    await click('[data-action="remove"]');
    expect(q('[data-action-bubble]')).toBeNull();
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-13"]');
    await click('[data-furniture="shelf"]');
    expect(q('[data-action-bubble]')).not.toBeNull();
    await click('[data-action="visit"]');
    expect(q('[data-action-bubble]')).toBeNull();
  });

  it('reste affichée tiroir réduit', async () => {
    await selectShelf();
    await click('[data-action="drawer-reduce"]');
    expect(q('[data-action-bubble]')).not.toBeNull();
  });
});
