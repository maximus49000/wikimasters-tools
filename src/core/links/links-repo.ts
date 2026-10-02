import type { KeyValueStore } from '../cache/store';
import { EMPTY_LINKS, needsLinksLookup, setLinks, type LinksState } from './links-book';

// `v2` : les liens viennent du wikitexte de l'introduction (lots de 50 articles). Les `links-v1` lus un article par requête,
// avec les liens que les modèles d'infobox ajoutent (« Genre musical », « Label discographique »…), sont laissés de côté.
const KEY = 'links-v2';
// Après un échec (429, hors ligne, stockage plein), on laisse Wikipédia respirer avant de réessayer.
const COOLDOWN_MS = 60_000;
// Articles lus par requête : la limite de l'API. Wikipédia accorde 200 requêtes par minute à chaque IP (mesuré : le quota se rétablit
// à chaque minute d'horloge, au-delà tout est refusé en 429) : 2233 cartes n'en demandent que 45.
export const BATCH_SIZE = 50;
// Requêtes en même temps. Peu importe : 45 requêtes tiennent en dix secondes à un seul lecteur.
export const CONCURRENCY = 2;
// Marge sous le quota de Wikipédia (200 requêtes par minute d'horloge et par IP) : la lecture de fond et les recherches de liaison
// partagent ce budget, glissant sur une minute. Une requête de plus aurait un 429 pour réponse, et tout serait refusé jusqu'à la minute suivante.
export const MAX_REQUESTS_PER_MINUTE = 120;
const WINDOW_MS = 60_000;
// Poids, en requêtes, d'une lecture des articles qui en citent d'autres (jusqu'à 3 requêtes pour un lot).
const BACKLINK_WEIGHT = 3;

// Les liens de l'introduction de plusieurs articles (slugs, au plus BATCH_SIZE), par article.
export type LinksFetcher = (slugs: string[]) => Promise<Record<string, string[]>>;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createLinksRepo(
  store: KeyValueStore,
  fetchLinks: LinksFetcher,
  sleep: (ms: number) => Promise<void> = realSleep,
  gapMs = 150,
  now: () => number = () => Date.now(),
  fetchBacklinks?: LinksFetcher,
) {
  // Écritures sérialisées ; lectures Wikipédia regroupées en un seul parcours à la fois.
  let writeTail: Promise<unknown> = Promise.resolve();
  const pending = new Set<string>();
  let current: Promise<void> | null = null;
  let failedAt: number | undefined;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  // Dates des requêtes de la dernière minute ; `paced` attend qu'il y ait de la place avant d'en lancer une.
  const sent: number[] = [];
  async function paced(weight = 1): Promise<void> {
    for (;;) {
      const t = now();
      while (sent.length > 0 && (sent[0] as number) <= t - WINDOW_MS) sent.shift();
      if (sent.length + weight <= MAX_REQUESTS_PER_MINUTE) break;
      await sleep(Math.max(50, (sent[0] ?? t) + WINDOW_MS - t));
    }
    const t = now();
    for (let i = 0; i < weight; i++) sent.push(t);
  }

  async function read(): Promise<LinksState> {
    return (await store.get<LinksState>(KEY)) ?? EMPTY_LINKS;
  }

  function update(change: (state: LinksState) => LinksState): Promise<void> {
    const run = writeTail.then(async () => {
      await store.set(KEY, change(await read()));
      notify();
    });
    writeTail = run.catch(() => undefined);
    return run;
  }

  async function load(): Promise<LinksState> {
    await writeTail;
    return read();
  }

  async function lookupAll(): Promise<void> {
    try {
      // Ce qui était déjà lu au départ, et ce que ce parcours a pris depuis, lu ou en cours de lecture (les demandes qui arrivent
      // en cours de route peuvent reprendre un article déjà pris : la vue n'a pas encore relu le stockage).
      const known = await load();
      const taken = new Set<string>();
      let failure: unknown;
      const writes: Promise<void>[] = [];
      const wanted = (slug: string) => !taken.has(slug) && needsLinksLookup(known, slug, now());

      // Le prochain lot, dans l'ordre où les articles ont été demandés.
      const takeBatch = (): string[] => {
        const batch: string[] = [];
        for (const slug of pending) {
          pending.delete(slug);
          if (!wanted(slug)) continue;
          taken.add(slug);
          batch.push(slug);
          if (batch.length >= BATCH_SIZE) break;
        }
        return batch;
      };

      const worker = async () => {
        let first = true;
        while (failure === undefined) {
          const batch = takeBatch();
          if (batch.length === 0) return;
          // Un lecteur n'attend qu'entre deux de ses propres requêtes.
          if (!first) await sleep(gapMs);
          first = false;
          try {
            await paced();
            const fetched = await fetchLinks(batch);
            // Chaque lot est écrit dès qu'il est lu, sans attendre l'autre lecteur.
            writes.push(
              update((latest) => setLinks(latest, fetched, now())).catch((error: unknown) => {
                failure ??= error;
              }),
            );
          } catch (error) {
            failure ??= error;
            return;
          }
        }
      };

      // Un article demandé juste avant la fin des lecteurs est repris par un nouveau tour.
      do {
        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
        await Promise.all(writes);
      } while (failure === undefined && [...pending].some(wanted));

      if (failure !== undefined) {
        // Hors ligne, 429, stockage plein… : on s'arrête, le reste sera réessayé après le délai de repos. Les lots lus avant
        // l'échec sont gardés : la lecture reprendra où elle s'est arrêtée.
        console.warn('[wikimasters-tools]', 'liens Wikipédia indisponibles :', failure);
        failedAt = now();
        pending.clear();
        notify();
      } else {
        pending.clear();
      }
    } finally {
      current = null;
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    // Vrai pendant la pause qui suit un échec : la vue le signale.
    failed: (): boolean => failedAt !== undefined && now() - failedAt < COOLDOWN_MS,
    // Lit tout de suite et dans l'ordre les articles qu'on n'a pas encore (recherche de liaison) : un lot de 50 par requête, au rythme du
    // budget partagé. Lève si Wikipédia échoue ; les lots déjà lus restent enregistrés.
    async readNow(slugs: string[], cancelled: () => boolean = () => false): Promise<LinksState> {
      const known = await load();
      const wanted = [...new Set(slugs)].filter((slug) => needsLinksLookup(known, slug, now()));
      for (let from = 0; from < wanted.length && !cancelled(); from += BATCH_SIZE) {
        await paced();
        if (cancelled()) break;
        const fetched = await fetchLinks(wanted.slice(from, from + BATCH_SIZE));
        await update((latest) => setLinks(latest, fetched, now()));
      }
      return load();
    },
    // Les articles qui citent chacun des articles donnés, pour chercher une liaison depuis l'arrivée. Non mémorisé.
    async citers(slugs: string[]): Promise<Record<string, string[]>> {
      if (!fetchBacklinks) return {};
      await paced(BACKLINK_WEIGHT);
      return fetchBacklinks(slugs);
    },
    resolveMissing(slugs: string[]): Promise<void> {
      if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return current ?? Promise.resolve();
      for (const slug of slugs) pending.add(slug);
      current ??= lookupAll();
      return current;
    },
  };
}

export type LinksRepo = ReturnType<typeof createLinksRepo>;
