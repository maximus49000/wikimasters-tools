// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { activeRoom, updateLayout } from '../../src/core/library/library-book';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { RoomView } from '../../src/content/RoomView';
import type { ImageService } from '../../src/core/images/image-service';
import { setImageService } from '../../src/content/image-registry';
import type { Layout, Room } from '../../src/core/library/library-types';
import { pxRect, shelfSlots } from '../../src/core/library/room-grid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1', name: 'Pièce 1', style: 'scandinave', orientation: 'landscape', cols: 24,
  layout: [
    { id: 'f1', kind: 'shelf', col: 0, row: 7 },
    { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'Daft_Punk' },
    { id: 'f3', kind: 'wall', shape: 'poster', col: 10, row: 4, slug: 'Paris' },
    { id: 'f4', kind: 'wall', shape: 'vinyl', col: 14, row: 4, slug: 'Inconnue' },
  ],
};

function mount(onCardTap = vi.fn()) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined}
        cards={{ Daft_Punk: { title: 'Daft Punk' }, Paris: { title: 'Paris' } }} onCardTap={onCardTap} />,
    );
  });
  return { container, onCardTap };
}

describe('cartes dans la pièce', () => {
  it('dessine les objets rangés et accrochés', () => {
    const { container } = mount();
    expect(container.querySelector('[data-card="Daft_Punk"]')).not.toBeNull();
    expect(container.querySelector('[data-card="Paris"]')).not.toBeNull();
  });

  it('grise une carte inconnue', () => {
    const { container } = mount();
    expect(container.querySelector('[data-card="Inconnue"]')?.getAttribute('data-missing')).toBe('true');
  });

  it('un toucher signale l’objet', () => {
    const { container, onCardTap } = mount();
    act(() => { container.querySelector('[data-card="Paris"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onCardTap).toHaveBeenCalledWith('f3');
  });
});

describe('étagère soulevée', () => {
  it('les objets rangés suivent leur étagère soulevée', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <RoomView room={room} editing cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined}
          drag={{ id: 'f1', x: 300, y: 200, ok: true, ghost: null }} cards={{ Daft_Punk: { title: 'Daft Punk' }, Paris: { title: 'Paris' } }} />,
      );
    });
    const card = container.querySelector('[data-card="Daft_Punk"]')!;
    expect(card.getAttribute('opacity')).toBe('0.3');
    expect(card.parentElement!.querySelector('g[transform*="scale(1.08)"]')).not.toBeNull();
    // un objet mural, lui, ne bouge pas
    expect(container.querySelector('[data-card="Paris"]')!.getAttribute('opacity')).toBe('1');
  });
});

describe('dessin détaillé', () => {
  const full: Room = {
    ...room,
    layout: [
      { id: 'f1', kind: 'shelf', col: 0, row: 7 },
      { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'Daft_Punk' },
      { id: 'f3', kind: 'wall', shape: 'poster', col: 10, row: 4, slug: 'Paris' },
      { id: 'd1', kind: 'desk', col: 14, row: 11 },
      { id: 'c1', kind: 'computer', deskId: 'd1', slug: 'Paris' },
    ],
  };
  const cards = { Daft_Punk: { title: 'Daft Punk' }, Paris: { title: 'Paris', imageUrl: 'own.png' } };
  const render = (editing: boolean, selectedId: string | null = null) => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<RoomView room={full} editing={editing} cellsActive={false} selectedId={selectedId} blink={[]} onCell={() => undefined} onPick={() => undefined} cards={cards} />);
    });
    return container;
  };

  it('ne dessine en pointillés que les emplacements vides', () => {
    const c = render(true);
    expect(c.querySelectorAll('rect[stroke-dasharray="3 3"]').length).toBe(14);
  });

  it('l’écran d’un ordinateur affichant une carte est touchable', () => {
    expect(render(false).querySelector('[data-screen="c1"]')).not.toBeNull();
  });

  it('contourne l’objet sélectionné en mode Aménager', () => {
    const c = render(true, 'f3');
    expect(c.querySelector('[data-id="f3"] rect[stroke-dasharray="6 4"]')).not.toBeNull();
    expect(c.querySelector('[data-id="f2"] rect[stroke-dasharray="6 4"]')).toBeNull();
  });

  it('prend l’image du service et se met à jour quand il notifie', () => {
    let url = 'a.png';
    const listeners = new Set<() => void>();
    setImageService({ displayUrl: () => url, subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); } } as unknown as ImageService);
    try {
      const c = render(false);
      expect(c.querySelector('[data-id="f3"] image')?.getAttribute('href')).toBe('a.png');
      url = 'b.png';
      act(() => listeners.forEach((l) => l()));
      expect(c.querySelector('[data-id="f3"] image')?.getAttribute('href')).toBe('b.png');
    } finally {
      setImageService(null);
    }
  });
});

