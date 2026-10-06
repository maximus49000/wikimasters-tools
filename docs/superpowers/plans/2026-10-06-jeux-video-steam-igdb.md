# Section « Jeu vidéo » (Steam, IGDB en repli) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher dans la fiche d'une carte de jeu vidéo une section (bande-annonce, note, infos, BO, lien vers la page du jeu) alimentée par Steam, avec IGDB en repli, et un glyphe « changer de jeu » pour corriger ou vider le choix.

**Architecture:** Calquée sur les films (`src/core/screen/` + `ScreenSection.tsx`) : un modèle commun `GameDetail` rempli par `steam-api.ts` ou `igdb-api.ts`, un service `game-service.ts` qui résout la carte (choix mémorisé > Steam via Wikidata P1733 > IGDB via P5794 (un *slug*) > recherche stricte par titre), et une section posée dans la fiche native comme les autres. Les appels réseau passent par le même `fetch` que TMDB (service worker de l'extension) ; l'APK reçoit un pont HTTP natif pour les hôtes sans CORS.

**Tech Stack:** TypeScript strict, React 19 (styles en ligne, shadow DOM), zod, vitest (+ jsdom), WXT (MV3), hls.js (lecture HLS de la bande-annonce Steam), Java (pont Android).

**Spec:** `docs/superpowers/specs/2026-10-06-jeux-video-steam-igdb-design.md` (maquettes : `.superpowers/maquette-jeux-video-fiche.html`, `.superpowers/maquette-jeux-video-correction.html`).

## Global Constraints

- Textes d'interface, messages d'erreur, commentaires : **en français**. Glyphes de l'application plutôt que du texte pour les boutons ; zones tactiles de **44 px** ; styles **en ligne** (shadow DOM) ; variables `--color-border`, `--color-accent` comme les composants existants.
- **Aucun secret commité** : `WXT_IGDB_CLIENT_ID` / `WXT_IGDB_CLIENT_SECRET` sont dans `.env.local` (ignoré par git, déjà rempli) ; ne jamais les afficher, journaliser ni coller dans un test.
- Réponses externes **validées par zod** ; un format inattendu **lève** (jamais enregistré comme « absent »).
- Ordre de résolution : choix mémorisé > Steam (P1733) > IGDB (P5794, slug) > recherche par titre (Steam puis IGDB, titre normalisé **égal**, sinon rien).
- Mémorisation : détails Steam 6 h, détails IGDB 7 jours (`TtlCache`), choix par carte `game-choice-v1`, identifiants Wikidata `game-v1`.
- Sans identifiants IGDB à la compilation : l'étape IGDB est ignorée (Steam seul fonctionne).
- Mentions en pied de section : « Données : Steam » / « Données : IGDB.com », « Metascore : Metacritic ».
- Chaque tâche : `npm test` et `npm run typecheck` verts avant le commit. Messages de commit en français, terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Travail sur la branche `feat/jeux-video-steam-igdb` (déjà créée, contient la spec). Après la dernière tâche : `npm run build`, pousser, ouvrir **et fusionner** la PR vers `main` sans demander (routine du projet), APK seulement à la demande.

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `src/core/game/config.ts` | Constantes d'URL et identifiants IGDB lus à la compilation |
| `src/core/game/errors.ts` | `GameError` + `gameErrorMessage` |
| `src/core/game/game-detail.ts` | Types `GameDetail`, `GameCandidate`, `GameRef`, `GameChoice`, `GameFetch` |
| `src/core/game/game-format.ts` | Mise en forme et lecture d'un lien Steam/IGDB |
| `src/core/game/http.ts` | `requestJson` partagé (statuts → `GameError`, zod) |
| `src/core/game/steam-api.ts` | `detail(appid)`, `search(title)` |
| `src/core/game/igdb-api.ts` | Jeton Twitch, file d'attente, `detail`, `search` |
| `src/core/game/wikidata-game.ts` | P1733 / P5794 par lots de 50 |
| `src/core/game/game-kinds.ts` | « Est-ce un jeu vidéo ? » |
| `src/core/game/game-repo.ts` | Identifiants Wikidata mémorisés + choix de l'utilisateur |
| `src/content/game-service.ts`, `game-registry.ts` | Résolution et actions de la section |
| `src/content/GameSection.tsx`, `GameChoiceDialog.tsx`, `HlsTrailerPlayer.tsx` | Interface |
| `src/content/SoundtrackButton.tsx` | Généralisé (n'est plus lié à `ScreenDetail`) |
| `src/content/Glyphs.tsx`, `decorate-listen.ts`, `mount.tsx`, `src/app/overlay.ts` | Glyphes et branchement |
| `src/core/spotify/transport.ts`, `wxt.config.ts` | Hôtes relayés et permissions |
| `src/android/native-http.ts`, `MainActivity.java` | Pont HTTP natif (APK) |

---

### Task 1: Configuration, hôtes autorisés, types et erreurs

**Files:**
- Create: `src/core/game/config.ts`, `src/core/game/errors.ts`, `src/core/game/game-detail.ts`, `src/core/game/http.ts`
- Modify: `src/env.d.ts`, `wxt.config.ts:14-24`, `src/core/spotify/transport.ts:34-43`
- Test: `tests/core/game/http.test.ts`, `tests/core/spotify/transport.test.ts` (existant, ajout)

**Interfaces:**
- Produces: `GameFetch`, `GameError(source, code, message)`, `gameErrorMessage(error)`, `requestJson(source, fetchFn, url, schema, init?)`, tous les types de `game-detail.ts` (voir code), constantes de `config.ts`.

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/core/game/http.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GameError, gameErrorMessage } from '../../../src/core/game/errors';
import { requestJson } from '../../../src/core/game/http';

const schema = z.object({ ok: z.boolean() });
const answer = (status: number, body: unknown = { ok: true }) => async () => new Response(JSON.stringify(body), { status });

describe('requestJson', () => {
  it('rend le JSON validé', async () => {
    expect(await requestJson('steam', answer(200), 'https://x', schema)).toEqual({ ok: true });
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'http'],
  ] as const)('le statut %i devient %s', async (status, code) => {
    await expect(requestJson('igdb', answer(status), 'https://x', schema)).rejects.toMatchObject({ name: 'GameError', source: 'igdb', code });
  });

  it('un format inattendu ou un réseau en panne lève une erreur http', async () => {
    await expect(requestJson('steam', answer(200, { pas: 'ça' }), 'https://x', schema)).rejects.toMatchObject({ code: 'http' });
    await expect(requestJson('steam', async () => Promise.reject(new Error('réseau')), 'https://x', schema)).rejects.toMatchObject({ code: 'http' });
  });
});

describe('gameErrorMessage', () => {
  it('nomme la source et reste lisible', () => {
    expect(gameErrorMessage(new GameError('steam', 'rate-limited', 'x'))).toBe('Steam demande de patienter un instant. Réessaie dans quelques secondes.');
    expect(gameErrorMessage(new GameError('igdb', 'auth', 'x'))).toBe("L'accès à IGDB est refusé.");
    expect(gameErrorMessage(new GameError('igdb', 'http', 'x'))).toBe('IGDB est indisponible pour le moment.');
    expect(gameErrorMessage(new Error('autre'))).toBe('Les informations du jeu sont indisponibles pour le moment.');
  });
});
```

Dans `tests/core/spotify/transport.test.ts`, ajouter à côté du test TMDB existant (ligne ~69) :

```ts
  it.each([
    'https://store.steampowered.com/api/appdetails?appids=1',
    'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1',
    'https://id.twitch.tv/oauth2/token?client_id=x',
    'https://api.igdb.com/v4/games',
  ])('relaie les jeux vidéo : %s', async (url) => {
    const d = deps();
    const reply = await handleSpotifyMessage({ type: 'wmt:spotify', op: 'fetch', url }, d);
    expect(reply).toMatchObject({ ok: true });
  });

  it("refuse un faux hôte de jeux vidéo", async () => {
    const reply = await handleSpotifyMessage({ type: 'wmt:spotify', op: 'fetch', url: 'https://store.steampowered.com.evil.test/x' }, deps());
    expect(reply).toEqual({ ok: false, error: 'adresse refusée' });
  });
```

(Adapter `deps()` au nom de la fabrique de `BackgroundDeps` utilisée dans ce fichier : la lire d'abord et reprendre exactement le même motif que le test TMDB voisin.)

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npx vitest run tests/core/game/http.test.ts tests/core/spotify/transport.test.ts`
Expected: FAIL (modules `game/*` introuvables ; adresses refusées).

- [ ] **Step 3: Implémenter**

`src/core/game/config.ts` :

```ts
// Identifiants IGDB (application Twitch « confidentielle »), injectés à la compilation depuis `.env.local` ; vides : IGDB est désactivé.
export const IGDB_CLIENT_ID: string = import.meta.env.WXT_IGDB_CLIENT_ID ?? '';
export const IGDB_CLIENT_SECRET: string = import.meta.env.WXT_IGDB_CLIENT_SECRET ?? '';
export const IGDB_ENABLED: boolean = IGDB_CLIENT_ID !== '' && IGDB_CLIENT_SECRET !== '';

export const STEAM_STORE_BASE = 'https://store.steampowered.com';
export const STEAM_API_BASE = 'https://api.steampowered.com';
export const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
export const IGDB_BASE = 'https://api.igdb.com/v4';
export const IGDB_COVER_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_big';
export const IGDB_THUMB_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_small';
```

`src/env.d.ts` : ajouter dans `ImportMetaEnv` :

```ts
  readonly WXT_IGDB_CLIENT_ID?: string;
  readonly WXT_IGDB_CLIENT_SECRET?: string;
```

`src/core/game/errors.ts` :

```ts
import type { GameSource } from './game-detail';

export type GameErrorCode = 'auth' | 'not-found' | 'rate-limited' | 'http';

export class GameError extends Error {
  constructor(
    readonly source: GameSource,
    readonly code: GameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

const NAMES: Record<GameSource, string> = { steam: 'Steam', igdb: 'IGDB' };

export function gameErrorMessage(error: unknown): string {
  if (!(error instanceof GameError)) return 'Les informations du jeu sont indisponibles pour le moment.';
  const name = NAMES[error.source];
  if (error.code === 'rate-limited') return `${name} demande de patienter un instant. Réessaie dans quelques secondes.`;
  if (error.code === 'auth') return `L'accès à ${name} est refusé.`;
  if (error.code === 'not-found') return `Introuvable sur ${name}.`;
  return `${name} est indisponible pour le moment.`;
}
```

`src/core/game/game-detail.ts` :

```ts
export type GameSource = 'steam' | 'igdb';
export type GameRef = { source: GameSource; id: number };
// Choix de l'utilisateur pour une carte : un jeu précis, ou « aucun jeu ».
export type GameChoice = GameRef | { none: true };

export type GameTrailer = { kind: 'hls'; url: string; poster?: string } | { kind: 'youtube'; key: string };
// `positive` : pourcentage d'avis positifs (Steam) ; `score` : note sur 100 (IGDB).
export type GameRating = { kind: 'positive' | 'score'; value: number; count: number; verdict?: string };

export type GameDetail = {
  source: GameSource;
  id: number;
  title: string;
  originalTitle?: string;
  year?: number;
  summary?: string;
  genres: string[];
  platforms: string[];
  developers: string[];
  releaseDate?: string;
  rating?: GameRating;
  metascore?: { score: number; url?: string };
  price?: string;
  playersOnline?: number;
  trailer?: GameTrailer;
  coverUrl?: string;
  pageUrl: string;
};

// Un résultat de recherche (propositions de la fenêtre « Changer de jeu » et résolution par titre).
export type GameCandidate = { source: GameSource; id: number; title: string; year?: number; platforms: string[]; imageUrl?: string; popularity: number };

export type GameRequestInit = { method?: string; headers?: Record<string, string>; body?: string };
export type GameFetch = (url: string, init?: GameRequestInit) => Promise<Response>;
```

`src/core/game/http.ts` :

```ts
import type { z } from 'zod';
import { GameError } from './errors';
import type { GameFetch, GameRequestInit, GameSource } from './game-detail';

// Un appel JSON : les statuts d'erreur deviennent des `GameError`, un format inattendu lève.
export async function requestJson<S extends z.ZodType>(source: GameSource, fetchFn: GameFetch, url: string, schema: S, init?: GameRequestInit): Promise<z.infer<S>> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    throw new GameError(source, 'http', 'injoignable');
  }
  if (response.status === 401 || response.status === 403) throw new GameError(source, 'auth', 'accès refusé');
  if (response.status === 404) throw new GameError(source, 'not-found', 'introuvable');
  if (response.status === 429) throw new GameError(source, 'rate-limited', 'limite atteinte');
  if (!response.ok) throw new GameError(source, 'http', `HTTP ${response.status}`);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new GameError(source, 'http', 'réponse illisible');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new GameError(source, 'http', 'réponse inattendue');
  return parsed.data;
}
```

`src/core/spotify/transport.ts` : dans `FETCH_PREFIXES`, après la ligne TMDB, ajouter

```ts
  // Jeux vidéo : Steam (boutique, joueurs en ligne), Twitch (jeton) et IGDB (catalogue).
  'https://store.steampowered.com/',
  'https://api.steampowered.com/',
  'https://id.twitch.tv/oauth2/token',
  'https://api.igdb.com/v4/',
```

et adapter le commentaire au-dessus (« …TMDB (films et séries), les jeux vidéo (Steam, IGDB) et GitHub… »).

`wxt.config.ts` : dans `host_permissions`, après la ligne TMDB, ajouter

```ts
      'https://store.steampowered.com/*',
      'https://api.steampowered.com/*',
      'https://id.twitch.tv/*',
      'https://api.igdb.com/*',
```

- [ ] **Step 4: Lancer les tests, vérifier la réussite**

Run: `npx vitest run tests/core/game/http.test.ts tests/core/spotify/transport.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Aligner la spec (durées de mémorisation)**

Dans `docs/superpowers/specs/2026-10-06-jeux-video-steam-igdb-design.md`, remplacer « Steam : détail 24 h, note et joueurs en ligne 1 h ; IGDB : 7 jours » par « Steam : détail complet (avec note et joueurs en ligne) 6 h ; IGDB : 7 jours », et « 4 requêtes par seconde » reste. Ajouter sous « Architecture » : « IGDB : `P5794` contient le *slug* du jeu (ex. `elden-ring`), pas un identifiant numérique ; `igdb-api` sait lire un jeu par slug. L'APK reçoit un pont HTTP natif (`WmtHttp`) pour Steam et IGDB, qui n'envoient pas d'en-têtes CORS. »

- [ ] **Step 6: Commit**

