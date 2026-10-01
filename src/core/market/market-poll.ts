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
  // Rechargements demandés par l'utilisateur, un par page et par filtre : relevés en priorité, sans attendre
  // les 30 min. `seq` est leur rang de priorité (le plus grand passe en premier ; le stockage ne garantit pas
  // l'ordre des clés).
  jobs?: Record<string, Job>;
  forceSeq?: number;
};

// `all` : les cartes de la page au moment du clic (change si le tri change) ; `slugs` : celles qui restent.
type Job = { filter: string; page: number; seq: number; all: string[]; slugs: string[] };

// La page de la Collection concernée : son numéro et les filtres actifs (chaîne vide = aucun).
export type ForceView = { filter: string; page: number };
export type ForceOutcome = 'created' | 'promoted' | 'running';
const DEFAULT_VIEW: ForceView = { filter: '', page: 1 };
const jobKey = (view: ForceView): string => `${view.filter}#${view.page}`;

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

  // Cartes forcées dont la recherche est faite dans cet onglet (avant l'écriture par lot dans le stockage).
  const forcedDone = new Set<string>();
  // Cartes déjà relevées dans la passe en cours : un rechargement forcé en cours de passe ne les relit pas.
  const passSeen = new Set<string>();

  // Cartes restantes d'un rechargement.
  const remainingOf = (state: Targets, job: Job): string[] =>
    job.slugs.filter((slug) => !forcedDone.has(slug) && state.wanted[slug] !== undefined);

  // Rechargements en cours, du plus prioritaire (le dernier forcé) au moins prioritaire.
  function liveJobs(state: Targets): [string, Job][] {
    return Object.entries(state.jobs ?? {})
      .filter(([, job]) => remainingOf(state, job).length > 0)
      .sort(([, a], [, b]) => b.seq - a.seq);
  }

  // Les cartes forcées, dans l'ordre : rechargement le plus prioritaire d'abord, puis ordre d'affichage.
  function forcedSlugs(state: Targets): string[] {
    const ordered = liveJobs(state).flatMap(([, job]) => remainingOf(state, job));
    return [...new Set(ordered)];
  }

  // Les cartes à relever : d'abord celles dont le rechargement est forcé (dans l'ordre demandé), puis celles vues
  // récemment à l'écran et pas relevées depuis 30 min. Pas de relevé pendant l'attente qui suit une erreur.
  function dueEntries(state: Targets, t: number): [string, Wanted][] {
    if (state.cooldownUntil !== undefined && t < state.cooldownUntil) return [];
    const forced = forcedSlugs(state);
    const isForced = new Set(forced);
    const normal = Object.entries(state.wanted).filter(([slug, w]) => {
      if (isForced.has(slug) || t - w.seenAt >= WANTED_TTL_MS) return false;
      const last = Math.max(state.polledAt[slug] ?? -Infinity, handled.get(slug) ?? -Infinity);
      return t - last >= POLL_INTERVAL_MS;
    });
    return [...forced.map((slug): [string, Wanted] => [slug, state.wanted[slug]!]), ...normal];
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

    // Rechargement demandé par l'utilisateur pour la page et le filtre affichés.
    // - Déjà en tête : rien de nouveau, les cartes se mettent juste à jour (`running`).
    // - En attente mais pas en tête : il passe en premier (`promoted`).
    // - Sinon : nouveau rechargement, prioritaire (`created`), sans attendre les 30 min ni l'attente après erreur.
    async force(targets: Target[], view: ForceView = DEFAULT_VIEW): Promise<ForceOutcome> {
      const t = now();
      const key = jobKey(view);
      const slugs = targets.map((target) => target.slug);
      let outcome: ForceOutcome = 'created';
      await mutate((state) => {
        const existing = state.jobs?.[key];
        const [headKey] = liveJobs(state)[0] ?? [];
        const same =
          existing !== undefined &&
          remainingOf(state, existing).length > 0 &&
          existing.all.length === slugs.length &&
          existing.all.every((slug, i) => slug === slugs[i]);

        if (same && headKey === key) {
          outcome = 'running';
          return state;
        }
        let seq = (state.forceSeq ?? 0) + 1;
        const jobs = { ...state.jobs };
        if (same) {
          outcome = 'promoted';
          jobs[key] = { ...existing!, seq };
          return { ...state, jobs, forceSeq: seq };
        }

        // Une carte relevée à l'instant dans la passe en cours est déjà à jour : on ne la relit pas.
        for (const slug of slugs) {
          if (passSeen.has(slug)) forcedDone.add(slug);
          else forcedDone.delete(slug);
        }
        const wanted = { ...state.wanted };
        for (const target of targets) {
          wanted[target.slug] = { title: target.title, seenAt: t };
          lastWanted.set(target.slug, t);
        }
        jobs[key] = { filter: view.filter, page: view.page, seq, all: slugs, slugs };
        const { cooldownUntil: _lifted, ...rest } = state;
        return { ...rest, wanted, jobs, forceSeq: seq };
      });
      notify();
      return outcome;
    },

    // Avancement du rechargement le plus prioritaire : `remaining` cartes restantes sur `total` (0 / 0 sans rechargement).
    async forceProgress(): Promise<{ remaining: number; total: number }> {
      await tail;
      const state = await load();
      const [, head] = liveJobs(state)[0] ?? [];
      return head ? { remaining: remainingOf(state, head).length, total: head.all.length } : { remaining: 0, total: 0 };
    },

    // Avancement du rechargement de la page et du filtre donnés ; `queued` : il attend derrière un autre.
    async forceStatus(view: ForceView): Promise<{ remaining: number; total: number; queued: boolean }> {
      await tail;
      const state = await load();
      const key = jobKey(view);
      const job = state.jobs?.[key];
      const remaining = job ? remainingOf(state, job).length : 0;
      if (!job || remaining === 0) return { remaining: 0, total: 0, queued: false };
      const [headKey] = liveJobs(state)[0] ?? [];
      return { remaining, total: job.all.length, queued: headKey !== key };
    },

    async tick(): Promise<TickResult> {
      if (running || !isVisible()) return 'skipped';
      running = true;
      try {
        const t = now();
        const state = await load();
        if (dueEntries(state, t).length === 0) return 'skipped';
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
            await mutate((s) => {
              const finished = new Set(slugs);
              const jobs: Record<string, Job> = {};
              for (const [key, job] of Object.entries(s.jobs ?? {})) {
                const left = job.slugs.filter((slug) => !finished.has(slug));
                if (left.length > 0) jobs[key] = { ...job, slugs: left };
              }
              return { ...s, jobs, polledAt: { ...s.polledAt, ...Object.fromEntries(slugs.map((slug) => [slug, at])) } };
            });
          }
        };

        // La liste est relue à chaque tour : un rechargement forcé demandé pendant la passe passe aussitôt devant.
        // Les cartes forcées ne comptent pas dans la limite de 60 requêtes de la passe.
        let normalDone = 0;
        passSeen.clear();
        const seen = passSeen;
        for (;;) {
          if (unloading) return 'interrupted';
          await tail;
          const current = await load();
          const forced = new Set(forcedSlugs(current));
          const next = dueEntries(current, now()).find(
            ([slug]) => !seen.has(slug) && (forced.has(slug) || normalDone < MAX_PER_PASS),
          );
          if (!next) break;
          const [slug, wanted] = next;
          seen.add(slug);

          let result: { auctions: MarketAuction[] };
          try {
            result = await api.searchMarket(wanted.title);
          } catch (error) {
            // Page en cours de déchargement : la requête échoue, ce n'est pas une panne du site.
            if (unloading) return 'interrupted';
            console.warn('[wikimasters-tools]', 'relevé du marché abandonné :', error);
            await flush();
            await mutate((s) => ({ ...s, jobs: {}, cooldownUntil: now() + POLL_INTERVAL_MS }));
            await dropLock();
            notify();
            return 'failed';
          }
          if (unloading) return 'interrupted';

          // La recherche renvoie aussi les titres voisins : seules les enchères de cette carte comptent.
          batch.push(...result.auctions.filter((a) => wikipediaSlug(a.card.wikipedia_url) === slug));
          done.push(slug);
          if (forced.has(slug)) forcedDone.add(slug);
          else normalDone += 1;
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
        passSeen.clear();
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
