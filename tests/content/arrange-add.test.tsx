// @vitest-environment jsdom
// Ajout d'une carte à l'endroit exact (＋) : réglette 🃏 des cartes pas encore dans la pièce, carte en attente (halo doré) à la première
// place libre, glissée à l'endroit exact, ✓ la pose (une fois), ✕ annule ; parcours du tiroir « Ajouter une carte » → meuble → vue ＋.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { activeRoom, addRoom, setActive, updateLayout } from '../../src/core/library/library-book';
import { topToScreen } from '../../src/core/library/arrange';
import type { Layout } from '../../src/core/library/library-types';
import { firstFreeTopSpot } from '../../src/core/library/surface';
import { boardItems, moveToBoard, poseCard, storeCard } from '../../src/core/library/room-grid';
import { PENDING_ID, usePendingCard } from '../../src/content/arrange/use-pending-card';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { ArrangeView, arrangeFrameFor } from '../../src/content/arrange/ArrangeView';
import { ArrangeShelf, wholeBoardPx, wholeFrameFor } from '../../src/content/arrange/ArrangeShelf';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);
const all = (selector: string) => Array.from(container.querySelectorAll(selector));
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
// jsdom n'a pas PointerEvent : un MouseEvent du même type, auquel on accroche le `pointerId`.
const pointer = (type: string, target: EventTarget, x: number, y: number, pointerId = 1) =>
  act(async () => {
    const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
    target.dispatchEvent(ev);
  });