```bash
git add src/core/game src/env.d.ts wxt.config.ts src/core/spotify/transport.ts tests/core/game tests/core/spotify/transport.test.ts docs/superpowers/specs
git commit -m "feat(jeux): configuration, types, erreurs et hôtes autorisés pour Steam et IGDB

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Mise en forme et lecture d'un lien

**Files:**
- Create: `src/core/game/game-format.ts`
- Test: `tests/core/game/game-format.test.ts`

**Interfaces:**
- Produces: `formatCount(n): string`, `verdictFr(desc?): string | undefined`, `yearOfText(text?): number | undefined`, `normalizeTitle(text): string`, `steamPageUrl(id): string`, `parseGameLink(text): { source: 'steam'; id: number } | { source: 'igdb'; slug: string } | null`, `formatPrice(currency, cents): string`.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { formatCount, formatPrice, normalizeTitle, parseGameLink, steamPageUrl, verdictFr, yearOfText } from '../../../src/core/game/game-format';

const flat = (text: string) => text.replace(/\s/g, ' ');

describe('game-format', () => {
  it('sépare les milliers et met en forme un prix en euros', () => {
    expect(flat(formatCount(1157783))).toBe('1 157 783');
    expect(flat(formatPrice('EUR', 5999))).toBe('59,99 €');
  });

  it('traduit le verdict Steam, et garde un verdict inconnu tel quel', () => {
    expect(verdictFr('Very Positive')).toBe('Très positives');
    expect(verdictFr('Mixed')).toBe('Mitigées');
    expect(verdictFr('Quelque chose')).toBe('Quelque chose');
    expect(verdictFr(undefined)).toBeUndefined();
  });

  it("lit l'année d'une date en texte", () => {
    expect(yearOfText('24 févr. 2022')).toBe(2022);
    expect(yearOfText('Bientôt')).toBeUndefined();
    expect(yearOfText(undefined)).toBeUndefined();
  });

  it('normalise les titres : accents, casse, ponctuation, espaces', () => {
    expect(normalizeTitle('  ELDEN  RING ')).toBe('elden ring');
    expect(normalizeTitle('Pokémon: Rouge')).toBe('pokemon rouge');
  });

  it("construit l'adresse de la page Steam", () => {
    expect(steamPageUrl(1245620)).toBe('https://store.steampowered.com/app/1245620');
  });

  it('lit un lien Steam ou IGDB, rien sinon', () => {
    expect(parseGameLink('https://store.steampowered.com/app/1245620/ELDEN_RING/')).toEqual({ source: 'steam', id: 1245620 });
    expect(parseGameLink(' https://www.igdb.com/games/super-metroid ')).toEqual({ source: 'igdb', slug: 'super-metroid' });
    expect(parseGameLink('https://exemple.test/app/12')).toBeNull();
    expect(parseGameLink('super metroid')).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/game/game-format.test.ts` — Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

```ts
import { STEAM_STORE_BASE } from './config';

export const formatCount = (count: number): string => count.toLocaleString('fr-FR');

export const formatPrice = (currency: string, cents: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);

// Les verdicts de Steam arrivent en anglais.
const VERDICTS: Record<string, string> = {
  'Overwhelmingly Positive': 'Extrêmement positives',
  'Very Positive': 'Très positives',
  Positive: 'Positives',
  'Mostly Positive': 'Plutôt positives',
  Mixed: 'Mitigées',
  'Mostly Negative': 'Plutôt négatives',
  Negative: 'Négatives',
  'Very Negative': 'Très négatives',
  'Overwhelmingly Negative': 'Extrêmement négatives',
};
export const verdictFr = (description: string | undefined): string | undefined => (description === undefined ? undefined : (VERDICTS[description] ?? description));

export const yearOfText = (text: string | undefined): number | undefined => {
  const match = text?.match(/\b(\d{4})\b/);
  return match?.[1] ? Number(match[1]) : undefined;
};

export const normalizeTitle = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const steamPageUrl = (appid: number): string => `${STEAM_STORE_BASE}/app/${appid}`;

export type GameLink = { source: 'steam'; id: number } | { source: 'igdb'; slug: string };

// Une adresse collée par l'utilisateur : page Steam (`/app/<id>`) ou page IGDB (`/games/<slug>`).
export function parseGameLink(text: string): GameLink | null {
  const value = text.trim();
  const steam = value.match(/^https?:\/\/store\.steampowered\.com\/app\/(\d+)/);
  if (steam?.[1]) return { source: 'steam', id: Number(steam[1]) };
  const igdb = value.match(/^https?:\/\/(?:www\.)?igdb\.com\/games\/([a-z0-9][a-z0-9-]*)/);
  if (igdb?.[1]) return { source: 'igdb', slug: igdb[1] };
  return null;
}
```

- [ ] **Step 4: Lancer, vérifier la réussite**

Run: `npx vitest run tests/core/game/game-format.test.ts && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/game/game-format.ts tests/core/game/game-format.test.ts
git commit -m "feat(jeux): mise en forme des notes, prix et liens de jeux

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API Steam

**Files:**
- Create: `src/core/game/steam-api.ts`
- Test: `tests/core/game/steam-api.test.ts`

**Interfaces:**
- Consumes: `requestJson`, `GameError`, types de `game-detail.ts`, `steamPageUrl`, `verdictFr`, `yearOfText`, `formatPrice`, `STEAM_*`.
- Produces: `createSteamApi({ fetch: GameFetch })` → `{ detail(appid: number): Promise<GameDetail | null>; search(title: string): Promise<GameCandidate[]> }`. `detail` rend `null` quand Steam répond `success: false` (jeu retiré, barrière d'âge). Les avis et les joueurs en ligne sont facultatifs (leur panne ne casse pas la fiche, sauf une limite de débit qui lève).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it, vi } from 'vitest';
import { GameError } from '../../../src/core/game/errors';
import { createSteamApi } from '../../../src/core/game/steam-api';

const details = {
  '1245620': {
    success: true,
    data: {
      name: 'ELDEN RING',
      short_description: 'Le RPG d’action acclamé.',
      is_free: false,
      developers: ['FromSoftware, Inc.'],
      genres: [{ description: 'Action' }, { description: 'RPG' }],
      release_date: { date: '24 févr. 2022' },
      price_overview: { currency: 'EUR', final: 5999 },
      metacritic: { score: 94, url: 'https://www.metacritic.com/game/pc/elden-ring' },
      platforms: { windows: true, mac: false, linux: false },
      movies: [{ thumbnail: 'https://x/thumb.jpg', hls_h264: 'https://x/hls.m3u8', highlight: true }],
      header_image: 'https://x/header.jpg',
    },
  },
};
const reviews = { query_summary: { review_score_desc: 'Very Positive', total_positive: 1077271, total_negative: 80512, total_reviews: 1157783 } };
const players = { response: { player_count: 22386, result: 1 } };
const search = {
  total: 2,
  items: [
    { type: 'app', id: 1245620, name: 'ELDEN RING', tiny_image: 'https://x/tiny.jpg', platforms: { windows: true, mac: false, linux: false } },
    { type: 'bundle', id: 9, name: 'Lot' },
  ],
};

const route = (table: Record<string, unknown>, status = 200) =>
  vi.fn(async (url: string) => {
    const hit = Object.entries(table).find(([key]) => url.includes(key));
    return hit ? Response.json(hit[1], { status }) : new Response('', { status: 404 });
  });

describe('createSteamApi.detail', () => {
  it('assemble la fiche : avis, joueurs, prix, bande-annonce, Metascore', async () => {
    const api = createSteamApi({ fetch: route({ appdetails: details, appreviews: reviews, GetNumberOfCurrentPlayers: players }) });
    const detail = await api.detail(1245620);
    expect(detail).toMatchObject({
      source: 'steam',
      id: 1245620,
      title: 'ELDEN RING',
      year: 2022,
      genres: ['Action', 'RPG'],
      platforms: ['Windows'],
      developers: ['FromSoftware, Inc.'],
      releaseDate: '24 févr. 2022',
      rating: { kind: 'positive', value: 93, count: 1157783, verdict: 'Très positives' },
      metascore: { score: 94, url: 'https://www.metacritic.com/game/pc/elden-ring' },
      playersOnline: 22386,
      trailer: { kind: 'hls', url: 'https://x/hls.m3u8', poster: 'https://x/thumb.jpg' },
      coverUrl: 'https://x/header.jpg',
      pageUrl: 'https://store.steampowered.com/app/1245620',
    });
    expect(detail?.price?.replace(/\s/g, ' ')).toBe('59,99 €');
  });

  it("rend null quand Steam n'a pas de données (success: false)", async () => {
    const api = createSteamApi({ fetch: route({ appdetails: { '7': { success: false } } }) });
    expect(await api.detail(7)).toBeNull();
  });

  it("garde la fiche sans avis ni joueurs quand ces appels échouent, mais relaie une limite de débit", async () => {
    const partial = vi.fn(async (url: string) => (url.includes('appdetails') ? Response.json(details) : new Response('', { status: 500 })));
    const detail = await createSteamApi({ fetch: partial }).detail(1245620);
    expect(detail?.title).toBe('ELDEN RING');
    expect(detail?.rating).toBeUndefined();
    expect(detail?.playersOnline).toBeUndefined();

    const limited = vi.fn(async (url: string) => (url.includes('appdetails') ? Response.json(details) : new Response('', { status: 429 })));
    await expect(createSteamApi({ fetch: limited }).detail(1245620)).rejects.toBeInstanceOf(GameError);
  });

  it("un jeu gratuit affiche « Gratuit », un jeu sans avis n'a pas de note", async () => {
    const free = { '5': { success: true, data: { name: 'Libre', is_free: true } } };
    const noReviews = { query_summary: { total_positive: 0, total_negative: 0, total_reviews: 0 } };
    const api = createSteamApi({ fetch: route({ appdetails: free, appreviews: noReviews, GetNumberOfCurrentPlayers: players }) });
    const detail = await api.detail(5);
    expect(detail?.price).toBe('Gratuit');
    expect(detail?.rating).toBeUndefined();
  });
});

describe('createSteamApi.search', () => {
  it('rend les jeux (type app) comme candidats, dans l’ordre de Steam', async () => {
    const api = createSteamApi({ fetch: route({ storesearch: search }) });
    expect(await api.search('Elden Ring')).toEqual([
      { source: 'steam', id: 1245620, title: 'ELDEN RING', platforms: ['Windows'], imageUrl: 'https://x/tiny.jpg', popularity: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/game/steam-api.test.ts` — Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `src/core/game/steam-api.ts`**

```ts
import { z } from 'zod';
import { STEAM_API_BASE, STEAM_STORE_BASE } from './config';
import { GameError } from './errors';
import type { GameCandidate, GameDetail, GameFetch } from './game-detail';
import { formatPrice, steamPageUrl, verdictFr, yearOfText } from './game-format';
import { requestJson } from './http';

const platformFlags = z.object({ windows: z.boolean().optional(), mac: z.boolean().optional(), linux: z.boolean().optional() });
const detailsSchema = z.record(
  z.string(),
  z.object({
    success: z.boolean(),
    data: z
      .object({
        name: z.string(),
        short_description: z.string().optional(),
        is_free: z.boolean().optional(),
        developers: z.array(z.string()).optional(),
        genres: z.array(z.object({ description: z.string() })).optional(),
        release_date: z.object({ date: z.string().optional() }).optional(),
        price_overview: z.object({ currency: z.string(), final: z.number() }).optional(),
        metacritic: z.object({ score: z.number(), url: z.string().optional() }).optional(),
        platforms: platformFlags.optional(),
        movies: z.array(z.object({ thumbnail: z.string().optional(), hls_h264: z.string().optional(), highlight: z.boolean().optional() })).optional(),
        header_image: z.string().optional(),
      })
      .optional(),
  }),
);
const reviewsSchema = z.object({
  query_summary: z.object({ review_score_desc: z.string().optional(), total_positive: z.number(), total_negative: z.number(), total_reviews: z.number() }),
});
const playersSchema = z.object({ response: z.object({ player_count: z.number().optional() }) });
const searchSchema = z.object({
  items: z.array(z.object({ type: z.string(), id: z.number(), name: z.string(), tiny_image: z.string().optional(), platforms: platformFlags.optional() })),
});

const platformNames = (flags: z.infer<typeof platformFlags> | undefined): string[] => [
  ...(flags?.windows ? ['Windows'] : []),
  ...(flags?.mac ? ['macOS'] : []),
  ...(flags?.linux ? ['Linux'] : []),
];

export function createSteamApi(deps: { fetch: GameFetch }) {
  const get = <S extends z.ZodType>(url: string, schema: S) => requestJson('steam', deps.fetch, url, schema);
  // Avis et joueurs en ligne sont un plus : leur panne ne casse pas la fiche, une limite de débit si (rien ne doit être gardé).
  const optional = <T>(promise: Promise<T>): Promise<T | null> =>
    promise.catch((error: unknown) => {
      if (error instanceof GameError && error.code === 'rate-limited') throw error;
      return null;
    });

  return {
    async detail(appid: number): Promise<GameDetail | null> {
      const [details, reviews, players] = await Promise.all([
        get(`${STEAM_STORE_BASE}/api/appdetails?appids=${appid}&l=french&cc=fr`, detailsSchema),
        optional(get(`${STEAM_STORE_BASE}/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=1`, reviewsSchema)),
        optional(get(`${STEAM_API_BASE}/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`, playersSchema)),
      ]);
      const entry = details[String(appid)];
      const data = entry?.success ? entry.data : undefined;
      if (!data) return null;

      const summary = reviews?.query_summary;
      const total = summary?.total_reviews ?? 0;
      const verdict = verdictFr(summary?.review_score_desc);
      const movie = data.movies?.find((item) => item.highlight && item.hls_h264) ?? data.movies?.find((item) => item.hls_h264);
      const price = data.is_free ? 'Gratuit' : data.price_overview ? formatPrice(data.price_overview.currency, data.price_overview.final) : undefined;
      const year = yearOfText(data.release_date?.date);

      return {
        source: 'steam',
        id: appid,
        title: data.name,
        ...(year !== undefined ? { year } : {}),
        ...(data.short_description ? { summary: data.short_description } : {}),
        genres: (data.genres ?? []).map((genre) => genre.description),
        platforms: platformNames(data.platforms),
        developers: data.developers ?? [],
        ...(data.release_date?.date ? { releaseDate: data.release_date.date } : {}),
        ...(summary && total > 0
          ? { rating: { kind: 'positive' as const, value: Math.round((100 * summary.total_positive) / total), count: total, ...(verdict ? { verdict } : {}) } }
          : {}),
        ...(data.metacritic ? { metascore: { score: data.metacritic.score, ...(data.metacritic.url ? { url: data.metacritic.url } : {}) } } : {}),
        ...(price ? { price } : {}),
        ...(players?.response.player_count !== undefined ? { playersOnline: players.response.player_count } : {}),
        ...(movie?.hls_h264 ? { trailer: { kind: 'hls' as const, url: movie.hls_h264, ...(movie.thumbnail ? { poster: movie.thumbnail } : {}) } } : {}),
        ...(data.header_image ? { coverUrl: data.header_image } : {}),
        pageUrl: steamPageUrl(appid),
      };
    },

    async search(title: string): Promise<GameCandidate[]> {
      const data = await get(`${STEAM_STORE_BASE}/api/storesearch/?term=${encodeURIComponent(title)}&l=french&cc=fr`, searchSchema);
      return data.items
        .filter((item) => item.type === 'app')
        .map((item) => ({
          source: 'steam' as const,
          id: item.id,
          title: item.name,
          platforms: platformNames(item.platforms),
          ...(item.tiny_image ? { imageUrl: item.tiny_image } : {}),
          popularity: 0,
        }));
    },
  };
}

export type SteamApi = ReturnType<typeof createSteamApi>;
```

