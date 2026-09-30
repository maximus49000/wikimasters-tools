import { COLLECTION_FILTER_MESSAGE } from './market-messages';

// Filtres actuellement appliqués sur la page Collection (chaîne vide = aucun).
export function createCollectionFilterSource(win: Window) {
  let current = '';
  const listeners = new Set<() => void>();
  win.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown; filter?: unknown } | null;
    if (event.source !== win || data?.type !== COLLECTION_FILTER_MESSAGE) return;
    if (typeof data.filter !== 'string' || data.filter === current) return;
    current = data.filter;
    for (const listener of listeners) listener();
  });
  return {
    current: () => current,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type CollectionFilterSource = ReturnType<typeof createCollectionFilterSource>;
