import type { KeyValueStore } from '../cache/store';
import { MAX_CANDIDATES } from './card-image-search';
import { addCandidates, EMPTY_IMAGES, markArtChecked, promoteArt, rejectCurrent, setFound, type ImageState } from './image-book';

const KEY = 'card-images';
const SETTING_KEY = 'wmt:imageReplace';
// Après un échec (429, hors ligne), on laisse Wikimedia respirer avant de réessayer.
const COOLDOWN_MS = 60_000;
// Une pochette trouvée est gardée pour toujours ; « rien trouvé » est revérifié tous les 30 jours (le catalogue évolue).
const ART_RECHECK_MS = 30 * 24 * 3_600_000;

// Liste (éventuellement vide) : la source a répondu. `null` : elle n'a pas pu répondre (compte non lié, source absente, limite, réseau) : rien n'est mémorisé.
type ArtSource = (title: string, slug: string) => Promise<string[] | null>;
export type ImageSearch = (title: string, skip: number, slug: string) => Promise<string[]>;

// Remplacement des images manquantes des cartes. L'état est gardé en mémoire (la décoration de la page est synchrone)
// et écrit dans le stockage à chaque changement.
export function createImageService(deps: {
  store: KeyValueStore;
  search: ImageSearch;
  // Pochette / affiche officielle (Spotify, TMDB) : toujours placée en tête quand elle existe.
  art?: ArtSource;
  // À défaut de toute image : photo de l'artiste, affiche la plus proche.
  fallback?: ArtSource;
  // Affiche officielle d'un jeu vidéo, posée aussi sur les cartes qui ont déjà une image (Wikipédia) ; liste vide pour toute autre carte.
  gameArt?: ArtSource;
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
  // Affiches de jeux vidéo des cartes qui ont déjà une image : en mémoire seulement (les sources en gardent déjà les réponses).
  const gameArtOf = new Map<string, string | null>();
  const gameArtFailedAt = new Map<string, number>();
  const gameArtRunning = new Set<string>();
  // Une source d'images en échec ou absente n'empêche pas les autres : elle compte comme « pas de réponse » (null).
  const safe = async (source: ArtSource | undefined, title: string, slug: string): Promise<string[] | null> =>
    source ? await source(title, slug).catch(() => null) : null;
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
    // Affiche d'un jeu vidéo pour une carte qui a déjà une image : `undefined` pas encore cherchée, `null` pas un jeu / rien trouvé.
    peekGameArt: (slug: string): string | null | undefined => gameArtOf.get(slug),
    requestGameArt(slug: string, title: string): Promise<void> {
      const failed = gameArtFailedAt.get(slug);
      if (!enabled || !deps.gameArt || gameArtOf.has(slug) || gameArtRunning.has(slug) || (failed !== undefined && now() - failed < COOLDOWN_MS)) return Promise.resolve();
      gameArtRunning.add(slug);
      return safe(deps.gameArt, title, slug)
        .then((answer) => {
          if (answer === null) {
            gameArtFailedAt.set(slug, now());
            return;
          }
          gameArtOf.set(slug, answer[0] ?? null);
          notify();
        })
        .finally(() => gameArtRunning.delete(slug));
    },
    // Lance la recherche d'une carte jamais cherchée (sans effet si l'option est coupée).
    request(slug: string, title: string): Promise<void> {
      if (!enabled || !loaded || coolingDown(slug)) return Promise.resolve();
      const known = state[slug];
      if (known?.art) return Promise.resolve();
      if (known) {
        // Image trouvée sans pochette officielle (source pas prête, ou rien à l'époque) : on la cherche, mais seulement si la source
        // n'a jamais répondu ou si sa réponse « rien » date de plus de 30 jours ; après un échec, une fois par minute au plus.
        const at = artTriedAt.get(slug);
        const checkedAt = known.artCheckedAt;
        if (!deps.art || (at !== undefined && now() - at < COOLDOWN_MS) || (checkedAt !== undefined && now() - checkedAt < ART_RECHECK_MS)) {
          return Promise.resolve();
        }
        artTriedAt.set(slug, now());
        return track(slug, async () => {
          const answer = await safe(deps.art, title, slug);
          // Pas de réponse : rien n'est mémorisé, on réessaiera.
          if (answer === null) return;
          const promoted = answer[0] ? promoteArt(state, slug, answer[0]) : state;
          // Pochette gardée pour toujours ; sinon (rien, ou pochette déjà écartée) on date la réponse.
          commit(promoted === state ? markArtChecked(state, slug, now()) : promoted);
        });
      }
      return track(slug, async () => {
        const answer = await safe(deps.art, title, slug);
        const art = answer ?? [];
        artTriedAt.set(slug, now());
        const wiki = await deps.search(title, 0, slug);
        let found = [...art, ...wiki.filter((url) => !art.includes(url))].slice(0, MAX_CANDIDATES);
        if (found.length === 0) found = (await safe(deps.fallback, title, slug)) ?? [];
        commit(setFound(state, slug, found, art.length > 0, answer === null ? undefined : now()));
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
