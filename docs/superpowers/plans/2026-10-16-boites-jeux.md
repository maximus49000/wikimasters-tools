# Vraies boîtes de jeux vidéo — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque jeu vidéo de « Ma Pièce » devient la vraie boîte de sa version (console, dimensions réelles fermée et ouverte, vrais devant et dos TheGamesDB, disque ou cartouche à l'échelle), qu'on peut retourner (⟲) et dont on lit le dos à la loupe.

**Architecture:** Le relais Cloudflare interroge TheGamesDB (clé `TGDB_API_KEY`, réponses gardées en KV sans expiration). Côté client, un service `game-box-service` rapproche la carte d'une **version** TheGamesDB (choix mémorisé `game-version-v1`) et en tire un `GameBox` (format de boîte + images). Le **format** est recopié dans le plan de la pièce (`box` sur l'objet rangé) pour que toute la géométrie de la scène reste pure et synchrone ; la couche d'ouverture calcule sa géométrie depuis ce format.

**Tech Stack:** TypeScript, React (SVG + CSS 3D), zod, vitest, Cloudflare Worker (relais), WXT (extension) + WebView Android.

**Spec:** `docs/superpowers/specs/2026-10-16-boites-jeux-design.md`

## Global Constraints

- Extension **et** app Android (même surcouche) ; validation d'abord sur le vrai téléphone (APK pré-prod).
- Images : **API avant remplacement** ; nouvelle source → `ART_VERSION` 3 → **4** (`src/core/images/image-book.ts:10`).
- Boîte ouverte = deux moitiés **identiques**, chacune égale à la boîte fermée ; la taille ne dépend **jamais** du contenu ; support **entier**, jamais coupé.
- Boîtes carton (NES, SNES, N64, Game Boy, GBA, Mega Drive…) **hors champ** → format `generic`.
- TheGamesDB n'est interrogé que pour un jeu **affiché** (fiche ouverte, objet dessiné dans la pièce) ; jamais de pré-remplissage de la Collection.
- Visuels par Opus avec la trace en tête de fichier : `// Dessin provisoire Opus : Fable n'est pas passé (gel jusqu'au 2026-10-17), reprise Fable prévue.`
- Style cellulo : aplats + trait encré (`INK` de `item-case.tsx`) + ombre nette, jamais de polygone brut.
- Glyphes plutôt que texte ; cibles tactiles 44 px.
- Chaque nouveau fichier de test est rangé dans une famille de `tests/familles.ts` (`fiche`, `relais`, `scene-piece`) ; on ne joue que les familles touchées.
- Fiche WikiHow (`src/core/whats-new/entries.ts`, **nouvel id**) dans la même PR.

## Review Focus

1. **Titre introuvable ou TheGamesDB en panne / quota épuisé** (502, 429, liste vide) : le jeu garde le devant Steam/IGDB, un format déduit de la plateforme Steam/IGDB, un dos fabriqué ; aucune erreur visible, nouvel essai plus tard (pas à chaque dessin). → tests en tâches 3 et 4.
2. **Pièce existante (livre v7)** : migration v8 sans perte ; un jeu dont le nouveau format est plus large que la place restante **reste** sur sa tablette (jamais retiré). → tests en tâche 6.
3. **Version sans dos ni captures** : dos fabriqué avec titre + description seulement, loupe toujours possible. → test en tâche 9.
4. **Couche tournée de 90° (téléphone en hauteur)** : ⟲ reste au-dessus de la boîte, la loupe et ses gestes suivent la rotation ; le retour Android ferme d'abord la loupe, puis la boîte. → tests en tâches 9 et 10.
5. **Plateforme TheGamesDB inconnue** (id absent de la table, ex. une console carton) : format `generic`, jamais d'exception. → test en tâche 2.

---

### Task 1: Route TheGamesDB du relais

**Files:**
- Create: `relay/src/tgdb.ts`
- Modify: `relay/src/index.ts` (Env `TGDB_API_KEY?: string` ; `LIMITS.tgdb = [60, 60_000]` ; routes GET `/tgdb/` ; `/status` → `tgdbKey`)
- Test: `tests/relay/tgdb.test.ts` (famille `relais`, déjà couverte par `tests/relay/**`)

