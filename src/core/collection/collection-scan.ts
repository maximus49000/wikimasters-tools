import type { CollectionPage } from '../api/collection-schemas';
import type { KeyValueStore } from '../cache/store';
import type { CollectionRepo } from './collection-repo';

const KEY = 'collectionScan';
// Un autre onglet qui a écrit son état il y a moins longtemps est considéré comme toujours en cours.
const LOCK_MS = 60_000;
// À incrémenter quand le scan lit de nouveaux champs : un parcours terminé avant repart de zéro.
const SCAN_VERSION = 5;

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
};

export const IDLE_SCAN: ScanState = { status: 'idle', nextPage: 0, entries: 0, updatedAt: 0 };

export type ScannerDeps = {
  api: { getCollectionPage(page: number, filter?: string, sort?: 'rarity' | 'added'): Promise<CollectionPage> };
  collection: Pick<CollectionRepo, 'observe'>;
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
  let active = false;
  let retryScheduled = false;

  async function state(): Promise<ScanState> {
    return (await store.get<ScanState>(KEY)) ?? IDLE_SCAN;
  }

  async function write(next: ScanState): Promise<void> {
    await store.set(KEY, next);
    for (const listener of listeners) listener();
  }

  const newest = (a: number | undefined, b: number | undefined): number | undefined =>
    a === undefined ? b : b === undefined ? a : Math.max(a, b);

  // Une page à la fois (l'espacement et le backoff 429 sont ceux de l'API). Aucune nouvelle
  // tentative en boucle : à la première erreur on s'arrête, la reprise se fait au prochain appel.
  // Import déjà terminé : on lit les cartes de la plus récente à la plus ancienne et on s'arrête
  // à la première obtenue avant le dernier import (souvent une seule requête).
  async function run({ force = false }: { force?: boolean } = {}): Promise<void> {
    if (active) return;
    active = true;
    let saved: ScanState = IDLE_SCAN;
    let mode: 'full' | 'incremental' = 'full';
    let page = 0;
    let entries = 0;
    let pending: number | undefined;
    try {
      saved = await state();
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
      const canIncrement = current && saved.lastObtainedAt !== undefined;
      if (!force && canIncrement && (saved.status === 'done' || saved.pass === 'incremental')) {
        mode = 'incremental';
        entries = saved.entries;
      } else if (!force && current && saved.status !== 'done' && saved.status !== 'idle') {
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
        ...(mode === 'full' && status !== 'done' && pending !== undefined ? { pendingObtainedAt: pending } : {}),
        ...extra,
      });

      if (mode === 'incremental') {
        let reached = false;
        let seenNewest = last;
        while (page < maxPages && !reached) {
          await write(snapshot('running'));
          const result = await api.getCollectionPage(page, undefined, 'added');
          const rows = result.obtained ?? [];
          // Sans le tri par date, l'arrêt anticipé raterait des cartes : mieux vaut échouer que se tromper.
          for (let i = 1; i < rows.length; i += 1) {
            const before = rows[i - 1]?.at;
            const after = rows[i]?.at;
            if (before !== undefined && after !== undefined && after > before) {
              throw new Error('le tri par date d’ajout n’est pas respecté');
            }
          }
          const fresh = new Set<string>();
          for (const row of rows) {
            if (row.at !== undefined && last !== undefined && row.at <= last) reached = true;
            else fresh.add(row.slug);
            seenNewest = newest(seenNewest, row.at);
          }
          if (result.entries === 0) reached = true;
          else await collection.observe(rows.length > 0 ? result.cards.filter((c) => fresh.has(c.slug)) : result.cards);
          entries += rows.filter((row) => fresh.has(row.slug)).length;
          page += 1;
        }
        if (!reached) throw new Error('limite de pages atteinte');
        page = 0;
        await write(snapshot('done', { ...(seenNewest !== undefined ? { lastObtainedAt: seenNewest } : {}) }));
        return;
      }

      while (page < maxPages) {
        await write(snapshot('running'));
        const result = await api.getCollectionPage(page, undefined, 'added');
        if (result.entries === 0) {
          await write(snapshot('done', pending !== undefined ? { lastObtainedAt: pending } : {}));
          return;
        }
        await collection.observe(result.cards);
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
        ...(mode === 'full' && pending !== undefined ? { pendingObtainedAt: pending } : {}),
        error: message,
      }).catch(() => undefined);
    } finally {
      active = false;
    }
  }

  return {
    run,
    state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type CollectionScanner = ReturnType<typeof createCollectionScanner>;
