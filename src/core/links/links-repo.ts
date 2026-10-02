import type { KeyValueStore } from '../cache/store';
import { EMPTY_LINKS, needsLinksLookup, setLinks, type LinksState } from './links-book';

const KEY = 'links-v1';
// Après un échec (429, hors ligne, stockage plein), on laisse Wikipédia respirer avant de réessayer.
const COOLDOWN_MS = 60_000;
// Les articles lus sont enregistrés par groupes : une écriture par article réécrirait tout le stockage à chaque fois.
export const WRITE_EVERY = 10;
// Articles lus en même temps. Mesuré depuis un navigateur : 4 lecteurs à la fois (3 requêtes par seconde) passent sans limitation
// de débit, quatre fois plus vite qu'un seul (2233 cartes : douze minutes au lieu d'une heure).
export const CONCURRENCY = 4;

// Les liens de l'introduction d'un article (slugs), un article par requête.
export type LinksFetcher = (slug: string) => Promise<string[]>;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createLinksRepo(
  store: KeyValueStore,
  fetchLinks: LinksFetcher,
  sleep: (ms: number) => Promise<void> = realSleep,
  gapMs = 150,
  now: () => number = () => Date.now(),
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
      // Ce qui était déjà lu au départ, et ce que ce parcours a lu depuis (les demandes qui arrivent en cours de route
      // peuvent reprendre un article déjà lu : la vue n'a pas encore relu le stockage).
      const known = await load();
      const readNow = new Set<string>();
      let buffer: Record<string, string[]> = {};
      let buffered = 0;
      let failure: unknown;
      const writes: Promise<void>[] = [];

      // Les articles lus sont écrits dès qu'il y en a dix, sans attendre les lecteurs encore occupés.
      const flush = () => {
        if (buffered === 0) return;
        const group = buffer;
        buffer = {};
        buffered = 0;
        writes.push(
          update((latest) => setLinks(latest, group, now())).catch((error: unknown) => {
            failure ??= error;
          }),
        );
      };

      // Le prochain article à lire, dans l'ordre où il a été demandé.
      const take = (): string | undefined => {
        for (const slug of pending) {
          pending.delete(slug);
          if (!readNow.has(slug) && needsLinksLookup(known, slug, now())) return slug;
        }
        return undefined;
      };

      const worker = async () => {
        let first = true;
        while (failure === undefined) {
          const slug = take();
          if (slug === undefined) return;
          // Un lecteur n'attend qu'entre deux de ses propres requêtes.
          if (!first) await sleep(gapMs);
          first = false;
          try {
            // Le résultat est d'abord attendu : `buffer[slug] = await …` viserait le tampon d'avant, déjà écrit si un
            // enregistrement l'a remplacé pendant l'attente.
            const links = await fetchLinks(slug);
            buffer[slug] = links;
            readNow.add(slug);
            buffered += 1;
            if (buffered >= WRITE_EVERY) flush();
          } catch (error) {
            failure ??= error;
            return;
          }
        }
      };

      // Un article demandé juste avant la fin des lecteurs est repris par un nouveau tour.
      do {
        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
        flush();
        await Promise.all(writes);
      } while (failure === undefined && [...pending].some((slug) => !readNow.has(slug) && needsLinksLookup(known, slug, now())));

      if (failure !== undefined) {
        // Hors ligne, 429, stockage plein… : on s'arrête, le reste sera réessayé après le délai de repos. Ce qui a été lu avant
        // l'échec est gardé : la lecture reprendra où elle s'est arrêtée.
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
    resolveMissing(slugs: string[]): Promise<void> {
      if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return current ?? Promise.resolve();
      for (const slug of slugs) pending.add(slug);
      current ??= lookupAll();
      return current;
    },
  };
}

export type LinksRepo = ReturnType<typeof createLinksRepo>;