**Interfaces:**
- Produces: `GET {RELAY_BASE}/tgdb/games?name=<1..120 car.>` → corps JSON TheGamesDB `v1.1/Games/ByGameName` avec `include=boxart,platform` et `fields=overview,platform,release_date,region_id` (réponse amont telle quelle) ; `GET {RELAY_BASE}/tgdb/images?ids=<1..20 ids séparés par des virgules>` → `v1/Games/Images` avec `filter[type]=screenshot,clearlogo`.
- `proxyTgdb(url: URL, deps: { fetch: Fetcher; apiKey: string | undefined; kv: KvLike | undefined }): Promise<ProxyResult>`

- [ ] **Step 1: Write the failing tests** (`tests/relay/tgdb.test.ts`, faux KV `memoryKv()`)
  - `ajoute la clé et transmet` : `/tgdb/games?name=Hollow Knight` → amont `https://api.thegamesdb.net/v1.1/Games/ByGameName`, `apikey=SECRET`, `name=Hollow Knight`, `include=boxart,platform` ; résultat `{status:200, body}`.
  - `garde la réponse en KV sans expiration et ne rappelle pas l'amont` : 2ᵉ appel identique → `fetch` appelé **une** fois ; clé KV `tgdb:games:hollow knight` (nom en minuscules, espaces réduits) ; `put` sans `expirationTtl`.
  - `ne garde pas une réponse en échec` : amont 500 → `{status:502}` et KV vide.
  - `refuse` : chemin inconnu → 404 ; `name` vide ou > 120 car. → 400 ; `ids` non numériques ou > 20 → 400 ; sans clé → 503 `not-configured` ; aucun appel amont dans ces cas.
  - `images` : `/tgdb/images?ids=55247,42293` → amont `v1/Games/Images?games_id=55247,42293&filter[type]=screenshot,clearlogo`, KV `tgdb:images:42293,55247` (ids triés).
- [ ] **Step 2: Run** `npx vitest run tests/relay/tgdb.test.ts` → FAIL (module absent).
- [ ] **Step 3: Implement `proxyTgdb`** sur le modèle de `relay/src/tmdb.ts` (liste blanche, `forward`) ; KV écrite seulement si `status === 200`. Câbler dans `index.ts` : `if (get && url.pathname.startsWith('/tgdb/')) return limited(request, 'tgdb') ?? relayed(await proxyTgdb(url, { fetch: net, apiKey: env.TGDB_API_KEY, kv: env.DOC_CACHE }))` ; `/status` ajoute `tgdbKey: Boolean(env.TGDB_API_KEY)`.
- [ ] **Step 4: Run** `npm run test:famille -- relais` → PASS.
- [ ] **Step 5: Deploy and check live** : `npx wrangler deploy` puis `curl -s "https://wikimasters-tools.maxime-protais-baumer.workers.dev/tgdb/games?name=Hollow%20Knight" | head -c 400` → JSON avec `"code":200`, `data.games`, `remaining_monthly_allowance`. Enregistrer cette réponse et celle de `?name=Red%20Dead%20Redemption%202` dans `tests/core/game/fixtures/tgdb-hollow-knight.json` et `tgdb-rdr2.json` (fixtures des tâches 2-3) ; relever aussi `include=platform` pour confirmer les ids de plateformes de la tâche 2, et noter dans le commit le `remaining_monthly_allowance` observé.
- [ ] **Step 6: Commit** `feat(relais): route TheGamesDB mémorisée en KV`

### Task 2: Formats de boîte par console

**Files:**
- Create: `src/core/game/platform-boxes.ts`
- Test: `tests/core/game/platform-boxes.test.ts` (famille `fiche`)

