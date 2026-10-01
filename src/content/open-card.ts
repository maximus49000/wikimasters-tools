import type { PendingStorage } from './pending-search';
import { setPendingReopen } from './return-target';

const COLLECTION_PATH = '/collection';

export type OpenCollectionCardDeps = {
  pathname: string;
  storage: PendingStorage;
  now: () => number;
  // Rouvre la fiche d'une carte dans la Collection de la page courante.
  reopen: (slug: string) => void;
  assign: (path: string) => void;
};

// La fiche d'une carte, depuis n'importe quelle page : sur la Collection, elle s'ouvre sur place ;
// ailleurs, on laisse la carte à rouvrir et on va à la Collection, qui la rouvre au chargement.
export function openCollectionCard(slug: string, { pathname, storage, now, reopen, assign }: OpenCollectionCardDeps): void {
  if (pathname.startsWith(COLLECTION_PATH)) {
    reopen(slug);
    return;
  }
  setPendingReopen(storage, slug, now());
  assign(COLLECTION_PATH);
}

// Dans la page courante ; `reopen` rouvre la fiche quand on est déjà dans la Collection.
export const openCardInPage = (slug: string, reopen: (slug: string) => void): void =>
  openCollectionCard(slug, {
    pathname: window.location.pathname,
    storage: window.sessionStorage,
    now: Date.now,
    reopen,
    assign: (path) => window.location.assign(path),
  });
