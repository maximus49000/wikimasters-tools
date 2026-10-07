// src/core/book/book-repo.ts
import type { KeyValueStore } from '../cache/store';
import type { CardBook } from './wikidata-book';

export type BookState = Record<string, CardBook>;
export type BookFetcher = (slugs: string[]) => Promise<Record<string, CardBook>>;

const KEY = 'book-v1';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

// Articles par interrogation de Wikidata.
const BATCH_SIZE = 50;

// Identifiants Open Library des cartes (même principe que `game-repo` et `screen-repo`).
// Les `resolve()` lancés dans le même tour d'horloge partagent une seule interrogation (par lots de 50 au plus).
export function createBookRepo(store: KeyValueStore, fetchBook: BookFetcher, now: () => number = () => Date.now()) {
  // Écritures sérialisées ; recherches regroupées en un seul parcours à la fois.
  let tail: Promise<unknown> = Promise.resolve();
  const pending = new Set<string>();
  let current: Promise<void> | null = null;
  let failedAt: number | undefined;

  const read = async (): Promise<BookState> => (await store.get<BookState>(KEY)) ?? {};
  const load = async (): Promise<BookState> => {
    await tail;
    return read();
  };
  const write = (change: (state: BookState) => BookState): Promise<void> => {
    const run = tail.then(async () => store.set(KEY, change(await read())));
    tail = run.catch(() => undefined);
    return run;
  };

  async function lookupAll(): Promise<void> {
    try {
      for (;;) {
        const state = await load();
        const batch = [...pending].filter((slug) => !Object.prototype.hasOwnProperty.call(state, slug)).slice(0, BATCH_SIZE);
        if (batch.length === 0 || (failedAt !== undefined && now() - failedAt < COOLDOWN_MS)) {
          pending.clear();
          return;
        }
        for (const slug of batch) pending.delete(slug);
        try {
          const found = await fetchBook(batch);
          await write((latest) => ({ ...latest, ...found }));
        } catch (error) {
          console.warn('[wikimasters-tools]', 'identifiants Open Library Wikidata indisponibles :', error);
          failedAt = now();
          pending.clear();
          return;
        }
      }
    } finally {
      current = null;
    }
  }

  return {
    load,

    // Interroge Wikidata pour les articles jamais vus (un article sans valeur est mémorisé vide) ; rend l'état à jour.
    async resolve(slugs: string[]): Promise<BookState> {
      for (const slug of slugs) pending.add(slug);
      if (pending.size > 0) {
        current ??= lookupAll();
        await current;
      }
      return load();
    },
  };
}
export type BookRepo = ReturnType<typeof createBookRepo>;
