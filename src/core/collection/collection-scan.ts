import type { CollectionPage } from '../api/collection-schemas';
import type { KeyValueStore } from '../cache/store';
import type { KnownCard } from './collection-book';
import type { CollectionRepo } from './collection-repo';

const KEY = 'collectionScan';
// Exemplaires comptés par le parcours complet en cours : la Collection garde ses anciens nombres jusqu'à la fin du parcours.
const COUNTS_KEY = 'collectionScanCounts';
// Un autre onglet qui a écrit son état il y a moins longtemps est considéré comme toujours en cours.
export const LOCK_MS = 60_000;
// À incrémenter quand le scan lit de nouveaux champs : un parcours terminé avant repart de zéro.
const SCAN_VERSION = 9;
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

// `tail` : les lignes (carte + date d'obtention) de la dernière page comptée, pour reconnaître celles qu'un décalage de la liste fait relire.
type DatedRow = { slug: string; at: number };
type StagedCounts = { nextPage: number; counts: Record<string, number>; tail?: DatedRow[] };

// Combien de lignes en tête de `rows` sont la fin de la page précédente relue : une carte obtenue entre deux pages décale la liste
// (triée de la plus récente à la plus ancienne), la page suivante recommence alors par des lignes déjà comptées.
// Le site ne donne pas d'identifiant d'exemplaire : on compare la carte et sa date d'obtention. Sans date, rien n'est écarté.
export function overlapWithPrevious(previous: DatedRow[], rows: { slug: string; at?: number }[]): number {
  for (let k = Math.min(previous.length, rows.length); k > 0; k -= 1) {
    const offset = previous.length - k;
    if (rows.slice(0, k).every((row, i) => row.at !== undefined && row.slug === previous[offset + i]?.slug && row.at === previous[offset + i]?.at)) return k;
  }
  return 0;
}

const datedRows = (rows: { slug: string; at?: number }[]): DatedRow[] =>
  rows.every((row) => row.at !== undefined) ? rows.map((row) => ({ slug: row.slug, at: row.at as number })) : [];

export const IDLE_SCAN: ScanState = { status: 'idle', nextPage: 0, entries: 0, updatedAt: 0 };

export type ScannerDeps = {
  api: { getCollectionPage(page: number, filter?: string, sort?: 'rarity' | 'added'): Promise<CollectionPage> };
  collection: Pick<CollectionRepo, 'observe' | 'replaceCopies'>;
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
        // Les cartes nouvelles ne sont ajoutées qu'au bout du parcours, avec la nouvelle date de reprise : un parcours interrompu
        // (429, rechargement) n'a rien ajouté, sa reprise ne compte donc pas deux fois les mêmes exemplaires.
        const gathered = new Map<string, KnownCard>();
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
            for (const card of added) {
              const known = gathered.get(card.slug);
              gathered.set(card.slug, known ? { ...card, copies: (known.copies ?? 0) + (card.copies ?? 0) } : card);
            }
          }
          entries += rows.filter((row) => fresh.has(row.slug)).length;
          page += 1;
        }
        if (!reached) throw new Error('limite de pages atteinte');
        await collection.observe([...gathered.values()], true);
        page = 0;
        await write(snapshot('done', { ...(seenNewest !== undefined ? { lastObtainedAt: seenNewest } : {}) }));
        return;
      }

      // Le parcours compte à part : la Collection garde ses nombres (et reste filtrable par « ×2 ») jusqu'à la fin.
      let counts: Record<string, number> = {};
      let tail: DatedRow[] = [];
      if (page > 0) {
        const staged = await store.get<StagedCounts>(COUNTS_KEY);
        if (staged?.nextPage === page) {
          counts = staged.counts;
          tail = staged.tail ?? [];
          // Les cartes obtenues depuis le début de ce parcours sont en page 0, que la reprise ne relit pas : on la relit d'abord
          // pour qu'une carte achetée pendant l'interruption ait sa rareté, ses stats et sa date. Les nombres restent ceux du parcours.
          await write(snapshot('running'));
          const head = await api.getCollectionPage(0, undefined, 'added');
          pageSize = Math.max(pageSize, head.entries);
          await collection.observe(head.cards.map(({ copies: _copies, ...rest }) => rest), false);
          // Une carte absente des nombres déjà comptés est nouvelle : sans cela, la fin du parcours la retirerait comme « vendue ».
          for (const { slug, copies } of head.cards) if (!(slug in counts)) counts[slug] = copies ?? 1;
          for (const row of head.obtained ?? []) pending = newest(pending, row.at);
        } else {
          page = 0;
          entries = 0;
          pending = undefined;
        }
      }
      while (page < maxPages) {
        await write(snapshot('running'));
        const result = await api.getCollectionPage(page, undefined, 'added');
        pageSize = Math.max(pageSize, result.entries);
        if (result.entries === 0) {
          // Les cartes que ce parcours n'a pas recomptées ont été vendues ou échangées.
          await collection.replaceCopies(counts);
          await store.set(COUNTS_KEY, null);
          await write(snapshot('done', { fullAt: now(), ...(pending !== undefined ? { lastObtainedAt: pending } : {}) }));
          return;
        }
        await collection.observe(result.cards.map(({ copies: _copies, ...rest }) => rest), false);
        const rows = result.obtained ?? [];
        if (rows.length > 0) {
          // Les lignes déjà comptées (liste décalée par une carte obtenue entre deux pages) ne le sont pas une seconde fois.
          for (const row of rows.slice(overlapWithPrevious(tail, rows))) counts[row.slug] = (counts[row.slug] ?? 0) + 1;
        } else {
          for (const { slug, copies } of result.cards) counts[slug] = (counts[slug] ?? 0) + (copies ?? 1);
        }
        tail = datedRows(rows);
        for (const row of rows) pending = newest(pending, row.at);
        entries += result.entries;
        page += 1;
        await store.set(COUNTS_KEY, { nextPage: page, counts, tail } satisfies StagedCounts);
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
