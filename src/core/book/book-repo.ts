// src/core/book/book-repo.ts
import type { KeyValueStore } from '../cache/store';
import type { BookChoice } from './book-detail';
import type { CardBook } from './wikidata-book';

export type BookState = Record<string, CardBook>;
export type BookFetcher = (slugs: string[]) => Promise<Record<string, CardBook>>;

// v2 : les entrées portent aussi Wikisource, Gutenberg et le décès de l'auteur (celles de v1 sont relues).
const KEY = 'book-v2';
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

const CHOICE_KEY = 'book-choice-v1';

// Le livre choisi à la main pour chaque carte (ou « aucun livre ») : il prime sur la résolution automatique.
export function createBookChoiceRepo(store: KeyValueStore) {
  let tail: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<Record<string, BookChoice>> => (await store.get<Record<string, BookChoice>>(CHOICE_KEY)) ?? {};
  const update = (change: (state: Record<string, BookChoice>) => Record<string, BookChoice>): Promise<void> => {
    const run = tail.then(async () => store.set(CHOICE_KEY, change(await read())));
    tail = run.catch(() => undefined);
    return run;
  };
  return {
    load: read,
    save: (slug: string, choice: BookChoice): Promise<void> => update((state) => ({ ...state, [slug]: choice })),
    clear: (slug: string): Promise<void> =>
      update((state) => {
        const { [slug]: _removed, ...rest } = state;
        return rest;
      }),
  };
}
export type BookChoiceRepo = ReturnType<typeof createBookChoiceRepo>;
