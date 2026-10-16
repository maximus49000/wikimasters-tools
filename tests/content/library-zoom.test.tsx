// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { updateLayout } from '../../src/core/library/library-book';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import type { Layout } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Même collection factice que tests/content/library-cards.test.tsx (copier `known` et `fakeCollection` de ce fichier).
const known = [
  { slug: 'Paris', title: 'Paris', imageUrl: 'p.png' },
  { slug: 'Daft_Punk', title: 'Daft Punk' },
];
const fakeCollection = { list: async () => known, subscribe: () => () => undefined } as unknown as CollectionRepo;

let container: HTMLDivElement;
let root: Root;
let repo: LibraryRepo;
// Sous horloge factice, un setTimeout réel ne viendrait jamais : on avance l'horloge de 0 ms à la place.
const settle = () => act(async () => {
  if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
  else await new Promise((r) => setTimeout(r, 0));
});
const q = (s: string) => container.querySelector<HTMLElement | SVGElement>(s);
async function click(s: string) {
  const el = q(s) ?? document.querySelector<HTMLElement>(s);
  if (!el) throw new Error(`introuvable : ${s}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
async function seed(layout: Layout) { await repo.update((st) => updateLayout(st, 'r1', () => layout)); await settle(); }
const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });

// Une carte rangée s'ouvre dans la scène (tests/content/library-panel.test.tsx) : la fiche ne s'ouvre plus depuis le zoom que pour l'écran d'un bureau.
const SHELF: Layout = [{ id: 's', kind: 'shelf', col: 0, row: 6, angle: 1 }, { id: 'c', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' }];
const DESK: Layout = [{ id: 'd', kind: 'desk', col: 0, row: 6 }, { id: 'pc', kind: 'computer', deskId: 'd', slug: 'Daft_Punk' }];

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} collection={fakeCollection} />); });
  await settle();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); act(() => root.unmount()); container.remove(); history.replaceState(null, ''); });

describe('zoom sur un meuble', () => {
  it('en Visiter, toucher une étagère avec cartes ouvre le zoom ; il passe « open » après 500 ms', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    await click('[data-furniture="shelf"]');
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('opening');
    await advance(500);
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('open');
  });
  it('toucher une carte rangée dans la pièce ouvre aussi le zoom (pas la fiche)', async () => {
    await seed([{ id: 's', kind: 'shelf', col: 0, row: 6 }, SHELF[1]!]);
    await click('[data-card="Daft_Punk"]');
    expect(q('[data-furniture-zoom]')).not.toBeNull();
    expect(document.querySelector('[data-room-card]')).toBeNull();
  });
  it('étagère vide : pas de zoom ; en Aménager : pas de zoom', async () => {
    await seed([{ id: 's', kind: 'shelf', col: 0, row: 6 }]);
    await click('[data-furniture="shelf"]');
    expect(q('[data-furniture-zoom]')).toBeNull();
    await seed(SHELF);
    await click('[data-action="edit"]');
    await click('[data-furniture="shelf"]');
    expect(q('[data-furniture-zoom]')).toBeNull();
  });
  it('pendant le zoom : pas de bouton Sortir (vue fenêtre), pas d’interrupteur ni de barre du haut, défilement figé', async () => {
    await seed(SHELF);
    await click('[data-furniture="shelf"]');
    expect(q('[data-action="outside"]')).toBeNull();
    expect(q('[data-mode-switch]')).toBeNull();
    expect(q('[data-menu-button="sky"]')).toBeNull();
    expect((q('[data-scroll]') as HTMLElement).style.overflowX).toBe('hidden');
    expect((q('[data-scroll]') as HTMLElement).style.overflowY).toBe('hidden');
    expect(q('[data-stage]')!.hasAttribute('data-zoom-open')).toBe(true);
  });
  it('toucher une carte dans le zoom ouvre la fiche ; la fermer revient au zoom', async () => {
    await seed(DESK);
    vi.useFakeTimers();
    await click('[data-furniture="desk"]');
    await advance(500);
    await click('[data-zoom-card="Daft_Punk"]');
    expect(document.querySelector('[data-room-card="Daft_Punk"]')).not.toBeNull();
    await click('[data-action="close"]');
    expect(document.querySelector('[data-room-card]')).toBeNull();
    expect(q('[data-furniture-zoom]')).not.toBeNull();
  });
  it('← ferme le zoom après l’animation et rend le bouton Sortir', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    await click('[data-furniture="shelf"]');
    await advance(500);
    await click('[data-action="zoom-back"]');
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('closing');
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
    expect(q('[data-action="outside"]')).not.toBeNull();
  });
  it('Échap ferme le zoom', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    await click('[data-furniture="shelf"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
  });
  it('retour Android/navigateur (popstate) ferme le zoom une seule fois, sans entrée d’historique orpheline', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    // L'historique de jsdom est partagé entre les tests (entrées « suivantes » laissées par les retours précédents) :
    // on vérifie les appels plutôt que la longueur absolue.
    const push = vi.spyOn(history, 'pushState');
    const back = vi.spyOn(history, 'back');
    await click('[data-furniture="shelf"]');
    expect(typeof history.state?.wmtZoom).toBe('string');
    expect(push).toHaveBeenCalledTimes(1);
    const afterOpen = history.length;
    await act(async () => { history.replaceState(null, ''); window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
    expect(history.length).toBe(afterOpen);
    expect(push).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    // un second retour hors zoom ne rouvre rien et ne plante pas
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    expect(q('[data-furniture-zoom]')).toBeNull();
  });
  it('une entrée plus ancienne marquée wmtZoom (page rechargée zoom ouvert) n’empêche pas le retour de fermer le zoom', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    history.replaceState({ wmtZoom: true }, '');
    await click('[data-furniture="shelf"]');
    await advance(500);
    // Retour Android réel : l'état redevient celui de l'entrée d'en dessous, l'ancienne marquée wmtZoom.
    await act(async () => { history.replaceState({ wmtZoom: true }, ''); window.dispatchEvent(new PopStateEvent('popstate', { state: { wmtZoom: true } })); });
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
  });
  it('← et Échap retirent chacun l’entrée d’historique du zoom exactement une fois', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    await click('[data-furniture="shelf"]');
    await advance(500);
    await click('[data-action="zoom-back"]');
    await advance(500);
    expect(back).toHaveBeenCalledTimes(1);
    history.replaceState(null, '');
    await click('[data-furniture="shelf"]');
    await advance(500);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
    expect(back).toHaveBeenCalledTimes(2);
  });
  it('Échap avec la fiche ouverte ferme la fiche seulement', async () => {
    await seed(DESK);
    vi.useFakeTimers();
    const back = vi.spyOn(history, 'back');
    await click('[data-furniture="desk"]');
    await advance(500);
    await click('[data-zoom-card="Daft_Punk"]');
    expect(document.querySelector('[data-room-card="Daft_Punk"]')).not.toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await advance(500);
    expect(document.querySelector('[data-room-card]')).toBeNull();
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('open');
    expect(back).not.toHaveBeenCalled();
  });
  it('retour Android/navigateur avec la fiche ouverte : ferme la fiche, le zoom reste (et son entrée d’historique)', async () => {
    await seed(DESK);
    vi.useFakeTimers();
    await click('[data-furniture="desk"]');
    await advance(500);
    await click('[data-zoom-card="Daft_Punk"]');
    const push = vi.spyOn(history, 'pushState');
    await act(async () => { history.replaceState(null, ''); window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    await advance(500);
    expect(document.querySelector('[data-room-card]')).toBeNull();
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('open');
    expect(push).toHaveBeenCalledTimes(1);
    expect(typeof history.state?.wmtZoom).toBe('string');
    // un second retour ferme alors le zoom (le retour du second zoom à la vue de face est couvert plus bas)
    await act(async () => { history.replaceState(null, ''); window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
  });
  it('second zoom : ← revient à la vue de face, puis à la pièce', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    await click('[data-furniture="shelf"]');
    await advance(500);
    await click('[data-zoom-board="1"]');
    expect(q('[data-shelf-board="1"]')).not.toBeNull();
    await click('[data-action="zoom-back"]');
    expect(q('[data-shelf-board]')).toBeNull();
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('open');
    await click('[data-action="zoom-back"]');
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
  });
  it('second zoom : Échap et le fond reviennent à la vue de face', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    await click('[data-furniture="shelf"]');
    await advance(500);
    await click('[data-zoom-board="0"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(q('[data-shelf-board]')).toBeNull();
    expect(q('[data-furniture-zoom]')).not.toBeNull();
    await click('[data-zoom-board="0"]');
    await click('[data-zoom-backdrop]');
    expect(q('[data-shelf-board]')).toBeNull();
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('open');
  });
  it('second zoom : retour Android → vue de face, le zoom reste et garde son entrée d’historique', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    const push = vi.spyOn(history, 'pushState');
    await click('[data-furniture="shelf"]');
    await advance(500);
    await click('[data-zoom-board="0"]');
    await act(async () => { history.replaceState(null, ''); window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    expect(q('[data-shelf-board]')).toBeNull();
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('open');
    expect(typeof history.state?.wmtZoom).toBe('string');
    expect(push).toHaveBeenCalledTimes(2);
  });
  it('bibliothèques liées : toucher la vide ouvre les deux', async () => {
    await seed([{ id: 'a', kind: 'shelf', col: 0, row: 6 }, { id: 'b', kind: 'shelf', col: 4, row: 6 }, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 'b', level: 0, order: 0, slug: 'Daft_Punk' }]);
    await click('[data-id="a"]');
    expect(container.querySelectorAll('[data-zoom-piece]')).toHaveLength(2);
  });
  it('bibliothèques liées : toucher une tablette de la seconde ouvre le second zoom des deux', async () => {
    await seed([{ id: 'a', kind: 'shelf', col: 0, row: 6 }, { id: 'b', kind: 'shelf', col: 4, row: 6 }, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 'b', level: 0, order: 0, slug: 'Daft_Punk' }]);
    vi.useFakeTimers();
    await click('[data-id="a"]');
    await advance(500);
    await click('[data-zoom-piece="b"] [data-zoom-board="1"]');
    expect(q('[data-shelf-board="1"]')).not.toBeNull();
    expect([...container.querySelectorAll('[data-board-shelf]')].map((e) => e.getAttribute('data-board-shelf'))).toEqual(['a', 'b']);
  });
});

describe('bibliothèques liées (Aménager)', () => {
  const PAIR: Layout = [{ id: 'a', kind: 'shelf', col: 0, row: 6 }, { id: 'b', kind: 'shelf', col: 4, row: 6 }];
  it('⛓ seulement avec une voisine collée ; délier puis relier', async () => {
    await seed([{ id: 'a', kind: 'shelf', col: 0, row: 6 }]);
    await click('[data-action="edit"]');
    await click('[data-id="a"]');
    expect(q('[data-action="shelf-link"]')).toBeNull();
    await seed(PAIR);
    expect(q('[data-action="shelf-link"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-outline="linked"]')).not.toBeNull();
    await click('[data-action="shelf-link"]');
    expect(repo.current()!.rooms[0]!.layout.find((p) => p.id === 'a')).toMatchObject({ unlinked: true });
    expect(q('[data-action="shelf-link"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(q('[data-outline="linked"]')).toBeNull();
    await click('[data-action="shelf-link"]');
    expect(repo.current()!.rooms[0]!.layout.some((p) => 'unlinked' in p)).toBe(false);
  });
});
