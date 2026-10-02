// Tri de la vue Homemade : les entrées de la liste « Trier la collection » du site (rareté, nom, favoris, date d'ajout)
// et notre « Prix de vente décroissant ». Il se lit sur l'entrée choisie, jamais sur les requêtes du site.
export type SortMode = 'rarity' | 'name' | 'starred' | 'added' | 'price';

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
