# Appels Spotify ordonnés, pause enregistrée, heure de reprise — plan d'implémentation

> **Pour les agents :** sous-compétence requise : superpowers:executing-plans (ou subagent-driven-development). Les étapes utilisent des cases `- [ ]`.

**Objectif :** une file d'appels Spotify à priorités et espacement, une pause enregistrée par famille d'appels (partagée entre onglets et rechargements), et un message qui annonce l'heure de reprise.

**Architecture :** deux petites unités testées seules (`limit-gate` : pause enregistrée par famille ; `call-queue` : file à trois niveaux avec espacement), branchées dans `createSpotifyApi`, qui range chaque appel dans un niveau et une famille. La fiche perd son bouton ⟳ et la mention « Nouvelle tentative automatique ».

**Pile :** TypeScript, React, vitest (+ jsdom pour les fiches), WXT.

**Spec :** [2026-10-01-spotify-ordonnancement-design.md](../specs/2026-10-01-spotify-ordonnancement-design.md)

## Contraintes globales

- Familles : `search` (`/search`), `player` (`/me/player/*`), `catalog` (le reste). Un 429 ne met en pause que sa famille.
- Niveaux : `now` (délai 0), `page` (`PAGE_GAP_MS` = 250 ms), `image` (`IMAGE_GAP_MS` = 1 000 ms). Un appel `image` ne part que s'il ne reste aucun appel `now` ou `page` en attente.
- Clés de stockage : `spotify-limit:search`, `spotify-limit:player`, `spotify-limit:catalog`, valeur `{ until, strikes }`.
- Escalade sans `Retry-After` lisible : 5 s, ×3, plafond 300 s ; une réponse non 429 de la famille remet `strikes` à 0.
- Messages : « Spotify demande de patienter jusqu'à 23 h 30. », « …jusqu'à demain à 14 h 05. », « …jusqu'au 03/10 à 9 h 00. » ; moins d'une minute : « Spotify demande de patienter un instant. Réessaie dans quelques secondes. » Heure de l'appareil, arrondie à la minute supérieure.
- Code, commentaires et tests en français, comme le reste du dépôt. Pas de texte de bouton : glyphes seulement (le bouton ⟳ « Réessayer maintenant » disparaît).
- Travail dans le worktree `C:\Users\maxim\Downloads\Wikimasters-clientid`, branche `feat/spotify-ordonnancement` : lancer `git branch --show-current` avant chaque commit. Tests : `npx vitest run <fichier>` ; types : `npx tsc --noEmit`.

---

### Tâche 1 : la pause enregistrée (`limit-gate`)

**Fichiers :**
- Créer : `src/core/spotify/limit-gate.ts`
- Tester : `tests/core/spotify/limit-gate.test.ts`

**Interfaces :**
- Produit : `type Family = 'search' | 'player' | 'catalog'` ; `createLimitGate({ store: KeyValueStore; now?: () => number })` → `{ remainingMs(family): Promise<number>; trip(family, retryAfterMs: number | null): Promise<{ waitMs: number; until: number }>; success(family): Promise<void> }`.

- [ ] **Étape 1 : écrire les tests qui échouent** — créer `tests/core/spotify/limit-gate.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createLimitGate } from '../../../src/core/spotify/limit-gate';

describe('createLimitGate', () => {
  it("n'a aucune pause au départ", async () => {
    const gate = createLimitGate({ store: createMemoryStore() });
    expect(await gate.remainingMs('search')).toBe(0);
  });

  it('garde la pause demandée par Spotify : une autre instance sur le même stockage la voit, jusqu\'à son terme', async () => {
    let clock = 1_000;
    const store = createMemoryStore();
    const first = createLimitGate({ store, now: () => clock });
    expect(await first.trip('search', 56_900_000)).toEqual({ waitMs: 56_900_000, until: 56_901_000 });

    clock += 60_000;
    const second = createLimitGate({ store, now: () => clock });
    expect(await second.remainingMs('search')).toBe(56_840_000);
    clock += 56_840_000;
    expect(await second.remainingMs('search')).toBe(0);
  });

  it('la pause est par famille : la recherche en pause laisse passer le lecteur', async () => {
    const gate = createLimitGate({ store: createMemoryStore(), now: () => 0 });
    await gate.trip('search', 60_000);
    expect(await gate.remainingMs('search')).toBe(60_000);
    expect(await gate.remainingMs('player')).toBe(0);
    expect(await gate.remainingMs('catalog')).toBe(0);
  });

  it("sans Retry-After lisible, l'attente s'allonge à chaque limite d'affilée (5 s, ×3, plafond 5 min), même entre deux instances", async () => {
    let clock = 0;
    const store = createMemoryStore();
    const waits: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const gate = createLimitGate({ store, now: () => clock });
      const { waitMs } = await gate.trip('search', null);
      waits.push(waitMs);
      clock += waitMs;
    }
    expect(waits).toEqual([5_000, 15_000, 45_000, 135_000, 300_000, 300_000]);
  });

  it("une réponse qui n'est pas un 429 remet l'escalade à zéro, dans sa famille seulement", async () => {
    const gate = createLimitGate({ store: createMemoryStore(), now: () => 0 });
    await gate.trip('search', null);
    await gate.trip('search', null);
    await gate.trip('player', null);
    await gate.success('search');
    expect((await gate.trip('search', null)).waitMs).toBe(5_000);
    expect((await gate.trip('player', null)).waitMs).toBe(15_000);
  });

  it("un Retry-After lisible est respecté tel quel et remet l'escalade à zéro", async () => {
    const gate = createLimitGate({ store: createMemoryStore(), now: () => 0 });
    expect((await gate.trip('search', null)).waitMs).toBe(5_000);
    expect((await gate.trip('search', 40_000)).waitMs).toBe(40_000);
    expect((await gate.trip('search', null)).waitMs).toBe(5_000);
  });
});
```

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/core/spotify/limit-gate.test.ts` → échec « Cannot find module … limit-gate ».

- [ ] **Étape 3 : implémenter** — créer `src/core/spotify/limit-gate.ts` :

```ts
import type { KeyValueStore } from '../cache/store';

