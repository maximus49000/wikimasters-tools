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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1', name: 'Pièce 1', style: 'scandinave', orientation: 'landscape', cols: 24,
  layout: [
    { id: 'f1', kind: 'shelf', col: 0, row: 4 },
    { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'Daft_Punk' },
    { id: 'f3', kind: 'wall', shape: 'poster', col: 10, row: 1, slug: 'Paris' },
    { id: 'f4', kind: 'wall', shape: 'vinyl', col: 14, row: 1, slug: 'Inconnue' },
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

describe('dessin détaillé', () => {
  const full: Room = {
    ...room,
    layout: [
      { id: 'f1', kind: 'shelf', col: 0, row: 4 },
      { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'Daft_Punk' },
      { id: 'f3', kind: 'wall', shape: 'poster', col: 10, row: 1, slug: 'Paris' },
      { id: 'd1', kind: 'desk', col: 14, row: 8 },
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
    await click('[data-cell="5-6"]');
    expect(layoutNow().find((p) => p.kind === 'wall')).toMatchObject({ slug: 'Paris', shape: 'poster' });
  });

  it('range une carte sur une étagère à l’emplacement 0', async () => {
    await seed([{ id: 'f1', kind: 'shelf', col: 0, row: 4 }]);
    await click('[data-action="edit"]');
    await pickCard('Paris');
    await click('[data-target="shelf"]');
    await click('[data-shape="cd"]');
    await click('[data-furniture="shelf"]');
    expect(layoutNow().find((p) => p.kind === 'stored')).toMatchObject({ slug: 'Paris', slot: 0, shelfId: 'f1' });
  });

  it('affiche une carte sur l’écran d’un ordinateur, et refuse un autre meuble', async () => {
    await seed([{ id: 'd1', kind: 'desk', col: 2, row: 10 }, { id: 'c1', kind: 'computer', deskId: 'd1' }]);
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
      { id: 'f1', kind: 'wall', shape: 'poster', col: 4, row: 1, slug: 'Paris' },
      { id: 'f2', kind: 'wall', shape: 'poster', col: 10, row: 1, slug: 'Inconnue' },
    ]);
    await click('[data-card="Paris"]');
    expect(onOpenCard).toHaveBeenCalledWith('Paris');
    await click('[data-card="Inconnue"]');
    expect(onOpenCard).toHaveBeenCalledTimes(1);
  });

  it('retire un objet, et demande confirmation pour une étagère garnie', async () => {
    await seed([
      { id: 'f1', kind: 'wall', shape: 'poster', col: 4, row: 1, slug: 'Paris' },
      { id: 'f2', kind: 'shelf', col: 12, row: 4 },
      { id: 'f3', kind: 'stored', shape: 'cd', shelfId: 'f2', slot: 0, slug: 'Daft_Punk' },
    ]);
    await click('[data-action="edit"]');
    await click('[data-card="Paris"]');
    await click('[data-action="remove"]');
    expect(layoutNow().some((p) => p.kind === 'wall')).toBe(false);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click('[data-furniture="shelf"]');
    await click('[data-action="remove"]');
    expect(confirm).toHaveBeenCalledWith('Retirer aussi les cartes rangées ?');
    expect(layoutNow().length).toBe(2);
    confirm.mockReturnValue(true);
    await click('[data-action="remove"]');
    expect(layoutNow().length).toBe(0);
  });

  it('grise dans le sélecteur une carte déjà posée', async () => {
    await seed([{ id: 'f1', kind: 'wall', shape: 'poster', col: 4, row: 1, slug: 'Paris' }]);
    await click('[data-action="edit"]');
    await click('[data-action="add-card"]');
    expect(q('[data-card-option="Paris"]')?.hasAttribute('disabled')).toBe(true);
    expect(q('[data-card-option="Daft_Punk"]')?.hasAttribute('disabled')).toBe(false);
  });
});
