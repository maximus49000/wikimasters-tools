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
import { createSortSource } from '../../src/content/sort-source';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SIZE = 5;
const cards: KnownCard[] = Array.from({ length: 30 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return { slug: `Carte_${number}`, title: `Carte ${number}`, rarity: 'C' };
});
// Ce que la recherche du site laisse : « Carte 12 » seule ; tout autre filtre garde toutes les cartes.
const SEARCH = 'search=Carte+12';
const loadFiltered = async (filter: string) => new Set(cards.filter((card) => filter !== SEARCH || card.title === 'Carte 12').map((card) => card.slug));

// Le filtre du site, modifiable à la main : comme quand la recherche par titre est remplie puis vidée.
function fakeFilter() {
  let current = '';
  const listeners = new Set<() => void>();
  return {
    current: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set(next: string) {
      current = next;
      for (const listener of listeners) listener();
    },
  };
}

let container: HTMLDivElement;
let root: Root;
let filter: ReturnType<typeof fakeFilter>;
let pages: ReturnType<typeof createPageMemory>;

async function mount() {
  root = createRoot(container);
  const noSubscribe = () => () => undefined;
  const scan = { ...IDLE_SCAN, pageSize: SIZE };
  await act(async () => {
    root.render(
      <HomemadePanel
        collection={{ snapshot: () => cards, list: async () => cards, subscribe: noSubscribe } as unknown as CollectionRepo}
        scanner={{ snapshot: () => scan, state: async () => scan, subscribe: noSubscribe } as unknown as CollectionScanner}
        kinds={{ load: async () => EMPTY_KINDS, subscribe: noSubscribe } as unknown as KindsRepo}
        kindFilterSource={createKindFilterSource({ getItem: () => null, setItem: () => undefined })}
        book={null}
        market={createMarketSource().source}
        filterSource={filter as CollectionFilterSource}
        sortSource={createSortSource()}
        loadFiltered={loadFiltered}
        nativePageSize={() => 0}
        onOpenCard={vi.fn()}
        onWantCards={vi.fn()}
        pages={pages}
      />,
    );
  });
}

// La vue se remonte quand le jeu remplace sa grille (fermeture d'une fiche).
async function remount() {
  await act(async () => root.unmount());
  await mount();
}

const setFilter = (next: string) => act(async () => filter.set(next));
const next = () =>
  act(async () => {
    [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Suivant'))?.click();
  });
const label = () => container.textContent?.match(/Page \d+ \/ \d+/)?.[0];
const titles = () => [...container.querySelectorAll('button[aria-label^="Carte"]')].map((button) => button.getAttribute('aria-label'));

async function toPage4() {
  await mount();
  for (let index = 0; index < 3; index++) await next();
  expect(label()).toBe('Page 4 / 6');
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  container = document.createElement('div');
  document.body.append(container);
  filter = fakeFilter();
  pages = createPageMemory();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('HomemadePanel, page gardée quand la fiche d’une carte est ouverte puis refermée', () => {
  it('retrouve la page quand la recherche posée pour atteindre la carte est retirée', async () => {
    await toPage4();
    await setFilter(SEARCH);
    expect(label()).toBe('Page 1 / 1');
    await setFilter('');
    expect(label()).toBe('Page 4 / 6');
    expect(titles()).toEqual(['Carte 16', 'Carte 17', 'Carte 18', 'Carte 19', 'Carte 20']);
  });

  it('la retrouve aussi quand la vue est remontée pendant que la recherche est posée', async () => {
    await toPage4();
    await setFilter(SEARCH);
    await remount();
    expect(label()).toBe('Page 1 / 1');
    await setFilter('');
    expect(label()).toBe('Page 4 / 6');
    expect(titles()).toEqual(['Carte 16', 'Carte 17', 'Carte 18', 'Carte 19', 'Carte 20']);
  });

  it('la garde quand la vue est remontée sans que le filtre ait changé', async () => {
    await toPage4();
    await remount();
    expect(label()).toBe('Page 4 / 6');
  });

  it('repart de la première page pour un autre filtre', async () => {
    await toPage4();
    await setFilter('rarity=C');
    expect(label()).toBe('Page 1 / 6');
  });
});