**Interfaces:**
- Produces:
  ```ts
  export type BoxFormat = 'bluray' | 'dvd' | 'gamecube' | 'switch' | 'ds' | 'psp' | 'vita' | 'cd-jewel' | 'generic';
  export type BoxSupport = { kind: 'disc'; d: number } | { kind: 'umd'; w: number; h: number } | { kind: 'cart'; w: number; h: number; color: string };
  export type BoxTemplate = { w: number; h: number; d: number; plastic: string; band: { color: string; label: string } | null; support: BoxSupport }; // cm
  export const BOX_FORMATS: Record<BoxFormat, BoxTemplate>;
  export function formatOfTgdbPlatform(id: number): BoxFormat;
  export function formatOfPlatformName(name: string): BoxFormat; // noms IGDB/Steam (« PlayStation 4 », « Nintendo Switch », « PC (Microsoft Windows) »…)
  ```
- Valeurs (cm) de la spec : bluray 13,5 × 17 × 1,4 (disque 12) ; dvd 13,5 × 19 × 1,4 (disque 12) ; gamecube 13,5 × 19 × 1,4 (disque 8) ; switch 10,5 × 17 × 1,1 (cartouche 2,1 × 3,1) ; ds 13,5 × 12,2 × 1,4 (cartouche 3,5 × 3,3) ; psp 11 × 18 × 1,4 (UMD 6,5 × 6,4) ; cd-jewel 14,2 × 12,5 × 1 (disque 12) ; generic 13,5 × 19 × 1,5 (disque 12). `vita` : à recouper (≈ 10,5 × 13,5 × 1,1, carte ≈ 2,2 × 3,2) avec source en commentaire.
- Plateformes TheGamesDB (à confirmer avec la réponse enregistrée en tâche 1) : 4919 PS4, 4980 PS5, 12 PS3, 4920 Xbox One, 4981 Xbox Series X → `bluray` ; 11 PS2, 14 Xbox, 15 Xbox 360, 9 Wii, 38 Wii U, 1 PC → `dvd` ; 2 GameCube → `gamecube` ; 4971 Switch → `switch` ; 8 DS, 4912 3DS → `ds` ; 13 PSP → `psp` ; 39 Vita → `vita` ; 10 PS1, 17 Saturn, 16 Dreamcast → `cd-jewel` ; tout le reste → `generic`.
- Couleurs de plastique : PlayStation bleu `#1F4C9E`, Xbox vert `#107C10`, Switch rouge `#E60012`, Wii/Wii U/DS blanc `#F2F2F0`, PS2/PC/GameCube/PSP/Vita noir `#1B1B1F`, cd-jewel transparent clair `#D9DEE6`.

- [ ] **Step 1: Write the failing tests** : `formatOfTgdbPlatform(4971) === 'switch'`, `(4919) === 'bluray'`, `(38) === 'dvd'`, `(6 /* SNES */) === 'generic'`, `(999999) === 'generic'` ; `formatOfPlatformName('Nintendo Switch') === 'switch'`, `('PlayStation 4') === 'bluray'`, `('PC (Microsoft Windows)') === 'dvd'`, `('Super Nintendo Entertainment System') === 'generic'` ; chaque `BOX_FORMATS[f]` a un support qui tient dans une moitié (`support` ≤ `w` et ≤ `h`).
- [ ] **Step 2: Run** `npx vitest run tests/core/game/platform-boxes.test.ts` → FAIL.
- [ ] **Step 3: Implement** la table et les deux fonctions (correspondance par nom : minuscules, recherche de mots-clés).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(jeu): formats de boîte par console`

### Task 3: Versions TheGamesDB (client, rapprochement, choix mémorisé)

**Files:**
- Create: `src/core/game/tgdb-api.ts`, `src/core/game/game-version-repo.ts`
- Modify: `src/core/game/config.ts` (`TGDB_RELAY = \`${RELAY_BASE}/tgdb\``, `TGDB_CDN = 'https://cdn.thegamesdb.net/images'`)
- Test: `tests/core/game/tgdb-api.test.ts`, `tests/core/game/game-version-repo.test.ts` (famille `fiche`)

