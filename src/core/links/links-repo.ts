import { BATCH_SIZE } from '../birth/wikidata-birth';
import type { KeyValueStore } from '../cache/store';
import { EMPTY_LINKS, needsLinksLookup, setLinks, type LinksState } from './links-book';

const KEY = 'links-v1';
// Après un échec (429, hors ligne, stockage plein), on laisse Wikipédia respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

export type LinksFetcher = (slugs: string[]) => Promise<Record<string, string[]>>;

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
      let first = true;
      for (;;) {
        const state = await load();
        const batch = [...pending].filter((candidate) => needsLinksLookup(state, candidate, now())).slice(0, BATCH_SIZE);
        if (batch.length === 0) {
          pending.clear();
          return;
        }
        for (const slug of batch) pending.delete(slug);
        if (!first) await sleep(gapMs);
        first = false;
        try {
          const fetched = await fetchLinks(batch);
          await update((latest) => setLinks(latest, fetched, now()));
        } catch (error) {
          // Hors ligne, 429, stockage plein… : on s'arrête, le reste sera réessayé après le délai de repos.
          console.warn('[wikimasters-tools]', 'liens Wikipédia indisponibles :', error);
          failedAt = now();
          pending.clear();
          notify();
          return;
        }
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
