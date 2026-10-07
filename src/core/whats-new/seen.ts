import type { KeyValueStore } from '../cache/store';
import type { Entry, Fix } from './types';

const KEY = 'whats-new-v1';

type State = { announced: string[]; consulted: string[] };
export type Pending = { entries: Entry[]; fixes: Fix[] };

// Ce qui a déjà été annoncé (fenêtre après mise à jour) et déjà consulté (grisé dans les grilles et dans WikiHow).
export function createWhatsNewRepo(store: KeyValueStore) {
  const load = async (): Promise<State> => (await store.get<State>(KEY)) ?? { announced: [], consulted: [] };
  return {
    // Premier lancement (rien d'enregistré) : l'existant est marqué annoncé, sauf les fiches « fresh ».
    async pending(entries: Entry[], fixes: Fix[]): Promise<Pending> {
      const state = await store.get<State>(KEY);
      if (!state) {
        await store.set<State>(KEY, { announced: [...entries.filter((e) => !e.fresh).map((e) => e.id), ...fixes.map((f) => f.id)], consulted: [] });
        return { entries: entries.filter((e) => e.fresh), fixes: [] };
      }
      const known = new Set(state.announced);
      return { entries: entries.filter((e) => !known.has(e.id)), fixes: fixes.filter((f) => !known.has(f.id)) };
    },
    async markAnnounced(ids: string[]): Promise<void> {
      const state = await load();
      await store.set<State>(KEY, { ...state, announced: [...new Set([...state.announced, ...ids])] });
    },
    async consulted(): Promise<Set<string>> {
      return new Set((await load()).consulted);
    },
    async markConsulted(id: string): Promise<void> {
      const state = await load();
      if (state.consulted.includes(id)) return;
      await store.set<State>(KEY, { ...state, consulted: [...state.consulted, id] });
    },
  };
}

export type WhatsNewRepo = ReturnType<typeof createWhatsNewRepo>;
