// `rarity` : tri du site (celui de la liste « Trier la collection ») ; `price` : notre « Prix de vente décroissant ».
export type SortMode = 'rarity' | 'price';

// Tri choisi, gardé en mémoire : le site repart de « Rareté » à chaque chargement de page.
export function createSortSource() {
  let current: SortMode = 'rarity';
  const listeners = new Set<() => void>();
  return {
    current: (): SortMode => current,
    set(next: SortMode): void {
      if (next === current) return;
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type SortSource = ReturnType<typeof createSortSource>;