// Spotify ne limite pas tout d'un bloc : en pratique, seule la recherche l'a été (la lecture et le lecteur répondaient pendant la pénalité).
export type Family = 'search' | 'player' | 'catalog';

// `until` : heure (ms) de fin de la pause ; `strikes` : limites d'affilée sans `Retry-After` lisible.
type State = { until: number; strikes: number };

const keyOf = (family: Family): string => `spotify-limit:${family}`;
// Attente quand Spotify limite sans que `Retry-After` soit lisible : 5 s, ×3 à chaque limite d'affilée, plafonnée à 5 min.
const UNREADABLE_BASE_MS = 5_000;
const UNREADABLE_MAX_MS = 300_000;

// La pause demandée par Spotify, gardée dans le stockage : toutes les pages, tous les onglets, l'extension comme l'APK la respectent.
export function createLimitGate(deps: { store: KeyValueStore; now?: () => number }) {
  const { store, now = () => Date.now() } = deps;
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
```

- [ ] **Étape 4 : vérifier la réussite** — `npx vitest run tests/core/spotify/limit-gate.test.ts` → 6 tests au vert.

- [ ] **Étape 5 : commiter**

```bash
git branch --show-current
git add src/core/spotify/limit-gate.ts tests/core/spotify/limit-gate.test.ts
git commit -m "feat: pause de Spotify enregistrée par famille d'appels (limit-gate)"
```

(Chaque message de commit se termine par la ligne `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, après une ligne vide.)

---

### Tâche 2 : la file à priorités (`call-queue`)

**Fichiers :**
- Créer : `src/core/spotify/call-queue.ts`
- Tester : `tests/core/spotify/call-queue.test.ts`

**Interfaces :**
- Produit : `type Priority = 'now' | 'page' | 'image'` ; `createCallQueue({ gaps?: Partial<Record<Priority, number>>; now?: () => number; sleep?: (ms: number) => Promise<void> })` → `{ run<T>(priority: Priority, job: () => Promise<T>, guard?: () => Promise<void>): Promise<T> }`.
- Comportement : un appel à la fois ; le niveau le plus prioritaire d'abord, premier arrivé premier servi dans un niveau ; le délai du niveau se compte depuis le début de l'appel précédent ; `guard` qui rejette refuse l'appel sans délai.