- [ ] **Step 4: Lancer, vérifier la réussite**

Run: `npx vitest run tests/core/game/steam-api.test.ts && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Vérifier contre la vraie API (une fois, à la main)**

Run: `curl -s "https://store.steampowered.com/appreviews/1245620?json=1&language=all&num_per_page=1" | head -c 300`
Expected: contient `"review_score_desc":"Very Positive"` (si c'est déjà du français, `verdictFr` le laisse tel quel : rien à changer).

- [ ] **Step 6: Commit**

```bash
git add src/core/game/steam-api.ts tests/core/game/steam-api.test.ts
git commit -m "feat(jeux): API Steam (fiche, avis, joueurs en ligne, recherche)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API IGDB (jeton Twitch, file d'attente, fiche, recherche)

**Files:**
- Create: `src/core/game/igdb-api.ts`
- Test: `tests/core/game/igdb-api.test.ts`

**Interfaces:**
- Consumes: `requestJson`, `GameError`, `createMemoryStore`/`KeyValueStore`, config.
- Produces: `createIgdbApi({ fetch, clientId, clientSecret, store, now?, sleep? })` → `{ detail(by: { id: number } | { slug: string }): Promise<GameDetail | null>; search(title: string): Promise<GameCandidate[]> }`. `search` rend les candidats triés du plus au moins connu (`popularity` = nombre de notes).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createIgdbApi } from '../../../src/core/game/igdb-api';

const row = {
  id: 1000,
  name: 'Super Metroid',
  summary: 'Samus affronte Ridley.',
  first_release_date: 766713600, // 1994-04-19
  url: 'https://www.igdb.com/games/super-metroid',
  genres: [{ name: 'Platform' }, { name: 'Adventure' }],
  platforms: [{ name: 'Super Nintendo Entertainment System' }],
  involved_companies: [{ developer: true, company: { name: 'Nintendo R&D1' } }, { developer: false, company: { name: 'Nintendo' } }],
  aggregated_rating: 91.4,
  aggregated_rating_count: 21,
  videos: [{ video_id: 'abcdefghijk' }],
  cover: { image_id: 'co1abc' },
};

function setup(over: { games?: (body: string) => Response; tokenStatus?: number } = {}) {
  const calls: { url: string; body?: string; auth?: string }[] = [];
  let tokens = 0;
  const fetch = vi.fn(async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
    calls.push({ url, ...(init?.body ? { body: init.body } : {}), ...(init?.headers?.Authorization ? { auth: init.headers.Authorization } : {}) });
    if (url.startsWith('https://id.twitch.tv/')) {
      tokens += 1;
      return Response.json({ access_token: `jeton-${tokens}`, expires_in: 5_000_000 }, { status: over.tokenStatus ?? 200 });
    }
    return over.games ? over.games(init?.body ?? '') : Response.json([row]);
  });
  const api = createIgdbApi({ fetch, clientId: 'id', clientSecret: 'secret', store: createMemoryStore(), now: () => 0, sleep: async () => undefined });
  return { api, fetch, calls, tokens: () => tokens };
}

