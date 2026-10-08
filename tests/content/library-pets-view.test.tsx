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
          pets={[{ id: 'p1', coat: 'orange', name: 'Minou', pose: 'sit', facing: 'r', behind: 1 }]}
        />,
      );
    });
    const order = Array.from(container.querySelectorAll('[data-furniture],[data-pet]')).map((el) => el.getAttribute('data-furniture') ?? el.getAttribute('data-pet'));
    expect(order).toEqual(['sofa', 'p1', 'chair']);
  });
});

describe('LibraryPanel avec un chat', () => {
  it('affiche le chat adopté et mémorise son plan sans prévenir les abonnés', async () => {
    await createLibraryRepo(store).update((s) => adoptPet(s, 'r1', 'Minou', 'orange'));
    await mountPanel();
    expect(q('[data-pet="p1"]')).not.toBeNull();
    await settle();
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
