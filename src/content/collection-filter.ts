import { COLLECTION_FILTER_MESSAGE } from './market-messages';

// Filtres actuellement appliqués sur la page Collection (chaîne vide = aucun).
export function createCollectionFilterSource(win: Window) {
  let current = '';
  let currentSort = '';
  const listeners = new Set<() => void>();
  win.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown; filter?: unknown; sort?: unknown } | null;
    if (event.source !== win || data?.type !== COLLECTION_FILTER_MESSAGE) return;
    if (typeof data.filter !== 'string') return;
    const sort = typeof data.sort === 'string' ? data.sort : '';
    if (data.filter === current && sort === currentSort) return;
    current = data.filter;
    currentSort = sort;
    for (const listener of listeners) listener();
  });
  return {
    current: () => current,
    // Tri du site hors rareté (« added », « name »…) ; chaîne vide = rareté.
    sort: () => currentSort,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type CollectionFilterSource = ReturnType<typeof createCollectionFilterSource>;
