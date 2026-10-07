import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { EMPTY_OWNERSHIP, ownershipSignature, screenOwnership, type ScreenOwnership } from '../core/collection/work-marks';
import type { ScreenRepo } from '../core/screen/screen-repo';

const BATCH = 50;
const BATCH_GAP_MS = 1500;
const AGAIN_GAP_MS = 30_000;
const LOG = '[wikimasters-tools]';

export type CollectionMarks = {
  subscribe(listener: () => void): () => void;
  // Les films et séries possédés : même objet tant que rien de visible ne change, pour un rendu stable.
  ownership(): ScreenOwnership;
  // Lance (une seule fois) la lecture des identifiants TMDB des cartes de cinéma de la Collection, en arrière-plan.
  ensure(): void;
};

// Repère, dans les listes d'œuvres (filmographie, plus tard bibliographie), les cartes que l'on possède.
export function createCollectionMarks(deps: {
  collection: Pick<CollectionRepo, 'list' | 'subscribe'>;
  screen: Pick<ScreenRepo, 'load' | 'resolve'>;
  screenSlugs: (cards: KnownCard[]) => Promise<Set<string>>;
  // Attente entre deux lots / deux passes (injectable pour les tests).
  pause?: (ms: number) => Promise<void>;
}): CollectionMarks {
  const { collection, screen, screenSlugs } = deps;
  const pause = deps.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let current: ScreenOwnership = EMPTY_OWNERSHIP;
  let signature = '';
  let started = false;
  let running = false;
  let again = false;
  let sequence = 0;
  const listeners = new Set<() => void>();

  const refresh = async (): Promise<void> => {
    const mine = ++sequence;
    const next = screenOwnership(await collection.list(), await screen.load());
    if (mine !== sequence) return; // un rafraîchissement plus récent a démarré : ce résultat est périmé
    const nextSignature = ownershipSignature(next);
    if (nextSignature === signature) return;
    signature = nextSignature;
    current = next;
    for (const listener of listeners) listener();
  };

  const resolveAll = async (): Promise<void> => {
    const cinema = [...(await screenSlugs(await collection.list()))];
    for (let i = 0; i < cinema.length; i += BATCH) {
      if (i > 0) await pause(BATCH_GAP_MS); // reste sous la limite de 200 requêtes/min par IP
      await screen.resolve(cinema.slice(i, i + BATCH));
      await refresh();
    }
  };

  // Une seule passe à la fois ; un changement de la Collection pendant une passe en programme une autre, espacée.
  const run = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        try {
          await refresh();
          await resolveAll();
        } catch (error) {
          console.warn(LOG, 'repérage de la Collection dans les listes indisponible :', error);
        }
        if (again) await pause(AGAIN_GAP_MS);
      } while (again);
    } finally {
      running = false;
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    ownership: () => current,
    ensure() {
      if (started) return;
      started = true;
      collection.subscribe(() => {
        void refresh().catch(() => undefined);
        void run().catch(() => undefined);
      });
      void run().catch(() => undefined);
    },
  };
}
