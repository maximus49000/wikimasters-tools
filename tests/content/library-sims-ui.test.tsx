// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore, type KeyValueStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';
import { LIBRARY_CSS, LibraryPanel } from '../../src/content/LibraryPanel';

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
const confirm = async () => { if (container.querySelector('[data-action="place-confirm"]')) await click('[data-action="place-confirm"]'); };
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
    await confirm();
    await click('[data-furniture="shelf"]');
    await confirm();
  }

  it('apparaît sur la sélection avec ses actions', async () => {
    await click('[data-action="edit"]');
    expect(q('[data-action-bubble]')).toBeNull();
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-13"]');
    await confirm();
    await click('[data-furniture="shelf"]');
    await confirm();
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
    await confirm();
    await click('[data-furniture="lamp"]');
    await confirm();
    expect(q('[data-action-bubble] [data-action="lamp"]')).not.toBeNull();
  });

  it('propose la taille pour une fenêtre', async () => {
    await click('[data-action="edit"]');
    await click('[data-category="deco"]');
    await click('[data-subcategory="walls"]');
    await click('[data-kind="window"]');
    await click('[data-cell="3-6"]');
    await confirm();
    await click('[data-furniture="window"]');
    await confirm();
    expect(q('[data-action-bubble] [data-action="win-w+"]')).not.toBeNull();
    expect(q('[data-action-bubble] [data-action="win-h-full"]')).not.toBeNull();
  });

  it('disparaît après le retrait et en Visiter', async () => {
    await selectShelf();
    await click('[data-action="remove"]');
    expect(q('[data-action-bubble]')).toBeNull();
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-13"]');
    await confirm();
    await click('[data-furniture="shelf"]');
    await confirm();
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

describe('corrections de la revue', () => {
  it('le nom tapé est enregistré quand Échap ferme le menu pendant la saisie', async () => {
    await click('[data-menu-button="room"]');
    const input = q('[data-menu="room"] input[aria-label="Nom de la pièce"]') as HTMLInputElement;
    await act(async () => { input.focus(); input.value = 'Salon'; });
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await settle();
    expect(repo.current()?.rooms[0]?.name).toBe('Salon');
  });

  it('un menu dont le bouton est à droite s’ouvre vers la gauche, sinon vers la droite', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375); // téléphone
    const sky = q('[data-menu-button="sky"]') as HTMLElement;
    vi.spyOn(sky, 'getBoundingClientRect').mockReturnValue({ left: 320, right: 360, top: 0, bottom: 40, width: 40, height: 40, x: 320, y: 0, toJSON: () => ({}) } as DOMRect);
    await click('[data-menu-button="sky"]');
    expect(menu('sky')?.dataset.align).toBe('end');
    await click('[data-menu-button="pets"]');
    expect(menu('pets')?.dataset.align).toBe('start');
  });

  it('changer de sous-catégorie abandonne l’outil armé', async () => {
    await click('[data-action="edit"]');
    await click('[data-category="deco"]');
    await click('[data-subcategory="lights"]');
    await click('[data-kind="lamp"]');
    await click('[data-subcategory="plants"]');
    await click('[data-cell="3-13"]');
    expect(q('[data-furniture]')).toBeNull();
  });

  it('ni le tiroir ni la barre de placement ne recréent leur observateur de taille à chaque rendu', async () => {
    let created = 0;
    vi.stubGlobal('ResizeObserver', class { constructor() { created += 1; } observe() {} disconnect() {} });
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    const before = created;
    await click('[data-cell="3-14"]');
    await click('[data-cell="8-14"]');
    await click('[data-kind="desk"]');
    expect(created).toBe(before);
    vi.unstubAllGlobals();
  });

  it('en plein écran aussi, la scène laisse la place du tiroir', () => {
    expect(LIBRARY_CSS).not.toContain(':not(:fullscreen){padding-bottom');
    expect(LIBRARY_CSS).toContain('.wmt-lib-stage:fullscreen{box-sizing:border-box');
  });
});

function stubFullscreen() {
  let current: Element | null = null;
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: function (this: HTMLElement) {
      current = this;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    },
  });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: () => {
      current = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    },
  });
}

describe('interrupteur en plein écran', () => {
  const press = async (selector: string) => {
    await act(async () => { (q(selector) as HTMLElement).click(); });
    await settle();
  };

  it('n’existe qu’en plein écran et bascule entre Visiter et Aménager', async () => {
    stubFullscreen();
    expect(q('[data-mode-switch]')).toBeNull();
    await click('.wmt-lib-topbar [data-action="fullscreen"]');
    expect(q('[data-mode-switch] [data-action="visit"]')?.getAttribute('aria-pressed')).toBe('true');
    await press('[data-mode-switch] [data-action="edit"]');
    expect(q('[data-mode-switch] [data-action="edit"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-drawer]')).not.toBeNull();
    await press('[data-mode-switch] [data-action="visit"]');
    expect(q('[data-drawer]')).toBeNull();
  });

  it('passer en 👁 pendant un placement l’annule sans rien enregistrer', async () => {
    stubFullscreen();
    await click('.wmt-lib-topbar [data-action="fullscreen"]');
    await press('[data-mode-switch] [data-action="edit"]');
    await click('[data-kind="shelf"]');
    expect(q('[data-placement-bar]')).not.toBeNull();
    await press('[data-mode-switch] [data-action="visit"]');
    expect(q('[data-placement-bar]')).toBeNull();
    expect(repo.current()!.rooms[0]!.layout).toHaveLength(0);
  });
});

describe('habillage Sims', () => {
  it('le tiroir range les catégories en colonne à gauche et nomme la catégorie', async () => {
    await click('[data-action="edit"]');
    expect(q('.wmt-lib-drawer-body .wmt-lib-cats [data-category="storage"]')).not.toBeNull();
    expect(q('.wmt-lib-cat-title')?.textContent).toBe('Rangement');
    expect(q('[data-drawer-tab="furniture"]')?.textContent).toContain('Meubles');
    expect(q('.wmt-lib-tabs-pill [data-drawer-tab="furniture"]')).not.toBeNull();
  });

  it('la feuille de style déclare les couleurs Sims', () => {
    expect(LIBRARY_CSS).toContain('--sims-panel');
    expect(LIBRARY_CSS).toContain('.wmt-lib-confirm');
    expect(LIBRARY_CSS).toContain('.wmt-lib-switch');
  });

  it('les boutons ronds du plein écran ont l’habillage Sims', async () => {
    stubFullscreen();
    await click('.wmt-lib-topbar [data-action="fullscreen"]');
    expect(q('.wmt-lib-fab[data-action="outside"]')).not.toBeNull();
    expect(q('.wmt-lib-fab[aria-label="Quitter le plein écran"]')).not.toBeNull();
  });
});