**Interfaces:**
- Consumes: `BoxFormat`, `formatOfTgdbPlatform` (tâche 2) ; fixtures de la tâche 1.
- Produces:
  ```ts
  export type TgdbVersion = { id: number; title: string; platformId: number; platformName: string; format: BoxFormat; year?: number; regionId?: number; overview?: string; front?: string; back?: string }; // front/back = filename boxart
  export function parseTgdbGames(json: unknown): TgdbVersion[];               // zod ; [] si la forme est inattendue
  export function matchingVersions(all: TgdbVersion[], titles: string[], year?: number): TgdbVersion[]; // titre normalisé exact (casse, accents, ponctuation, « the »), année ±1 si connue
  export function defaultVersion(list: TgdbVersion[], preferred?: BoxFormat): TgdbVersion | null;
  export function boxartUrl(file: string, size: 'medium' | 'original'): string; // `${TGDB_CDN}/${size}/${file}`
  export function fetchTgdbVersions(name: string, fetchFn: GameFetch): Promise<TgdbVersion[] | null>; // null = panne (≠ [] = rien trouvé)
  export function fetchTgdbImages(ids: number[], fetchFn: GameFetch): Promise<Record<number, { shots: string[]; logo?: string }> | null>;
  export type GameVersionChoice = { tgdbId: number };
  export function createGameVersionRepo(store: KeyValueStore): { load(): Promise<Record<string, GameVersionChoice>>; save(slug: string, c: GameVersionChoice): Promise<void>; clear(slug: string): Promise<void> }; // clé 'game-version-v1', écritures en file comme createGameChoiceRepo
  ```
- Ordre de `defaultVersion` : a un dos > format égal à `preferred` > région PAL (ids des régions Europe/PAL relevés via `/v1/Regions` du relais lors de la tâche 1, en constante commentée) > année la plus ancienne > plus petit id.

- [ ] **Step 1: Write the failing tests** :
  - `parseTgdbGames(fixture rdr2)` contient une version `platformId 4919`, `format 'bluray'`, `back === 'boxart/back/55247-1.jpg'`.
  - `matchingVersions` sur `Hollow Knight` garde les 4 consoles et **écarte** « Hollow Knight: Silksong » ; « Pokemon Red » écarte « Pokémon Red: Battle Factory ».
  - `defaultVersion` préfère la version avec dos à une plus ancienne sans dos ; à dos égal, `preferred` gagne ; liste vide → `null`.
  - `parseTgdbGames({code:418})` → `[]` ; `fetchTgdbVersions` avec amont 502 → `null`.
  - Repo : save/load/clear, deux `save` simultanés gardent les deux.
