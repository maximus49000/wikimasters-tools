import type { KeyValueStore } from '../cache/store';
import { MAX_CANDIDATES } from './card-image-search';
import { addCandidates, EMPTY_IMAGES, promoteArt, rejectCurrent, setFound, type ImageState } from './image-book';

const KEY = 'card-images';
const SETTING_KEY = 'wmt:imageReplace';
// Après un échec (429, hors ligne), on laisse Wikimedia respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

type ArtSource = (title: string, slug: string) => Promise<string[]>;
export type ImageSearch = (title: string, skip: number, slug: string) => Promise<string[]>;

// Remplacement des images manquantes des cartes. L'état est gardé en mémoire (la décoration de la page est synchrone)
// et écrit dans le stockage à chaque changement.
export function createImageService(deps: {
  store: KeyValueStore;
  search: ImageSearch;
  // Pochette / affiche officielle (Spotify, TMDB) : toujours placée en tête quand elle existe.
  art?: (title: string, slug: string) => Promise<string[]>;
  // À défaut de toute image : photo de l'artiste, affiche la plus proche.
  fallback?: (title: string, slug: string) => Promise<string[]>;
  settings: Pick<Storage, 'getItem' | 'setItem'>;
  now?: () => number;
}) {
  const now = deps.now ?? (() => Date.now());
  let state: ImageState = EMPTY_IMAGES;
  let loaded = false;
  const listeners = new Set<() => void>();
  const inFlight = new Map<string, Promise<void>>();
  const failedAt = new Map<string, number>();
  const artTriedAt = new Map<string, number>();
  // Une source d'images indisponible n'empêche pas les autres.
  const safe = async (source: ArtSource | undefined, title: string, slug: string): Promise<string[]> =>
    (await source?.(title, slug).catch(() => [])) ?? [];
  let writeTail: Promise<unknown> = Promise.resolve();

  const ready = deps.store.get<ImageState>(KEY).then(
    (saved) => {
      // Ce qui a été trouvé pendant la lecture a priorité sur l'état enregistré.
      state = { ...(saved ?? {}), ...state };
      loaded = true;
      notify();
    },
    () => {
      loaded = true;
    },
  );

  // Inactif par défaut (on l'active depuis « Plus ») ; un stockage illisible laisse la fonction coupée.
  let enabled = ((): boolean => {
    try {
      return deps.settings.getItem(SETTING_KEY) === 'on';
    } catch {
      return false;
    }
  })();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function commit(next: ImageState): void {
    state = next;
    writeTail = writeTail.then(() => deps.store.set(KEY, state)).catch(() => undefined);
    notify();
  }

  // Une seule recherche à la fois par carte.
  function track(slug: string, job: () => Promise<void>): Promise<void> {
    const running = inFlight.get(slug);
    if (running) return running;
    const run = job()
      .catch((error: unknown) => {
        console.warn('[wikimasters-tools]', 'recherche d’image indisponible :', error);
        failedAt.set(slug, now());
      })
      .finally(() => inFlight.delete(slug));
    inFlight.set(slug, run);
    return run;
  }

  const coolingDown = (slug: string): boolean => {
    const at = failedAt.get(slug);
    return at !== undefined && now() - at < COOLDOWN_MS;
  };

  return {
    enabled: (): boolean => enabled,
    setEnabled(next: boolean): void {
      if (next === enabled) return;
      enabled = next;
      try {
        deps.settings.setItem(SETTING_KEY, next ? 'on' : 'off');
      } catch {
        // stockage indisponible
      }
      notify();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    // `undefined` : pas encore cherchée ; `null` : recherche faite, rien de trouvé.
    peek: (slug: string): string | null | undefined => state[slug]?.url,
    // Lance la recherche d'une carte jamais cherchée (sans effet si l'option est coupée).
    request(slug: string, title: string): Promise<void> {
      if (!enabled || !loaded || coolingDown(slug)) return Promise.resolve();
      const known = state[slug];
      if (known?.art) return Promise.resolve();
      if (known) {
        // Image trouvée avant que la pochette officielle soit disponible : on la cherche, une fois par minute au plus.
        const at = artTriedAt.get(slug);
        if (!deps.art || (at !== undefined && now() - at < COOLDOWN_MS)) return Promise.resolve();
        artTriedAt.set(slug, now());
        return track(slug, async () => {
          const [art] = await safe(deps.art, title, slug);
          if (art) commit(promoteArt(state, slug, art));
        });
      }
      return track(slug, async () => {
        const art = await safe(deps.art, title, slug);
        artTriedAt.set(slug, now());
        const wiki = await deps.search(title, 0, slug);
        let found = [...art, ...wiki.filter((url) => !art.includes(url))].slice(0, MAX_CANDIDATES);
        if (found.length === 0) found = await safe(deps.fallback, title, slug);
        commit(setFound(state, slug, found, art.length > 0));
      });
    },
    // Image d'une carte, cherchée si besoin (aperçus, qui ne se redessinent pas seuls).
    async resolve(slug: string, title: string): Promise<string | null> {
      if (!enabled) return null;
      await ready;
      await this.request(slug, title);
      return state[slug]?.url ?? null;
    },
    // « Mauvaise image » : écarte l'image affichée et passe à la suivante ; si toutes sont écartées, nouvelle recherche.
    reject(slug: string, title: string): Promise<void> {
      return track(slug, async () => {
        await ready;
        let next = rejectCurrent(state, slug);
        if (next[slug]?.url) return commit(next);
        const known = next[slug];
        const fresh = await deps.search(title, known?.candidates.length ?? 0, slug);
        next = addCandidates(rejectCurrent(state, slug), slug, fresh);
        commit(next);
      });
    },
  };
}

export type ImageService = ReturnType<typeof createImageService>;
