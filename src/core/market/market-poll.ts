import type { GameApi } from '../api/game-api';
import type { KeyValueStore } from '../cache/store';
import type { HistoryRepo } from './history-repo';
import { wikipediaSlug } from './market-book';
import type { MarketAuction } from './schemas';

// Une même carte n'est relevée qu'une fois par ce délai.
export const POLL_INTERVAL_MS = 30 * 60_000;
// Une carte n'est relevée que si elle a été vue à l'écran récemment.
const WANTED_TTL_MS = 10 * 60_000;
// Un onglet qui n'a rien écrit depuis ce délai est considéré mort : un autre peut prendre le relais.
const LOCK_STALE_MS = 20_000;
// Au plus 60 requêtes par passe (~90 s) : le reste suit à la passe suivante.
const MAX_PER_PASS = 60;
// Les résultats sont enregistrés par lots : une navigation ne perd que le lot en cours.
const CHUNK = 10;
const WANT_DEBOUNCE_MS = 60_000;
const TARGETS_KEY = 'market-targets';
const LOCK_KEY = 'market-lock';

export type Target = { slug: string; title: string };

type Wanted = Targets['wanted'][string];

type Targets = {
  wanted: Record<string, { title: string; seenAt: number }>;
  polledAt: Record<string, number>;
  // Après une vraie erreur (déconnexion, 429 persistant), on n'insiste pas avant cette date.
  cooldownUntil?: number;
};

type Lock = { owner: string | null; updatedAt: number };

export type CollectorDeps = {
  api: Pick<GameApi, 'searchMarket'>;
  history: Pick<HistoryRepo, 'record'>;
  store: KeyValueStore;
  now: () => number;
  isVisible: () => boolean;
  // Identifiant propre à cet onglet (verrou).
  id: string;
};

export type TickResult = 'ran' | 'skipped' | 'interrupted' | 'failed';