- [ ] **Étape 1 : écrire les tests qui échouent** — créer `tests/core/spotify/call-queue.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createCallQueue } from '../../../src/core/spotify/call-queue';

// Horloge simulée : attendre fait avancer le temps.
function clocked(gaps = {}) {
  let clock = 0;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const queue = createCallQueue({ gaps, now: () => clock, sleep });
  return { queue, sleep, now: () => clock };
}

describe('createCallQueue', () => {
  it('fait passer la lecture, puis le contenu de la page, puis les images, même arrivés dans l’ordre inverse', async () => {
    const { queue } = clocked();
    const order: string[] = [];
    const job = (name: string) => async () => void order.push(name);
    await Promise.all([queue.run('image', job('image')), queue.run('page', job('page')), queue.run('now', job('now'))]);
    expect(order).toEqual(['now', 'page', 'image']);
  });

  it('sert dans l’ordre d’arrivée à l’intérieur d’un niveau', async () => {
    const { queue } = clocked();
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((n) => queue.run('page', async () => void order.push(n))));
    expect(order).toEqual([1, 2, 3]);
  });

  it('espace les appels selon le niveau, depuis le début de l’appel précédent', async () => {
    const { queue, now } = clocked({ page: 250, image: 1_000 });
    const starts: number[] = [];
    const job = async () => void starts.push(now());
    await queue.run('page', job);
    await queue.run('page', job);
    await queue.run('image', job);
    expect(starts).toEqual([0, 250, 1_250]);
  });

  it('un appel plus prioritaire arrivé pendant une attente passe devant', async () => {
    let clock = 0;
    const order: string[] = [];
    // eslint-disable-next-line prefer-const
    let queue: ReturnType<typeof createCallQueue>;
    let injected = false;
    const sleep = async (ms: number) => {
      clock += ms;
      if (!injected) {
        injected = true;
        void queue.run('page', async () => void order.push('page'));
      }
    };
    queue = createCallQueue({ gaps: { page: 250, image: 1_000 }, now: () => clock, sleep });
    await Promise.all([queue.run('image', async () => void order.push('image 1')), queue.run('image', async () => void order.push('image 2'))]);
    // La seconde image attend son délai ; pendant ce temps un appel de contenu arrive et part avant elle.
    expect(order).toEqual(['image 1', 'page', 'image 2']);
  });

  it('refuse sans délai un appel dont la garde rejette, et cela ne compte pas dans l’espacement', async () => {
    const { queue, sleep } = clocked({ page: 250 });
    const refused = new Error('pause');
    await expect(queue.run('page', async () => 'jamais', async () => Promise.reject(refused))).rejects.toBe(refused);
    expect(sleep).not.toHaveBeenCalled();
    // Le premier appel réel part tout de suite : le refus n'a pas consommé de délai.
    await queue.run('page', async () => 'ok');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('exécute un seul appel à la fois', async () => {
    const { queue } = clocked();
    let running = 0;
    let peak = 0;
    const job = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
    };
    await Promise.all([queue.run('page', job), queue.run('page', job), queue.run('now', job)]);
    expect(peak).toBe(1);
  });

  it("un appel en échec ne bloque pas les suivants", async () => {
    const { queue } = clocked();
    const failing = queue.run('page', async () => Promise.reject(new Error('boom')));
    const next = queue.run('page', async () => 'suite');
    await expect(failing).rejects.toThrow('boom');
    expect(await next).toBe('suite');
  });
});
```

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/core/spotify/call-queue.test.ts` → échec « Cannot find module … call-queue ».

- [ ] **Étape 3 : implémenter** — créer `src/core/spotify/call-queue.ts` :

```ts
// Niveaux d'appel, du plus au moins pressé : la lecture, le contenu de la page (listes d'écoute), puis les images (pochettes, photos).
export type Priority = 'now' | 'page' | 'image';

const ORDER: readonly Priority[] = ['now', 'page', 'image'];

type Job = {
  priority: Priority;
  run: () => Promise<unknown>;
  guard: (() => Promise<void>) | undefined;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export type CallQueueDeps = {
  // Délai minimal avant un appel du niveau, compté depuis le début de l'appel précédent (0 si absent).
  gaps?: Partial<Record<Priority, number>>;
  now?: () => number;
  // Remplaçable en test.
  sleep?: (ms: number) => Promise<void>;
};

// Un seul appel à la fois : Spotify limite l'application entière, une rafale d'images ne doit pas passer devant le contenu de la page.
export function createCallQueue(deps: CallQueueDeps = {}) {
  const { gaps = {}, now = () => Date.now(), sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) } = deps;
  const pending: Record<Priority, Job[]> = { now: [], page: [], image: [] };
  let draining = false;
  let lastStart = -Infinity;

  const best = (): Job | undefined => {
    for (const priority of ORDER) {
      const first = pending[priority][0];
      if (first) return first;
    }
    return undefined;
  };
  const drop = (job: Job): void => {
    pending[job.priority] = pending[job.priority].filter((other) => other !== job);
  };

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      for (;;) {
        const next = best();
        if (!next) return;
        // La garde (pause enregistrée) peut refuser l'appel : il n'attend alors aucun délai.
        try {
          await next.guard?.();
        } catch (error) {
          drop(next);
          next.reject(error);
          continue;
        }
        const wait = lastStart + (gaps[next.priority] ?? 0) - now();
        if (wait > 0) {
          await sleep(wait);
          // Un appel plus prioritaire a pu arriver, ou une pause commencer : on refait le choix.
          continue;
        }
        if (best() !== next) continue;
        drop(next);
        lastStart = now();
        try {
          next.resolve(await next.run());
        } catch (error) {
          next.reject(error);
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    run<T>(priority: Priority, job: () => Promise<T>, guard?: () => Promise<void>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pending[priority].push({ priority, run: job, guard, resolve: resolve as (value: unknown) => void, reject });
        // Au tour suivant : les appels lancés dans le même élan sont classés avant le premier départ.
        void Promise.resolve().then(drain);
      });
    },
  };
}

