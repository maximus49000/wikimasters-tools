import type { CollectionPage } from '../api/collection-schemas';
import type { KeyValueStore } from '../cache/store';
import type { CollectionRepo } from './collection-repo';

const KEY = 'collectionScan';
// Un autre onglet qui a écrit son état il y a moins longtemps est considéré comme toujours en cours.
export const LOCK_MS = 60_000;
// À incrémenter quand le scan lit de nouveaux champs : un parcours terminé avant repart de zéro.
const SCAN_VERSION = 7;
// La mise à jour incrémentale n'ajoute que les cartes récentes : une carte vendue ou échangée n'est jamais décomptée.
// Les exemplaires sont donc recomptés sur toute la Collection au plus tard à cette échéance.
export const FULL_REFRESH_MS = 3_600_000;

export type ScanState = {
  status: 'idle' | 'running' | 'done' | 'error';
  // Prochaine page à lire (0-indexée) : c'est là que la reprise repart (parcours complet seulement).
  nextPage: number;
  // Entrées lues depuis le début du parcours complet en cours (ou cumulées après les mises à jour).
  entries: number;
  updatedAt: number;
  // Absent des états écrits avant la version 2.
  version?: number;
  error?: string;
  // « full » : tout lire ; « incremental » : seulement les cartes obtenues depuis le dernier import.
  pass?: 'full' | 'incremental';
  // Date d'obtention (ms) de la carte la plus récente vue par le dernier import terminé.
  lastObtainedAt?: number;
  // Idem pour le parcours complet en cours, pour qu'une reprise ne la perde pas.
  pendingObtainedAt?: number;
  // Plus grande page lue (entrées d'une page de l'API du site) : la taille de page de la vue Homemade.
  pageSize?: number;
  // Fin (ms) du dernier parcours complet : les exemplaires comptés sont exacts à cette date.
  fullAt?: number;
};

export const IDLE_SCAN: ScanState = { status: 'idle', nextPage: 0, entries: 0, updatedAt: 0 };

export type ScannerDeps = {
  api: { getCollectionPage(page: number, filter?: string, sort?: 'rarity' | 'added'): Promise<CollectionPage> };
  collection: Pick<CollectionRepo, 'observe' | 'resetCopies'>;
  store: KeyValueStore;
  now?: () => number;
  maxPages?: number;
  // Programme une reprise différée (setTimeout par défaut) ; injectable pour les tests.
  schedule?: (fn: () => void, ms: number) => void;
};