// Relevé, en lecture seule, des seules cartes de la Collection affichées à l'écran :
// une recherche par titre (comme la page Marché du site), au plus une fois par carte et par 30 min.
// - Indépendant de la page affichée, et sans état à sauvegarder pour survivre à une navigation :
//   la date du dernier relevé est tenue carte par carte, la page suivante ne refait que ce qui reste.
// - Un seul onglet à la fois (verrou daté dans le stockage, périmé après 20 s sans activité).
// - Une vraie erreur arrête la passe ; ce qui est déjà relevé reste enregistré.
export function createMarketCollector(deps: CollectorDeps) {
  const { api, history, store, now, isVisible, id } = deps;
  let running = false;
  let unloading = false;
  let holdsLock = false;
  let releasing: Promise<void> = Promise.resolve();
  let tail: Promise<unknown> = Promise.resolve();
  const lastWanted = new Map<string, number>();
  // Cartes dont la recherche est faite dans cet onglet (avant même l'écriture par lot dans le stockage).
  const handled = new Map<string, number>();
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  // Les cartes à relever : vues récemment à l'écran, pas relevées depuis 30 min, hors délai de retrait.
  function dueEntries(state: Targets, t: number): [string, Wanted][] {
    if (state.cooldownUntil !== undefined && t < state.cooldownUntil) return [];
    return Object.entries(state.wanted).filter(([slug, w]) => {
      if (t - w.seenAt >= WANTED_TTL_MS) return false;
      const last = Math.max(state.polledAt[slug] ?? -Infinity, handled.get(slug) ?? -Infinity);
      return t - last >= POLL_INTERVAL_MS;
    });
  }

  const load = async (): Promise<Targets> =>
    (await store.get<Targets>(TARGETS_KEY)) ?? { wanted: {}, polledAt: {} };

  // Lecture-fusion-écriture sérialisées dans l'onglet.
  function mutate(change: (state: Targets) => Targets): Promise<void> {
    const run = tail.then(async () => store.set(TARGETS_KEY, change(await load())));
    tail = run.catch(() => undefined);
    return run;
  }

  async function takeLock(t: number): Promise<boolean> {
    const lock = await store.get<Lock>(LOCK_KEY);
    if (lock && lock.owner !== null && lock.owner !== id && t - lock.updatedAt < LOCK_STALE_MS) return false;
    await store.set(LOCK_KEY, { owner: id, updatedAt: t });
    holdsLock = true;
    return true;
  }

  async function dropLock(): Promise<void> {
    if (!holdsLock) return;
    holdsLock = false;
    await store.set(LOCK_KEY, { owner: null, updatedAt: 0 });
  }

  return {
    // Les cartes affichées maintenant : appelé à chaque lecture de la page, donc dédoublonné.
    // Résout `true` quand de nouvelles cartes ont été enregistrées (il y a peut-être du travail).
    want(targets: Target[]): Promise<boolean> {
      const t = now();
      const fresh = targets.filter((target) => t - (lastWanted.get(target.slug) ?? -Infinity) >= WANT_DEBOUNCE_MS);
      if (fresh.length === 0) return Promise.resolve(false);
      for (const target of fresh) lastWanted.set(target.slug, t);
      return mutate((state) => {
        const wanted = { ...state.wanted };
        for (const target of fresh) wanted[target.slug] = { title: target.title, seenAt: t };
        // On oublie ce qui n'a plus été vu depuis longtemps, et les dates de relevé de plus d'un jour.
        for (const [slug, entry] of Object.entries(wanted)) if (t - entry.seenAt > WANTED_TTL_MS) delete wanted[slug];
        const polledAt = Object.fromEntries(
          Object.entries(state.polledAt).filter(([, at]) => t - at < 24 * 3_600_000),
        );
        return { ...state, wanted, polledAt };
      }).then(() => {
        notify();
        return true;
      });
    },

    async tick(): Promise<TickResult> {
      if (running || !isVisible()) return 'skipped';
      running = true;
      try {
        const t = now();
        const state = await load();
        const pending = dueEntries(state, t).slice(0, MAX_PER_PASS);
        if (pending.length === 0) return 'skipped';
        if (!(await takeLock(t))) return 'skipped';

        let batch: MarketAuction[] = [];
        let done: string[] = [];
        const flush = async (): Promise<void> => {
          if (batch.length > 0) await history.record(batch);
          const at = now();
          const slugs = done;
          batch = [];
          done = [];
          if (slugs.length > 0) {
            await mutate((s) => ({ ...s, polledAt: { ...s.polledAt, ...Object.fromEntries(slugs.map((slug) => [slug, at])) } }));
          }
        };

        for (const [slug, wanted] of pending) {
          if (unloading) return 'interrupted';
          let result: { auctions: MarketAuction[] };
          try {
            result = await api.searchMarket(wanted.title);
          } catch (error) {
            // Page en cours de déchargement : la requête échoue, ce n'est pas une panne du site.
            if (unloading) return 'interrupted';
            console.warn('[wikimasters-tools]', 'relevé du marché abandonné :', error);
            await flush();
            await mutate((s) => ({ ...s, cooldownUntil: now() + POLL_INTERVAL_MS }));
            await dropLock();
            notify();
            return 'failed';
          }
          if (unloading) return 'interrupted';

          // La recherche renvoie aussi les titres voisins : seules les enchères de cette carte comptent.
          batch.push(...result.auctions.filter((a) => wikipediaSlug(a.card.wikipedia_url) === slug));
          done.push(slug);
          handled.set(slug, now());
          notify();
          await store.set(LOCK_KEY, { owner: id, updatedAt: now() });
          if (done.length >= CHUNK) await flush();
        }
        await flush();
        await dropLock();
        return 'ran';
      } finally {
        running = false;
        await releasing;
        notify();
      }
    },

    // Les cartes en attente de relevé (en file ou en cours) : elles affichent le glyphe de chargement.
    async pendingSlugs(): Promise<Set<string>> {
      await tail;
      return new Set(dueEntries(await load(), now()).map(([slug]) => slug));
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    // La page se décharge (pagehide) : on libère le verrou pour que la page suivante reprenne aussitôt.
    release(): Promise<void> {
      unloading = true;
      releasing = holdsLock ? dropLock() : Promise.resolve();
      notify();
      return releasing;
    },

    // Page restaurée depuis le cache de navigation (pageshow) : le collecteur peut repartir.
    activate(): void {
      unloading = false;
    },
  };
}

export type MarketCollector = ReturnType<typeof createMarketCollector>;
