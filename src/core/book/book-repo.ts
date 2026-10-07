// src/core/book/book-repo.ts
import type { KeyValueStore } from '../cache/store';
import type { CardBook } from './wikidata-book';

export type BookState = Record<string, CardBook>;
export type BookFetcher = (slugs: string[]) => Promise<Record<string, CardBook>>;

const KEY = 'book-v1';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

// Identifiants Open Library des cartes (même principe que `game-repo` et `screen-repo`).
export function createBookRepo(store: KeyValueStore, fetchBook: BookFetcher, now: () => number = () => Date.now()) {
  // Lectures et écritures sérialisées.
  let tail: Promise<unknown> = Promise.resolve();
  let failedAt: number | undefined;

  const read = async (): Promise<BookState> => (await store.get<BookState>(KEY)) ?? {};

  return {
    load: read,

    // Interroge Wikidata pour les articles jamais vus (un article sans valeur est mémorisé vide) ; rend l'état à jour.
    resolve(slugs: string[]): Promise<BookState> {
      const run = tail.then(async () => {
        const state = await read();
        const missing = slugs.filter((slug) => !Object.prototype.hasOwnProperty.call(state, slug));
        if (missing.length === 0) return state;
        if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return state;
        try {
          const next = { ...state, ...(await fetchBook(missing)) };
          await store.set(KEY, next);
          return next;
        } catch (error) {
          console.warn('[wikimasters-tools]', 'identifiants Open Library Wikidata indisponibles :', error);
          failedAt = now();
          return state;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}
export type BookRepo = ReturnType<typeof createBookRepo>;