export type CallQueue = ReturnType<typeof createCallQueue>;
```

- [ ] **Étape 4 : vérifier la réussite** — `npx vitest run tests/core/spotify/call-queue.test.ts` → 7 tests au vert. Si le test « passe devant » échoue sur la règle ESLint citée en commentaire, retirer le commentaire `eslint-disable` : le dépôt n'a pas d'ESLint à ce jour.

- [ ] **Étape 5 : commiter**

```bash
git branch --show-current
git add src/core/spotify/call-queue.ts tests/core/spotify/call-queue.test.ts
git commit -m "feat: file d'appels Spotify à trois niveaux avec espacement (call-queue)"
```

---

### Tâche 3 : le message avec l'heure de reprise (`errors`)

**Fichiers :**
- Modifier : `src/core/spotify/errors.ts`
- Tester : `tests/core/spotify/errors.test.ts`

**Interfaces :**
- Produit : `new SpotifyError(code, message, retryAfterMs?, retryAt?)` (`retryAt` : heure absolue en ms) ; `userMessage(error: unknown, now?: number): string`.

- [ ] **Étape 1 : écrire les tests qui échouent** — dans `tests/core/spotify/errors.test.ts`, remplacer le second `it` (« annonce l'attente réelle d'une limite… ») par :

```ts
  describe('limite de débit', () => {
    // Heures de l'appareil : les tests ne dépendent pas du fuseau.
    const at = (day: number, hour: number, minute: number, second = 0) => new Date(2026, 9, day, hour, minute, second).getTime();
    const now = at(1, 22, 41);
    const instant = 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.';
    const limited = (retryAt: number) => userMessage(new SpotifyError('rate-limited', 'x', retryAt - now, retryAt), now);

    it("annonce l'heure à laquelle les appels reprennent : aujourd'hui, demain, plus tard", () => {
      expect(limited(at(1, 23, 30))).toBe("Spotify demande de patienter jusqu'à 23 h 30.");
      expect(limited(at(2, 14, 5))).toBe("Spotify demande de patienter jusqu'à demain à 14 h 05.");
      expect(limited(at(3, 9, 0))).toBe("Spotify demande de patienter jusqu'au 03/10 à 9 h 00.");
    });

    it('arrondit à la minute supérieure : jamais une heure avant la reprise réelle', () => {
      expect(limited(at(2, 14, 29, 10))).toBe("Spotify demande de patienter jusqu'à demain à 14 h 30.");
      expect(limited(at(2, 14, 30, 0))).toBe("Spotify demande de patienter jusqu'à demain à 14 h 30.");
    });

    it("moins d'une minute, ou sans durée connue : un instant", () => {
      expect(limited(now + 59_000)).toBe(instant);
      expect(userMessage(new SpotifyError('rate-limited', 'x'), now)).toBe(instant);
    });

    it("sans heure absolue, la durée demandée suffit", () => {
      expect(userMessage(new SpotifyError('rate-limited', 'x', 30 * 60_000), now)).toBe("Spotify demande de patienter jusqu'à 23 h 11.");
    });
  });
```

Dans le premier `it`, la ligne `rate-limited` (`3000`) reste valable telle quelle (moins d'une minute, horloge réelle).

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/core/spotify/errors.test.ts` → échecs sur les nouveaux messages.

- [ ] **Étape 3 : implémenter** — dans `src/core/spotify/errors.ts` :

Remplacer le constructeur de `SpotifyError` par :

```ts
export class SpotifyError extends Error {
  constructor(
    readonly code: SpotifyErrorCode,
    message: string,
    // Pour `rate-limited` : durée demandée par Spotify (Retry-After), restante au moment de l'erreur.
    readonly retryAfterMs?: number,
    // Pour `rate-limited` : heure (ms, absolue) à laquelle les appels pourront reprendre.
    readonly retryAt?: number,
  ) {
    super(message);
    this.name = 'SpotifyError';
  }
}
```

Remplacer tout ce qui suit `MESSAGES` (la fonction `rateLimitedMessage` et `userMessage`) par :

```ts
const pad = (value: number): string => String(value).padStart(2, '0');
const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// « jusqu'à 14 h 30 », « jusqu'à demain à 14 h 30 », « jusqu'au 03/10 à 14 h 30 » : l'heure de l'appareil, arrondie à la minute supérieure.
function resumeTime(retryAt: number, now: number): string {
  const resume = new Date(Math.ceil(retryAt / 60_000) * 60_000);
  const time = `${resume.getHours()} h ${pad(resume.getMinutes())}`;
  const days = Math.round((startOfDay(resume) - startOfDay(new Date(now))) / 86_400_000);
  if (days <= 0) return `jusqu'à ${time}`;
  if (days === 1) return `jusqu'à demain à ${time}`;
  return `jusqu'au ${pad(resume.getDate())}/${pad(resume.getMonth() + 1)} à ${time}`;
}

