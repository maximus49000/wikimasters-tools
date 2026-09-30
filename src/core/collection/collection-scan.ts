import type { CollectionPage } from '../api/collection-schemas';
import type { KeyValueStore } from '../cache/store';
import type { CollectionRepo } from './collection-repo';

const KEY = 'collectionScan';
// Un autre onglet qui a écrit son état il y a moins longtemps est considéré comme toujours en cours.
const LOCK_MS = 60_000;

export type ScanState = {
  status: 'idle' | 'running' | 'done' | 'error';
  // Prochaine page à lire (0-indexée) : c'est là que la reprise repart.
  nextPage: number;
  // Entrées lues depuis le début du parcours en cours.
  entries: number;
  updatedAt: number;
  error?: string;
};

export const IDLE_SCAN: ScanState = { status: 'idle', nextPage: 0, entries: 0, updatedAt: 0 };

export type ScannerDeps = {
  api: { getCollectionPage(page: number): Promise<CollectionPage> };
  collection: Pick<CollectionRepo, 'observe'>;
  store: KeyValueStore;
  now?: () => number;
  maxPages?: number;
  // Programme une reprise différée (setTimeout par défaut) ; injectable pour les tests.
  schedule?: (fn: () => void, ms: number) => void;
};

export function createCollectionScanner({
  api,
  collection,
  store,
  now = () => Date.now(),
  maxPages = 200,
  schedule = (fn, ms) => void setTimeout(fn, ms),
}: ScannerDeps) {
  const listeners = new Set<() => void>();
  let active = false;
  let retryScheduled = false;

  async function state(): Promise<ScanState> {
    return (await store.get<ScanState>(KEY)) ?? IDLE_SCAN;
  }

  async function write(next: ScanState): Promise<void> {
    await store.set(KEY, next);
    for (const listener of listeners) listener();
  }

  // Une page à la fois (l'espacement et le backoff 429 sont ceux de l'API). Aucune nouvelle
  // tentative en boucle : à la première erreur on s'arrête, la reprise se fait au prochain appel.
  async function run({ force = false }: { force?: boolean } = {}): Promise<void> {
    if (active) return;
    active = true;
    let page = 0;
    let entries = 0;
    try {
      const saved = await state();
      if (!force && saved.status === 'done') return;
      if (saved.status === 'running' && now() - saved.updatedAt < LOCK_MS) {
        // Un autre chargement de page scanne (ou vient de l'être, p. ex. rechargement en cours de
        // scan) : on revient voir une fois le verrou expiré, une seule fois à la fois.
        if (!retryScheduled) {
          retryScheduled = true;
          const remaining = LOCK_MS - (now() - saved.updatedAt);
          schedule(() => {
            retryScheduled = false;
            void run();
          }, remaining + 1000);
        }
        return;
      }
      if (!force) {
        page = saved.nextPage;
        entries = saved.entries;
      }

      while (page < maxPages) {
        await write({ status: 'running', nextPage: page, entries, updatedAt: now() });
        const result = await api.getCollectionPage(page);
        if (result.entries === 0) {
          await write({ status: 'done', nextPage: page, entries, updatedAt: now() });
          return;
        }
        await collection.observe(result.cards);
        entries += result.entries;
        page += 1;
      }
      await write({
        status: 'error',
        nextPage: page,
        entries,
        updatedAt: now(),
        error: 'limite de pages atteinte',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await write({ status: 'error', nextPage: page, entries, updatedAt: now(), error: message }).catch(
        () => undefined,
      );
    } finally {
      active = false;
    }
  }

  return {
    run,
    state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type CollectionScanner = ReturnType<typeof createCollectionScanner>;
