import type { KeyValueStore } from '../cache/store';

// Tempo mesuré de chaque piste, indexé par l'uri Spotify.
const KEY = 'tempo-v1';
const DAY_MS = 86_400_000;
// Un tempo trouvé change rarement ; un « introuvable » (pas d'extrait, mesure douteuse) est revérifié plus tôt.
const FOUND_TTL_MS = 180 * DAY_MS;
const MISSING_TTL_MS = 30 * DAY_MS;

type Entry = { bpm: number | null; at: number };
type Book = Record<string, Entry>;

export function createTempoRepo(store: KeyValueStore, now: () => number = () => Date.now()) {
  // Écritures sérialisées : deux sauvegardes simultanées ne doivent pas s'écraser.
  let writeTail: Promise<unknown> = Promise.resolve();

  return {
    // undefined = à mesurer ; null = introuvable encore valable ; nombre = tempo trouvé.
    async get(uri: string): Promise<number | null | undefined> {
      const entry = ((await store.get<Book>(KEY)) ?? {})[uri];
      if (!entry) return undefined;
      const ttl = entry.bpm === null ? MISSING_TTL_MS : FOUND_TTL_MS;
      return now() - entry.at < ttl ? entry.bpm : undefined;
    },
    save(uri: string, bpm: number | null): Promise<void> {
      const run = writeTail.then(async () => {
        const book = (await store.get<Book>(KEY)) ?? {};
        await store.set(KEY, { ...book, [uri]: { bpm, at: now() } });
      });
      writeTail = run.catch(() => undefined);
      return run;
    },
  };
}

export type TempoRepo = ReturnType<typeof createTempoRepo>;
