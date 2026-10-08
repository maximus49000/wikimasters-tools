// `list` : la grille du site, inchangée ; `homemade` : notre grille paginée et filtrable (vue par défaut).
export type CollectionView = 'homemade' | 'world' | 'timeline' | 'web' | 'list';

const KEY = 'wmt:collectionView';

// Toute erreur de stockage (accès bloqué…) est absorbée : on reste en vue Homemade.
export function readView(storage: Pick<Storage, 'getItem'>): CollectionView {
  try {
    const value = storage.getItem(KEY);
    return value === 'list' || value === 'world' || value === 'timeline' || value === 'web' || value === 'homemade' ? value : 'homemade';
  } catch {
    return 'homemade';
  }
}

export function writeView(storage: Pick<Storage, 'setItem'>, view: CollectionView): void {
  try {
    storage.setItem(KEY, view);
  } catch {
    // stockage indisponible
  }
}
