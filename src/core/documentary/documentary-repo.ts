// src/core/documentary/documentary-repo.ts
import type { KeyValueStore } from '../cache/store';
import type { DocCandidate } from './types';

const PROPOSALS_KEY = 'doc-proposals-v1';
const FLAGS_KEY = 'doc-flagged-v1';
const CHOICE_KEY = 'doc-choice-v1';

// Ce que l'utilisateur a fait lui-même : ses propositions (visibles pour lui tout de suite) et les vidéos qu'il juge hors sujet (masquées chez lui).
export function createDocumentaryRepo(store: KeyValueStore) {
  let tail: Promise<unknown> = Promise.resolve();
  const update = <T>(key: string, change: (state: Record<string, T[]>) => Record<string, T[]>): Promise<void> => {
    const run = tail.then(async () => store.set(key, change((await store.get<Record<string, T[]>>(key)) ?? {})));
    tail = run.catch(() => undefined);
    return run;
  };
  const read = async <T>(key: string, slug: string): Promise<T[]> => {
    await tail;
    return ((await store.get<Record<string, T[]>>(key)) ?? {})[slug] ?? [];
  };
  return {
    proposals: (slug: string): Promise<DocCandidate[]> => read<DocCandidate>(PROPOSALS_KEY, slug),
    addProposal: (slug: string, candidate: DocCandidate): Promise<void> =>
      update<DocCandidate>(PROPOSALS_KEY, (state) => {
        const list = state[slug] ?? [];
        return list.some((entry) => entry.id === candidate.id) ? state : { ...state, [slug]: [...list, candidate] };
      }),
    // La vidéo que l'utilisateur a choisie pour la carte (la vidéo entière est gardée : elle revient même si la recherche ne la renvoie plus).
    choice: async (slug: string): Promise<DocCandidate | null> => {
      await tail;
      return ((await store.get<Record<string, DocCandidate>>(CHOICE_KEY)) ?? {})[slug] ?? null;
    },
    setChoice: (slug: string, candidate: DocCandidate): Promise<void> => {
      const run = tail.then(async () => store.set(CHOICE_KEY, { ...((await store.get<Record<string, DocCandidate>>(CHOICE_KEY)) ?? {}), [slug]: candidate }));
      tail = run.catch(() => undefined);
      return run;
    },
    clearChoice: (slug: string): Promise<void> => {
      const run = tail.then(async () => {
        const { [slug]: _removed, ...rest } = (await store.get<Record<string, DocCandidate>>(CHOICE_KEY)) ?? {};
        await store.set(CHOICE_KEY, rest);
      });
      tail = run.catch(() => undefined);
      return run;
    },
    flagged: (slug: string): Promise<string[]> => read<string>(FLAGS_KEY, slug),
    addFlag: (slug: string, id: string): Promise<void> =>
      update<string>(FLAGS_KEY, (state) => {
        const list = state[slug] ?? [];
        return list.includes(id) ? state : { ...state, [slug]: [...list, id] };
      }),
  };
}
export type DocumentaryRepo = ReturnType<typeof createDocumentaryRepo>;