- [ ] **Step 2: Run** `npx vitest run tests/core/game/tgdb-api.test.ts tests/core/game/game-version-repo.test.ts` → FAIL.
- [ ] **Step 3: Implement** (zod comme `igdb-api.ts`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(jeu): versions TheGamesDB et choix mémorisé`

### Task 4: Service des boîtes + devant TheGamesDB en priorité

**Files:**
- Create: `src/content/game-box-service.ts`
- Modify: `src/content/game-service.ts` (`cover()` : devant TheGamesDB d'abord), `src/core/images/image-book.ts` (`ART_VERSION = 4`), `src/app/overlay.ts` (câblage, comme `gameService` l.669-684)
- Test: `tests/content/game-box-service.test.ts` (ajouter `'game-box-service.*'` à la famille `fiche`), `tests/content/game-service.test.ts`

**Interfaces:**
- Consumes: tâches 2-3 ; `getGameService().view` (pour titres, année, plateformes, description).
- Produces:
  ```ts
  export type GameBox = { format: BoxFormat; tgdbId?: number; platformName: string; frontUrl?: string; backUrl?: string; backFullUrl?: string; shots: string[]; logoUrl?: string; title: string; summary?: string };
  export function createGameBoxService(deps: { versions: (name: string) => Promise<TgdbVersion[] | null>; images: (ids: number[]) => Promise<Record<number, { shots: string[]; logo?: string }> | null>; choices: ReturnType<typeof createGameVersionRepo>; game: { view(slug: string, title: string): Promise<GameView> }; cache: TtlCache; now?: () => number }): {
    box(slug: string, title: string): Promise<GameBox | null>;      // null = pas un jeu
    peek(slug: string): GameBox | null | undefined;                  // synchrone, pour la scène
    request(slug: string, title: string): void;                      // lance box() si inconnu, 1 essai / minute après une panne
    subscribe(listener: () => void): () => void;
    versions(slug: string, title: string): Promise<TgdbVersion[]>;
    chooseVersion(slug: string, tgdbId: number): Promise<void>;     // + onChanged(slug) → images.forgetGameArt
    resetVersion(slug: string): Promise<void>;
  };
  export function getGameBoxService(): ReturnType<typeof createGameBoxService> | null; // même patron que getGameService
  ```
- Repli quand TheGamesDB ne répond pas ou ne trouve rien : `format = formatOfPlatformName(premier nom de detail.platforms)` (Steam seul → `dvd`), `frontUrl = detail.coverUrl`, pas de `backUrl` (dos fabriqué en tâche 9), `shots` des captures Steam/IGDB si disponibles, sinon `[]`.
- Cache client des réponses TheGamesDB : `game-tgdb-${nom normalisé}`, TTL 365 j.

- [ ] **Step 1: Write the failing tests** :
  - version choisie mémorisée → `box()` rend son format, `frontUrl = boxartUrl(front,'medium')`, `backFullUrl = boxartUrl(back,'original')`.
  - sans choix → `defaultVersion` avec `preferred = formatOfPlatformName(detail.platforms[0])`.
  - `versions` renvoie `null` (panne) → repli Steam/IGDB **et** `request` ne relance pas avant 60 s (faux `now`).
  - `peek` est `undefined` avant `request`, puis l'objet après résolution, et `subscribe` est notifié une fois.
  - `game-service.cover()` rend `[box.frontUrl, …anciennes images]` quand une version existe ; inchangé sinon.
- [ ] **Step 2: Run** `npm run test:famille -- fiche` → FAIL sur les nouveaux tests.
- [ ] **Step 3: Implement** ; `ART_VERSION = 4`.
- [ ] **Step 4: Run** `npm run test:famille -- fiche` → PASS.
- [ ] **Step 5: Commit** `feat(jeu): boîte d'une carte (TheGamesDB, repli Steam/IGDB)`

### Task 5: Choisir la version dans la fiche

**Files:**
- Create: `src/content/GameVersionDialog.tsx`
- Modify: `src/content/GameSection.tsx` (bouton à côté de ⇄, l.108-136)
- Test: `tests/content/GameVersionDialog.test.tsx`, `tests/content/GameSection.test.tsx` (famille `fiche`)

**Interfaces:**
- Consumes: `getGameBoxService().versions / chooseVersion / resetVersion` (tâche 4).
- Produces: bouton `aria-label="Changer de version"` glyphe console (manette) ; dialogue listant chaque version : vignette `boxartUrl(front,'medium')`, nom de console, année, glyphe ✓ « dos » si `back` ; la version active cochée ; « Automatique » en tête (= `resetVersion`).

- [ ] **Step 1: Write the failing tests** : le bouton n'apparaît que si `versions()` rend ≥ 2 versions ; cliquer une version appelle `chooseVersion(slug, id)` et ferme ; « Automatique » appelle `resetVersion` ; liste vide → message « Aucune autre version connue ».
- [ ] **Step 2: Run** `npx vitest run tests/content/GameVersionDialog.test.tsx tests/content/GameSection.test.tsx` → FAIL.
- [ ] **Step 3: Implement** sur le modèle de `GameChoiceDialog.tsx`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(jeu): choisir la version (console) d'un jeu`

### Task 6: Plan de la pièce — format de boîte et présentation « de dos » (cœur pur)

**Files:**
- Modify: `src/core/library/library-types.ts` (`StoredDisplay = 'cover' | 'spine' | 'back'` ; objet rangé `box?: BoxFormat`), `src/core/library/library-book.ts` (v8 + `migrateV7`), `src/core/library/item-models.ts`, `src/core/library/room-grid.ts` (`StoredLike.box`), `src/core/library/carried-items.ts` (`storedPlacement` recopie `box`)
- Test: `tests/core/library/item-models.test.ts`, `tests/core/library/library-migration-v8.test.ts` (famille `scene-piece` : ajouter le motif s'il n'est pas couvert par `library-migration*`), `tests/core/library/room-grid*.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function storedModel(shape: ShelfShape, box?: BoxFormat): Model;      // game + box → dimensions de BOX_FORMATS[box] et couleur `plastic` ; sinon ITEM_MODELS[shape]
  export function itemFootprintCm(shape: ShelfShape, display: ItemDisplay, box?: BoxFormat): number; // 'cover' | 'back' → w ; 'spine' → d
  export type ItemPlacement = { …existant; box?: BoxFormat };
  export function setStoredBox(layout: Layout, id: string, box: BoxFormat): Layout; // ne déplace rien, même si la tablette déborde
  ```
- Le modèle `game` porte un décalque `{ face: 'back', key: 'back:game' }` ; présentation `'back'` = demi-tour (`HALF: front↔back, left↔right, top`), présentoir aussi pour `'back'`.
- `displayOf` inchangé pour les défauts ; `'back'` accepté seulement pour `shape === 'game'` (sinon ramené à `'cover'` au chargement).

- [ ] **Step 1: Write the failing tests** :
  - `storedModel('game','switch')` → `w 10.5, h 17, d 1.1` ; `storedModel('game')` → 13,5 × 19 × 1,5 ; `itemFootprintCm('game','back','bluray') === 13.5`.
  - `itemPieces` d'un jeu `display:'back'` : le décalque `…|back:game` est sur la face `front`, `…|cover:game` sur `back`.
  - Migration : un état v7 avec un jeu rangé → v8 identique avec `version: 8` ; un état v8 avec `display:'back'` sur un CD → relu en `'cover'`.
  - `setStoredBox` sur une tablette pleine : l'objet garde `shelfId/level/order`, rien n'est retiré (Review Focus 2).
- [ ] **Step 2: Run** `npm run test:famille -- scene-piece` → FAIL sur les nouveaux tests.
- [ ] **Step 3: Implement** (tous les appels `ITEM_MODELS[p.shape]` des objets rangés passent par `storedModel(p.shape, p.box)`).
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece` → PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): format de boîte et présentation de dos (v8)`

### Task 7: Scène — boîtes dessinées, dos dans l'armoire, synchronisation du format

**Files:**
- Modify: `src/content/model3d-art.tsx` (rôle `back` ; `ItemContent.backUrl` ; bandeau de console au lieu du rouge unique), `src/content/RoomView.tsx` (l.482 : `content.backUrl`), `src/content/shelf-board-zoom.tsx` (image du dos et proportions du format), `src/content/LibraryPanel.tsx` (`DisplayButtons` : « Présenter de dos » pour un jeu ; effet de synchronisation `box` ; `getGameBoxService().request` pour les jeux dessinés)
- Test: `tests/content/model3d-art.test.tsx`, `tests/content/shelf-board-zoom.test.tsx`, `tests/content/library-panel.test.tsx` (famille `scene-piece`)

**Interfaces:**
- Consumes: `GameBox` / `peek` / `subscribe` (tâche 4) ; `setStoredBox`, `storedModel` (tâche 6).
- Synchronisation : quand `peek(slug)?.format` diffère du `box` de l'objet rangé, `setStoredBox` puis sauvegarde (une écriture par changement, jamais en boucle). Dos dessiné : `backUrl`, sinon dos fabriqué (tâche 9) — d'ici là un aplat de la couleur du plastique + titre.

- [ ] **Step 1: Write the failing tests** : décalque `back` dessine `content.backUrl` ; bouton `data-action="display-back"` présent pour un jeu, absent pour un CD ; un jeu dont `peek` rend `switch` est réécrit une seule fois avec `box:'switch'` ; second zoom : un jeu de dos montre l'image du dos.
- [ ] **Step 2: Run** `npm run test:famille -- scene-piece` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS ; capture de l'étagère (un jeu Switch, un PS4 de face, un de dos) montrée à l'utilisateur.
- [ ] **Step 5: Commit** `feat(bibliotheque): vraies boîtes de jeux dans l'armoire`

### Task 8: Boîte ouverte aux vraies dimensions, disque ou cartouche, page de gauche

**Files:**
- Modify: `src/content/opened-item/item-case.tsx` (`gameGeometry(format)` remplace `GEOMETRY['game-case']` ; `DiscKind` + `'mini' | 'umd' | 'cart'` ; dessin cartouche), `src/content/opened-item/selectors.tsx` (`GameSelector` : en-tête fiche courte + description 3 lignes « Lire la suite ›» au-dessus des lignes existantes), `src/content/opened-item/OpenedItemLayer.tsx` + `src/content/LibraryPanel.tsx` (passer `format`), `src/content/opened-item/disc-flight.tsx` (kind `'game' | 'cart'`), `src/content/hifi/hifi-art.tsx` (cartouche couchée, sans rotation)
- Test: `tests/content/item-case.test.tsx`, `tests/content/selectors.test.tsx`, `tests/content/disc-flight.test.tsx`, `tests/content/opened-item-layer.test.tsx` (famille `scene-piece`)

**Interfaces:**
- Consumes: `BOX_FORMATS` (tâche 2), `GameBox` (tâche 4).
- Produces: `export function gameGeometry(format: BoxFormat): Geometry` — unités mm : `w = template.w*10`, `h = template.h*10` ; support centré dans la moitié droite à l'échelle réelle (`disc.d = support.d*10`) ; sélecteur = moitié gauche moins 9 mm de marge.

- [ ] **Step 1: Write the failing tests** :
  - `gameGeometry('switch')` → `w 105, h 170` ; cartouche 21 × 31 centrée ; `gameGeometry('bluray').disc.d === 120` et le disque tient dans la moitié (`cx - d/2 ≥ 0`, `cx + d/2 ≤ w`).
  - Rendu : deux moitiés de même largeur (couvercle = plateau) pour `switch`, `bluray`, `ds`.
  - `GameSelector` : titre, « PS4 · 2018 · Rockstar Games », note, description coupée à 3 lignes (`detail.summary` Steam fr, sinon IGDB, sinon `box.summary` TheGamesDB), « Lire la suite » la déplie ; puis vidéo et BO comme avant ; la page défile (style `overflow-y: auto`).
  - BO d'un jeu `switch` : la cartouche vole au poste (`kind 'cart'`) et y est couchée sans `rotate`.
- [ ] **Step 2: Run** `npm run test:famille -- scene-piece` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS ; capture (PS4 ouverte, Switch ouverte) montrée à l'utilisateur.
- [ ] **Step 5: Commit** `feat(bibliotheque): boîte de jeu ouverte aux vraies dimensions`

### Task 9: Retourner (⟲) — extérieur dos | tranche | devant, dos fabriqué

**Files:**
- Create: `src/content/opened-item/game-outside.tsx` (face extérieure + dos fabriqué)
- Modify: `src/content/opened-item/item-case.tsx` (face arrière de la boîte ouverte, pivot `rotateY(180deg)` 700 ms, fondu en mouvement réduit), `src/content/opened-item/OpenedItemLayer.tsx` (bouton ⟲ au-dessus de la boîte, centré)
- Test: `tests/content/game-outside.test.tsx` (ajouter à `scene-piece`), `tests/content/opened-item-layer.test.tsx`

**Interfaces:**
- Consumes: `GameBox` (tâche 4), `gameGeometry` (tâche 8).
- Produces: `export function GameOutside(props: { box: GameBox; geometry: Geometry; onMagnify: () => void }): ReactElement` — trois zones : dos (`backUrl` ou `MadeBack`), tranche (largeur = `template.d*10` mm, titre vertical + console), devant (`frontUrl`) ; `export function MadeBack(props: { box: GameBox }): ReactElement` — bandeau console, logo (`logoUrl`) ou titre, jusqu'à 4 `shots`, début de `summary`.
- Bouton : `data-action="flip"`, glyphe ⟲, 44 px, positionné au-dessus du bord haut de la boîte et centré horizontalement sur elle (dans le repère de la couche, rotation 90° comprise). Retournée : vidéo arrêtée, disque rendu ; ✕ / retour referment comme d'habitude (retour à l'intérieur sans animation, puis fermeture).