describe('LibraryPanel : cartes', () => {
  const known = [
    { slug: 'Paris', title: 'Paris', imageUrl: 'p.png' },
    { slug: 'Daft_Punk', title: 'Daft Punk' },
  ];
  const fakeCollection = { list: async () => known, subscribe: () => () => undefined } as unknown as CollectionRepo;
  let container: HTMLDivElement;
  let root: Root;
  let repo: LibraryRepo;
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const q = (selector: string) => container.querySelector<HTMLElement | SVGElement>(selector);
  async function click(selector: string) {
    const el = q(selector);
    if (!el) throw new Error(`introuvable : ${selector}`);
    await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await settle();
  }
  const layoutNow = () => activeRoom(repo.current()!).layout;
  async function seed(layout: Layout) {
    await repo.update((state) => updateLayout(state, 'r1', () => layout));
    await settle();
  }
  async function mountPanel(onOpenCard?: (slug: string) => void) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    repo = createLibraryRepo(createMemoryStore());
    await act(async () => { root.render(<LibraryPanel library={repo} collection={fakeCollection} onOpenCard={onOpenCard} />); });
    await settle();
  }
  async function pickCard(slug: string) {
    await click('[data-action="add-card"]');
    await click(`[data-card-option="${slug}"]`);
  }

  beforeEach(async () => { await mountPanel(); });
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => root.unmount());
    container.remove();
  });

  it('accroche une carte au mur', async () => {
    await click('[data-action="edit"]');
    await pickCard('Paris');
    await click('[data-target="wall"]');
    await click('[data-shape="poster"]');
    await click('[data-cell="5-9"]');
    expect(layoutNow().find((p) => p.kind === 'wall')).toMatchObject({ slug: 'Paris', shape: 'poster' });
  });

  it('range une carte sur une étagère à l’emplacement 0', async () => {
    await seed([{ id: 'f1', kind: 'shelf', col: 0, row: 7 }]);
    await click('[data-action="edit"]');
    await pickCard('Paris');
    await click('[data-target="shelf"]');
    await click('[data-shape="cd"]');
    await click('[data-furniture="shelf"]');
    expect(layoutNow().find((p) => p.kind === 'stored')).toMatchObject({ slug: 'Paris', slot: 0, shelfId: 'f1' });
  });

  it('toucher une carte déjà rangée pendant la pose sur une étagère vise son étagère', async () => {
    await seed([{ id: 'f1', kind: 'shelf', col: 0, row: 7 }, { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'Daft_Punk' }]);
    await click('[data-action="edit"]');
    await pickCard('Paris');
    await click('[data-target="shelf"]');
    await click('[data-shape="cd"]');
    await click('[data-card="Daft_Punk"]');
    expect(layoutNow().find((p) => p.kind === 'stored' && p.slug === 'Paris')).toMatchObject({ shelfId: 'f1', slot: 1 });
  });

  it('affiche une carte sur l’écran d’un ordinateur, et refuse un autre meuble', async () => {
    await seed([{ id: 'd1', kind: 'desk', col: 2, row: 13 }, { id: 'c1', kind: 'computer', deskId: 'd1' }]);
    await click('[data-action="edit"]');
    await pickCard('Paris');
    await click('[data-target="screen"]');
    await click('[data-furniture="desk"]');
    expect(q('[role="status"]')?.textContent).toContain('Choisissez un ordinateur.');
    await click('[data-furniture="computer"]');
    expect(layoutNow().find((p) => p.kind === 'computer')).toMatchObject({ slug: 'Paris' });
  });

  it('en Visiter, toucher une carte l’ouvre ; une carte inconnue ne fait rien', async () => {
    act(() => root.unmount());
    container.remove();
    const onOpenCard = vi.fn();
    await mountPanel(onOpenCard);
    await seed([
      { id: 'f1', kind: 'wall', shape: 'poster', col: 4, row: 4, slug: 'Paris' },
      { id: 'f2', kind: 'wall', shape: 'poster', col: 10, row: 4, slug: 'Inconnue' },
    ]);
    await click('[data-card="Paris"]');
    expect(onOpenCard).toHaveBeenCalledWith('Paris');
    await click('[data-card="Inconnue"]');
    expect(onOpenCard).toHaveBeenCalledTimes(1);
  });

  it('retire un objet, et demande confirmation pour une étagère garnie', async () => {
    await seed([
      { id: 'f1', kind: 'wall', shape: 'poster', col: 4, row: 4, slug: 'Paris' },
      { id: 'f2', kind: 'shelf', col: 12, row: 7 },
      { id: 'f3', kind: 'stored', shape: 'cd', shelfId: 'f2', slot: 0, slug: 'Daft_Punk' },
    ]);
    await click('[data-action="edit"]');
    await click('[data-card="Paris"]');
    await click('[data-action="remove"]');
    expect(layoutNow().some((p) => p.kind === 'wall')).toBe(false);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click('[data-furniture="shelf"]');
    await click('[data-action="remove"]');
    expect(confirm).toHaveBeenCalledWith('Retirer aussi ce qui est posé dessus ?');
    expect(layoutNow().length).toBe(2);
    confirm.mockReturnValue(true);
    await click('[data-action="remove"]');
    expect(layoutNow().length).toBe(0);
  });

  it('grise dans le sélecteur une carte déjà posée', async () => {
    await seed([{ id: 'f1', kind: 'wall', shape: 'poster', col: 4, row: 4, slug: 'Paris' }]);
    await click('[data-action="edit"]');
    await click('[data-action="add-card"]');
    expect(q('[data-card-option="Paris"]')?.hasAttribute('disabled')).toBe(true);
    expect(q('[data-card-option="Daft_Punk"]')?.hasAttribute('disabled')).toBe(false);
  });

  // Un pixel d'écran = une unité du dessin (24 colonnes de 30, hauteur 510).
  function stubSvgRect() {
    const svg = q('svg[role="img"]') as unknown as SVGElement;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: 720, bottom: 510, width: 720, height: 510, x: 0, y: 0, toJSON: () => ({}) });
  }
  const pointer = (type: string, target: EventTarget, x: number, y: number) =>
    act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })); });
  async function longPress(selector: string, x: number, y: number) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await pointer('pointerdown', q(selector)!, x, y);
    await act(async () => { vi.advanceTimersByTime(500); });
    vi.useRealTimers();
  }
  const slotCenter = (i: number) => {
    const s = shelfSlots(pxRect({ col: 0, row: 7, w: 6, h: 8 }))[i]!;
    return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  };
  const shelfLayout: Layout = [
    { id: 'f1', kind: 'shelf', col: 0, row: 7 },
    { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'Daft_Punk' },
  ];

  it('un appui long sur un objet accroché le déplace sur le mur', async () => {
    await seed([{ id: 'f1', kind: 'wall', shape: 'poster', col: 2, row: 4, slug: 'Paris' }]);
    stubSvgRect();
    await longPress('[data-card="Paris"]', 105, 170);
    expect(q('[data-action="edit"]')?.getAttribute('aria-pressed')).toBe('true');
    await pointer('pointermove', window, 305, 203);
    expect(q('[data-drag-ghost="ok"]')).not.toBeNull();
    await pointer('pointerup', window, 305, 203);
    await settle();
    expect(layoutNow()[0]).toMatchObject({ kind: 'wall', col: 10, row: 4, slug: 'Paris' });
  });

  it('un objet accroché lâché sur le sol reste en place et le dit', async () => {
    await seed([{ id: 'f1', kind: 'wall', shape: 'poster', col: 2, row: 4, slug: 'Paris' }]);
    stubSvgRect();
    await longPress('[data-card="Paris"]', 105, 170);
    await pointer('pointermove', window, 305, 405);
    await pointer('pointerup', window, 305, 405);
    await settle();
    expect(layoutNow()[0]).toMatchObject({ kind: 'wall', col: 2, row: 4 });
    expect(q('[role="status"]')?.textContent).toContain('mur');
  });

  it('un appui long sur un objet rangé le déplace dans un autre emplacement', async () => {
    await seed(shelfLayout);
    stubSvgRect();
    const from = slotCenter(0);
    const to = slotCenter(4);
    await longPress('[data-card="Daft_Punk"]', from.x, from.y);
    await pointer('pointermove', window, to.x, to.y);
    expect(q('[data-drag-ghost="ok"]')).not.toBeNull();
    await pointer('pointerup', window, to.x, to.y);
    await settle();
    expect(layoutNow().find((p) => p.id === 'f2')).toMatchObject({ kind: 'stored', shelfId: 'f1', slot: 4 });
  });

  it('un objet rangé passe sur l’emplacement d’une autre étagère', async () => {
    await seed([...shelfLayout, { id: 'f9', kind: 'shelf', col: 10, row: 7 }]);
    stubSvgRect();
    const from = slotCenter(0);
    const other = shelfSlots(pxRect({ col: 10, row: 7, w: 6, h: 8 }))[3]!;
    await longPress('[data-card="Daft_Punk"]', from.x, from.y);
    await pointer('pointerup', window, other.x + other.w / 2, other.y + other.h / 2);
    await settle();
    expect(layoutNow().find((p) => p.id === 'f2')).toMatchObject({ shelfId: 'f9', slot: 3 });
  });

  it('lâcher un objet sur un emplacement occupé le laisse en place et affiche un message', async () => {
    await seed([...shelfLayout, { id: 'f3', kind: 'stored', shape: 'dvd', shelfId: 'f1', slot: 1, slug: 'Paris' }]);
    stubSvgRect();
    const from = slotCenter(0);
    const to = slotCenter(1);
    await longPress('[data-card="Daft_Punk"]', from.x, from.y);
    await pointer('pointermove', window, to.x, to.y);
    expect(q('[data-drag-ghost="refused"]')).not.toBeNull();
    await pointer('pointerup', window, to.x, to.y);
    await settle();
    expect(layoutNow().find((p) => p.id === 'f2')).toMatchObject({ slot: 0 });
    expect(layoutNow().find((p) => p.id === 'f3')).toMatchObject({ slot: 1 });
    expect(q('[role="status"]')?.textContent).toContain('déjà pris');
  });

  it('un appui long sur un ordinateur qui affiche une carte déplace l’ordinateur et sa carte', async () => {
    await seed([
      { id: 'd1', kind: 'desk', col: 2, row: 11 },
      { id: 'd2', kind: 'desk', col: 12, row: 11 },
      { id: 'c1', kind: 'computer', deskId: 'd1', slug: 'Paris' },
    ]);
    stubSvgRect();
    await longPress('[data-screen="c1"]', 130, 285);
    await pointer('pointermove', window, 400, 385);
    await pointer('pointerup', window, 400, 385);
    await settle();
    expect(layoutNow().find((p) => p.id === 'c1')).toMatchObject({ kind: 'computer', deskId: 'd2', slug: 'Paris' });
  });
});
