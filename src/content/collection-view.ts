export type CollectionView = 'list' | 'world';

const KEY = 'wmt:collectionView';

// Toute erreur de stockage (accès bloqué…) est absorbée : on reste en vue Liste.
export function readView(storage: Pick<Storage, 'getItem'>): CollectionView {
  try {
    return storage.getItem(KEY) === 'world' ? 'world' : 'list';
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
