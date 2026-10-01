import type { KeyValueStore } from '../cache/store';
import type { CardMusic } from './wikidata-music';

export type MusicState = Record<string, CardMusic>;
export type MusicFetcher = (slugs: string[]) => Promise<Record<string, CardMusic>>;

const KEY = 'music-v1';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

export function createMusicRepo(store: KeyValueStore, fetchMusic: MusicFetcher, now: () => number = () => Date.now()) {
  // Lectures et écritures sérialisées.
  let tail: Promise<unknown> = Promise.resolve();
  let failedAt: number | undefined;

  const read = async (): Promise<MusicState> => (await store.get<MusicState>(KEY)) ?? {};

  return {
    load: read,

    // Interroge Wikidata pour les articles jamais vus (un article sans valeur est mémorisé vide) ; rend l'état à jour.
    resolve(slugs: string[]): Promise<MusicState> {
      const run = tail.then(async () => {
        const state = await read();
        const missing = slugs.filter((slug) => !Object.prototype.hasOwnProperty.call(state, slug));
        if (missing.length === 0) return state;
        if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return state;
        try {
          const next = { ...state, ...(await fetchMusic(missing)) };
          await store.set(KEY, next);
          return next;
        } catch (error) {
          console.warn('[wikimasters-tools]', 'musique Wikidata indisponible :', error);
          failedAt = now();
          return state;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

export type MusicRepo = ReturnType<typeof createMusicRepo>;
