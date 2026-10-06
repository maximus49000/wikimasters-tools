import type { KeyValueStore } from '../cache/store';
import type { GameChoice } from './game-detail';
import type { CardGame } from './wikidata-game';

export type GameState = Record<string, CardGame>;
export type GameFetcher = (slugs: string[]) => Promise<Record<string, CardGame>>;

const KEY = 'game-v1';
const CHOICE_KEY = 'game-choice-v1';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

// Identifiants Steam / IGDB des cartes (même principe que `screen-repo`).
export function createGameRepo(store: KeyValueStore, fetchGame: GameFetcher, now: () => number = () => Date.now()) {
  // Lectures et écritures sérialisées.
  let tail: Promise<unknown> = Promise.resolve();
  let failedAt: number | undefined;

  const read = async (): Promise<GameState> => (await store.get<GameState>(KEY)) ?? {};

  return {
    load: read,

    // Interroge Wikidata pour les articles jamais vus (un article sans valeur est mémorisé vide) ; rend l'état à jour.
    resolve(slugs: string[]): Promise<GameState> {
      const run = tail.then(async () => {
        const state = await read();
        const missing = slugs.filter((slug) => !Object.prototype.hasOwnProperty.call(state, slug));
        if (missing.length === 0) return state;
        if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return state;
        try {
          const next = { ...state, ...(await fetchGame(missing)) };
          await store.set(KEY, next);
          return next;
        } catch (error) {
          console.warn('[wikimasters-tools]', 'identifiants Steam et IGDB Wikidata indisponibles :', error);
          failedAt = now();
          return state;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}
export type GameRepo = ReturnType<typeof createGameRepo>;

// Le jeu choisi à la main pour chaque carte (ou « aucun jeu ») : il prime sur la résolution automatique.
export function createGameChoiceRepo(store: KeyValueStore) {
  let tail: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<Record<string, GameChoice>> => (await store.get<Record<string, GameChoice>>(CHOICE_KEY)) ?? {};
  const update = (change: (state: Record<string, GameChoice>) => Record<string, GameChoice>): Promise<void> => {
    const run = tail.then(async () => store.set(CHOICE_KEY, change(await read())));
    tail = run.catch(() => undefined);
    return run;
  };
  return {
    load: read,
    save: (slug: string, choice: GameChoice): Promise<void> => update((state) => ({ ...state, [slug]: choice })),
    clear: (slug: string): Promise<void> =>
      update((state) => {
        const { [slug]: _removed, ...rest } = state;
        return rest;
      }),
  };
}
export type GameChoiceRepo = ReturnType<typeof createGameChoiceRepo>;
