// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { IDLE_SCAN, type CollectionScanner } from '../../src/core/collection/collection-scan';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';
import { EMPTY_KINDS } from '../../src/core/kinds/kinds-book';
import type { KindsRepo } from '../../src/core/kinds/kinds-repo';
import type { CollectionFilterSource } from '../../src/content/collection-filter';
import { HomemadePanel } from '../../src/content/HomemadePanel';
import { createKindFilterSource } from '../../src/content/kind-filter';
import { createMarketSource } from '../../src/content/market-source';
import { createPageMemory } from '../../src/content/page-memory';
import { createSelectionSource } from '../../src/content/selection-source';
import { createSortSource } from '../../src/content/sort-source';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cards: KnownCard[] = ['Ted Lasso', 'Ovide', 'Rodez'].map((title) => ({ slug: title.replace(/ /g, '_'), title, rarity: 'C' }));
const noSubscribe = () => () => undefined;

let container: HTMLDivElement;
let root: Root;
let selection: ReturnType<typeof createSelectionSource>;
const onOpenCard = vi.fn();
const onToggleCard = vi.fn();
const onLongPressCard = vi.fn();

beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  container = document.createElement('div');
  document.body.append(container);
  selection = createSelectionSource();
  root = createRoot(container);
  await act(async () => {
    root.render(
      <HomemadePanel
        collection={{ snapshot: () => cards, list: async () => cards, subscribe: noSubscribe } as unknown as CollectionRepo}
        scanner={{ snapshot: () => IDLE_SCAN, state: async () => IDLE_SCAN, subscribe: noSubscribe } as unknown as CollectionScanner}
        kinds={{ load: async () => EMPTY_KINDS, subscribe: noSubscribe } as unknown as KindsRepo}
        kindFilterSource={createKindFilterSource({ getItem: () => null, setItem: () => undefined })}
        book={null}
        market={createMarketSource().source}
        filterSource={{ current: () => '', sort: () => '', subscribe: noSubscribe } as unknown as CollectionFilterSource}
        sortSource={createSortSource()}
        loadFiltered={async () => new Set(cards.map((card) => card.slug))}
        nativePageSize={() => 0}
        onOpenCard={onOpenCard}
        onWantCards={vi.fn()}
        pages={createPageMemory()}
        selection={selection}
        onToggleCard={onToggleCard}
        onLongPressCard={onLongPressCard}
      />,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const tile = (title: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${title}"]`);

describe('vue Homemade : sélection', () => {
  it("n'affiche aucune case hors du mode « Sélectionner » et ouvre la fiche au clic", async () => {
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
    await act(async () => tile('Ovide')?.click());
    expect(onOpenCard).toHaveBeenCalledWith('Ovide');
    expect(onToggleCard).not.toHaveBeenCalled();
  });

  it('affiche une case par carte en mode sélection, et un clic coche au lieu d’ouvrir', async () => {
    await act(async () => selection.setSelecting(true));
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(3);
    await act(async () => tile('Ovide')?.click());
    expect(onToggleCard).toHaveBeenCalledWith({ slug: 'Ovide', title: 'Ovide' });
    expect(onOpenCard).not.toHaveBeenCalled();
  });

  it('montre cochées les cartes de la sélection', async () => {
    await act(async () => {
      selection.setSelecting(true);
      selection.toggle({ slug: 'Rodez', title: 'Rodez' });
    });
    expect(tile('Rodez')?.getAttribute('aria-checked')).toBe('true');
    expect(tile('Ovide')?.getAttribute('aria-checked')).toBe('false');
  });

  describe('appui long', () => {
    const press = (element: Element | null | undefined, type: string, clientY = 0) =>
      element?.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 0, clientY }));

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('ouvre la sélection avec la carte, sans ouvrir sa fiche au relâchement', async () => {
      const ovide = tile('Ovide');
      await act(async () => press(ovide, 'pointerdown'));
      await act(async () => vi.advanceTimersByTime(500));
      expect(onLongPressCard).toHaveBeenCalledWith({ slug: 'Ovide', title: 'Ovide' });
      await act(async () => {
        press(ovide, 'pointerup');
        ovide?.click();
      });
      expect(onOpenCard).not.toHaveBeenCalled();
      await act(async () => ovide?.click());
      expect(onOpenCard).toHaveBeenCalledWith('Ovide');
    });

    it('un appui court ou un défilement ne déclenchent rien', async () => {
      const ovide = tile('Ovide');
      await act(async () => press(ovide, 'pointerdown'));
      await act(async () => vi.advanceTimersByTime(200));
      await act(async () => press(ovide, 'pointerup'));
      await act(async () => press(ovide, 'pointerdown'));
      await act(async () => press(ovide, 'pointermove', 40));
      await act(async () => vi.advanceTimersByTime(1000));
      expect(onLongPressCard).not.toHaveBeenCalled();
    });

    it('en mode sélection, l’appui long ne fait rien de plus que le clic', async () => {
      await act(async () => selection.setSelecting(true));
      await act(async () => press(tile('Ovide'), 'pointerdown'));
      await act(async () => vi.advanceTimersByTime(1000));
      expect(onLongPressCard).not.toHaveBeenCalled();
    });
  });
});