- [ ] **Step 1: Write the failing tests** :
  - Jeu ouvert : bouton `flip` présent (absent pour un CD/DVD/livre) ; son centre x = centre x de la boîte.
  - Clic → classe/état retourné ; l'extérieur montre dans l'ordre dos, tranche, devant ; second clic → intérieur.
  - `box` sans `backUrl` ni `shots` → `MadeBack` avec titre et description (Review Focus 3).
  - Couche tournée (`layerFrame` en hauteur) : le bouton reste au-dessus de la boîte dans le repère tourné (Review Focus 4).
  - Une vidéo en cours est arrêtée au retournement.
- [ ] **Step 2: Run** `npm run test:famille -- scene-piece` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS ; capture (RDR2 PS4 retournée, Hollow Knight avec dos fabriqué) montrée à l'utilisateur.
- [ ] **Step 5: Commit** `feat(bibliotheque): retourner la boîte de jeu`

### Task 10: Loupe sur le dos

**Files:**
- Create: `src/content/opened-item/back-magnifier.tsx`
- Modify: `src/content/opened-item/game-outside.tsx` (glyphe loupe 44 px, coin bas droit du dos), `src/content/opened-item/OpenedItemLayer.tsx` (historique : retour ferme la loupe d'abord), `src/content/opened-item/use-opened-item.ts` (`onBeforeClose`)
- Test: `tests/content/back-magnifier.test.tsx` (ajouter à `scene-piece`), `tests/content/opened-item-layer.test.tsx`

**Interfaces:**
- Consumes: `GameBox.backFullUrl` / `backUrl` (tâche 4), `MadeBack` (tâche 9).
- Produces: `export function BackMagnifier(props: { box: GameBox; onClose: () => void }): ReactElement` — dos **entier ajusté** à l'écran par défaut ; image `backFullUrl` (repli `backUrl` affiché pendant le chargement) ; pincer = zoom (1× à 6×), glisser = déplacement borné, double-toucher = retour à 1× ; ✕ (`data-action="close-magnifier"`), retour Android, Échap → `onClose` (vue pochette intégrale retournée).

- [ ] **Step 1: Write the failing tests** : ouverture à l'échelle 1 avec l'image entière visible (`object-fit: contain`) ; deux pointeurs qui s'écartent ×2 → échelle 2 ; double-toucher → 1 ; ✕ → `onClose` et la boîte reste retournée ; `popstate` ferme la loupe sans fermer la boîte ; dos fabriqué → la loupe montre `MadeBack` agrandi.
- [ ] **Step 2: Run** `npm run test:famille -- scene-piece` → FAIL.
- [ ] **Step 3: Implement** (événements pointeur, pas de bibliothèque).
- [ ] **Step 4: Run** → PASS ; capture montrée à l'utilisateur.
- [ ] **Step 5: Commit** `feat(bibliotheque): loupe sur le dos de la boîte`

### Task 11: WikiHow, vérifications, livraison

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvel id `boites-jeux-2026-10`, thème `collection`, glyphe 🎮)
- Test: tests existants des nouveautés (famille où vit `entries`)

- [ ] **Step 1: Write the entry** : étapes « Choisir la version », « Retourner la boîte », « Lire le dos à la loupe », « Présenter de dos » ; chacune avec `details` À quoi ça sert / D'où viennent les données (TheGamesDB, Steam, IGDB) / Comment faire / Limites (dos souvent absents pour les jeux récents, scans surtout américains, boîtes carton pas encore gérées).
- [ ] **Step 2: Run** `npm run test:famille -- fiche relais scene-piece` puis la famille des nouveautés → PASS ; `npx tsc --noEmit` → 0 erreur ; `npm run build` → OK.
- [ ] **Step 3: Android** : APK pré-prod sur le S26 (voir mémoire « Mesure sur téléphone ») : ouvrir un jeu PS4 et un jeu Switch, retourner, loupe, retour Android ; capture montrée à l'utilisateur.
- [ ] **Step 4: Commit** `docs(wikihow): vraies boîtes de jeux`, puis PR vers `main`, fusion, `npm run preprod` (jamais de production sans ordre explicite).