export function createCollectionScanner({
  api,
  collection,
  store,
  now = () => Date.now(),
  maxPages = 200,
  schedule = (fn, ms) => void setTimeout(fn, ms),
}: ScannerDeps) {
  const listeners = new Set<() => void>();
  // Parcours en cours dans cet onglet (rendu aux appels simultanés), et force demandé pendant ce temps.
  let active: Promise<void> | null = null;
  let forceQueued = false;
  let retryScheduled = false;

  // Dernier état lu ou écrit : une vue qui se remonte repart de là, sans attendre le stockage.
  let latest: ScanState | null = null;

  async function state(): Promise<ScanState> {
    latest = (await store.get<ScanState>(KEY)) ?? IDLE_SCAN;
    return latest;
  }

  async function write(next: ScanState): Promise<void> {
    await store.set(KEY, next);
    latest = next;
    for (const listener of listeners) listener();
  }

  const newest = (a: number | undefined, b: number | undefined): number | undefined =>
    a === undefined ? b : b === undefined ? a : Math.max(a, b);

  // Une page à la fois (l'espacement et le backoff 429 sont ceux de l'API). Aucune nouvelle
  // tentative en boucle : à la première erreur on s'arrête, la reprise se fait au prochain appel.
  // Import déjà terminé : on lit les cartes de la plus récente à la plus ancienne et on s'arrête
  // à la première obtenue avant le dernier import (souvent une seule requête).
  async function pass({ force }: { force: boolean }): Promise<void> {
    let saved: ScanState = IDLE_SCAN;
    let mode: 'full' | 'incremental' = 'full';
    let page = 0;
    let entries = 0;
    let pending: number | undefined;
    let pageSize = 0;
    try {
      saved = await state();
      pageSize = saved.pageSize ?? 0;
      if (saved.status === 'running' && now() - saved.updatedAt < LOCK_MS) {
        // Un autre chargement de page scanne (ou vient de l'être, p. ex. rechargement en cours de
        // scan) : on revient voir une fois le verrou expiré, une seule fois à la fois.
        if (!retryScheduled) {
          retryScheduled = true;
          const remaining = LOCK_MS - (now() - saved.updatedAt);
          schedule(() => {
            retryScheduled = false;
            void run();
          }, remaining + 1000);
        }
        return;
      }

      const current = saved.version === SCAN_VERSION;
      // Un parcours complet récent : les nombres d'exemplaires sont frais, la mise à jour incrémentale suffit.
      const countsFresh = saved.fullAt !== undefined && now() - saved.fullAt < FULL_REFRESH_MS;
      const canIncrement = current && saved.lastObtainedAt !== undefined && countsFresh;
      if (!force && canIncrement && (saved.status === 'done' || saved.pass === 'incremental')) {
        mode = 'incremental';
        entries = saved.entries;
      } else if (!force && current && saved.pass !== 'incremental' && saved.status !== 'done' && saved.status !== 'idle') {
        page = saved.nextPage;
        entries = saved.entries;
        pending = saved.pendingObtainedAt;
      }
      const last = saved.lastObtainedAt;
      const snapshot = (status: ScanState['status'], extra: Partial<ScanState> = {}): ScanState => ({
        status,
        nextPage: page,
        entries,
        updatedAt: now(),
        version: SCAN_VERSION,
        pass: mode,
        ...(last !== undefined ? { lastObtainedAt: last } : {}),
        ...(saved.fullAt !== undefined ? { fullAt: saved.fullAt } : {}),
        ...(mode === 'full' && status !== 'done' && pending !== undefined ? { pendingObtainedAt: pending } : {}),
        ...(pageSize > 0 ? { pageSize } : {}),
        ...extra,
      });

      if (mode === 'incremental') {
        let reached = false;
        let seenNewest = last;
        while (page < maxPages && !reached) {
          await write(snapshot('running'));
          const result = await api.getCollectionPage(page, undefined, 'added');
          pageSize = Math.max(pageSize, result.entries);
          const rows = result.obtained ?? [];
          // Sans le tri par date, l'arrêt anticipé raterait des cartes : mieux vaut échouer que se tromper.
          for (let i = 1; i < rows.length; i += 1) {
            const before = rows[i - 1]?.at;
            const after = rows[i]?.at;
            if (before !== undefined && after !== undefined && after > before) {
              throw new Error('le tri par date d’ajout n’est pas respecté');
            }
          }
          const fresh = new Map<string, number>();
          for (const row of rows) {
            if (row.at !== undefined && last !== undefined && row.at <= last) reached = true;
            else fresh.set(row.slug, (fresh.get(row.slug) ?? 0) + 1);
            seenNewest = newest(seenNewest, row.at);
          }
          if (result.entries === 0) reached = true;
          else {
            // Seules les copies nouvelles s'ajoutent au compte déjà connu.
            const added = rows.length > 0 ? result.cards.filter((c) => fresh.has(c.slug)).map((c) => ({ ...c, copies: fresh.get(c.slug) ?? 0 })) : result.cards;
            await collection.observe(added, true);
          }
          entries += rows.filter((row) => fresh.has(row.slug)).length;
          page += 1;
        }
        if (!reached) throw new Error('limite de pages atteinte');
        page = 0;
        await write(snapshot('done', { ...(seenNewest !== undefined ? { lastObtainedAt: seenNewest } : {}) }));
        return;
      }

      // Un parcours qui repart de la première page recompte les exemplaires depuis zéro.
      if (page === 0) await collection.resetCopies();
      while (page < maxPages) {
        await write(snapshot('running'));
        const result = await api.getCollectionPage(page, undefined, 'added');
        pageSize = Math.max(pageSize, result.entries);
        if (result.entries === 0) {
          await write(snapshot('done', { fullAt: now(), ...(pending !== undefined ? { lastObtainedAt: pending } : {}) }));
          return;
        }
        await collection.observe(result.cards, true);
        for (const row of result.obtained ?? []) pending = newest(pending, row.at);
        entries += result.entries;
        page += 1;
      }
      await write(snapshot('error', { error: 'limite de pages atteinte' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await write({
        status: 'error',
        nextPage: mode === 'full' ? page : 0,
        entries,
        updatedAt: now(),
        version: SCAN_VERSION,
        pass: mode,
        ...(saved.lastObtainedAt !== undefined ? { lastObtainedAt: saved.lastObtainedAt } : {}),
        ...(saved.fullAt !== undefined ? { fullAt: saved.fullAt } : {}),
        ...(mode === 'full' && pending !== undefined ? { pendingObtainedAt: pending } : {}),
        ...(pageSize > 0 ? { pageSize } : {}),
        error: message,
      }).catch(() => undefined);
    }
  }

  // Un seul parcours à la fois dans cet onglet. Un `force` demandé pendant un parcours déjà en cours (p. ex. la mise à jour
  // du chargement de la page) n'est pas perdu : un parcours complet suit, et l'appel ne se termine qu'ensuite.
  function run({ force = false }: { force?: boolean } = {}): Promise<void> {
    if (active) {
      if (force) forceQueued = true;
      return active;
    }
    active = (async () => {
      try {
        await pass({ force });
        while (forceQueued) {
          forceQueued = false;
          await pass({ force: true });
        }
      } finally {
        active = null;
      }
    })();
    return active;
  }

  return {
    run,
    state,
    snapshot: (): ScanState | null => latest,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type CollectionScanner = ReturnType<typeof createCollectionScanner>;
