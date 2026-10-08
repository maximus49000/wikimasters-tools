import type { KeyValueStore } from '../cache/store';
import { createInitialState, parseLibraryState } from './library-book';
import type { LibraryState } from './library-types';

const KEY = 'library';

export function createLibraryRepo(store: KeyValueStore) {
  // Écritures sérialisées : deux changements simultanés ne s'écrasent pas (comme `geo-repo`).
  let writeTail: Promise<unknown> = Promise.resolve();
  // Dernier état lu ou écrit : le panneau, remonté, repart de là sans attendre le stockage.
  let latest: LibraryState | null = null;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const read = async (): Promise<LibraryState> => parseLibraryState(await store.get<unknown>(KEY));

  return {
    current: (): LibraryState | null => latest,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    // Lecture mise en file avec les écritures : un changement lancé pendant le chargement n'est pas écrasé par un état plus ancien.
    // Si le stockage échoue, on affiche une pièce vide SANS l'écrire : les vraies données ne sont jamais remplacées.
    load(): Promise<LibraryState> {
      const run = writeTail.then(async () => {
        try {
          latest = await read();
        } catch {
          latest ??= createInitialState();
        }
        notify();
        return latest;
      });
      writeTail = run.catch(() => undefined);
      return run;
    },
    update(change: (state: LibraryState) => LibraryState): Promise<void> {
      const run = writeTail.then(async () => {
        const next = change(await read());
        await store.set(KEY, next);
        latest = next;
        notify();
      });
      writeTail = run.catch(() => undefined);
      return run;
    },
  };
}

export type LibraryRepo = ReturnType<typeof createLibraryRepo>;
