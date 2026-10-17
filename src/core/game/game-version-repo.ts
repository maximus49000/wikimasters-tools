import type { KeyValueStore } from '../cache/store';

const KEY = 'game-version-v1';

// La version (console) choisie à la main pour la boîte de chaque carte.
export type GameVersionChoice = { tgdbId: number };

export function createGameVersionRepo(store: KeyValueStore) {
  // Écritures sérialisées : deux enregistrements simultanés ne s'écrasent pas.
  let tail: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<Record<string, GameVersionChoice>> => (await store.get<Record<string, GameVersionChoice>>(KEY)) ?? {};
  const update = (change: (state: Record<string, GameVersionChoice>) => Record<string, GameVersionChoice>): Promise<void> => {
    const run = tail.then(async () => store.set(KEY, change(await read())));
    tail = run.catch(() => undefined);
    return run;
  };
  return {
    load: read,
    save: (slug: string, choice: GameVersionChoice): Promise<void> => update((state) => ({ ...state, [slug]: choice })),
    clear: (slug: string): Promise<void> =>
      update((state) => {
        const { [slug]: _removed, ...rest } = state;
        return rest;
      }),
  };
}
export type GameVersionRepo = ReturnType<typeof createGameVersionRepo>;