// La limite de Spotify peut durer des heures : on annonce l'heure à laquelle les appels reprendront, quand on la connaît.
function rateLimitedMessage(error: SpotifyError, now: number): string {
  const retryAt = error.retryAt ?? (error.retryAfterMs === undefined ? undefined : now + error.retryAfterMs);
  if (retryAt === undefined || retryAt - now < 60_000) return MESSAGES['rate-limited'];
  return `Spotify demande de patienter ${resumeTime(retryAt, now)}.`;
}

export function userMessage(error: unknown, now: number = Date.now()): string {
  if (!(error instanceof SpotifyError)) return MESSAGES.http;
  return error.code === 'rate-limited' ? rateLimitedMessage(error, now) : MESSAGES[error.code];
}
```

- [ ] **Étape 4 : vérifier la réussite** — `npx vitest run tests/core/spotify/errors.test.ts` → au vert.

- [ ] **Étape 5 : commiter**

```bash
git branch --show-current
git add src/core/spotify/errors.ts tests/core/spotify/errors.test.ts
git commit -m "feat: le message d'une limite Spotify annonce l'heure de reprise"
```

---

### Tâche 4 : le client Spotify (file, familles, pause enregistrée)

**Fichiers :**
- Modifier : `src/core/spotify/spotify-api.ts`
- Tester : `tests/core/spotify/spotify-api.test.ts`

**Interfaces :**
- Consomme : `createLimitGate`, `Family` (tâche 1) ; `createCallQueue`, `Priority` (tâche 2) ; `SpotifyError(…, retryAfterMs, retryAt)` (tâche 3).
- Produit : `createSpotifyApi({ session, fetch, store, deviceTypes?, now?, gaps?, sleep? })` ; `clearLimit` disparaît ; les erreurs `rate-limited` portent `retryAfterMs` et `retryAt`.

- [ ] **Étape 1 : adapter les tests** — dans `tests/core/spotify/spotify-api.test.ts` :

a) En tête, ajouter l'import `import { createMemoryStore, type KeyValueStore } from '../../../src/core/cache/store';` et remplacer `setup` par :

```ts
// `gaps` à zéro : les tests n'attendent pas les délais d'espacement (testés à part).
function setup(responses: Response[], deviceTypes?: string[], now?: () => number, store: KeyValueStore = createMemoryStore()) {
  const fetch = vi.fn();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  const session = { accessToken: vi.fn(async () => 'TOKEN') };
  return {
    api: createSpotifyApi({ session, fetch, store, gaps: { page: 0, image: 0 }, ...(deviceTypes ? { deviceTypes } : {}), ...(now ? { now } : {}) }),
    fetch,
    session,
  };
}
```

b) Remplacer les deux tests « après un 429, n'envoie plus rien… » et « clearLimit lève la pause… » par :

```ts
  it("après un 429, n'envoie plus rien de la même famille tant que dure l'attente demandée, puis reprend", async () => {
    let clock = 1_000;
    const { api, fetch } = setup([empty(429, { 'Retry-After': '120' }), empty(204)], undefined, () => clock);
    await expect(api.pause()).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 120_000, retryAt: 121_000 });

    // Même famille (lecteur) : rien ne part, et l'erreur annonce le reste de l'attente.
    clock += 30_000;
    await expect(api.playerState()).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 90_000, retryAt: 121_000 });
    await expect(api.play(null)).rejects.toMatchObject({ code: 'rate-limited' });
    expect(fetch).toHaveBeenCalledTimes(1);

    clock += 90_000;
    await api.pause();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("une limite sur la recherche ne bloque ni la lecture ni le lecteur ; une limite sur la lecture ne bloque pas la recherche", async () => {
    const search = setup([empty(429, { 'Retry-After': '3600' }), empty(204), empty(204), json({ items: [] })]);
    await expect(search.api.searchAlbum('Abbey Road')).rejects.toMatchObject({ code: 'rate-limited' });
    await expect(search.api.searchAlbum('Abbey Road')).rejects.toMatchObject({ code: 'rate-limited' });
    await search.api.pause();
    expect(await search.api.playerState()).toBeNull();
    await search.api.albumTracks('alb1');
    expect(search.fetch).toHaveBeenCalledTimes(4);

    const player = setup([empty(429, { 'Retry-After': '60' }), json({ albums: { items: [] } })]);
    await expect(player.api.pause()).rejects.toMatchObject({ code: 'rate-limited' });
    await expect(player.api.playerState()).rejects.toMatchObject({ code: 'rate-limited' });
    expect(await player.api.searchAlbum('Abbey Road')).toBeNull();
    expect(player.fetch).toHaveBeenCalledTimes(2);
  });

  it("la pause est gardée dans le stockage : une autre page n'envoie rien tant qu'elle dure", async () => {
    let clock = 1_000;
    const store = createMemoryStore();
    const first = setup([empty(429, { 'Retry-After': '120' })], undefined, () => clock, store);
    await expect(first.api.searchAlbum('Abbey Road')).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 120_000, retryAt: 121_000 });

    clock += 30_000;
    const second = setup([], undefined, () => clock, store);
    await expect(second.api.findCover('album', 'Abbey Road')).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 90_000, retryAt: 121_000 });
    expect(second.fetch).not.toHaveBeenCalled();
  });

  it("passe le contenu de la page avant les images arrivées plus tôt", async () => {
    const { api, fetch } = setup([json({ items: [] }), json({ tracks: { items: [] } })]);
    const cover = api.findCover('track', 'Yesterday');
    const tracks = api.albumTracks('alb1');
    await Promise.all([cover, tracks]);
    expect(call(fetch, 0).url.pathname).toBe('/v1/albums/alb1/tracks');
    expect(call(fetch, 1).url.pathname).toBe('/v1/search');
  });

  it("espace les appels : 250 ms pour le contenu de la page, 1 s pour les images", async () => {
    let clock = 0;
    const waits: number[] = [];
    const fetch = vi.fn(async () => json({ albums: { items: [] } }));
    const api = createSpotifyApi({
      session: { accessToken: async () => 'TOKEN' },
      fetch,
      store: createMemoryStore(),
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    await api.searchAlbum('A');
    await api.searchAlbum('B');
    await api.findCover('album', 'C');
    await api.findCover('album', 'D');
    expect(waits).toEqual([250, 1_000, 1_000]);
  });
```

Les tests « traduit les erreurs », « sans Retry-After lisible… » et « un Retry-After lisible est respecté… » restent inchangés (ils passent par `setup` et ses horloges).

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/core/spotify/spotify-api.test.ts` → échecs (la dépendance `store` n'existe pas encore, `retryAt` absent).

- [ ] **Étape 3 : implémenter** — dans `src/core/spotify/spotify-api.ts` :

a) Imports : ajouter après l'import de `SpotifyError` :

```ts
import type { KeyValueStore } from '../cache/store';
import { createCallQueue, type Priority } from './call-queue';
import { createLimitGate, type Family } from './limit-gate';
```

b) Remplacer les constantes `UNREADABLE_LIMIT_BASE_MS` et `UNREADABLE_LIMIT_MAX_MS` (et leur commentaire) par :

```ts
// Délai minimal entre deux appels, selon leur niveau : le contenu de la page d'abord, les images ensuite et plus lentement.
// Spotify ne publie pas la limite des applications en mode développement : estimations, à ajuster à l'usage.
const PAGE_GAP_MS = 250;
const IMAGE_GAP_MS = 1_000;

// Famille d'un appel, pour la pause : en pratique Spotify n'a limité que la recherche (la lecture et le lecteur répondaient).
const familyOf = (path: string): Family => (path.startsWith('/search') ? 'search' : path.startsWith('/me/player') ? 'player' : 'catalog');
```

c) Remplacer l'en-tête de `createSpotifyApi` et la fonction `send` (de `export function createSpotifyApi(` jusqu'à la fin de `send`) par :

