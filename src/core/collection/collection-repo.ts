import type { KeyValueStore } from '../cache/store';
import { applyCopyDeltas, mergeCards, type CollectionState, type KnownCard } from './collection-book';

const KEY = 'collection';

export function createCollectionRepo(store: KeyValueStore) {
  // Lecture-fusion-écriture sérialisées : deux observations simultanées ne s'écrasent pas.
  let tail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  // Dernier état lu ou écrit : une vue qui se remonte repart de là, sans attendre le stockage.
  let latest: KnownCard[] | null = null;

  return {
    observe(cards: KnownCard[], addCopies = false): Promise<void> {
      const run = tail.then(async () => {
        const state = (await store.get<CollectionState>(KEY)) ?? {};
        const next = mergeCards(state, cards, addCopies);
        if (next === state) return;
        await store.set(KEY, next);
        latest = Object.values(next);
        for (const listener of listeners) listener();
      });
      tail = run.catch(() => undefined);
      return run;
    },

    // Début d'un parcours complet : les exemplaires sont recomptés depuis zéro.
    resetCopies(): Promise<void> {
      const run = tail.then(async () => {
        const state = (await store.get<CollectionState>(KEY)) ?? {};
        if (!Object.values(state).some((card) => card.copies !== undefined)) return;
        const next: CollectionState = {};
        for (const [slug, { copies: _copies, ...card }] of Object.entries(state)) next[slug] = card;
        await store.set(KEY, next);
        latest = Object.values(next);
        for (const listener of listeners) listener();
      });
      tail = run.catch(() => undefined);
      return run;
    },

    // Carte vendue, échangée ou revenue : le nombre d'exemplaires varie sans nouveau parcours. À zéro, la carte quitte la Collection.
    // Une carte dont le nombre est inconnu n'est pas touchée (le prochain parcours complet la corrigera).
    adjustCopies(deltas: Record<string, number>): Promise<void> {
      const run = tail.then(async () => {
        const state = (await store.get<CollectionState>(KEY)) ?? {};
        const next = applyCopyDeltas(state, deltas);
        if (next === state) return;
        await store.set(KEY, next);
        latest = Object.values(next);
        for (const listener of listeners) listener();
      });
      tail = run.catch(() => undefined);
      return run;
    },

    // Fin d'un parcours complet : une carte que le parcours n'a pas recomptée n'est plus dans la Collection.
    dropUncounted(): Promise<void> {
      const run = tail.then(async () => {
        const state = (await store.get<CollectionState>(KEY)) ?? {};
        const entries = Object.entries(state);
        // Aucun nombre connu : le parcours n'a rien compté (collection vide ?), on ne vide pas tout par prudence.
        if (!entries.some(([, card]) => card.copies !== undefined)) return;
        const kept = entries.filter(([, card]) => card.copies !== undefined);
        if (kept.length === entries.length) return;
        const next = Object.fromEntries(kept);
        await store.set(KEY, next);
        latest = Object.values(next);
        for (const listener of listeners) listener();
      });
      tail = run.catch(() => undefined);
      return run;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    snapshot: (): KnownCard[] | null => latest,

    async list(): Promise<KnownCard[]> {
      await tail;
      latest = Object.values((await store.get<CollectionState>(KEY)) ?? {});
      return latest;
    },
  };
}

export type CollectionRepo = ReturnType<typeof createCollectionRepo>;