describe('createIgdbApi', () => {
  it('lit un jeu par slug et le met au format commun', async () => {
    const { api, calls } = setup();
    const detail = await api.detail({ slug: 'super-metroid' });
    expect(calls.find((call) => call.url.includes('/games'))?.body).toContain('where slug = "super-metroid"');
    expect(detail).toMatchObject({
      source: 'igdb',
      id: 1000,
      title: 'Super Metroid',
      year: 1994,
      genres: ['Platform', 'Adventure'],
      platforms: ['Super Nintendo Entertainment System'],
      developers: ['Nintendo R&D1'],
      rating: { kind: 'score', value: 91, count: 21 },
      trailer: { kind: 'youtube', key: 'abcdefghijk' },
      pageUrl: 'https://www.igdb.com/games/super-metroid',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg',
    });
    expect(detail?.releaseDate).toContain('1994');
  });

  it('lit un jeu par identifiant, rend null quand IGDB ne le connaît pas', async () => {
    const { api, calls } = setup({ games: () => Response.json([]) });
    expect(await api.detail({ id: 5 })).toBeNull();
    expect(calls.find((call) => call.url.includes('/games'))?.body).toContain('where id = 5');
  });

  it('demande le jeton une fois, le garde, et le renouvelle après un refus (401)', async () => {
    let refused = true;
    const { api, tokens } = setup({
      games: () => {
        if (refused) {
          refused = false;
          return new Response('', { status: 401 });
        }
        return Response.json([row]);
      },
    });
    expect((await api.detail({ id: 1000 }))?.title).toBe('Super Metroid');
    expect(tokens()).toBe(2); // premier jeton refusé, second accepté
    await api.detail({ id: 1000 });
    expect(tokens()).toBe(2);
  });

  it('cherche par titre : candidats du plus connu au moins connu, guillemets retirés de la requête', async () => {
    const rows = [
      { id: 1, name: 'Super Metroid Arcade', first_release_date: 1506816000, platforms: [{ name: 'SNES' }], cover: { image_id: 'a' }, total_rating_count: 0 },
      { id: 2, name: 'Super Metroid', first_release_date: 766713600, platforms: [{ name: 'SNES' }], cover: { image_id: 'b' }, total_rating_count: 300 },
    ];
    const { api, calls } = setup({ games: () => Response.json(rows) });
    const found = await api.search('Super "Metroid"');
    expect(calls.find((call) => call.url.includes('/games'))?.body).toContain('search "Super  Metroid"');
    expect(found.map((candidate) => candidate.id)).toEqual([2, 1]);
    expect(found[0]).toMatchObject({ source: 'igdb', title: 'Super Metroid', year: 1994, platforms: ['SNES'], popularity: 300, imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_small/b.jpg' });
  });

  it("une réponse sans la structure attendue lève une erreur, et un échec du jeton aussi", async () => {
    await expect(setup({ games: () => Response.json({ pas: 'un tableau' }) }).api.detail({ id: 1 })).rejects.toMatchObject({ name: 'GameError', source: 'igdb' });
    await expect(setup({ tokenStatus: 403 }).api.detail({ id: 1 })).rejects.toMatchObject({ code: 'auth' });
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/game/igdb-api.test.ts` — Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `src/core/game/igdb-api.ts`**

```ts
import { z } from 'zod';
import type { KeyValueStore } from '../cache/store';
import { IGDB_BASE, IGDB_COVER_BASE, IGDB_THUMB_BASE, TWITCH_TOKEN_URL } from './config';
import { GameError } from './errors';
import type { GameCandidate, GameDetail, GameFetch } from './game-detail';
import { requestJson } from './http';

const TOKEN_KEY = 'igdb-token-v1';
// Un jeton est renouvelé une heure avant son expiration.
const TOKEN_MARGIN_MS = 3_600_000;
// IGDB tolère environ 4 requêtes par seconde.
const GAP_MS = 260;

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });
type StoredToken = { token: string; expiresAt: number };

const row = z.object({
  id: z.number(),
  name: z.string(),
  summary: z.string().optional(),
  first_release_date: z.number().optional(),
  url: z.string().optional(),
  genres: z.array(z.object({ name: z.string() })).optional(),
  platforms: z.array(z.object({ name: z.string() })).optional(),
  involved_companies: z.array(z.object({ developer: z.boolean().optional(), company: z.object({ name: z.string() }).optional() })).optional(),
  aggregated_rating: z.number().optional(),
  aggregated_rating_count: z.number().optional(),
  total_rating: z.number().optional(),
  total_rating_count: z.number().optional(),
  videos: z.array(z.object({ video_id: z.string() })).optional(),
  cover: z.object({ image_id: z.string() }).optional(),
});
const rows = z.array(row);
type Row = z.infer<typeof row>;

const DETAIL_FIELDS =
  'id,name,summary,first_release_date,url,genres.name,platforms.name,involved_companies.developer,involved_companies.company.name,aggregated_rating,aggregated_rating_count,total_rating,total_rating_count,videos.video_id,cover.image_id';
const SEARCH_FIELDS = 'id,name,first_release_date,platforms.name,cover.image_id,total_rating_count';

// Les guillemets et les barres obliques inverses casseraient la requête.
const clean = (text: string): string => text.replace(/[\\"]/g, ' ').trim();
const yearOf = (seconds: number | undefined): number | undefined => (seconds === undefined ? undefined : new Date(seconds * 1000).getUTCFullYear());
const dateText = (seconds: number): string => new Date(seconds * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function toDetail(game: Row): GameDetail {
  const year = yearOf(game.first_release_date);
  const developers = (game.involved_companies ?? []).filter((item) => item.developer && item.company).map((item) => item.company?.name ?? '');
  const critic = game.aggregated_rating !== undefined ? { value: game.aggregated_rating, count: game.aggregated_rating_count ?? 0 } : null;
  const players = game.total_rating !== undefined ? { value: game.total_rating, count: game.total_rating_count ?? 0 } : null;
  const score = critic ?? players;
  const video = game.videos?.[0]?.video_id;
  return {
    source: 'igdb',
    id: game.id,
    title: game.name,
    ...(year !== undefined ? { year } : {}),
    ...(game.summary ? { summary: game.summary } : {}),
    genres: (game.genres ?? []).map((genre) => genre.name),
    platforms: (game.platforms ?? []).map((platform) => platform.name),
    developers,
    ...(game.first_release_date !== undefined ? { releaseDate: dateText(game.first_release_date) } : {}),
    ...(score ? { rating: { kind: 'score' as const, value: Math.round(score.value), count: score.count } } : {}),
    ...(video ? { trailer: { kind: 'youtube' as const, key: video } } : {}),
    ...(game.cover ? { coverUrl: `${IGDB_COVER_BASE}/${game.cover.image_id}.jpg` } : {}),
    pageUrl: game.url ?? `https://www.igdb.com/games/${game.id}`,
  };
}

export function createIgdbApi(deps: {
  fetch: GameFetch;
  clientId: string;
  clientSecret: string;
  store: KeyValueStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}) {
  const { fetch: fetchFn, clientId, clientSecret, store } = deps;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function token(renew: boolean): Promise<string> {
    if (!renew) {
      const kept = await store.get<StoredToken>(TOKEN_KEY);
      if (kept && kept.expiresAt - now() > TOKEN_MARGIN_MS) return kept.token;
    }
    const url = `${TWITCH_TOKEN_URL}?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
    const data = await requestJson('igdb', fetchFn, url, tokenSchema, { method: 'POST' });
    await store.set<StoredToken>(TOKEN_KEY, { token: data.access_token, expiresAt: now() + data.expires_in * 1000 });
    return data.access_token;
  }

  // Les requêtes se suivent, séparées de GAP_MS.
  let tail: Promise<unknown> = Promise.resolve();
  function paced<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task);
    tail = run.then(
      () => sleep(GAP_MS),
      () => sleep(GAP_MS),
    );
    return run;
  }

  function query(body: string): Promise<Row[]> {
    return paced(async () => {
      for (let attempt = 0; ; attempt += 1) {
        const bearer = await token(attempt > 0);
        try {
          return await requestJson('igdb', fetchFn, `${IGDB_BASE}/games`, rows, {
            method: 'POST',
            headers: { 'Client-ID': clientId, Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
            body,
          });
        } catch (error) {
          // Un jeton refusé est renouvelé une fois.
          if (attempt === 0 && error instanceof GameError && error.code === 'auth') continue;
          throw error;
        }
      }
    });
  }

  return {
    async detail(by: { id: number } | { slug: string }): Promise<GameDetail | null> {
      const where = 'id' in by ? `id = ${by.id}` : `slug = "${clean(by.slug)}"`;
      const [game] = await query(`fields ${DETAIL_FIELDS}; where ${where}; limit 1;`);
      return game ? toDetail(game) : null;
    },

    async search(title: string): Promise<GameCandidate[]> {
      const found = await query(`search "${clean(title)}"; fields ${SEARCH_FIELDS}; limit 10;`);
      return found
        .map((game): GameCandidate => {
          const year = yearOf(game.first_release_date);
          return {
            source: 'igdb',
            id: game.id,
            title: game.name,
            ...(year !== undefined ? { year } : {}),
            platforms: (game.platforms ?? []).map((platform) => platform.name),
            ...(game.cover ? { imageUrl: `${IGDB_THUMB_BASE}/${game.cover.image_id}.jpg` } : {}),
            popularity: game.total_rating_count ?? 0,
          };
        })
        .sort((a, b) => b.popularity - a.popularity);
    },
  };
}

export type IgdbApi = ReturnType<typeof createIgdbApi>;
```

- [ ] **Step 4: Lancer, vérifier la réussite**

Run: `npx vitest run tests/core/game/igdb-api.test.ts && npm run typecheck` — Expected: PASS. (Si le test sur `clean('Super "Metroid"')` échoue : la requête attendue contient deux espaces, un par guillemet remplacé.)

- [ ] **Step 5: Essai réel, sans afficher les secrets**

Exécuter, depuis la racine, le script suivant qui charge `.env.local` sans rien imprimer d'autre que le résultat :

```bash
node -e "
const fs=require('fs');const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
(async()=>{const t=await (await fetch('https://id.twitch.tv/oauth2/token?client_id='+env.WXT_IGDB_CLIENT_ID+'&client_secret='+env.WXT_IGDB_CLIENT_SECRET+'&grant_type=client_credentials',{method:'POST'})).json();
const r=await fetch('https://api.igdb.com/v4/games',{method:'POST',headers:{'Client-ID':env.WXT_IGDB_CLIENT_ID,Authorization:'Bearer '+t.access_token,Accept:'application/json'},body:'fields id,name,slug; where slug = \"super-metroid\"; limit 1;'});
console.log(r.status, JSON.stringify(await r.json()));})();"
```

Expected: `200 [{"id":…,"name":"Super Metroid","slug":"super-metroid"}]`.

- [ ] **Step 6: Commit**

```bash
git add src/core/game/igdb-api.ts tests/core/game/igdb-api.test.ts
git commit -m "feat(jeux): API IGDB (jeton Twitch, file d'attente, fiche par slug ou identifiant, recherche)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wikidata, nature « jeu vidéo » et dépôts

**Files:**
- Create: `src/core/game/wikidata-game.ts`, `src/core/game/game-kinds.ts`, `src/core/game/game-repo.ts`
- Test: `tests/core/game/wikidata-game.test.ts`, `tests/core/game/game-repo.test.ts`

**Interfaces:**
- Consumes: `getJson`, `parseWikibaseItems`, `usableClaims`, `FetchLike` de `src/core/birth/wikidata-birth.ts` ; `slugToTitle` de `src/core/market/market-book` ; `CardKinds` de `src/core/kinds/wikidata-kinds` ; `KeyValueStore`.
- Produces: `CardGame = { steamId?: number; igdbSlug?: string }` ; `parseCardGame(json)` ; `fetchWikidataGame(fetchFn, slugs)` ; `isVideoGame(kinds: CardKinds | undefined): boolean` ; `createGameRepo(store, fetchGame, now?)` → `{ load(), resolve(slugs) }` ; `createGameChoiceRepo(store)` → `{ load(): Promise<Record<string, GameChoice>>; save(slug, choice): Promise<void>; clear(slug): Promise<void> }`.

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/core/game/wikidata-game.test.ts` (même motif que `wikidata-screen.test.ts`) :

```ts
import { describe, expect, it, vi } from 'vitest';
import { isVideoGame } from '../../../src/core/game/game-kinds';
import { fetchWikidataGame, parseCardGame } from '../../../src/core/game/wikidata-game';

const text = (value: string, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value } } });
const entities = (record: Record<string, Record<string, unknown[]>>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([key, claims]) => [key, { claims }])),
});

describe('parseCardGame', () => {
  it("lit l'identifiant Steam (P1733) et le slug IGDB (P5794)", () => {
    const parsed = parseCardGame(entities({ Q1: { P1733: [text('1245620')], P5794: [text('elden-ring')] } }));
    expect(parsed.Q1).toEqual({ steamId: 1245620, igdbSlug: 'elden-ring' });
  });

  it('ignore une valeur mal formée et un rang déprécié', () => {
    const parsed = parseCardGame(entities({ Q1: { P1733: [text('abc'), text('1', 'deprecated'), text('2', 'preferred')], P5794: [text('Pas Un Slug!')] } }));
    expect(parsed.Q1).toEqual({ steamId: 2 });
  });

  it('rend un objet vide sans valeur, et lève sur un format inattendu', () => {
    expect(parseCardGame(entities({ Q1: {} })).Q1).toEqual({});
    expect(() => parseCardGame({ pas: 'wikidata' })).toThrow();
  });
});

describe('fetchWikidataGame', () => {
  it('rend une entrée par article', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      if (params.get('prop') === 'pageprops') {
        return Response.json({ query: { pages: [{ title: 'Elden Ring', pageprops: { wikibase_item: 'Q64826862' } }, { title: 'Inconnu' }] } });
      }
      return Response.json(entities({ Q64826862: { P1733: [text('1245620')] } }));
    });
    expect(await fetchWikidataGame(fetchFn, ['Elden_Ring', 'Inconnu'])).toEqual({ Elden_Ring: { steamId: 1245620 }, Inconnu: {} });
  });
});

describe('isVideoGame', () => {
  it('reconnaît la nature « jeu vidéo » (Q7889)', () => {
    expect(isVideoGame({ natures: ['Q7889'], occupations: [], genres: [] })).toBe(true);
    expect(isVideoGame({ natures: ['Q11424'], occupations: [], genres: [] })).toBe(false);
    expect(isVideoGame(undefined)).toBe(false);
  });
});
```

`tests/core/game/game-repo.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createGameChoiceRepo, createGameRepo } from '../../../src/core/game/game-repo';

describe('createGameRepo', () => {
  it("n'interroge Wikidata que pour les articles jamais vus, et mémorise un article vide", async () => {
    const fetchGame = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, slug === 'A' ? { steamId: 1 } : {}])));
    const repo = createGameRepo(createMemoryStore(), fetchGame);
    expect(await repo.resolve(['A', 'B'])).toEqual({ A: { steamId: 1 }, B: {} });
    await repo.resolve(['A', 'B']);
    expect(fetchGame).toHaveBeenCalledTimes(1);
  });

  it('ne mémorise rien après un échec et attend avant de réessayer', async () => {
    let t = 0;
    const fetchGame = vi.fn(async () => {
      throw new Error('429');
    });
    const repo = createGameRepo(createMemoryStore(), fetchGame, () => t);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await repo.resolve(['A'])).toEqual({});
    t = 10_000;
    await repo.resolve(['A']);
    expect(fetchGame).toHaveBeenCalledTimes(1);
    t = 70_000;
    await repo.resolve(['A']);
    expect(fetchGame).toHaveBeenCalledTimes(2);
  });
});

describe('createGameChoiceRepo', () => {
  it('garde, remplace et efface le choix de chaque carte', async () => {
    const repo = createGameChoiceRepo(createMemoryStore());
    expect(await repo.load()).toEqual({});
    await repo.save('A', { source: 'steam', id: 1 });
    await repo.save('B', { none: true });
    await repo.save('A', { source: 'igdb', id: 2 });
    expect(await repo.load()).toEqual({ A: { source: 'igdb', id: 2 }, B: { none: true } });
    await repo.clear('A');
    expect(await repo.load()).toEqual({ B: { none: true } });
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/game/wikidata-game.test.ts tests/core/game/game-repo.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implémenter**

`src/core/game/game-kinds.ts` :

```ts
import type { CardKinds } from '../kinds/wikidata-kinds';

const VIDEO_GAME = 'Q7889';

// Une carte dont la nature Wikidata est « jeu vidéo ». Une carte avec un identifiant Steam compte aussi (voir game-service).
export const isVideoGame = (kinds: CardKinds | undefined): boolean => kinds?.natures.includes(VIDEO_GAME) ?? false;
```

`src/core/game/wikidata-game.ts` :

```ts
import { z } from 'zod';
import { getJson, parseWikibaseItems, usableClaims, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle } from '../market/market-book';

// Identifiants lus sur Wikidata : Steam (P1733, numérique) et IGDB (P5794, le slug du jeu, ex. `elden-ring`) ; champ absent = inconnu.
export type CardGame = { steamId?: number; igdbSlug?: string };

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

const claimsResponse = z.object({
  entities: z.record(z.string(), z.object({ claims: z.record(z.string(), z.unknown()).optional() })),
});
const steamId = z.string().regex(/^\d+$/);
const igdbSlug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

function firstSteamId(claims: Record<string, unknown>): number | undefined {
  for (const claim of usableClaims(claims, 'P1733')) {
    const parsed = steamId.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return Number(parsed.data);
  }
  return undefined;
}

function firstSlug(claims: Record<string, unknown>): string | undefined {
  for (const claim of usableClaims(claims, 'P5794')) {
    const parsed = igdbSlug.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de valeur ».
export function parseCardGame(json: unknown): Record<string, CardGame> {
  const parsed = claimsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, CardGame> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const claims = entity.claims ?? {};
    const steam = firstSteamId(claims);
    const slug = firstSlug(claims);
    result[id] = { ...(steam !== undefined ? { steamId: steam } : {}), ...(slug !== undefined ? { igdbSlug: slug } : {}) };
  }
  return result;
}

// Un lot d'articles (50 au plus) : élément Wikidata, puis identifiants Steam et IGDB.
// Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikidataGame(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, CardGame>> {
  const titles = slugs.map(slugToTitle);
  const pagesJson = await getJson(
    fetchFn,
    WIKIPEDIA,
    { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', formatversion: '2', titles: titles.join('|') },
    'Wikipédia',
  );
  const items = parseWikibaseItems(pagesJson, titles);
  const itemIds = [...new Set(Object.values(items).filter((id): id is string => id !== null))];
  const byItem =
    itemIds.length > 0 ? parseCardGame(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims', ids: itemIds.join('|') }, 'Wikidata')) : {};
  const result: Record<string, CardGame> = {};
  slugs.forEach((slug, index) => {
    const id = items[titles[index] ?? ''];
    result[slug] = (id ? byItem[id] : undefined) ?? {};
  });
  return result;
}
```

`src/core/game/game-repo.ts` :

```ts
import type { KeyValueStore } from '../cache/store';
import type { GameChoice } from './game-detail';
import type { CardGame } from './wikidata-game';

export type GameState = Record<string, CardGame>;
export type GameFetcher = (slugs: string[]) => Promise<Record<string, CardGame>>;

const KEY = 'game-v1';
const CHOICE_KEY = 'game-choice-v1';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

// Identifiants Steam / IGDB des cartes (même principe que `screen-repo`).
export function createGameRepo(store: KeyValueStore, fetchGame: GameFetcher, now: () => number = () => Date.now()) {
  // Lectures et écritures sérialisées.
  let tail: Promise<unknown> = Promise.resolve();
  let failedAt: number | undefined;

  const read = async (): Promise<GameState> => (await store.get<GameState>(KEY)) ?? {};

  return {
    load: read,

    // Interroge Wikidata pour les articles jamais vus (un article sans valeur est mémorisé vide) ; rend l'état à jour.
    resolve(slugs: string[]): Promise<GameState> {
      const run = tail.then(async () => {
        const state = await read();
        const missing = slugs.filter((slug) => !Object.prototype.hasOwnProperty.call(state, slug));
        if (missing.length === 0) return state;
        if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return state;
        try {
          const next = { ...state, ...(await fetchGame(missing)) };
          await store.set(KEY, next);
          return next;
        } catch (error) {
          console.warn('[wikimasters-tools]', 'identifiants Steam et IGDB Wikidata indisponibles :', error);
          failedAt = now();
          return state;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}
export type GameRepo = ReturnType<typeof createGameRepo>;

// Le jeu choisi à la main pour chaque carte (ou « aucun jeu ») : il prime sur la résolution automatique.
export function createGameChoiceRepo(store: KeyValueStore) {
  let tail: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<Record<string, GameChoice>> => (await store.get<Record<string, GameChoice>>(CHOICE_KEY)) ?? {};
  const update = (change: (state: Record<string, GameChoice>) => Record<string, GameChoice>): Promise<void> => {
    const run = tail.then(async () => store.set(CHOICE_KEY, change(await read())));
    tail = run.catch(() => undefined);
    return run;
  };
  return {
    load: read,
    save: (slug: string, choice: GameChoice): Promise<void> => update((state) => ({ ...state, [slug]: choice })),
    clear: (slug: string): Promise<void> =>
      update((state) => {
        const { [slug]: _removed, ...rest } = state;
        return rest;
      }),
  };
}
export type GameChoiceRepo = ReturnType<typeof createGameChoiceRepo>;
```

- [ ] **Step 4: Lancer, vérifier la réussite**

Run: `npx vitest run tests/core/game && npm run typecheck` — Expected: PASS (si `_removed` est signalé par le linter/tsc, le renommer en `void` : `const { [slug]: removed, ...rest } = state; void removed;`).

- [ ] **Step 5: Commit**

```bash
git add src/core/game tests/core/game
git commit -m "feat(jeux): identifiants Steam/IGDB sur Wikidata, nature jeu vidéo, dépôts d'identifiants et de choix

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Service de la section (résolution, recherche, choix)

**Files:**
- Create: `src/content/game-service.ts`, `src/content/game-registry.ts`
- Test: `tests/content/game-service.test.ts`

**Interfaces:**
- Consumes: `SteamApi['detail'|'search']`, `IgdbApi['detail'|'search']` (ou `null` sans identifiants IGDB), `GameRepo['resolve']`, `GameChoiceRepo`, `KindsRepo['resolveMissing'|'load']`, `collection.list()`, `TtlCache['getOrLoad']`, `isVideoGame`, `normalizeTitle`, `parseGameLink`, `cleanTitle` (de `src/core/music/listen`), `gameErrorMessage`.
- Produces:

```ts
export type GameView =
  | { status: 'none' }                       // pas une carte de jeu vidéo : rien dans la fiche
  | { status: 'empty' }                      // section sans jeu (titre + glyphe)
  | { status: 'detail'; detail: GameDetail }
  | { status: 'error'; message: string };
export type GameCandidates = { steam: GameCandidate[]; igdb: GameCandidate[]; message?: string };
export type GamePreview = { detail?: GameDetail; message?: string };
```

`createGameService(deps)` → `{ igdbEnabled: boolean; view(slug, title): Promise<GameView>; candidates(query): Promise<GameCandidates>; preview(ref: GameRef): Promise<GamePreview>; fromLink(text: string): Promise<GamePreview>; choose(slug, ref): Promise<void>; chooseNone(slug): Promise<void>; reset(slug): Promise<void> }` ; `GameService` ; `setGameService` / `getGameService`.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createGameService } from '../../src/content/game-service';
import { createMemoryStore } from '../../src/core/cache/store';
import { createGameChoiceRepo } from '../../src/core/game/game-repo';
import type { GameCandidate, GameDetail } from '../../src/core/game/game-detail';
import { GameError } from '../../src/core/game/errors';

const steamDetail: GameDetail = { source: 'steam', id: 1245620, title: 'ELDEN RING', genres: [], platforms: [], developers: [], pageUrl: 'https://store.steampowered.com/app/1245620' };
const igdbDetail: GameDetail = { source: 'igdb', id: 1000, title: 'Super Metroid', genres: [], platforms: [], developers: [], pageUrl: 'https://www.igdb.com/games/super-metroid' };
const cand = (source: 'steam' | 'igdb', id: number, title: string, popularity = 0): GameCandidate => ({ source, id, title, platforms: [], popularity });

type Setup = { natures?: string[]; ids?: object; collection?: string[]; steamSearch?: GameCandidate[]; igdbSearch?: GameCandidate[]; igdb?: boolean; steamDetail?: GameDetail | null };

function setup(over: Setup = {}) {
  const steam = {
    detail: vi.fn(async (id: number) => (over.steamDetail === undefined ? { ...steamDetail, id } : over.steamDetail)),
    search: vi.fn(async () => over.steamSearch ?? []),
  };
  const igdb = {
    detail: vi.fn(async (by: { id: number } | { slug: string }) => ({ ...igdbDetail, id: 'id' in by ? by.id : igdbDetail.id })),
    search: vi.fn(async () => over.igdbSearch ?? []),
  };
  const choices = createGameChoiceRepo(createMemoryStore());
  const service = createGameService({
    collection: { list: async () => (over.collection ?? ['Jeu']).map((slug) => ({ slug, title: slug })) },
    kinds: { resolveMissing: vi.fn(async () => undefined), load: async () => ({ cards: { Jeu: { natures: over.natures ?? ['Q7889'], occupations: [], genres: [] } }, labels: {} }) },
    games: { resolve: async () => ({ Jeu: over.ids ?? {} }) },
    choices,
    steam,
    igdb: over.igdb === false ? null : igdb,
    steamCache: { getOrLoad: (_key, loader) => loader() },
    igdbCache: { getOrLoad: (_key, loader) => loader() },
  });
  return { service, steam, igdb, choices };
}

describe('createGameService.view', () => {
  it("rien quand la carte n'est pas dans la collection ou n'est pas un jeu", async () => {
    expect(await setup({ collection: [] }).service.view('Jeu', 'Jeu')).toEqual({ status: 'none' });
    expect(await setup({ natures: ['Q11424'] }).service.view('Jeu', 'Jeu')).toEqual({ status: 'none' });
  });

  it("une carte qui a un identifiant Steam est un jeu même sans la nature Q7889", async () => {
    const { service } = setup({ natures: ['Q123'], ids: { steamId: 5 } });
    expect(await service.view('Jeu', 'Jeu')).toMatchObject({ status: 'detail', detail: { source: 'steam', id: 5 } });
  });

  it("Steam d'abord : l'identifiant Wikidata prime sur IGDB", async () => {
    const { service, steam, igdb } = setup({ ids: { steamId: 1245620, igdbSlug: 'elden-ring' } });
    expect(await service.view('Jeu', 'Elden Ring')).toEqual({ status: 'detail', detail: { ...steamDetail } });
    expect(steam.detail).toHaveBeenCalledWith(1245620);
    expect(igdb.detail).not.toHaveBeenCalled();
  });

  it("repli IGDB par slug quand Steam n'a rien (ou ne connaît pas le jeu)", async () => {
    const { service, igdb } = setup({ ids: { steamId: 7, igdbSlug: 'super-metroid' }, steamDetail: null });
    expect(await service.view('Jeu', 'Super Metroid')).toMatchObject({ status: 'detail', detail: { source: 'igdb' } });
    expect(igdb.detail).toHaveBeenCalledWith({ slug: 'super-metroid' });
  });

  it('sans identifiant : recherche par titre nettoyé, titre égal exigé, Steam puis IGDB', async () => {
    const steamHit = setup({ steamSearch: [cand('steam', 2, 'Autre jeu'), cand('steam', 3, 'Elden Ring')] });
    expect(await steamHit.service.view('Jeu', 'Elden_Ring_(jeu_vidéo)')).toMatchObject({ detail: { source: 'steam', id: 3 } });
    expect(steamHit.steam.search).toHaveBeenCalledWith('Elden Ring');

    const igdbHit = setup({ steamSearch: [cand('steam', 2, 'Autre jeu')], igdbSearch: [cand('igdb', 8, 'Super Metroid Arcade', 9), cand('igdb', 9, 'Super Metroid', 5), cand('igdb', 10, 'Super Metroid', 50)] });
    expect(await igdbHit.service.view('Jeu', 'Super Metroid')).toMatchObject({ detail: { source: 'igdb', id: 10 } });
  });

  it('rien de sûr → section vide ; sans identifiants IGDB, Steam seul', async () => {
    expect(await setup({ igdbSearch: [cand('igdb', 8, 'Autre')] }).service.view('Jeu', 'Super Metroid')).toEqual({ status: 'empty' });
    const noIgdb = setup({ igdb: false, ids: { igdbSlug: 'super-metroid' } });
    expect(await noIgdb.service.view('Jeu', 'Super Metroid')).toEqual({ status: 'empty' });
    expect(noIgdb.service.igdbEnabled).toBe(false);
  });

  it('le choix mémorisé prime sur Wikidata ; « aucun jeu » vide la section ; reset revient à l’automatique', async () => {
    const { service, steam, igdb, choices } = setup({ ids: { steamId: 1245620 } });
    await service.choose('Jeu', { source: 'igdb', id: 42 });
    expect(await service.view('Jeu', 'Jeu')).toMatchObject({ detail: { source: 'igdb', id: 42 } });
    expect(igdb.detail).toHaveBeenCalledWith({ id: 42 });
    expect(steam.detail).not.toHaveBeenCalled();

    await service.chooseNone('Jeu');
    expect(await service.view('Jeu', 'Jeu')).toEqual({ status: 'empty' });
    expect(await choices.load()).toEqual({ Jeu: { none: true } });

    await service.reset('Jeu');
    expect(await service.view('Jeu', 'Jeu')).toMatchObject({ detail: { source: 'steam' } });
  });

  it('une erreur réseau devient un message', async () => {
    const { service, steam } = setup({ ids: { steamId: 1 } });
    steam.detail.mockRejectedValueOnce(new GameError('steam', 'rate-limited', 'x'));
    expect(await service.view('Jeu', 'Jeu')).toEqual({ status: 'error', message: 'Steam demande de patienter un instant. Réessaie dans quelques secondes.' });
  });
});

describe('createGameService : fenêtre « Changer de jeu »', () => {
  it('candidates : Steam et IGDB côte à côte, un message quand une source échoue', async () => {
    const { service, steam } = setup({ steamSearch: [cand('steam', 1, 'A')], igdbSearch: [cand('igdb', 2, 'B', 3)] });
    expect(await service.candidates('a')).toEqual({ steam: [cand('steam', 1, 'A')], igdb: [cand('igdb', 2, 'B', 3)] });
    steam.search.mockRejectedValueOnce(new GameError('steam', 'http', 'x'));
    expect(await service.candidates('a')).toMatchObject({ steam: [], message: 'Steam est indisponible pour le moment.' });
  });

  it('preview et fromLink : aperçu d’un jeu, message sinon', async () => {
    const { service } = setup();
    expect((await service.preview({ source: 'steam', id: 9 })).detail?.id).toBe(9);
    expect((await service.fromLink('https://store.steampowered.com/app/77/x')).detail?.id).toBe(77);
    expect((await service.fromLink('https://www.igdb.com/games/super-metroid')).detail?.source).toBe('igdb');
    expect(await service.fromLink('pas un lien')).toEqual({ message: 'Adresse non reconnue.' });
    expect(await setup({ steamDetail: null }).service.preview({ source: 'steam', id: 1 })).toEqual({ message: 'Ce jeu est introuvable.' });
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/game-service.test.ts` — Expected: FAIL (modules introuvables).

- [ ] **Step 3: Implémenter**

`src/content/game-registry.ts` :

```ts
import type { GameService } from './game-service';

// Le service est créé une fois par la surcouche ; les fiches de carte le lisent ici.
let service: GameService | null = null;

export const setGameService = (next: GameService | null): void => {
  service = next;
};
export const getGameService = (): GameService | null => service;
```

`src/content/game-service.ts` :

```ts
import type { TtlCache } from '../core/cache/ttl-cache';
import type { KnownCard } from '../core/collection/collection-book';
import { gameErrorMessage } from '../core/game/errors';
import type { GameCandidate, GameDetail, GameRef } from '../core/game/game-detail';
import { normalizeTitle, parseGameLink } from '../core/game/game-format';
import { isVideoGame } from '../core/game/game-kinds';
import type { GameChoiceRepo, GameRepo } from '../core/game/game-repo';
import type { IgdbApi } from '../core/game/igdb-api';
import type { SteamApi } from '../core/game/steam-api';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { cleanTitle } from '../core/music/listen';

export type GameView = { status: 'none' } | { status: 'empty' } | { status: 'detail'; detail: GameDetail } | { status: 'error'; message: string };
export type GameCandidates = { steam: GameCandidate[]; igdb: GameCandidate[]; message?: string };
export type GamePreview = { detail?: GameDetail; message?: string };

export type GameServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  games: Pick<GameRepo, 'resolve'>;
  choices: Pick<GameChoiceRepo, 'load' | 'save' | 'clear'>;
  steam: Pick<SteamApi, 'detail' | 'search'>;
  // Absent sans identifiants IGDB à la compilation.
  igdb: Pick<IgdbApi, 'detail' | 'search'> | null;
  // Steam : 6 h ; IGDB : 7 jours.
  steamCache: Pick<TtlCache, 'getOrLoad'>;
  igdbCache: Pick<TtlCache, 'getOrLoad'>;
};

const SOURCE_NAMES = { steam: 'Steam', igdb: 'IGDB' } as const;

export function createGameService(deps: GameServiceDeps) {
  const { collection, kinds, games, choices, steam, igdb, steamCache, igdbCache } = deps;

  const steamDetail = (id: number) => steamCache.getOrLoad(`game-steam-${id}`, () => steam.detail(id));
  const igdbDetail = (by: { id: number } | { slug: string }) =>
    igdb ? igdbCache.getOrLoad(`game-igdb-${'id' in by ? by.id : `slug-${by.slug}`}`, () => igdb.detail(by)) : Promise.resolve(null);
  const detailOf = (ref: GameRef): Promise<GameDetail | null> => (ref.source === 'steam' ? steamDetail(ref.id) : igdbDetail({ id: ref.id }));

  // Un titre égal (accents, casse, ponctuation) ; à égalité, le plus connu.
  const exact = (candidates: GameCandidate[], wanted: string): GameCandidate | undefined =>
    candidates.filter((candidate) => normalizeTitle(candidate.title) === wanted).sort((a, b) => b.popularity - a.popularity)[0];

  async function automatic(ids: { steamId?: number; igdbSlug?: string }, title: string): Promise<GameDetail | null> {
    if (ids.steamId !== undefined) {
      const found = await steamDetail(ids.steamId);
      if (found) return found;
    }
    if (ids.igdbSlug !== undefined && igdb) {
      const found = await igdbDetail({ slug: ids.igdbSlug });
      if (found) return found;
    }
    const query = cleanTitle(title);
    const wanted = normalizeTitle(query);
    if (wanted === '') return null;
    const steamHit = exact(await steamCache.getOrLoad(`game-search-steam-${wanted}`, () => steam.search(query)), wanted);
    if (steamHit) {
      const found = await steamDetail(steamHit.id);
      if (found) return found;
    }
    if (igdb) {
      const igdbHit = exact(await igdbCache.getOrLoad(`game-search-igdb-${wanted}`, () => igdb.search(query)), wanted);
      if (igdbHit) return igdbDetail({ id: igdbHit.id });
    }
    return null;
  }

  return {
    igdbEnabled: igdb !== null,

    // Ce que la fiche d'une carte montre : rien (pas un jeu), une section vide, un jeu, ou une erreur.
    async view(slug: string, title: string): Promise<GameView> {
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const cardKinds = (await kinds.load()).cards[slug];
        const ids = (await games.resolve([slug]))[slug] ?? {};
        if (!isVideoGame(cardKinds) && ids.steamId === undefined) return { status: 'none' };

        const choice = (await choices.load())[slug];
        if (choice) {
          if ('none' in choice) return { status: 'empty' };
          const chosen = await detailOf(choice);
          return chosen ? { status: 'detail', detail: chosen } : { status: 'empty' };
        }
        const found = await automatic(ids, title);
        return found ? { status: 'detail', detail: found } : { status: 'empty' };
      } catch (error) {
        return { status: 'error', message: gameErrorMessage(error) };
      }
    },

    // Les propositions de la fenêtre « Changer de jeu » : les deux sources, chacune pouvant échouer sans gêner l'autre.
    async candidates(query: string): Promise<GameCandidates> {
      const text = cleanTitle(query);
      const failures: string[] = [];
      const run = async (source: 'steam' | 'igdb', search: (() => Promise<GameCandidate[]>) | null): Promise<GameCandidate[]> => {
        if (!search) return [];
        try {
          return await search();
        } catch (error) {
          failures.push(gameErrorMessage(error));
          return [];
        }
      };
      const [steamList, igdbList] = await Promise.all([run('steam', () => steam.search(text)), run('igdb', igdb ? () => igdb.search(text) : null)]);
      return { steam: steamList, igdb: igdbList, ...(failures[0] ? { message: failures[0] } : {}) };
    },

    // Aperçu d'un jeu proposé ou collé, avant validation.
    async preview(ref: GameRef): Promise<GamePreview> {
      try {
        const detail = await detailOf(ref);
        return detail ? { detail } : { message: 'Ce jeu est introuvable.' };
      } catch (error) {
        return { message: gameErrorMessage(error) };
      }
    },

    async fromLink(text: string): Promise<GamePreview> {
      const link = parseGameLink(text);
      if (!link) return { message: 'Adresse non reconnue.' };
      if (link.source === 'steam') return this.preview({ source: 'steam', id: link.id });
      if (!igdb) return { message: `${SOURCE_NAMES.igdb} n'est pas configuré.` };
      try {
        const detail = await igdbDetail({ slug: link.slug });
        return detail ? { detail } : { message: 'Ce jeu est introuvable.' };
      } catch (error) {
        return { message: gameErrorMessage(error) };
      }
    },

    choose: (slug: string, ref: GameRef): Promise<void> => choices.save(slug, ref),
    chooseNone: (slug: string): Promise<void> => choices.save(slug, { none: true }),
    reset: (slug: string): Promise<void> => choices.clear(slug),
  };
}

export type GameService = ReturnType<typeof createGameService>;
```

- [ ] **Step 4: Lancer, vérifier la réussite**

Run: `npx vitest run tests/content/game-service.test.ts && npm run typecheck` — Expected: PASS. (Si l'ordre des tests de `candidates` échoue sur `message`, vérifier que le texte attendu correspond à `gameErrorMessage(new GameError('steam','http',…))` = « Steam est indisponible pour le moment. ».)

- [ ] **Step 5: Commit**

```bash
git add src/content/game-service.ts src/content/game-registry.ts tests/content/game-service.test.ts
git commit -m "feat(jeux): service de la section (résolution Steam puis IGDB, choix mémorisé, propositions)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Bande originale ouverte aux jeux (`SoundtrackButton`)

**Files:**
- Modify: `src/content/SoundtrackButton.tsx:1-30` et ses usages, `src/content/ScreenSection.tsx:45`
- Test: `tests/content/SoundtrackButton.test.tsx` (existant, adapté)

**Interfaces:**
- Consumes: aucun nouveau.
- Produces: `SoundtrackButton({ soundtrackKey, title, originalTitle? }: { soundtrackKey: string; title: string; originalTitle?: string })` (remplace `detail`). Clés : films `movie:<id>` / `tv:<id>` (inchangées), jeux `game:<source>:<id>`.

- [ ] **Step 1: Adapter le test existant (il doit échouer)**

Dans `tests/content/SoundtrackButton.test.tsx` : remplacer `const detail = { mediaType: 'movie', id: 27205, title: 'Inception' } as const;` par

```ts
const props = { soundtrackKey: 'movie:27205', title: 'Inception' };
```

et chaque `<SoundtrackButton detail={detail} />` par `<SoundtrackButton {...props} />`. Là où un test passe un `originalTitle` (chercher `originalTitle` dans le fichier), le passer en prop : `<SoundtrackButton {...props} originalTitle="…" />`. Ajouter ce test :

```ts
  it('un jeu : la BO est gardée sous la clé du jeu', async () => {
    const soundtrack = vi.fn(async () => spotify);
    setMusicService({ soundtrack, play: vi.fn(), isLinked: async () => true, manualSoundtrack: true, subscribe: () => () => undefined } as unknown as MusicService);
    await act(async () => root.render(<SoundtrackButton soundtrackKey="game:steam:1245620" title="Elden Ring" />));
    expect(soundtrack).toHaveBeenCalledWith('game:steam:1245620', ['Elden Ring']);
  });
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/SoundtrackButton.test.tsx` — Expected: FAIL (props inconnues, `detail` indéfini).

- [ ] **Step 3: Implémenter**

Dans `src/content/SoundtrackButton.tsx` : supprimer l'import `ScreenDetail`, changer la signature et les trois premières lignes du corps :

```tsx
// « Bande originale » du film, de la série ou du jeu, au-dessus de la bande-annonce : …(commentaire existant inchangé)…
export function SoundtrackButton({ soundtrackKey, title, originalTitle }: { soundtrackKey: string; title: string; originalTitle?: string }) {
  const service = getMusicService();
  const [linked, setLinked] = useState(false);
  const [listen, setListen] = useState<Listen | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [setting, setSetting] = useState(false);
  const key = soundtrackKey;
  const titles = originalTitle ? [title, originalTitle] : [title];
```

(supprimer la ligne `const { mediaType, id, title, originalTitle } = detail;` et l'ancienne ligne `const key = ...`). Le reste (effets, rendu) est inchangé : `key`, `title`, `originalTitle` existent toujours.

Dans `src/content/ScreenSection.tsx`, ligne du bouton :

```tsx
      <SoundtrackButton soundtrackKey={`${detail.mediaType}:${detail.id}`} title={detail.title} {...(detail.originalTitle ? { originalTitle: detail.originalTitle } : {})} />
```

- [ ] **Step 4: Lancer, vérifier la réussite**

Run: `npm test && npm run typecheck` — Expected: PASS (toute la suite : les films ne doivent pas régresser).

- [ ] **Step 5: Commit**

```bash
git add src/content/SoundtrackButton.tsx src/content/ScreenSection.tsx tests/content/SoundtrackButton.test.tsx
git commit -m "refactor(bo): le bouton de bande originale prend une clé et un titre, utilisable pour les jeux

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Interface (glyphes, lecteur HLS, section, fenêtre de choix) et branchement

**Files:**
- Create: `src/content/HlsTrailerPlayer.tsx`, `src/content/GameSection.tsx`, `src/content/GameChoiceDialog.tsx`
- Modify: `package.json` (hls.js), `src/content/Glyphs.tsx`, `src/content/SoundtrackDialog.tsx` (exporter `useOverlayHost`), `src/content/decorate-listen.ts`, `src/content/mount.tsx`, `src/app/overlay.ts`
- Test: `tests/content/GameSection.test.tsx`, `tests/content/GameChoiceDialog.test.tsx`, `tests/content/decorate-listen.test.ts` (existant, ajout si présent)

**Interfaces:**
- Consumes: `GameService` (`view`, `candidates`, `preview`, `fromLink`, `choose`, `chooseNone`, `reset`, `igdbEnabled`), `SoundtrackButton`, `TrailerPlayer` (`trailerKey`), `Glyph`, `useOverlayHost`, `formatCount`, types de `game-detail.ts`.
- Produces: `GameSection({ slug, title })`, `GameChoiceDialog({ service, slug, title, current, onChanged, onClose })`, `HlsTrailerPlayer({ url, poster?, pageUrl })`, glyphes `swap` et `gamepad`, `GAME_HOST_ATTRIBUTE`, `decorateGame`, `mountGameSection`, `pruneGameSections`.

- [ ] **Step 1: Installer hls.js et ajouter les glyphes**

Run: `npm install hls.js@^1` puis vérifier que `package.json` contient `"hls.js"` dans `dependencies` et que `package-lock.json` a changé.

Dans `src/content/Glyphs.tsx`, ajouter dans `PATHS` (avant `} as const;`) :

```tsx
  swap: (
    <>
      <polyline points="16,3 20,7 16,11" />
      <line x1="4" y1="7" x2="20" y2="7" />
      <polyline points="8,21 4,17 8,13" />
      <line x1="20" y1="17" x2="4" y2="17" />
    </>
  ),
  gamepad: (
    <>
      <rect x="2" y="7" width="20" height="11" rx="5" />
      <line x1="7" y1="10.5" x2="7" y2="14.5" />
      <line x1="5" y1="12.5" x2="9" y2="12.5" />
      <circle cx="15.5" cy="11.5" r="1" />
      <circle cx="18" cy="13.5" r="1" />
    </>
  ),
```

Dans `src/content/SoundtrackDialog.tsx`, changer `function useOverlayHost()` en `export function useOverlayHost()`.

- [ ] **Step 2: Écrire les tests qui échouent**

`tests/content/GameChoiceDialog.test.tsx` (même banc que `SoundtrackButton.test.tsx` : jsdom, `act`, fenêtre dans un shadow DOM sur le `<body>`) :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameChoiceDialog } from '../../src/content/GameChoiceDialog';
import type { GameService } from '../../src/content/game-service';
import type { GameCandidate, GameDetail } from '../../src/core/game/game-detail';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const cand = (source: 'steam' | 'igdb', id: number, title: string): GameCandidate => ({ source, id, title, platforms: ['PC'], popularity: 0 });
const detail: GameDetail = { source: 'steam', id: 1245620, title: 'ELDEN RING', genres: [], platforms: [], developers: [], rating: { kind: 'positive', value: 93, count: 10, verdict: 'Très positives' }, pageUrl: 'x' };

function service(over: Record<string, unknown> = {}) {
  return {
    igdbEnabled: true,
    candidates: vi.fn(async () => ({ steam: [cand('steam', 1245620, 'ELDEN RING')], igdb: [cand('igdb', 7, 'Elden Ring')] })),
    preview: vi.fn(async () => ({ detail })),
    fromLink: vi.fn(async () => ({ detail })),
    choose: vi.fn(async () => undefined),
    chooseNone: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined),
    ...over,
  };
}

// La fenêtre vit dans un shadow DOM posé sur le <body>.
const dialog = (): ParentNode => Array.from(document.body.children).find((child) => child.shadowRoot)?.shadowRoot ?? document.createDocumentFragment();
const byLabel = (label: string) => dialog().querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const click = (element: HTMLElement) => act(async () => element.click());

async function show(svc: ReturnType<typeof service>, onChanged = vi.fn(), onClose = vi.fn()) {
  await act(async () =>
    root.render(<GameChoiceDialog service={svc as unknown as GameService} slug="Elden_Ring" title="Elden Ring" current={null} onChanged={onChanged} onClose={onClose} />),
  );
  return { onChanged, onClose };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('GameChoiceDialog', () => {
  it('lance la recherche avec le titre de la carte et regroupe Steam puis IGDB', async () => {
    const svc = service();
    await show(svc);
    expect(svc.candidates).toHaveBeenCalledWith('Elden Ring');
    const text = dialog().textContent ?? '';
    expect(text.indexOf('Steam')).toBeLessThan(text.indexOf('IGDB'));
    expect(text).toContain('ELDEN RING');
  });

  it('sélectionner un résultat affiche un aperçu ; « Utiliser ce jeu » garde le choix puis ferme', async () => {
    const svc = service();
    const { onChanged, onClose } = await show(svc);
    await click(byLabel('Choisir ELDEN RING (Steam)'));
    expect(svc.preview).toHaveBeenCalledWith({ source: 'steam', id: 1245620 });
    expect(dialog().textContent).toContain('93');
    await click(byLabel('Utiliser ce jeu'));
    expect(svc.choose).toHaveBeenCalledWith('Elden_Ring', { source: 'steam', id: 1245620 });
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('« Aucun jeu » et « Revenir au choix automatique »', async () => {
    const svc = service();
    const { onChanged } = await show(svc);
    await click(byLabel('Aucun jeu'));
    expect(svc.chooseNone).toHaveBeenCalledWith('Elden_Ring');
    await click(byLabel('Revenir au choix automatique'));
    expect(svc.reset).toHaveBeenCalledWith('Elden_Ring');
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('onglet « Coller un lien » : aperçu d’une adresse, message sinon', async () => {
    const svc = service({ fromLink: vi.fn(async (text: string) => (text.includes('steampowered') ? { detail } : { message: 'Adresse non reconnue.' })) });
    await show(svc);
    await click(byLabel('Coller un lien'));
    const input = byLabel('Adresse du jeu') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'n’importe quoi');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(byLabel('Vérifier le lien'));
    expect(dialog().textContent).toContain('Adresse non reconnue.');
  });
});
```

`tests/content/GameSection.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setGameService } from '../../src/content/game-registry';
import type { GameService, GameView } from '../../src/content/game-service';
import { GameSection } from '../../src/content/GameSection';
import { setMusicService } from '../../src/content/music-registry';
import type { GameDetail } from '../../src/core/game/game-detail';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const steam: GameDetail = {
  source: 'steam',
  id: 1245620,
  title: 'ELDEN RING',
  genres: ['Action', 'RPG'],
  platforms: ['Windows'],
  developers: ['FromSoftware, Inc.'],
  releaseDate: '24 févr. 2022',
  rating: { kind: 'positive', value: 93, count: 1157783, verdict: 'Très positives' },
  metascore: { score: 94 },
  price: '59,99 €',
  playersOnline: 22386,
  trailer: { kind: 'hls', url: 'https://x/hls.m3u8', poster: 'https://x/p.jpg' },
  pageUrl: 'https://store.steampowered.com/app/1245620',
};
const igdb: GameDetail = { source: 'igdb', id: 1, title: 'Super Metroid', genres: [], platforms: ['SNES'], developers: [], rating: { kind: 'score', value: 91, count: 21 }, trailer: { kind: 'youtube', key: 'abcdefghijk' }, pageUrl: 'https://www.igdb.com/games/super-metroid' };

async function show(view: GameView) {
  const service = { view: vi.fn(async () => view), igdbEnabled: true } as unknown as GameService;
  setGameService(service);
  await act(async () => root.render(<GameSection slug="Elden_Ring" title="Elden Ring" />));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  setMusicService(null);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setGameService(null);
});

describe('GameSection', () => {
  it('rien pour une carte qui n’est pas un jeu', async () => {
    await show({ status: 'none' });
    expect(container.innerHTML).toBe('');
  });

  it('une fiche Steam : note, verdict, Metascore, prix, joueurs, lien et source', async () => {
    await show({ status: 'detail', detail: steam });
    const text = container.textContent ?? '';
    expect(text).toContain('93');
    expect(text).toContain('Très positives');
    expect(text).toContain('94');
    expect(text).toContain('59,99');
    expect(text).toContain('22');
    expect(text).toContain('Données : Steam');
    expect(container.querySelector<HTMLAnchorElement>('a[aria-label="Ouvrir la page Steam"]')?.href).toBe('https://store.steampowered.com/app/1245620');
    expect(container.querySelector('[aria-label="Changer de jeu"]')).not.toBeNull();
  });

  it('une fiche IGDB : note sur 100 et lien IGDB', async () => {
    await show({ status: 'detail', detail: igdb });
    expect(container.textContent).toContain('91');
    expect(container.textContent).toContain('/100');
    expect(container.textContent).toContain('Données : IGDB.com');
    expect(container.querySelector('a[aria-label="Ouvrir la fiche IGDB"]')).not.toBeNull();
  });

  it('section vide : le titre et le glyphe seulement', async () => {
    await show({ status: 'empty' });
    expect(container.textContent).toContain('Jeu vidéo');
    expect(container.querySelector('[aria-label="Changer de jeu"]')).not.toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('une erreur : message discret, glyphe conservé', async () => {
    await show({ status: 'error', message: 'Steam est indisponible pour le moment.' });
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Steam est indisponible pour le moment.');
    expect(container.querySelector('[aria-label="Changer de jeu"]')).not.toBeNull();
  });
});
```

- [ ] **Step 3: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/GameSection.test.tsx tests/content/GameChoiceDialog.test.tsx` — Expected: FAIL (composants introuvables).

- [ ] **Step 4: Implémenter `HlsTrailerPlayer.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Glyph } from './Glyphs';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const HEIGHT = 'min(130px, 20vh)';

// Bande-annonce Steam (flux HLS) : miniature + ▶ ; hls.js n'est chargé qu'au clic (Chrome ne lit pas le HLS seul).
// Si la lecture échoue (site qui bloque le flux), le lien vers la page du jeu reste là.
export function HlsTrailerPlayer({ url, poster, pageUrl }: { url: string; poster?: string; pageUrl: string }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!playing) return;
    const element = video.current;
    if (!element) return;
    let destroy: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.on(Hls.Events.ERROR, (_event, data) => data.fatal && setFailed(true));
          hls.loadSource(url);
          hls.attachMedia(element);
          destroy = () => hls.destroy();
        } else if (element.canPlayType('application/vnd.apple.mpegurl')) {
          element.src = url;
        } else {
          setFailed(true);
        }
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [playing, url]);

  return (
    <div style={{ position: 'relative', width: '100%', height: HEIGHT, borderRadius: 8, overflow: 'hidden', background: '#000', border }}>
      {playing && !failed ? (
        <video ref={video} controls autoPlay playsInline poster={poster} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
      ) : (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setPlaying(true);
          }}
          aria-label="Lire la bande-annonce"
          title="Lire la bande-annonce"
          style={{
            width: '100%',
            height: '100%',
            cursor: 'pointer',
            border: 0,
            padding: 0,
            color: '#fff',
            background: poster ? `center / cover no-repeat url(${poster})` : '#1b2330',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name="play" size={22} />
          </span>
        </button>
      )}
      <a
        href={pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Voir la bande-annonce sur la page du jeu"
        title="Voir sur la page du jeu"
        style={{ position: 'absolute', top: 4, right: 4, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Glyph name="external" size={16} />
      </a>
    </div>
  );
}
```

- [ ] **Step 5: Implémenter `GameSection.tsx`**

```tsx
import { useEffect, useState, type CSSProperties } from 'react';
import type { GameDetail } from '../core/game/game-detail';
import { formatCount } from '../core/game/game-format';
import { GameChoiceDialog } from './GameChoiceDialog';
import { getGameService } from './game-registry';
import type { GameView } from './game-service';
import { Glyph } from './Glyphs';
import { HlsTrailerPlayer } from './HlsTrailerPlayer';
import { SoundtrackButton } from './SoundtrackButton';
import { TrailerPlayer } from './TrailerPlayer';

const SIZE = 44; // cible tactile
const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const iconButton: CSSProperties = { width: SIZE, height: SIZE, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };
const SOURCE = { steam: { name: 'Steam', page: 'Page Steam', label: 'Ouvrir la page Steam', credit: 'Données : Steam' }, igdb: { name: 'IGDB', page: 'Fiche IGDB', label: 'Ouvrir la fiche IGDB', credit: 'Données : IGDB.com' } } as const;

function Rating({ detail }: { detail: GameDetail }) {
  const { rating, metascore } = detail;
  if (!rating && !metascore) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {rating && (
        <>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#4ade80' }}>{rating.kind === 'positive' ? `${rating.value} %` : rating.value}</span>
          <span style={{ fontSize: 12, lineHeight: '16px' }}>
            {rating.kind === 'positive' ? <b style={{ display: 'block', fontSize: 13 }}>{rating.verdict ?? 'Avis des joueurs'}</b> : <b style={{ display: 'block', fontSize: 13 }}>/100</b>}
            <span style={{ opacity: 0.7 }}>{rating.count > 0 ? `${formatCount(rating.count)} avis` : 'Note IGDB'}</span>
          </span>
        </>
      )}
      {metascore && (
        <span title="Metascore" style={{ marginLeft: 'auto', minWidth: 34, height: 26, padding: '0 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, fontWeight: 700, fontSize: 13, background: '#66cc33', color: '#0b1b00' }}>
          {metascore.score}
        </span>
      )}
    </div>
  );
}

function Facts({ detail }: { detail: GameDetail }) {
  const rows: [string, string][] = [
    ...(detail.price ? ([['Prix', detail.price]] as [string, string][]) : []),
    ...(detail.playersOnline !== undefined ? ([['En ligne', `● ${formatCount(detail.playersOnline)} joueurs`]] as [string, string][]) : []),
    ...(detail.developers.length > 0 ? ([['Studio', detail.developers.slice(0, 2).join(', ')]] as [string, string][]) : []),
    ...(detail.releaseDate ? ([['Sortie', detail.releaseDate]] as [string, string][]) : []),
    ...(detail.platforms.length > 0 ? ([['Plateformes', detail.platforms.slice(0, 4).join(' · ')]] as [string, string][]) : []),
  ];
  if (rows.length === 0) return null;
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', margin: 0, fontSize: 13 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt style={{ opacity: 0.65 }}>{label}</dt>
          <dd style={{ margin: 0 }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Detail({ detail }: { detail: GameDetail }) {
  const source = SOURCE[detail.source];
  return (
    <>
      <SoundtrackButton soundtrackKey={`game:${detail.source}:${detail.id}`} title={detail.title} {...(detail.originalTitle ? { originalTitle: detail.originalTitle } : {})} />
      {detail.trailer?.kind === 'hls' && <HlsTrailerPlayer url={detail.trailer.url} pageUrl={detail.pageUrl} {...(detail.trailer.poster ? { poster: detail.trailer.poster } : {})} />}
      {detail.trailer?.kind === 'youtube' && <TrailerPlayer trailerKey={detail.trailer.key} />}
      <Rating detail={detail} />
      {detail.genres.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {detail.genres.slice(0, 5).map((genre) => (
            <span key={genre} style={{ border, borderRadius: 999, padding: '1px 9px', fontSize: 12 }}>
              {genre}
            </span>
          ))}
        </div>
      )}
      <Facts detail={detail} />
      <a
        href={detail.pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={source.label}
        style={{ minHeight: SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border, borderRadius: 10, color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
      >
        {source.page} <Glyph name="external" size={16} />
      </a>
      <p style={{ margin: 0, fontSize: 10, opacity: 0.6 }}>
        {source.credit}
        {detail.metascore ? ' · Metascore : Metacritic' : ''}
      </p>
    </>
  );
}

type Props = { slug: string; title: string };

// Section « jeu vidéo » de la fiche native d'une carte : un jeu (Steam, sinon IGDB), ou une section vide avec le glyphe pour en choisir un ; rien pour les autres cartes.
export function GameSection({ slug, title }: Props) {
  const service = getGameService();
  const [view, setView] = useState<GameView | null>(null);
  const [version, setVersion] = useState(0);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    void service.view(slug, title).then((next) => !cancelled && setView(next));
    return () => {
      cancelled = true;
    };
  }, [service, slug, title, version]);

  if (!service || !view || view.status === 'none') return null;
  const current = view.status === 'detail' ? view.detail : null;

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Glyph name="gamepad" size={16} />
        <span style={{ flex: 1, minWidth: 0 }}>Jeu vidéo{current ? ` · ${SOURCE[current.source].name}` : ''}</span>
        <button type="button" onClick={() => setChoosing(true)} aria-label="Changer de jeu" title="Changer de jeu" style={iconButton}>
          <Glyph name="swap" />
        </button>
      </div>
      {view.status === 'error' && (
        <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {view.message}
        </p>
      )}
      {current && <Detail detail={current} />}
      {choosing && <GameChoiceDialog service={service} slug={slug} title={title} current={current} onChanged={() => setVersion((value) => value + 1)} onClose={() => setChoosing(false)} />}
    </div>
  );
}
```

- [ ] **Step 6: Implémenter `GameChoiceDialog.tsx`**

```tsx
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { GameCandidate, GameDetail } from '../core/game/game-detail';
import type { GameCandidates, GameService } from './game-service';
import { Glyph } from './Glyphs';
import { useOverlayHost } from './SoundtrackDialog';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const iconButton: CSSProperties = { width: 44, height: 44, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };
const wide: CSSProperties = { width: '100%', minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '600 14px system-ui, sans-serif' };
const tab = (selected: boolean): CSSProperties => ({
  flex: 1,
  minHeight: 44,
  cursor: 'pointer',
  font: '600 14px system-ui, sans-serif',
  color: selected ? '#0d1117' : 'inherit',
  background: selected ? 'var(--color-accent, #34d399)' : 'none',
  border: selected ? '1px solid transparent' : border,
  borderRadius: 8,
});
const field: CSSProperties = { flex: 1, minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '0 10px', color: 'inherit', background: 'none', border, borderRadius: 8, font: '14px system-ui, sans-serif' };
const NAMES = { steam: 'Steam', igdb: 'IGDB' } as const;

type Mode = 'search' | 'link';
type Props = {
  service: Pick<GameService, 'candidates' | 'preview' | 'fromLink' | 'choose' | 'chooseNone' | 'reset' | 'igdbEnabled'>;
  slug: string;
  title: string;
  current: GameDetail | null;
  // Le choix de la carte a changé : la section se recharge.
  onChanged: () => void;
  onClose: () => void;
};

// « Changer de jeu » : recherche sur Steam et IGDB (ou lien collé), aperçu, puis « Utiliser ce jeu » ; « Aucun jeu » vide la section.
export function GameChoiceDialog({ service, slug, title, current, onChanged, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState(title);
  const [link, setLink] = useState('');
  const [found, setFound] = useState<GameCandidates | null>(null);
  const [selected, setSelected] = useState<GameDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const search = async (text: string) => {
    if (text.trim() === '') return setMessage('Saisis un titre à chercher.');
    setBusy(true);
    setMessage(null);
    setSelected(null);
    const result = await service.candidates(text);
    setBusy(false);
    setFound(result);
    const total = result.steam.length + result.igdb.length;
    setMessage(result.message ?? (total === 0 ? 'Aucun résultat.' : null));
  };

  // Première recherche d'office, avec le titre de la carte.
  useEffect(() => {
    void search(title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = async (candidate: GameCandidate) => {
    setBusy(true);
    setMessage(null);
    const result = await service.preview({ source: candidate.source, id: candidate.id });
    setBusy(false);
    setSelected(result.detail ?? null);
    if (!result.detail) setMessage(result.message ?? 'Ce jeu est introuvable.');
  };

  const checkLink = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await service.fromLink(link);
    setBusy(false);
    setSelected(result.detail ?? null);
    if (!result.detail) setMessage(result.message ?? 'Ce jeu est introuvable.');
  };

  const done = async (action: () => Promise<void>) => {
    setBusy(true);
    await action();
    setBusy(false);
    onChanged();
    onClose();
  };

  const mountPoint = useOverlayHost();
  if (!mountPoint) return null;

  const row = (candidate: GameCandidate) => {
    const isCurrent = current?.source === candidate.source && current.id === candidate.id;
    return (
      <li key={`${candidate.source}:${candidate.id}`} style={{ borderTop: border, opacity: isCurrent ? 0.55 : 1 }}>
        <button
          type="button"
          disabled={busy || isCurrent}
          onClick={() => void preview(candidate)}
          aria-label={`Choisir ${candidate.title} (${NAMES[candidate.source]})`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '4px 8px', cursor: 'pointer', color: 'inherit', background: 'none', border: 0, textAlign: 'left', font: '13px system-ui, sans-serif' }}
        >
          <span style={{ flex: 'none', width: 36, height: 48, borderRadius: 5, background: candidate.imageUrl ? `center / cover no-repeat url(${candidate.imageUrl})` : 'rgba(148,163,184,0.25)' }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{candidate.title}</span>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, opacity: 0.7 }}>
              {[candidate.platforms.slice(0, 2).join(', '), candidate.year, isCurrent ? 'jeu actuel' : ''].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, padding: '1px 6px', border, borderRadius: 4 }}>{NAMES[candidate.source]}</span>
        </button>
      </li>
    );
  };

  const group = (label: string, list: GameCandidate[]) => (
    <div key={label}>
      <p style={{ margin: '8px 0 4px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}>{label}</p>
      {list.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>Aucun résultat.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, border, borderRadius: 8 }}>{list.map((candidate, index) => (index === 0 ? <div key={candidate.id} style={{ marginTop: -1 }}>{row(candidate)}</div> : row(candidate)))}</ul>
      )}
    </div>
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Changer de jeu"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(400px, 100%)', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: '#0d1117', color: '#e6edf3', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <span>
            <strong style={{ fontSize: 16 }}>Changer de jeu</strong>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>Carte « {title} »</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={iconButton}>
            <Glyph name="close" />
          </button>
        </div>

        <div role="group" aria-label="Mode de recherche" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" aria-label="Rechercher" aria-pressed={mode === 'search'} onClick={() => setMode('search')} style={tab(mode === 'search')}>
            Rechercher
          </button>
          <button type="button" aria-label="Coller un lien" aria-pressed={mode === 'link'} onClick={() => setMode('link')} style={tab(mode === 'link')}>
            Coller un lien
          </button>
        </div>

        {mode === 'search' ? (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void search(query);
              }}
              style={{ display: 'flex', gap: 8, marginBottom: 4 }}
            >
              <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Titre à chercher" style={field} />
              <button type="submit" aria-label="Chercher" title="Chercher" style={iconButton}>
                <Glyph name="search" />
              </button>
            </form>
            {found && (
              <>
                {group('Steam', found.steam)}
                {service.igdbEnabled && group('IGDB', found.igdb)}
              </>
            )}
          </>
        ) : (
          <form onSubmit={(event) => void checkLink(event)} style={{ display: 'flex', gap: 8 }}>
            <input value={link} onChange={(event) => setLink(event.target.value)} aria-label="Adresse du jeu" placeholder="store.steampowered.com/app/… ou igdb.com/games/…" style={field} />
            <button type="submit" aria-label="Vérifier le lien" title="Vérifier le lien" style={iconButton}>
              <Glyph name="link" />
            </button>
          </form>
        )}

        {selected && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--color-accent, #34d399)', borderRadius: 12 }}>
            <span>
              <b>{selected.title}</b>
              <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>
                {NAMES[selected.source]}
                {selected.rating ? ` · ${selected.rating.kind === 'positive' ? `${selected.rating.value} %${selected.rating.verdict ? ` · ${selected.rating.verdict}` : ''}` : `${selected.rating.value}/100`}` : ''}
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void done(() => service.choose(slug, { source: selected.source, id: selected.id }))}
              aria-label="Utiliser ce jeu"
              style={{ ...wide, color: '#04130c', background: 'var(--color-accent, #34d399)', border: 0 }}
            >
              Utiliser ce jeu
            </button>
          </div>
        )}

        {message && (
          <p role="status" style={{ margin: '8px 0 0', fontSize: 12 }}>
            {message}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <button type="button" disabled={busy} onClick={() => void done(() => service.chooseNone(slug))} aria-label="Aucun jeu" title="Cette carte n'a pas de jeu" style={wide}>
            ∅ Aucun jeu
          </button>
          <button type="button" disabled={busy} onClick={() => void done(() => service.reset(slug))} aria-label="Revenir au choix automatique" style={{ ...wide, border: 'none', fontWeight: 400, opacity: 0.8 }}>
            Revenir au choix automatique
          </button>
        </div>
      </div>
    </div>,
    mountPoint,
  );
}
```

(Si la mise en liste du `group()` avec le `div` autour du premier `row` paraît superflue au relecteur, simplifier en `list.map(row)` ; le test ne dépend pas de cette enveloppe.)

- [ ] **Step 7: Brancher la section dans la fiche**

`src/content/decorate-listen.ts` : ajouter, à côté des autres constantes,

```ts
export const GAME_HOST_ATTRIBUTE = 'data-wmt-game';
```

ajouter `GAME_HOST_ATTRIBUTE` au tableau `NATIVE_HOSTS`, et à la fin du fichier :

```ts
// Section « jeu vidéo » (Steam / IGDB) : après les autres sections de l'extension, comme film / série.
export const decorateGame = (root: ParentNode, mount: MountListen): number => decorateNative(root, GAME_HOST_ATTRIBUTE, true, mount);
```

`src/content/mount.tsx` : importer `GAME_HOST_ATTRIBUTE` (avec les autres attributs de `./decorate-listen`) et `GameSection` (`import { GameSection } from './GameSection';`), puis après `pruneScreenSections` :

```tsx
const gameSections = createNativeSections(GAME_HOST_ATTRIBUTE, '0', (slug, title) => <GameSection slug={slug} title={title} />);
export const mountGameSection: MountListen = gameSections.mount;
export const pruneGameSections = gameSections.prune;
```

`src/app/overlay.ts` :
1. Imports : ajouter `mountGameSection, pruneGameSections` à l'import de `'../content/mount'` (ligne ~38), `decorateGame` à l'import de `'../content/decorate-listen'` (ligne ~39), et
```ts
import { createGameService } from '../content/game-service';
import { getGameService, setGameService } from '../content/game-registry';
import { IGDB_CLIENT_ID, IGDB_CLIENT_SECRET, IGDB_ENABLED } from '../core/game/config';
import type { GameFetch } from '../core/game/game-detail';
import { createGameChoiceRepo, createGameRepo } from '../core/game/game-repo';
import { createIgdbApi } from '../core/game/igdb-api';
import { createSteamApi } from '../core/game/steam-api';
import { fetchWikidataGame } from '../core/game/wikidata-game';
```
2. Après le bloc `if (TMDB_API_KEY) { … }` (ligne ~470) :
```ts
  // Jeux vidéo : Steam sans clé, IGDB seulement avec les identifiants Twitch de la compilation. Même `fetch` que TMDB
  // (service worker dans l'extension, pont natif dans l'APK). Une panne ici ne doit jamais empêcher la surcouche.
  try {
    const gameFetch: GameFetch = (url, init) => (spotify ? spotify.fetch(url, init) : fetch(url, init));
    setGameService(
      createGameService({
        collection: collectionRepo,
        kinds: kindsRepo,
        games: createGameRepo(store, (slugs) => fetchWikidataGame((url) => fetch(url), slugs)),
        choices: createGameChoiceRepo(store),
        steam: createSteamApi({ fetch: gameFetch }),
        igdb: IGDB_ENABLED ? createIgdbApi({ fetch: gameFetch, clientId: IGDB_CLIENT_ID, clientSecret: IGDB_CLIENT_SECRET, store }) : null,
        steamCache: createTtlCache(store, { ttlMs: 6 * 3_600_000 }),
        igdbCache: createTtlCache(store, { ttlMs: 7 * 24 * 3_600_000 }),
      }),
    );
  } catch (error) {
    console.warn(LOG, 'jeux vidéo indisponibles :', error);
  }
```
3. Dans la boucle de décoration (après le bloc `pruneScreenSections`, ligne ~290) :
```ts
      try {
        pruneGameSections();
        // La section jeu vidéo se pose dès que son service est créé (Steam n'a besoin d'aucune clé).
        if (getGameService()) decorateGame(document, mountGameSection);
      } catch (error) {
        console.warn(LOG, 'section jeu vidéo indisponible :', error);
      }
```

(Vérifier le type de `spotify.fetch` : s'il n'accepte pas `init` en 2ᵉ paramètre, utiliser `(url, init) => …` en lecture de `SpotifyFetch` dans `src/core/spotify/spotify-session.ts` et aligner `GameRequestInit` ; `createTmdbApi` n'envoie que l'URL, Tidal envoie déjà `method`/`headers`/`body`.)

- [ ] **Step 8: Lancer toute la suite**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS ; build sans erreur (la taille du bundle de contenu augmente d'environ celle de hls.js).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src tests
git commit -m "feat(jeux): section Jeu vidéo dans la fiche (lecteur HLS, note, BO, glyphe « changer de jeu »)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Pont HTTP natif pour l'APK (Steam et IGDB sans CORS)

Dans la WebView de l'APK, `fetch` part de la page `www.wiki-masters.com` : Steam et IGDB n'envoient pas d'en-têtes CORS, la requête serait refusée. On expose un pont Java `WmtHttp` à liste blanche d'hôtes, et la surcouche l'utilise pour ces hôtes seulement.

**Files:**
- Create: `src/android/native-http.ts`
- Modify: `src/android/spotify-env.ts:27` (fetch), `src/android/spotify-env.ts:8-14` (type `AndroidWindow`), `android/app/src/main/java/io/github/maximus49000/wikimasterstools/MainActivity.java`
- Test: `tests/android/native-http.test.ts`

**Interfaces:**
- Produces: `GAME_NATIVE_PREFIXES: readonly string[]` ; `createNativeFetch(win: NativeHttpWindow, fallback: typeof fetch): typeof fetch` — pour une URL dont le préfixe est dans la liste blanche et si `win.WmtHttp` existe : appelle `win.WmtHttp.request(id, url, method, headersJson, body)` puis attend `win.__wmtHttpDone(id, status, retryAfter, body)` ; sinon rend `fallback(url, init)`. Java : `WmtHttp.request(String id, String url, String method, String headersJson, String body)`.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createNativeFetch, type NativeHttpWindow } from '../../src/android/native-http';

function setup(hasBridge = true) {
  const win: NativeHttpWindow = {};
  const fallback = vi.fn(async () => new Response('repli')) as unknown as typeof fetch;
  if (hasBridge) {
    win.WmtHttp = {
      request: vi.fn((id: string) => {
        queueMicrotask(() => win.__wmtHttpDone?.(id, 200, '', '{"ok":true}'));
      }),
    };
  }
  return { win, fallback, nativeFetch: createNativeFetch(win, fallback) };
}

describe('createNativeFetch', () => {
  it('passe par le pont natif pour Steam et IGDB, et rend une Response', async () => {
    const { win, nativeFetch, fallback } = setup();
    const response = await nativeFetch('https://store.steampowered.com/api/appdetails?appids=1');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(win.WmtHttp?.request).toHaveBeenCalledWith(expect.any(String), 'https://store.steampowered.com/api/appdetails?appids=1', 'GET', '{}', '');
    expect(fallback).not.toHaveBeenCalled();
  });

  it("transmet la méthode, les en-têtes et le corps d'une requête IGDB", async () => {
    const { win, nativeFetch } = setup();
    await nativeFetch('https://api.igdb.com/v4/games', { method: 'POST', headers: { 'Client-ID': 'x' }, body: 'fields id;' });
    expect(win.WmtHttp?.request).toHaveBeenCalledWith(expect.any(String), 'https://api.igdb.com/v4/games', 'POST', '{"Client-ID":"x"}', 'fields id;');
  });

  it('les autres adresses, ou sans pont, gardent le fetch normal', async () => {
    const withBridge = setup();
    await withBridge.nativeFetch('https://api.themoviedb.org/3/movie/1');
    expect(withBridge.fallback).toHaveBeenCalledTimes(1);
    const without = setup(false);
    await without.nativeFetch('https://store.steampowered.com/api/appdetails?appids=1');
    expect(without.fallback).toHaveBeenCalledTimes(1);
  });

  it('une réponse 429 garde son délai Retry-After', async () => {
    const win: NativeHttpWindow = {};
    win.WmtHttp = { request: (id: string) => queueMicrotask(() => win.__wmtHttpDone?.(id, 429, '30', '')) };
    const response = await createNativeFetch(win, vi.fn() as unknown as typeof fetch)('https://api.igdb.com/v4/games');
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/android/native-http.test.ts` — Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `src/android/native-http.ts`**

```ts
// Ce que MainActivity.java expose à la page : `WmtHttp.request(id, url, method, headersJson, body)` fait la requête côté Android
// (sans CORS) puis appelle `window.__wmtHttpDone(id, status, retryAfter, body)`.
export type NativeHttpWindow = {
  WmtHttp?: { request(id: string, url: string, method: string, headersJson: string, body: string): void };
  __wmtHttpDone?: (id: string, status: number, retryAfter: string, body: string) => void;
};

// Hôtes sans en-têtes CORS : seuls ceux-là passent par le pont (le reste garde le fetch de la page).
export const GAME_NATIVE_PREFIXES: readonly string[] = ['https://store.steampowered.com/', 'https://api.steampowered.com/', 'https://id.twitch.tv/oauth2/token', 'https://api.igdb.com/v4/'];

const NO_BODY = new Set([101, 204, 205, 304]);
const TIMEOUT_MS = 20_000;

export function createNativeFetch(win: NativeHttpWindow, fallback: typeof fetch): typeof fetch {
  const pending = new Map<string, (status: number, retryAfter: string, body: string) => void>();
  let counter = 0;
  const install = () => {
    win.__wmtHttpDone = (id, status, retryAfter, body) => pending.get(id)?.(status, retryAfter, body);
  };

  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const bridge = win.WmtHttp;
    if (!bridge || !GAME_NATIVE_PREFIXES.some((prefix) => url.startsWith(prefix))) return fallback(input, init);
    install();
    const id = `http-${(counter += 1)}`;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new TypeError('pont HTTP : délai dépassé'));
      }, TIMEOUT_MS);
      pending.set(id, (status, retryAfter, body) => {
        clearTimeout(timer);
        pending.delete(id);
        if (status === 0) return reject(new TypeError('pont HTTP : réseau indisponible'));
        resolve(new Response(NO_BODY.has(status) ? null : body, { status, ...(retryAfter ? { headers: { 'Retry-After': retryAfter } } : {}) }));
      });
      try {
        bridge.request(id, url, init?.method ?? 'GET', JSON.stringify(headers), typeof init?.body === 'string' ? init.body : '');
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  };
}
```

Dans `src/android/spotify-env.ts` : importer `{ createNativeFetch, type NativeHttpWindow } from './native-http'`, changer le type `AndroidWindow` en `AndroidWindow = NativeHttpWindow & { …existant… }` (ajouter `& NativeHttpWindow` au type), et remplacer la ligne `fetch: (url, init) => win.fetch(url, init),` par

```ts
    fetch: nativeFetch,
```

avec, en tête de `createAndroidSpotifyEnv`, `const nativeFetch = createNativeFetch(win, (url, init) => win.fetch(url, init)) as unknown as SpotifyEnv['fetch'];`. (Vérifier le type exact de `SpotifyFetch` et adapter le cast : `createNativeFetch` renvoie `typeof fetch`, `SpotifyEnv.fetch` attend `SpotifyFetch` ; si l'assignation directe passe le typecheck, retirer le cast.) Ajouter dans `tests/android/spotify-env.test.ts` un test : avec un `win` sans `WmtHttp`, `env.fetch(url)` appelle toujours `win.fetch`.

- [ ] **Step 4: Côté Java — `MainActivity.java`**

Ajouter les imports `java.net.HttpURLConnection`, `java.net.URL`, `java.util.Iterator`, `org.json.JSONException`, et :

```java
    // Hôtes de jeux vidéo (Steam, Twitch, IGDB) sans CORS : requêtes faites ici, jamais d'autre adresse.
    private static final String[] HTTP_ALLOWED = {
        "https://store.steampowered.com/",
        "https://api.steampowered.com/",
        "https://id.twitch.tv/oauth2/token",
        "https://api.igdb.com/v4/"
    };
```

Juste après `webView.addJavascriptInterface(new SpotifyBridge(), "WmtSpotify");` :

```java
        webView.addJavascriptInterface(new HttpBridge(), "WmtHttp");
```

Et la classe interne (à côté de `UpdateBridge`) :

```java
    // Pont HTTP : `WmtHttp.request(id, url, method, headersJson, body)` ; la réponse revient par window.__wmtHttpDone.
    private final class HttpBridge {
        @JavascriptInterface
        public void request(String id, String url, String method, String headersJson, String body) {
            boolean allowed = false;
            for (String prefix : HTTP_ALLOWED) if (url != null && url.startsWith(prefix)) allowed = true;
            final String callId = id == null ? "" : id.replaceAll("[^A-Za-z0-9-]", "");
            if (!allowed) {
                deliver(callId, 0, "", "");
                return;
            }
            new Thread(() -> {
                int status = 0;
                String retryAfter = "";
                String text = "";
                HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection) new URL(url).openConnection();
                    connection.setConnectTimeout(15000);
                    connection.setReadTimeout(15000);
                    connection.setRequestMethod("POST".equals(method) ? "POST" : "GET");
                    JSONObject headers = new JSONObject(headersJson == null ? "{}" : headersJson);
                    for (Iterator<String> names = headers.keys(); names.hasNext(); ) {
                        String name = names.next();
                        connection.setRequestProperty(name, headers.getString(name));
                    }
                    if ("POST".equals(method)) {
                        connection.setDoOutput(true);
                        if (body != null && !body.isEmpty()) connection.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
                    }
                    status = connection.getResponseCode();
                    String after = connection.getHeaderField("Retry-After");
                    retryAfter = after == null ? "" : after;
                    InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                    if (stream != null) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        byte[] chunk = new byte[8192];
                        int read;
                        while ((read = stream.read(chunk)) != -1) out.write(chunk, 0, read);
                        text = out.toString("UTF-8");
                    }
                } catch (IOException | JSONException error) {
                    status = 0;
                } finally {
                    if (connection != null) connection.disconnect();
                }
                deliver(callId, status, retryAfter, text);
            }).start();
        }

        private void deliver(String id, int status, String retryAfter, String text) {
            String script = "window.__wmtHttpDone && window.__wmtHttpDone(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(retryAfter) + "," + JSONObject.quote(text) + ")";
            runOnUiThread(() -> webView.evaluateJavascript(script, null));
        }
    }
```

(`ByteArrayOutputStream`, `InputStream`, `IOException`, `StandardCharsets` et `JSONObject` sont déjà importés.)

- [ ] **Step 5: Vérifier**

Run: `npm test && npm run typecheck` — Expected: PASS.
Run: `npm run apk` seulement si l'utilisateur le demande (l'APK se construit à la demande) ; sinon vérifier la compilation Java en lecture attentive (aucun outil dans cette session ne la lance sans APK). Signaler explicitement dans le compte rendu que la partie Java **n'a pas été compilée ni testée sur appareil**.

- [ ] **Step 6: Commit**

```bash
git add src/android tests/android android
git commit -m "feat(android): pont HTTP natif pour Steam, Twitch et IGDB (hôtes sans CORS)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Vérification finale, mémoire du projet et livraison

**Files:**
- Modify: `C:\Users\maxim\.claude\projects\C--Users-maxim-Downloads-Wikimasters-tools\memory\project_steam_jeux_video.md` et `MEMORY.md` (statut)

- [ ] **Step 1: Suite complète et build**

Run: `npm test && npm run typecheck && npm run build && npm run build:firefox`
Expected: tout PASS ; aucun secret dans `.output/` : `grep -r "WXT_IGDB_CLIENT_SECRET" .output | head` ne doit rien renvoyer d'autre que le nom de variable (la *valeur* est embarquée, comme Tidal ; vérifier seulement que `.env.local` n'est pas suivi : `git ls-files | grep env.local` ne renvoie rien).

- [ ] **Step 2: Vérification manuelle dans Chrome (à faire par l'utilisateur, recharger l'extension)**

Ouvrir la Collection et la fiche de : (a) Elden Ring (Steam : bande-annonce HLS lisible, 93 %, Metascore, prix, joueurs, bouton « Page Steam ») ; (b) Super Metroid ou un autre jeu SNES/Game Boy (IGDB : note /100, bande-annonce YouTube, « Fiche IGDB ») ; (c) un jeu absent des deux (section vide + glyphe) ; (d) le glyphe ⇄ : propositions Steam/IGDB, aperçu, « Utiliser ce jeu », « Aucun jeu », « Revenir au choix automatique », onglet « Coller un lien » avec une adresse Steam et une adresse IGDB ; (e) la BO d'un jeu avec un compte Spotify lié. Points à surveiller : la bande-annonce Steam peut être bloquée par la politique de sécurité du site (alors le lien de secours « Voir sur la page du jeu » reste) ; la position de la section par rapport au bouton « Mauvaise image ».

- [ ] **Step 3: Mettre à jour la mémoire du projet**

Dans `project_steam_jeux_video.md` : remplacer « Rien n'est encore implémenté » par l'état réel (PR, branche, ce qui est vérifié, ce qui reste : vérification manuelle Chrome + APK à construire sur demande + pont Java non testé sur appareil) et rappeler : `P5794` = slug IGDB, IGDB et Steam sans CORS (pont natif Android), secret IGDB dans `.env.local`. Mettre à jour la ligne correspondante de `MEMORY.md`.

- [ ] **Step 4: Pousser, ouvrir et fusionner la PR (routine du projet)**

```bash
git push -u origin feat/jeux-video-steam-igdb
gh pr create --base main --title "feat: section Jeu vidéo (Steam, IGDB en repli, BO, changer de jeu)" --body "<résumé, tests, points à vérifier à la main>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --merge
```

Utiliser les outils `ccd_pr` (`get_status`, `bind_pr`) après l'ouverture, ne pas surveiller la CI soi-même. Ne **pas** promouvoir en production (`npm run promouvoir` seulement sur ordre explicite).

---

## Auto-revue du plan

- **Couverture de la spec** : résolution Steam > IGDB > recherche stricte (Tasks 3-6) ; modèle commun (1) ; Wikidata P1733/P5794 par lots (5) ; IGDB jeton + file 4 req/s (4) ; mémorisation 6 h / 7 j / choix (5-6, 8) ; BO avec clé `game:<source>:<id>` (7) ; lecteur HLS + YouTube (8) ; glyphe ⇄, recherche des deux sources, lien collé, aperçu, « Aucun jeu », retour automatique, section vide (6, 8) ; permissions d'hôte + relais (1) ; pont Android (9) ; mentions de source (8) ; erreurs discrètes (6, 8) ; tests (chaque tâche) ; vérification manuelle (10).
- **Écart assumé avec la spec** : durées de mémorisation simplifiées (une seule durée Steam de 6 h) — la spec est alignée à l'étape 5 de la Task 1.
- **Cohérence des types** : `GameRef`, `GameChoice`, `GameDetail`, `GameCandidate`, `GameView`, `GameCandidates`, `GamePreview`, `CardGame { steamId, igdbSlug }` sont définis dans les Tasks 1, 5 et 6 et utilisés tels quels dans 6-8 ; `SoundtrackButton({ soundtrackKey, title, originalTitle })` défini en 7, utilisé en 8.
- **Risques restants** (à signaler, pas des trous) : politique de sécurité du site vis-à-vis du flux vidéo Steam et des images Steam/IGDB (à voir en Task 10) ; le code Java du pont n'est pas compilé dans cette session.
