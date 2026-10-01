import type { GameApi } from '../api/game-api';
import type { KeyValueStore } from '../cache/store';
import type { HistoryRepo } from './history-repo';
import type { MarketAuction } from './schemas';

export const POLL_INTERVAL_MS = 30 * 60_000;
// Un relevé interrompu (navigation, onglet fermé) n'est repris que s'il est récent : au-delà, les prix ont trop bougé.
const RESUME_MAX_MS = 10 * 60_000;
// Un onglet qui n'a rien écrit depuis ce délai est considéré mort : un autre peut reprendre son relevé.
const LOCK_STALE_MS = 20_000;
// Garde-fou : le marché ne devrait jamais compter autant de pages.
const MAX_PAGES = 100;
const KEY = 'market-poll';

// Progression d'un relevé, écrite après chaque page : elle survit au changement de page du site.
type Progress = {
  owner: string | null;
  startedAt: number;
  updatedAt: number;
  nextPage: number;
  auctions: MarketAuction[];
};

export type CollectorDeps = {
  api: Pick<GameApi, 'getMarketPage'>;
  history: Pick<HistoryRepo, 'record' | 'markAttempt' | 'lastPollAt'>;
  store: KeyValueStore;
  now: () => number;
  isVisible: () => boolean;
  // Identifiant propre à cet onglet (verrou).
  id: string;
};

export type TickResult = 'ran' | 'skipped' | 'interrupted' | 'failed';

// Relevé complet du marché, en lecture seule, indépendant de la page affichée.
// - Reprenable : après un changement de page, le script suivant repart de la page non lue.
// - Un seul onglet à la fois (verrou daté dans le stockage, périmé après 20 s sans activité).
// - Toute vraie erreur (déconnexion, 429 persistant, format) abandonne le relevé sans rien enregistrer.
export function createMarketCollector(deps: CollectorDeps) {
  const { api, history, store, now, isVisible, id } = deps;
  let running = false;
  let unloading = false;
  let current: Progress | null = null;
  let releasing: Promise<void> = Promise.resolve();

  const load = async (): Promise<Progress | null> => (await store.get<Progress | null>(KEY)) ?? null;

  async function loop(start: Progress): Promise<TickResult> {
    let state = start;
    current = state;
    await store.set(KEY, state);
    try {
      for (let page = state.nextPage; page <= MAX_PAGES; page++) {
        const result = await api.getMarketPage(page);
        // La page se décharge : ce qui revient n'est plus à nous, la reprise relira cette page.
        if (unloading) return 'interrupted';

        const seen = new Set(state.auctions.map((a) => a.id));
        state = {
          ...state,
          auctions: [...state.auctions, ...result.auctions.filter((a) => !seen.has(a.id))],
          nextPage: page + 1,
          updatedAt: now(),
        };
        current = state;
        if (!result.hasMore) {
          await history.record(state.auctions);
          await store.set(KEY, null);
          return 'ran';
        }
        await store.set(KEY, state);
      }
      throw new Error(`marché : plus de ${MAX_PAGES} pages, relevé abandonné`);
    } catch (error) {
      if (unloading) return 'interrupted';
      console.warn('[wikimasters-tools]', 'relevé du marché abandonné :', error);
      await store.set(KEY, null);
      return 'failed';
    }
  }

  return {
    async tick(): Promise<TickResult> {
      if (running || !isVisible()) return 'skipped';
      running = true;
      try {
        const t = now();
        const saved = await load();
        const resumable = saved !== null && t - saved.startedAt < RESUME_MAX_MS;

        if (resumable && saved.owner !== null && saved.owner !== id && t - saved.updatedAt < LOCK_STALE_MS) {
          return 'skipped';
        }
        if (resumable) {
          const result = await loop({ ...saved, owner: id, updatedAt: t });
          await releasing;
          return result;
        }

        if (t - (await history.lastPollAt()) < POLL_INTERVAL_MS) return 'skipped';
        // La tentative est datée d'abord : un échec n'entraîne pas de relance en boucle.
        await history.markAttempt();
        const result = await loop({ owner: id, startedAt: t, updatedAt: t, nextPage: 1, auctions: [] });
        await releasing;
        return result;
      } finally {
        running = false;
      }
    },

    // La page se décharge (pagehide) : on libère le verrou pour que la page suivante reprenne aussitôt.
    release(): Promise<void> {
      unloading = true;
      releasing = current ? store.set(KEY, { ...current, owner: null }) : Promise.resolve();
      return releasing;
    },

    // Page restaurée depuis le cache de navigation (pageshow) : le collecteur peut repartir.
    activate(): void {
      unloading = false;
    },
  };
}

export type MarketCollector = ReturnType<typeof createMarketCollector>;
