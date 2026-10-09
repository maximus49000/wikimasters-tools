// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { RoomView } from '../../src/content/RoomView';
import { createMemoryStore, type KeyValueStore } from '../../src/core/cache/store';
import { adoptPet, createInitialState } from '../../src/core/library/library-book';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import type { Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let store: KeyValueStore;
let repo: LibraryRepo;
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);

async function mountPanel() {
  repo = createLibraryRepo(store);
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store = createMemoryStore();
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('RoomView avec un chat', () => {
  const room: Room = {
    ...createInitialState().rooms[0]!,
    cols: 48,
    layout: [
      { id: 'a', kind: 'sofa', col: 2, row: 12 },
      { id: 'f', kind: 'chair', col: 20, row: 15 },
    ],
  };

  it('insère le chat parmi les meubles selon son rang de dessin', async () => {
    await act(async () => {
      root.render(
        <RoomView
          room={room}
          editing={false}
          cellsActive={false}
          selectedId={null}
          blink={[]}
          onCell={() => undefined}
          onPick={() => undefined}
          pets={[{ id: 'p1', species: 'cat' as const, coat: 'orange', name: 'Minou', pose: 'sit', facing: 'r', behind: 1, top: false }]}
        />,
      );
    });
    const order = Array.from(container.querySelectorAll('[data-furniture],[data-pet]')).map((el) => el.getAttribute('data-furniture') ?? el.getAttribute('data-pet'));
    expect(order).toEqual(['sofa', 'p1', 'chair']);
  });
});

describe('RoomView : couches du chat', () => {
  const base: Room = {
    ...createInitialState().rooms[0]!,
    cols: 48,
    layout: [
      { id: 'a', kind: 'sofa', col: 2, row: 12 },
      { id: 'c', kind: 'desk', col: 12, row: 14 },
      { id: 'd', kind: 'small', item: 'plant', hostId: 'c', slot: 0 },
      { id: 'e', kind: 'computer', deskId: 'c' },
      { id: 'w', kind: 'wall', shape: 'poster', col: 30, row: 5, slug: 'Paris' },
    ],
  };
  const orderOf = (pets: React.ComponentProps<typeof RoomView>['pets']) => {
    act(() => {
      root.render(<RoomView room={base} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} pets={pets} />);
    });
    return Array.from(container.querySelectorAll('[data-furniture],[data-pet],[data-card],[data-pet-bubble]')).map((el) => el.getAttribute('data-furniture') ?? el.getAttribute('data-card') ?? (el.hasAttribute('data-pet-bubble') ? `bubble:${el.getAttribute('data-pet-bubble')}` : el.getAttribute('data-pet')));
  };
  const cat = { id: 'p1', species: 'cat' as const, coat: 'orange' as const, name: 'Minou', pose: 'sit' as const, facing: 'r' as const, behind: 1, top: false };

  it('les posters sont dessinés avant les meubles et le chat', () => {
    const order = orderOf([cat]);
    expect(order.indexOf('Paris')).toBeLessThan(order.indexOf('p1'));
    expect(order.indexOf('Paris')).toBeLessThan(order.indexOf('sofa'));
  });

  it('un chat perché sur le bureau passe après l ordinateur et les petits objets', () => {
    const order = orderOf([{ ...cat, behind: 2, top: true }]);
    expect(order.indexOf('p1')).toBeGreaterThan(order.indexOf('computer'));
    expect(order.indexOf('p1')).toBeGreaterThan(order.indexOf('small'));
  });

  it('à rang égal sur le sol, le plus loin (pieds les plus hauts) est dessiné en premier, quel que soit l ordre de la liste', () => {
    const far = { ...cat, id: 'far', behind: 1, depthY: 200 };
    const near = { ...cat, id: 'near', behind: 1, depthY: 400 };
    const names = (order: (string | null)[]) => order.filter((x) => x === 'far' || x === 'near');
    expect(names(orderOf([near, far]))).toEqual(['far', 'near']);
    expect(names(orderOf([far, near]))).toEqual(['far', 'near']);
  });

  it('la bulle n existe que quand il ronronne, dans la couche du dessus', () => {
    expect(orderOf([cat]).some((x) => String(x).startsWith('bubble:'))).toBe(false);
    const order = orderOf([{ ...cat, pose: 'purr' }]);
    expect(order[order.length - 1]).toBe('bubble:p1');
    expect(container.querySelector('[data-pet-bubble] [data-pet-name]')!.textContent).toBe('Minou');
    expect(container.querySelector('[data-pet] [data-pet-name]')).toBeNull();
  });
});

describe('LibraryPanel avec un chat', () => {
  it('affiche le chat adopté et mémorise son plan sans prévenir les abonnés', async () => {
    await createLibraryRepo(store).update((s) => adoptPet(s, 'r1', 'Minou', 'orange'));
    await mountPanel();
    const subscriber = vi.fn();
    repo.subscribe(subscriber);
    expect(q('[data-pet="p1"]')).not.toBeNull();
    await settle();
    expect(subscriber).not.toHaveBeenCalled();
    expect(repo.current()!.rooms[0]!.pets[0]!.plan).toBeDefined();
  });

  it('au retour, reprend le plan mémorisé sans en choisir un autre', async () => {
    await createLibraryRepo(store).update((s) => adoptPet(s, 'r1', 'Minou', 'orange'));
    await mountPanel();
    await settle();
    const saved = repo.current()!.rooms[0]!.pets[0]!.plan!;
    act(() => root.unmount());
    root = createRoot(container);
    await mountPanel();
    await settle();
    expect(repo.current()!.rooms[0]!.pets[0]!.plan).toEqual(saved);
  });

  it('une pièce sans chat n en dessine pas', async () => {
    await mountPanel();
    expect(q('[data-pet]')).toBeNull();
  });
});