```ts
// `deviceTypes` : types d'appareil Spotify où lancer la lecture, par ordre de préférence (ex. `Smartphone` sur le téléphone).
// `store` : la pause demandée par Spotify y est gardée, pour que toutes les pages, tous les onglets et l'APK la respectent.
export function createSpotifyApi(deps: {
  session: Pick<SpotifySession, 'accessToken'>;
  fetch: SpotifyFetch;
  store: KeyValueStore;
  deviceTypes?: readonly string[];
  now?: () => number;
  // Remplaçables en test.
  gaps?: Partial<Record<Priority, number>>;
  sleep?: (ms: number) => Promise<void>;
}) {
  const { session, fetch, store, deviceTypes = [], now = () => Date.now(), gaps, sleep } = deps;
  const gate = createLimitGate({ store, now });
  // Un seul appel à la fois : la lecture, puis le contenu de la page, puis les images, espacés (voir PAGE_GAP_MS et IMAGE_GAP_MS).
  const queue = createCallQueue({ gaps: { now: 0, page: PAGE_GAP_MS, image: IMAGE_GAP_MS, ...gaps }, now, ...(sleep ? { sleep } : {}) });

  type Options = { query?: Record<string, string>; body?: unknown };

  async function sendNow(family: Family, method: string, path: string, options: Options): Promise<Response> {
    const url = `${API_URL}${path}${options.query ? `?${new URLSearchParams(options.query).toString()}` : ''}`;
    for (let attempt = 0; ; attempt += 1) {
      const token = await session.accessToken(attempt > 0);
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      // Toute autre réponse prouve que la limite de cette famille est levée.
      if (response.status !== 429) await gate.success(family);
      if (response.status === 401) {
        // Un seul essai avec un jeton neuf.
        if (attempt === 0) continue;
        throw new SpotifyError('not-linked', 'Jeton Spotify refusé');
      }
      if (response.status === 404 && path.startsWith('/me/player')) throw new SpotifyError('no-device', 'Aucun appareil Spotify actif');
      if (response.status === 403) throw new SpotifyError('not-premium', 'Spotify Premium requis');
      if (response.status === 429) {
        // `Retry-After` n'est lisible que par le service worker de l'extension : Spotify ne l'expose pas en CORS (page web, WebView de l'APK).
        const seconds = Number(response.headers.get('Retry-After'));
        const { waitMs, until } = await gate.trip(family, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null);
        console.warn('[wikimasters-tools]', `Spotify : limite atteinte (${method} ${path}), pause de ${Math.round(waitMs / 1000)} s`);
        throw new SpotifyError('rate-limited', 'Trop de requêtes', waitMs, until);
      }
      if (!response.ok) throw new SpotifyError('http', `Spotify : HTTP ${response.status}`);
      return response;
    }
  }

  // Pendant la pause de sa famille, un appel échoue tout de suite, sans rien envoyer.
  function send(priority: Priority, method: string, path: string, options: Options = {}): Promise<Response> {
    const family = familyOf(path);
    const guard = async (): Promise<void> => {
      const remaining = await gate.remainingMs(family);
      if (remaining > 0) throw new SpotifyError('rate-limited', 'Limite Spotify atteinte', remaining, now() + remaining);
    };
    return queue.run(priority, () => sendNow(family, method, path, options), guard);
  }
```

