import type { KeyValueStore } from '../cache/store';

// Spotify ne limite pas tout d'un bloc : en pratique, seule la recherche l'a été (la lecture et le lecteur répondaient pendant la pénalité).
export type Family = 'search' | 'player' | 'catalog';

// `until` : heure (ms) de fin de la pause ; `strikes` : limites d'affilée sans `Retry-After` lisible.
type State = { until: number; strikes: number };

const DEFAULT_PREFIX = 'spotify-limit';
// Attente quand Spotify limite sans que `Retry-After` soit lisible : 5 s, ×3 à chaque limite d'affilée, plafonnée à 5 min.
const UNREADABLE_BASE_MS = 5_000;
const UNREADABLE_MAX_MS = 300_000;

// La pause demandée par Spotify, gardée dans le stockage : toutes les pages, tous les onglets, l'extension comme l'APK la respectent.
export function createLimitGate(deps: { store: KeyValueStore; now?: () => number; prefix?: string }) {
  const { store, now = () => Date.now(), prefix = DEFAULT_PREFIX } = deps;
  const keyOf = (family: Family): string => `${prefix}:${family}`;
  // Lectures-modifications-écritures sérialisées dans cette page.
  let tail: Promise<unknown> = Promise.resolve();
  const serialized = <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job);
    tail = run.catch(() => undefined);
    return run;
  };
  const read = (family: Family): Promise<State | undefined> => store.get<State>(keyOf(family));

  return {
    // Millisecondes d'attente restantes pour cette famille (0 : aucune pause en cours).
    async remainingMs(family: Family): Promise<number> {
      const state = await read(family);
      return state ? Math.max(0, state.until - now()) : 0;
    },

    // Spotify vient de limiter cette famille. `retryAfterMs` : sa demande, ou `null` si l'en-tête est illisible (page web, WebView).
    trip(family: Family, retryAfterMs: number | null): Promise<{ waitMs: number; until: number }> {
      return serialized(async () => {
        const asked = retryAfterMs !== null && retryAfterMs > 0 ? retryAfterMs : null;
        const strikes = asked === null ? ((await read(family))?.strikes ?? 0) + 1 : 0;
        const waitMs = asked ?? Math.min(UNREADABLE_BASE_MS * 3 ** (strikes - 1), UNREADABLE_MAX_MS);
        const until = now() + waitMs;
        await store.set<State>(keyOf(family), { until, strikes });
        return { waitMs, until };
      });
    },

    // Toute réponse autre qu'un 429 prouve que la limite est levée : l'escalade repart de zéro.
    success(family: Family): Promise<void> {
      return serialized(async () => {
        const state = await read(family);
        if (state && state.strikes > 0) await store.set<State>(keyOf(family), { until: state.until, strikes: 0 });
      });
    },
  };
}

export type LimitGate = ReturnType<typeof createLimitGate>;
