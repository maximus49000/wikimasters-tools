import type { KeyValueStore } from '../cache/store';
import type { CardScreen } from './wikidata-screen';

export type ScreenState = Record<string, CardScreen>;
export type ScreenFetcher = (slugs: string[]) => Promise<Record<string, CardScreen>>;

const KEY = 'screen-v1';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

export function createScreenRepo(store: KeyValueStore, fetchScreen: ScreenFetcher, now: () => number = () => Date.now()) {
  // Lectures et écritures sérialisées.
  let tail: Promise<unknown> = Promise.resolve();
  let failedAt: number | undefined;

  const read = async (): Promise<ScreenState> => (await store.get<ScreenState>(KEY)) ?? {};

  return {
    load: read,

    // Interroge Wikidata pour les articles jamais vus (un article sans valeur est mémorisé vide) ; rend l'état à jour.
    resolve(slugs: string[]): Promise<ScreenState> {
      const run = tail.then(async () => {
        const state = await read();
        const missing = slugs.filter((slug) => !Object.prototype.hasOwnProperty.call(state, slug));
        if (missing.length === 0) return state;
        if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return state;
        try {
          const next = { ...state, ...(await fetchScreen(missing)) };
          await store.set(KEY, next);
          return next;
        } catch (error) {
          console.warn('[wikimasters-tools]', 'identifiants TMDB Wikidata indisponibles :', error);
          failedAt = now();
          return state;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

export type ScreenRepo = ReturnType<typeof createScreenRepo>;
