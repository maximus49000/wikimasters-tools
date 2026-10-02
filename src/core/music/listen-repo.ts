import type { KeyValueStore } from '../cache/store';
import type { Listen } from './listen';

// Ce que la plateforme a répondu pour une carte : une liste, ou rien (`checkedAt`, en ms, date cette réponse « rien »).
type Stored = { listen: Listen } | { listen: null; checkedAt: number };
type ListenState = Record<string, Stored>;

// Clé du dépôt Spotify ; chaque autre plateforme a la sienne (`listens-tidal-v1`) : délier ou changer de plateforme n'en efface aucune.
export const SPOTIFY_LISTENS_KEY = 'listens-v1';
// Une liste trouvée ne change pas ; « rien trouvé » est redemandé au bout de 30 jours (comme les pochettes).
const NOTHING_MS = 30 * 24 * 3_600_000;

export function createListenRepo(store: KeyValueStore, now: () => number = () => Date.now(), key: string = SPOTIFY_LISTENS_KEY) {
  // Lectures et écritures sérialisées.
  let tail: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<ListenState> => (await store.get<ListenState>(key)) ?? {};

  return {
    // Les réponses gardées et encore valables : une carte absente est à demander à Spotify (`null` : il n'a rien trouvé).
    async load(): Promise<Map<string, Listen | null>> {
      const kept = new Map<string, Listen | null>();
      for (const [slug, entry] of Object.entries(await read())) {
        if (entry.listen) kept.set(slug, entry.listen);
        else if (now() - entry.checkedAt < NOTHING_MS) kept.set(slug, null);
      }
      return kept;
    },

    // Garde la réponse de Spotify pour une carte (`null` : rien trouvé) ; elle remplace la précédente.
    save(slug: string, listen: Listen | null): Promise<void> {
      const run = tail.then(async () => {
        const state = await read();
        await store.set(key, { ...state, [slug]: listen ? { listen } : { listen: null, checkedAt: now() } });
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

export type ListenRepo = ReturnType<typeof createListenRepo>;