d) Dans `usableDevices` : `await send('GET', '/me/player/devices')` → `await send('now', 'GET', '/me/player/devices')`.

e) Dans l'objet retourné : supprimer la méthode `clearLimit` (et son commentaire) ; puis, pour chaque appel à `send`, ajouter le niveau en premier argument :
- `searchTracks` : `send('page', 'GET', '/search', …)`
- `searchAlbum` : `send('page', 'GET', '/search', …)`
- `findCover` (les deux appels) : `send('image', 'GET', '/search', …)`
- `findArtistImage` : `send('image', 'GET', '/search', …)`
- `albumTracks` : `send('page', 'GET', `/albums/…/tracks`, …)`
- `play` (les trois appels `PUT /me/player/play`), `pause`, `playerState` : `send('now', …)`

- [ ] **Étape 4 : vérifier la réussite** — `npx vitest run tests/core/spotify/spotify-api.test.ts` → au vert.

- [ ] **Étape 5 : commiter** (les autres fichiers ne compilent pas encore : `overlay.ts`, `music-service.ts`. C'est attendu, la tâche 5 les met à jour.)

```bash
git branch --show-current
git add src/core/spotify/spotify-api.ts tests/core/spotify/spotify-api.test.ts
git commit -m "feat: le client Spotify range ses appels en file à priorités et garde la pause par famille"
```

---

### Tâche 5 : la fiche sans bouton de nouvel essai, et le branchement

**Fichiers :**
- Modifier : `src/content/music-service.ts`, `src/content/ListenSection.tsx`, `src/app/overlay.ts`, `src/entrypoints/background.ts`
- Supprimer : `tests/content/listen-retry.test.tsx`
- Modifier : `tests/content/music-service.test.ts`, `tests/content/listen-section.test.tsx`, `tests/content/listen-rate-limit.test.tsx`

**Interfaces :**
- Consomme : `createSpotifyApi({ …, store })` (tâche 4).
- Produit : `MusicService` sans `retry` ; `ListenSection` sans bouton « Réessayer maintenant » ni « Nouvelle tentative automatique ».

- [ ] **Étape 1 : adapter les tests** —
  - `git rm tests/content/listen-retry.test.tsx`.
  - `tests/content/music-service.test.ts` : supprimer la ligne `clearLimit: vi.fn(),` du faux `api` et tout le bloc `describe('retry', …)` (de `describe('retry', () => {` à son `});` de fermeture, juste avant la fin du `describe` parent).
  - `tests/content/listen-section.test.tsx` : dans le premier test, renommer en `'recharge une fois le délai passé (plus une seconde de marge) et affiche alors les titres'` et supprimer la ligne `expect(text()).toContain('Nouvelle tentative automatique.');` ; supprimer les deux lignes `expect(text()).not.toContain('Nouvelle tentative automatique.');` (dans « s'arrête après 5 tentatives » et « ne relance pas une autre erreur… ») ; ajouter à la fin du `describe` :

```ts
  it("n'offre aucun bouton pour réessayer à la main : un nouvel essai pendant la pause ne servirait à rien", async () => {
    serviceOf(vi.fn(async () => limited(30_000)));
    await render();
    expect(text()).toContain(LIMITED);
    expect(container.querySelector('button')).toBeNull();
  });
```

  - `tests/content/listen-rate-limit.test.tsx` : ajouter l'import `createMemoryStore` (déjà présent) et remplacer `const api = createSpotifyApi({ session: { accessToken: async () => 'token' }, fetch });` par `const api = createSpotifyApi({ session: { accessToken: async () => 'token' }, fetch, store: createMemoryStore() });` ; remplacer la fonction `observe` pour ne plus chercher « Nouvelle tentative » :

```ts
// Avance l'horloge par pas de 100 ms et note chaque changement d'affichage (M = message, · = rien).
async function observe(totalMs: number) {
  const changes: string[] = [];
  let last = '';
  for (let t = 0; t < totalMs; t += 100) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    const now = text() === '' ? '·' : 'M';
    if (now !== last) changes.push(`${(t / 1000).toFixed(1)}s:${now}`);
    last = now;
  }
  return changes.join(' ');
}
```

    puis remplacer les deux attentes `expect(display).toMatch(/^0\.0s:· 0\.2s:R \d+\.\ds:M$/);` par `expect(display).toMatch(/^0\.0s:· \d+\.\ds:M$/);`.

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/content/music-service.test.ts tests/content/listen-section.test.tsx tests/content/listen-rate-limit.test.tsx` → échecs (le bouton et la mention existent encore).

- [ ] **Étape 3 : implémenter** —
  - `src/content/music-service.ts` : dans `MusicServiceDeps.api`, retirer `| 'clearLimit'` ; supprimer la méthode `retry` et son commentaire (`// Bouton « Réessayer maintenant » après une limite : …`).
  - `src/content/ListenSection.tsx` : supprimer la constante `RETRY_LABEL` ; supprimer le `useState` `forcing` et son commentaire ; supprimer `setForcing(false);` dans le premier `useEffect` ; dans l'effet de relance, remplacer `if (autoRetries >= MAX_AUTO_RETRIES || forcing) return;` par `if (autoRetries >= MAX_AUTO_RETRIES) return;`, les dépendances `[view, autoRetries, forcing]` par `[view, autoRetries]`, et réécrire le commentaire au-dessus en `// Limite de Spotify : le chargement est relancé à l'heure annoncée. Un chargement abouti remet le compte à zéro.` ; supprimer la ligne `const retrying = …` et la fonction `retryNow` avec son commentaire ; remplacer tout le bloc `{view.status === 'error' && ( … )}` par :

```tsx
      {view.status === 'error' && <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{view.message}</p>}
```

  - `src/app/overlay.ts` : `createSpotifyApi({ session, fetch: spotify.fetch, store, … })` (la variable `store` est déjà utilisée par `createSpotifySession({ store, … })` juste au-dessus).
  - `src/entrypoints/background.ts` : `fetch: (url, init) => fetch(url, { ...init, redirect: 'error', cache: 'no-store' }),` avec le commentaire `// Pas de redirection suivie : les jetons et l'en-tête d'autorisation ne quittent pas Spotify. Réponses toujours fraîches : un 429 resservi par un cache prolongerait à tort une pause enregistrée.`

- [ ] **Étape 4 : vérifier** — `npx vitest run` (toute la suite) puis `npx tsc --noEmit` → tout au vert, aucune erreur de types. Corriger ce que `tsc` signale (références restantes à `clearLimit`, `retry`, `forcing`).

- [ ] **Étape 5 : commiter**

```bash
git branch --show-current
git add -A src tests
git commit -m "feat: la fiche annonce l'heure de reprise, sans bouton de nouvel essai"
```

---

### Tâche 6 : livraison

- [ ] **Étape 1 :** `npx vitest run` et `npx tsc --noEmit` au vert ; `npm run build`.
- [ ] **Étape 2 :** pousser la branche, ouvrir la PR vers `main`, la fusionner (consigne permanente de l'utilisateur) : `git push -u origin feat/spotify-ordonnancement`, `gh pr create --base main …`, `gh pr merge <n> --merge`.
- [ ] **Étape 3 :** `git checkout --detach origin/main`, `npm run build` dans le worktree, puis `robocopy <worktree>\.output\chrome-mv3 <dépôt>\.output\chrome-mv3 /MIR` (code de sortie 1 = copie faite).
- [ ] **Étape 4 :** mettre à jour la mémoire du projet (`project_spotify.md`, `MEMORY.md`) : conception réalisée, familles d'appels, constantes à ajuster, reste la vérification manuelle.
- [ ] **Étape 5 :** vérification dans Chrome après rechargement de l'extension : fiche Kamini, console sans 429 ; essai d'un appel Spotify hors de l'application selon ce que le compte lié permet.
