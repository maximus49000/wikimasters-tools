export type CollectionView = 'list' | 'world' | 'timeline';

const KEY = 'wmt:collectionView';

// Toute erreur de stockage (accès bloqué…) est absorbée : on reste en vue Grille.
export function readView(storage: Pick<Storage, 'getItem'>): CollectionView {
  try {
    const value = storage.getItem(KEY);
    return value === 'world' || value === 'timeline' ? value : 'list';
  } catch {
    return 'list';
  }
}

export function writeView(storage: Pick<Storage, 'setItem'>, view: CollectionView): void {
  try {
    storage.setItem(KEY, view);
  } catch {
    // stockage indisponible
  }
}