const KNOWN = [
  { slug: 'Paris', title: 'Paris' },
  { slug: 'Kiki', title: 'Kiki' },
  { slug: 'Daft_Punk', title: 'Daft Punk' },
];
// Bureau avec écran et un CD déjà posé (Kiki) devant à gauche.
const DESK: Layout = [
  { id: 'd', kind: 'desk', col: 12, row: 10 },
  { id: 'pc', kind: 'computer', deskId: 'd' },
  { id: 'k', kind: 'posed', shape: 'cd', hostId: 'd', x: 2, z: 2, slug: 'Kiki' },
];
// Deux bibliothèques liées : s porte 3 CD en haut, t est vide.
const SHELVES: Layout = [
  { id: 's', kind: 'shelf', col: 0, row: 6 }, { id: 't', kind: 'shelf', col: 4, row: 6 },
  { id: 'c1', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'A' },
  { id: 'c2', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 1, slug: 'B' },
  { id: 'c3', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 2, slug: 'C' },
];
const LAYER = { w: 800, h: 400 };

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.assign(window, { innerWidth: 800, innerHeight: 400 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

const strip = () => all('[data-card-strip] [data-strip-card]').map((e) => e.getAttribute('data-strip-card'));

describe('＋ sur un bureau (ArrangeView en mode ajout)', () => {
  const frame = arrangeFrameFor('desk', LAYER);
  const delta = (x0: number, z0: number, x1: number, z1: number): [number, number] => {
    const a = topToScreen(frame, x0, z0);
    const b = topToScreen(frame, x1, z1);
    return [b[0] - a[0], b[1] - a[1]];
  };
  const mount = () => {
    const h = { onAdd: vi.fn(), onMove: vi.fn(), onClose: vi.fn() };
    act(() => root.render(
      <ArrangeView layout={DESK} room={{ style: 'scandinave' }} hostId="d" mode="add" onMove={h.onMove} onClose={h.onClose}
        add={{ cards: KNOWN, categoryOf: () => 'music', onAdd: h.onAdd }} />,
    ));
    return h;
  };

  it('la réglette montre les cartes pas encore dans la pièce, sans carte en attente ni ✕', () => {
    mount();
    expect(q('[data-arrange-view]')?.getAttribute('data-arrange-mode')).toBe('add');
    expect(strip()).toEqual(['Daft_Punk', 'Paris']);
    expect(q('[data-pending]')).toBeNull();
    expect(q('[data-action="arrange-cancel"]')).toBeNull();
    const btn = q('[data-strip-card="Paris"]')!;
    expect(btn.getAttribute('aria-label')).toBe('Paris');
    expect(btn.getAttribute('title')).toBe('Paris');
  });

  it('toucher une carte : en attente (halo doré) à la première place libre ; une autre carte la remplace', async () => {
    mount();
    await click('[data-strip-card="Paris"]');
    const spot = firstFreeTopSpot(DESK, 'd', { shape: 'cd' })!;
    expect(all('[data-pending]')).toHaveLength(1);
    expect(q('[data-pending]')?.getAttribute('data-pending')).toBe('Paris');
    expect(q('[data-pending]')?.getAttribute('data-at')).toBe(`${spot.x},${spot.z}`);
    expect(q('[data-pending-halo]')).not.toBeNull();
    expect(q('[data-action="arrange-cancel"]')).not.toBeNull();
    await click('[data-strip-card="Daft_Punk"]');
    expect(all('[data-pending]')).toHaveLength(1);
    expect(q('[data-pending]')?.getAttribute('data-pending')).toBe('Daft_Punk');
    expect(q('[data-strip-card="Daft_Punk"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('glisser la carte en attente puis ✓ : onAdd une fois, à l’endroit exact ; rien n’est écrit pendant le glissé', async () => {
    const h = mount();
    await click('[data-strip-card="Daft_Punk"]');
    const spot = firstFreeTopSpot(DESK, 'd', { shape: 'cd' })!;
    const [dx, dy] = delta(spot.x, spot.z, 90, 12);
    await pointer('pointerdown', q('[data-pending]')!, 300, 200);
    await pointer('pointermove', window, 300 + dx / 2, 200 + dy / 2);
    await pointer('pointermove', window, 300 + dx, 200 + dy);
    expect(q('[data-footprint]')?.getAttribute('data-ok')).toBe('true');
    await pointer('pointerup', window, 300 + dx, 200 + dy);
    await settle();
    expect(h.onMove).not.toHaveBeenCalled();
    expect(h.onAdd).not.toHaveBeenCalled();
    expect(q('[data-pending]')?.getAttribute('data-at')).toBe('90,12');
    expect(q('[data-action="arrange-done"]')?.getAttribute('aria-label')).toBe('Poser la carte');
    await click('[data-action="arrange-done"]');
    expect(h.onAdd).toHaveBeenCalledTimes(1);
    expect(h.onAdd).toHaveBeenCalledWith({ slug: 'Daft_Punk', shape: 'cd' }, { hostId: 'd', x: 90, z: 12 });
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it('✕ annule l’ajout : plus de carte en attente, ✓ ferme sans rien poser', async () => {
    const h = mount();
    await click('[data-strip-card="Paris"]');
    await click('[data-action="arrange-cancel"]');
    expect(q('[data-pending]')).toBeNull();
    expect(q('[data-action="arrange-cancel"]')).toBeNull();
    await click('[data-action="arrange-done"]');
    expect(h.onAdd).not.toHaveBeenCalled();
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('✓ refusé : la carte reste en attente, à sa place', () => {
  const frame = arrangeFrameFor('desk', LAYER);
  const delta = (x0: number, z0: number, x1: number, z1: number): [number, number] => {
    const a = topToScreen(frame, x0, z0);
    const b = topToScreen(frame, x1, z1);
    return [b[0] - a[0], b[1] - a[1]];
  };
  const spot = firstFreeTopSpot(DESK, 'd', { shape: 'cd' })!;
  type OnAdd = (...args: unknown[]) => Promise<unknown> | void;
  const render = (layout: Layout, add: { cards: typeof KNOWN; categoryOf: () => 'music'; onAdd: OnAdd }, onClose = vi.fn()) =>
    act(() => root.render(<ArrangeView layout={layout} room={{ style: 'scandinave' }} hostId="d" mode="add" onMove={vi.fn()} onClose={onClose} add={add} />));

  it('écriture rejetée : la carte reste en attente au même endroit, avec le message', async () => {
    const add = { cards: KNOWN, categoryOf: () => 'music' as const, onAdd: vi.fn(() => Promise.reject(new Error('refusé'))) };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(DESK, add);
    await click('[data-strip-card="Paris"]');
    await click('[data-action="arrange-done"]');
    await settle();
    expect(add.onAdd).toHaveBeenCalledTimes(1);
    expect(q('[data-pending]')?.getAttribute('data-at')).toBe(`${spot.x},${spot.z}`);
    expect(q('[data-arrange-note]')?.textContent).toBe('Impossible de poser la carte ici.');
  });

  it('écriture lancée en exception : même chose, rien n’est avalé en silence', async () => {
    const add = { cards: KNOWN, categoryOf: () => 'music' as const, onAdd: vi.fn(() => { throw new Error('boum'); }) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(DESK, add);
    await click('[data-strip-card="Paris"]');
    await click('[data-action="arrange-done"]');
    expect(q('[data-pending]')?.getAttribute('data-at')).toBe(`${spot.x},${spot.z}`);
    expect(q('[data-arrange-note]')?.textContent).toBe('Impossible de poser la carte ici.');
    expect(warn).toHaveBeenCalled();
  });

  it('écriture tenue mais disposition inchangée (pose refusée) : la carte reste en attente, avec le message', async () => {
    const add = { cards: KNOWN, categoryOf: () => 'music' as const, onAdd: vi.fn(() => Promise.resolve()) };
    render(DESK, add);
    await click('[data-strip-card="Paris"]');
    await click('[data-action="arrange-done"]');
    await settle();
    expect(q('[data-pending]')?.getAttribute('data-at')).toBe(`${spot.x},${spot.z}`);
    expect(q('[data-arrange-note]')?.textContent).toBe('Impossible de poser la carte ici.');
  });

  it('la disposition reçue prend sa place : la carte ne bouge pas, rouge + message, ✓ refusé jusqu’à une place verte', async () => {
    const add = { cards: KNOWN, categoryOf: () => 'music' as const, onAdd: vi.fn() };
    const onClose = vi.fn();
    render(DESK, add, onClose);
    await click('[data-strip-card="Paris"]');
    expect(q('[data-pending]')?.getAttribute('data-ok')).toBe('true');
    // Un réveil arrive à cette place (autre appareil, autre vue) : la carte reste là, en rouge.
    const taken: Layout = [...DESK, { id: 'a', kind: 'small', item: 'alarm', hostId: 'd', x: spot.x, z: spot.z }];
    render(taken, add, onClose);
    expect(q('[data-pending]')?.getAttribute('data-at')).toBe(`${spot.x},${spot.z}`);
    expect(q('[data-pending]')?.getAttribute('data-ok')).toBe('false');
    expect(q('[data-pending-halo]')?.getAttribute('data-ok')).toBe('false');
    expect(q('[data-arrange-note]')?.textContent).toBe('Plus de place ici : glissez la carte à une place libre.');
    await click('[data-action="arrange-done"]');
    expect(add.onAdd).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Glissée à une place libre : verte, ✓ la pose là.
    const [dx, dy] = delta(spot.x, spot.z, 90, 12);
    await pointer('pointerdown', q('[data-pending]')!, 300, 200);
    await pointer('pointermove', window, 300 + dx / 2, 200 + dy / 2);
    await pointer('pointermove', window, 300 + dx, 200 + dy);
    await pointer('pointerup', window, 300 + dx, 200 + dy);
    await settle();
    expect(q('[data-pending]')?.getAttribute('data-ok')).toBe('true');
    expect(q('[data-arrange-note]')).toBeNull();
    await click('[data-action="arrange-done"]');
    expect(add.onAdd).toHaveBeenCalledWith({ slug: 'Paris', shape: 'cd' }, { hostId: 'd', x: 90, z: 12 });
  });
});

describe('＋ sur une étagère (ArrangeShelf en mode ajout)', () => {
  const mount = () => {
    const h = { onAdd: vi.fn(), onBoard: vi.fn(), onTop: vi.fn(), onLevel: vi.fn(), onClose: vi.fn() };
    act(() => root.render(
      <ArrangeShelf layout={SHELVES} room={{ style: 'scandinave' }} shelfIds={['s', 't']} level="whole" mode="add"
        add={{ cards: KNOWN, categoryOf: () => 'music', onAdd: h.onAdd }}
        onLevel={h.onLevel} onBoard={h.onBoard} onTop={h.onTop} onClose={h.onClose} />,
    ));
    return h;
  };

  it('toucher une carte : en attente sur la première tablette libre (à la suite) ; glisser puis ✓ : onAdd sur la tablette visée', async () => {
    const h = mount();
    expect(q('[data-card-strip]')).not.toBeNull();
    await click('[data-strip-card="Paris"]');
    expect(q('[data-pending]')?.getAttribute('data-pending')).toBe('Paris');
    expect(q('[data-pending]')?.getAttribute('data-at')).toBe('s:0:3');
    const f = wholeFrameFor(['s', 't'], SHELVES, LAYER);
    const [x0, y0] = wholeBoardPx(f, 0, 0, 52);
    const [x1, y1] = wholeBoardPx(f, 1, 2, 10);
    await pointer('pointerdown', q('[data-pending]')!, x0, y0);
    await pointer('pointermove', window, x1, y1);
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('true');
    await pointer('pointerup', window, x1, y1);
    await settle();
    expect(h.onBoard).not.toHaveBeenCalled();
    expect(q('[data-pending]')?.getAttribute('data-at')).toBe('t:2:0');
    await click('[data-action="arrange-done"]');
    expect(h.onAdd).toHaveBeenCalledTimes(1);
    expect(h.onAdd).toHaveBeenCalledWith({ slug: 'Paris', shape: 'cd' }, { shelfId: 't', level: 2, order: 0 });
  });
});

describe('LibraryPanel : ＋ et tiroir « Ajouter une carte »', () => {
  const fakeCollection = { list: async () => KNOWN, subscribe: () => () => undefined } as unknown as CollectionRepo;
  let repo: LibraryRepo;
  const seed = async (layout: Layout) => {
    repo = createLibraryRepo(createMemoryStore());
    await act(async () => { root.render(<LibraryPanel library={repo} collection={fakeCollection} />); });
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => layout)); });
    await settle();
  };
  const layoutNow = () => activeRoom(repo.current()!).layout;

  it('＋ « Ajouter une carte ici » dans la bulle d’un bureau et d’une étagère ouvre la vue ＋ avec la réglette', async () => {
    await seed([...DESK, { id: 's', kind: 'shelf', col: 0, row: 6 }]);
    await click('[data-action="edit"]');
    await click('[data-furniture="desk"]');
    const btn = q('[data-action-bubble] [data-action="arrange-add"]');
    expect(btn?.getAttribute('aria-label')).toBe('Ajouter une carte ici');
    expect(btn?.textContent).toContain('＋');
    await click('[data-action="arrange-add"]');
    expect(q('[data-arrange-view]')?.getAttribute('data-arrange-mode')).toBe('add');
    expect(strip()).toEqual(['Daft_Punk', 'Paris']);
    await click('[data-action="arrange-done"]');
    expect(q('[data-arrange-view]')).toBeNull();
    await click('[data-furniture="shelf"]');
    await click('[data-action="arrange-add"]');
    expect(q('[data-arrange-shelf]')?.getAttribute('data-arrange-mode')).toBe('add');
    expect(q('[data-card-strip]')).not.toBeNull();
  });

  it('tiroir : carte → « Poser sur un meuble » → forme → toucher le bureau → vue ＋ avec la carte en attente ; ✓ la pose', async () => {
    await seed(DESK);
    await click('[data-action="edit"]');
    await click('[data-action="add-card"]');
    await click('[data-card-option="Paris"]');
    expect(q('[data-target="shelf"]')?.getAttribute('aria-label')).toBe('Poser sur un meuble');
    await click('[data-target="shelf"]');
    await click('[data-shape="cd"]');
    expect(q('[data-arrange-view]')).toBeNull();
    await click('[data-furniture="desk"]');
    expect(q('[data-arrange-view]')?.getAttribute('data-arrange-mode')).toBe('add');
    expect(q('[data-pending]')?.getAttribute('data-pending')).toBe('Paris');
    await click('[data-action="arrange-done"]');
    await settle();
    const spot = firstFreeTopSpot(DESK, 'd', { shape: 'cd' })!;
    expect(layoutNow().find((p) => p.kind === 'posed' && p.slug === 'Paris')).toMatchObject({ hostId: 'd', x: spot.x, z: spot.z, shape: 'cd' });
    // La carte posée n'est plus dans la réglette, ni en attente ; la vue reste ouverte : on en ajoute une seconde.
    expect(strip()).toEqual(['Daft_Punk']);
    expect(q('[data-pending]')).toBeNull();
    expect(q('[data-arrange-view]')).not.toBeNull();
    await click('[data-strip-card="Daft_Punk"]');
    expect(q('[data-pending]')?.getAttribute('data-pending')).toBe('Daft_Punk');
    await click('[data-action="arrange-done"]');
    await settle();
    expect(layoutNow().filter((p) => p.kind === 'posed').map((p) => (p as { slug: string }).slug).sort()).toEqual(['Daft_Punk', 'Kiki', 'Paris']);
    expect(strip()).toEqual([]);
    // ✓ sans carte en attente : la vue se ferme.
    await click('[data-action="arrange-done"]');
    expect(q('[data-arrange-view]')).toBeNull();
  });

  it('choix du meuble : ✕ « Annuler » ou Échap y renoncent (aucune vue ne s’ouvre ensuite)', async () => {
    await seed(DESK);
    await click('[data-action="edit"]');
    const choose = async () => {
      await click('[data-action="add-card"]');
      await click('[data-card-option="Paris"]');
      await click('[data-target="shelf"]');
      await click('[data-shape="cd"]');
      expect(q('[data-pick-host]')).not.toBeNull();
    };
    await choose();
    const cancel = q('[data-action="cancel-card"]')!;
    expect(cancel.getAttribute('aria-label')).toBe('Annuler');
    expect(cancel.getAttribute('title')).toBe('Annuler');
    expect(cancel.textContent).toContain('✕');
    await click('[data-action="cancel-card"]');
    expect(q('[data-pick-host]')).toBeNull();
    await click('[data-furniture="desk"]');
    expect(q('[data-arrange-view]')).toBeNull();
    await choose();
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await settle();
    expect(q('[data-pick-host]')).toBeNull();
    await click('[data-furniture="desk"]');
    expect(q('[data-arrange-view]')).toBeNull();
  });

  it('choix du meuble puis changement de pièce : la carte du tiroir est oubliée (retour à la pièce : rien ne s’ouvre)', async () => {
    await seed(DESK);
    await click('[data-action="edit"]');
    await click('[data-action="add-card"]');
    await click('[data-card-option="Paris"]');
    await click('[data-target="shelf"]');
    await click('[data-shape="cd"]');
    expect(q('[data-pick-host]')).not.toBeNull();
    await act(async () => { await repo.update(addRoom); });
    await settle();
    expect(q('[data-pick-host]')).toBeNull();
    await act(async () => { await repo.update((st) => setActive(st, 'r1')); });
    await settle();
    await click('[data-furniture="desk"]');
    expect(q('[data-arrange-view]')).toBeNull();
  });
});

describe('carte du tiroir qui ne tient pas : la vue ＋ le dit', () => {
  const open = (layout: Layout, initial: { slug: string; shape: 'cd' }) =>
    act(() => root.render(<ArrangeView layout={layout} room={{ style: 'scandinave' }} hostId="d" mode="add" onMove={vi.fn()} onClose={vi.fn()}
      add={{ cards: KNOWN, categoryOf: () => 'music', initial, onAdd: vi.fn() }} />));

  it('bureau plein : aucune carte en attente, « Plus de place sur ce meuble. »', () => {
    let full: Layout = DESK;
    for (let i = 0; ; i++) {
      const spot = firstFreeTopSpot(full, 'd', { shape: 'cd' });
      if (!spot) break;
      full = poseCard(full, 'd', 'cd', `F${i}`, `f${i}`, spot.x, spot.z)!;
    }
    open(full, { slug: 'Paris', shape: 'cd' });
    expect(q('[data-pending]')).toBeNull();
    expect(q('[data-arrange-note]')?.textContent).toBe('Plus de place sur ce meuble.');
  });

  it('carte déjà dans la pièce : aucune carte en attente, « Cette carte est déjà dans la pièce. »', () => {
    open(DESK, { slug: 'Kiki', shape: 'cd' });
    expect(q('[data-pending]')).toBeNull();
    expect(q('[data-arrange-note]')?.textContent).toBe('Cette carte est déjà dans la pièce.');
  });
});

describe('carte en attente sur une tablette : les autres objets bougent, elle garde sa place', () => {
  type Hook = ReturnType<typeof usePendingCard>;
  type Wrapped = ReturnType<Hook['wrap']>;
  // L'appelant applique l'intention à la disposition reçue (sans la carte en attente), puis la vue est redessinée avec elle.
  const mountHook = () => {
    const got: { pend: Hook | null; moves: Wrapped | null } = { pend: null, moves: null };
    let real: Layout = SHELVES;
    const onBoard = vi.fn((id: string, shelfId: string, level: 0 | 1 | 2, order: number) => {
      real = moveToBoard(real, id, shelfId, level, order)!;
      draw();
    });
    function Harness({ layout }: { layout: Layout }) {
      const pend = usePendingCard({ layout, ids: ['s'], add: { cards: KNOWN, categoryOf: () => 'music', onAdd: vi.fn() }, enabled: true });
      got.pend = pend;
      got.moves = pend.wrap({ onBoard, onTop: vi.fn() });
      return null;
    }
    const draw = () => root.render(<Harness layout={real} />);
    act(draw);
    // Rangs dessinés de la tablette 0.
    const board0 = (l: Layout = got.pend!.view) => boardItems(l, 's', 0).map((p) => p.id);
    return { got, onBoard, board0 };
  };

  it('A P B C, C lâchée entre A et P : A C P B, avant comme après l’écriture', async () => {
    const { got, onBoard, board0 } = mountHook();
    act(() => got.pend!.pick('Paris'));
    await act(async () => { await got.moves!.onBoard(PENDING_ID, 's', 0, 1); });
    expect(board0()).toEqual(['c1', PENDING_ID, 'c2', 'c3']);
    // Rang lu sur la disposition dessinée (sans C) : 1 = entre A et P. Avant l'écriture, l'objet lâché est dessiné à sa place visée.
    const view = got.pend!.view;
    act(() => { void got.moves!.onBoard('c3', 's', 0, 1); });
    expect(onBoard).toHaveBeenCalledWith('c3', 's', 0, 1);
    expect(board0()).toEqual(['c1', 'c3', PENDING_ID, 'c2']);
    expect(board0(moveToBoard(view, 'c3', 's', 0, 1)!)).toEqual(['c1', 'c3', PENDING_ID, 'c2']);
  });

  it('A P B C, B lâchée avant A : l’appelant reçoit le rang sans la carte en attente', async () => {
    const { got, onBoard, board0 } = mountHook();
    act(() => got.pend!.pick('Paris'));
    await act(async () => { await got.moves!.onBoard(PENDING_ID, 's', 0, 1); });
    // Rang dessiné de B après le déplacement : 0 → B A P C.
    act(() => { void got.moves!.onBoard('c2', 's', 0, 0); });
    expect(onBoard).toHaveBeenCalledWith('c2', 's', 0, 0);
    expect(board0()).toEqual(['c2', 'c1', PENDING_ID, 'c3']);
  });

  it('A P B C, C lâchée après B (P avant la cible) : rang envoyé diminué de un, A P B C inchangé autour de P', async () => {
    const { got, onBoard, board0 } = mountHook();
    act(() => got.pend!.pick('Paris'));
    await act(async () => { await got.moves!.onBoard(PENDING_ID, 's', 0, 1); });
    // A P B C, C reprise et lâchée juste avant B : dessiné A P C B (rang 2 en comptant P), demandé au rang 1 (A C B).
    act(() => { void got.moves!.onBoard('c3', 's', 0, 2); });
    expect(onBoard).toHaveBeenCalledWith('c3', 's', 0, 1);
    expect(board0()).toEqual(['c1', PENDING_ID, 'c3', 'c2']);
  });

  it('A B P C, A part sur une autre tablette : B P C, avant comme après l’écriture', async () => {
    const { got, onBoard, board0 } = mountHook();
    act(() => got.pend!.pick('Paris'));
    await act(async () => { await got.moves!.onBoard(PENDING_ID, 's', 0, 2); });
    expect(board0()).toEqual(['c1', 'c2', PENDING_ID, 'c3']);
    const view = got.pend!.view;
    act(() => { void got.moves!.onBoard('c1', 's', 1, 0); });
    expect(onBoard).toHaveBeenCalledWith('c1', 's', 1, 0);
    expect(board0()).toEqual(['c2', PENDING_ID, 'c3']);
    expect(board0(moveToBoard(view, 'c1', 's', 1, 0)!)).toEqual(['c2', PENDING_ID, 'c3']);
  });
});

describe('tablette : la disposition reçue remplit la place de la carte en attente', () => {
  it('elle ne bouge pas : rouge + message, ✓ refusé', async () => {
    const h = { onAdd: vi.fn(), onBoard: vi.fn(), onTop: vi.fn(), onLevel: vi.fn(), onClose: vi.fn() };
    const draw = (layout: Layout) => act(() => root.render(
      <ArrangeShelf layout={layout} room={{ style: 'scandinave' }} shelfIds={['s', 't']} level="whole" mode="add"
        add={{ cards: KNOWN, categoryOf: () => 'music', onAdd: h.onAdd }}
        onLevel={h.onLevel} onBoard={h.onBoard} onTop={h.onTop} onClose={h.onClose} />,
    ));
    draw(SHELVES);
    await click('[data-strip-card="Paris"]');
    expect(q('[data-pending]')?.getAttribute('data-at')).toBe('s:0:3');
    expect(q('[data-pending]')?.getAttribute('data-ok')).toBe('true');
    // D'autres CD arrivent sur la tablette 0 jusqu'à la remplir.
    let full: Layout = SHELVES;
    for (let i = 0; ; i++) {
      const next = storeCard(full, 's', 0, 99, 'cd', `F${i}`, `f${i}`);
      if (!next) break;
      full = next;
    }
    draw(full);
    expect(q('[data-pending]')?.getAttribute('data-at')).toBe('s:0:3');
    expect(q('[data-pending]')?.getAttribute('data-ok')).toBe('false');
    expect(q('[data-pending-halo]')?.getAttribute('stroke')).toBe('#C8443A');
    expect(q('[data-arrange-note]')?.textContent).toBe('Plus de place ici : glissez la carte à une place libre.');
    await click('[data-action="arrange-done"]');
    expect(h.onAdd).not.toHaveBeenCalled();
    expect(h.onClose).not.toHaveBeenCalled();
  });
});
