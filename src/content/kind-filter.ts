import { NO_KIND_FILTER, type KindFilter } from '../core/kinds/kinds-filter';

const KEY = 'wmt:kindFilter';

// Toute erreur de stockage (accès bloqué, valeur illisible) est absorbée : on repart sans filtre.
function read(storage: Pick<Storage, 'getItem'>): KindFilter {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return NO_KIND_FILTER;
    const value = JSON.parse(raw) as { nature?: unknown; facet?: unknown } | null;
    return typeof value?.nature === 'string' && typeof value.facet === 'string'
      ? { nature: value.nature, facet: value.facet }
      : NO_KIND_FILTER;
  } catch {
    return NO_KIND_FILTER;
  }
}

// Filtre nature / occupation choisi dans la rangée de listes, partagé par les trois vues et mémorisé.
export function createKindFilterSource(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  let current = read(storage);
  const listeners = new Set<() => void>();
  return {
    current: (): KindFilter => current,
    set(next: KindFilter): void {
      if (next.nature === current.nature && next.facet === current.facet) return;
      current = next;
      try {
        storage.setItem(KEY, JSON.stringify(next));
      } catch {
        // stockage indisponible
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type KindFilterSource = ReturnType<typeof createKindFilterSource>;
