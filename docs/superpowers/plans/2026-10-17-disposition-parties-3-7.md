# Disposition des objets — parties 3 à 7 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ranger toute une étagère depuis la vue Modifier (zoom par tablette, cartes et petits objets mélangés), poser des cartes
sur un plateau (trépied ou à plat), modifier une carte sur place (présentation, format, version de pochette), puis le zoom de la
chaîne hi-fi.

**Architecture:** Le cœur (`src/core/library`) gagne les tablettes mixtes, les poses et les changements d'une carte ; chaque
changement est une fonction pure `(layout, …) => Layout | null` (null = refusé, rien ne bouge). L'interface réutilise la vue
Modifier de la partie 2 (`src/content/arrange/`) pour le dessus, et le rendu du zoom d'étagère existant (`furniture-zoom.tsx`,
`shelf-board-zoom.tsx`) pour le meuble entier et les tablettes, avec le glissé en plus. Les versions de pochette viennent de sources
réelles (Spotify, Deezer par le relais, TMDB par le relais, TheGamesDB, Open Library) et sont gardées sur l'objet posé.

**Tech Stack:** TypeScript, React, zod, vitest + Testing Library ; relais Cloudflare (`relay/`).

**Spec:** `docs/superpowers/specs/2026-10-16-disposition-objets-meuble-design.md` — section « Révision du 2026-10-17 » (prime sur
le début du document). Plan précédent (parties 1-2 livrées, PR #327, #330) : `docs/superpowers/plans/2026-10-17-disposition-objets-meuble.md`.

## Global Constraints

- Chaque partie = une branche depuis `origin/main` + une PR fusionnée + `npm run preprod` lancé depuis le worktree qui porte `main`.
- WikiHow : une **nouvelle** fiche par partie visible — partie 3 `bibliotheque-v34`, 4 `v35`, 5 `v36`, 6 `v37`, 7 `v38` —
  rubriques « À quoi ça sert / D'où viennent les données / Comment ça marche / Limites » ; on ne modifie pas les fiches déjà publiées.
- Glyphes seulement sur les boutons, `aria-label` et `title` en français.
- Une carte ou un objet ne change **jamais** de place tout seul : tout changement qui ne tient pas est refusé (rouge / message
  « Plus de place sur cette tablette. »), rien ne bouge.
- Pochette et format choisis dans la pièce : **propres à l'objet posé** ; la Collection, la fiche et les images du site ne changent pas.
- Versions de pochette d'un CD : **Spotify d'abord, Deezer seulement si Spotify ne donne rien** (ou pas de compte lié). DVD :
  affiches TMDB. Jeu : boîtes TheGamesDB. Livre : couvertures Open Library. Rien trouvé → bouton grisé, jamais de version inventée.
- Meuble entier et tablettes **de face**, comme le zoom d'étagère existant ; le dessus en **vue plongeante** (partie 2).
- Le glissé suit le doigt (Android d'abord) : seul l'objet tenu bouge (transform) ; l'état est écrit au lâcher par une **intention**
  (`onMove`, `onBoard`…), jamais par un instantané du plan.
- Stockage : **v10** (partie 4), une seule montée de version pour tout ce plan.
- Tests : `npm run test:famille -- scene-piece` (+ `scene-lumiere` si l'éclairage des objets change, `fiche` pour les services de
  pochette, `relais` pour le relais). **Une seule session lance des tests à la fois** : vérifier qu'aucun `vitest` d'une autre
  session ne tourne avant de lancer. Échec connu sans rapport : `library-scene.test.ts` (fenêtre col 2,5).
- Visuels par Fable (sinon Opus + trace « Fable n'est pas passé » dans la PR) ; capture montrée à l'utilisateur à chaque partie visible.

## Review Focus

1. **Changer le format pour un boîtier plus large sur une tablette pleine** : refusé, la carte garde format et place — test Tâche 5.1.
2. **Doigt posé par hasard près du bord en zoom** : le passage à la tablette voisine n'a lieu qu'après `EDGE_MS` au bord ; quitter
   le bord annule — test Tâche 3.2.
3. **Bibliothèques liées** : le meuble entier les montre côte à côte ; une carte passe de l'une à l'autre et reste à sa nouvelle
   place après rechargement — test Tâche 3.2.
4. **Pochettes sans réseau / relais en erreur** : bouton grisé, pochette actuelle gardée, aucune erreur visible — test Tâche 6.1.
5. **Format changé sur une carte qui avait une pochette choisie** : la pochette choisie est oubliée (elle venait d'une autre
   source), la carte reprend la pochette par défaut du nouveau format — test Tâche 5.1.

---

## Partie 3 — Étagère entière + zoom par tablette (branche `feat/vue-modifier-etagere`)

### Task 3.1: Tablettes mixtes (cœur)

**Files:**
- Modify: `src/core/library/room-grid.ts` (`boardItems` :526, `boardUsedCm` :530, `fits`, `shelfLayoutIn` :568, `dropOnShelf` :623, `firstFreeBoard` :644, `insertStored` :674, `moveStored` :709)
- Modify: `src/core/library/carried-items.ts` (`storedPlacementsOf` :43, `carriedPlacementOf` :80 — un petit objet de tablette n'est plus « non dessiné »)
- Modify: `src/core/library/light/occluders.ts` (même rangement de tablette)
- Test: `tests/core/library/board-mixed.test.ts` (ajouter à `scene-piece` dans `tests/familles.ts`)

**Interfaces:**
- Produces:
  - `type BoardItem = Stored | SmallOnBoard` ; `boardItems(layout, shelfId, level, ignoreId?): BoardItem[]` (trié par `order` ; le petit objet de tablette a `hostId` = l'étagère)
  - `type BoardLike = StoredLike | { id?: string; item: SmallItem }` ; `boardWidthCm(p: BoardLike): number` (petit objet : `ITEM_MODELS[forme].w`) ; `boardHeightCm(p: BoardLike): number`
  - `boardClearCm(level: ShelfLevel): number` — hauteur libre lue dans le modèle de l'étagère (attendu : 0 → 56, 1 → 57, 2 → 50 cm)
  - `dropOnShelf(layout, shelfId, level, xCm, item: BoardLike): ShelfDrop` ; `ShelfDrop` gagne `reason: 'too-high'`
  - `moveToBoard(layout, id, shelfId, level, order): Layout | null` — carte rangée, petit objet de tablette ou petit objet du dessus (il perd `x`/`z`, gagne `level`/`order`) ; une carte `posed` devient `stored` (même slug, shape, box, caseColor) ; refusé si plein / trop haut / chaîne hi-fi
  - `moveToTop(layout, id, hostId, x, z): Layout | null` — petit objet de tablette vers le dessus (`canPutOnTop`) ; **carte refusée** (null) jusqu'à la partie 4

- [ ] **Step 1: Write the failing tests** (`board-mixed.test.ts`) :
  - CD (14) + lampe (15) sur la tablette 1 : `boardUsedCm` = 30 ; `shelfLayoutIn` place la lampe à `x0Cm = 15`.
  - `boardClearCm(0) === 56`, `(1) === 57`, `(2) === 50`.
  - `dropOnShelf` d'un objet qui dépasse 74 cm → `shelf-full` ; d'un objet plus haut que `boardClearCm` → `too-high`.
  - Tablette qui débordait avant : rien n'est retiré à la lecture ; un objet déjà dessus peut changer de rang.
  - `moveToBoard` d'une lampe du dessus vers (tablette 1, rang 0) : `level: 1, order: 0`, plus de `x`/`z`, voisins décalés.
  - `moveToBoard` d'une chaîne hi-fi : null.
  - `moveToTop` d'un CD rangé : null ; d'une lampe de tablette vers `{x: 0, z: 0}` du dessus : acceptée, la tablette se recompacte.
  - Étagères liées A et B : `moveToBoard` d'un CD de A vers B change `shelfId` ; `removeFurniture(A)` n'emporte que ce qui reste sur A.
  - `carriedPlacementOf` d'une lampe de tablette renvoie une pose sur la planche (`y = boardTopCm(level)`) ; `isLamp` reste vrai.
- [ ] **Step 2: Run** `npm run test:famille -- scene-piece` — Expected: FAIL.
- [ ] **Step 3: Implement** les signatures ci-dessus ; `storeCard`/`moveStored` restent et passent par les nouvelles règles.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece scene-lumiere` et `npx tsc --noEmit` — Expected: PASS (hors échec connu).
- [ ] **Step 5: Commit** `feat(bibliotheque): tablettes mixtes cartes + petits objets`.

### Task 3.2: Vue Modifier d'une étagère (meuble entier, zoom, glissé entre tablettes)

**Files:**
- Create: `src/content/arrange/ArrangeShelf.tsx` (niveaux, navigation, glissé)
- Create: `src/content/arrange/use-board-drag.ts` (place d'insertion verte/rouge, bord d'écran)
- Modify: `src/content/furniture-zoom.tsx` (exporter `garnishOf` ; dessiner les petits objets de tablette), `src/content/shelf-board-zoom.tsx` (dessiner les petits objets de tablette ; props optionnelles de glissé), `src/content/arrange/ArrangeView.tsx` (réutilisée pour le niveau « dessus » d'une étagère), `src/content/LibraryPanel.tsx` (✋ sur une étagère → `ArrangeShelf`)
- Modify: `src/core/whats-new/entries.ts` → fiche `bibliotheque-v34`
- Test: `tests/content/arrange-shelf.test.tsx` (ajouter à `scene-piece`)

**Interfaces:**
- Consumes: Tâche 3.1 ; `ArrangeView` (partie 2, props `layout room hostId mode onMove onClose sceneView imageOf`) ; `ShelfBoardZoom` (`shelfIds level room cards imageOf onCard onLevel stacked`) ; `zoomIdsOf`/`shelfGroupOf` pour les étagères liées ; `useArrangeView` (historique).
- Produces:
  - `type ArrangeLevel = 'whole' | 'top' | ShelfLevel` — ordre vertical : `'top'`, 0, 1, 2
  - `<ArrangeShelf layout room shelfIds level onLevel onBoard onTop onMove onClose sceneView imageOf />` avec `onBoard(id: string, shelfId: string, level: ShelfLevel, order: number): Promise<unknown> | void` (LibraryPanel : `editLayout((l) => moveToBoard(l, …))`) et `onTop(id, hostId, x, z)` (LibraryPanel : `editLayout((l) => moveToTop(l, …))`)
  - Constantes `EDGE_PX = 48`, `EDGE_MS = 600`

- [ ] **Step 1: Write the failing tests** :
  - ✋ sur une étagère ouvre `[data-arrange-shelf]` au niveau `whole` : le meuble entier de face, deux étagères liées côte à côte.
  - Toucher une tablette (ou une carte) au niveau `whole` → niveau de cette tablette ; ▲ depuis la tablette 0 → `top` (vue plongeante, `[data-arrange-view]`) ; ▼ depuis `top` → tablette 0.
  - Balayer verticalement ≥ `SWIPE_PX` dans le vide en zoom → tablette voisine ; balayer sur une carte la saisit (pas de changement de tablette).
  - En zoom, glisser un CD entre deux objets → `[data-insert]` `data-ok="true"` ; lâcher → `onBoard` une fois avec le rang visé ; tablette pleine → `data-ok="false"`, lâcher → rien, retour.
  - Tenir une carte à moins de `EDGE_PX` du bord bas pendant `EDGE_MS` → la vue passe à la tablette suivante, la carte reste tenue ; la lâcher → `onBoard` sur cette tablette. Quitter le bord avant `EDGE_MS` → pas de changement.
  - Au niveau `whole`, lâcher une carte sur une autre tablette → `onBoard` avec cette tablette.
  - Lâcher une carte sur le dessus (niveau `top` ou bord haut) → refusé (rouge), rien n'est appelé.
  - Retour Android : en zoom → retour au niveau `whole` ; au niveau `whole` → fermeture.
  - Petits objets de tablette dessinés aussi dans le zoom d'étagère hors Aménager (`[data-board-small]`).
  - Toucher une carte sans glisser en zoom : rien pour l'instant (la bulle arrive en partie 5).
- [ ] **Step 2: Run** `npx vitest run tests/content/arrange-shelf.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** : le rendu de face reprend `garnishOf` / `ShelfBoardZoom` (mêmes dessins que le zoom connu) ; le niveau
  `top` réutilise `ArrangeView` sur l'étagère ; pendant un glissé, seule la carte tenue et la place d'insertion bougent ; la
  validation se fait sur le plan avec les déplacements en attente appliqués (comme `use-top-drag`). Fiche `bibliotheque-v34`.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece` + `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Capture** (banc d'essai, comme la partie 2) : meuble entier + une tablette zoomée avec une carte en cours de glissé, montrée à l'utilisateur.
- [ ] **Step 6: Commit** `feat(bibliotheque): vue Modifier d'une étagère entière (zoom par tablette)`, puis PR, fusion, pré-prod.

---

## Partie 4 — Cartes posées sur un plateau + ajout ＋ (branche `feat/cartes-posees`)

### Task 4.1: Poses trépied / à plat + stockage v10

**Files:**
- Modify: `src/core/library/library-types.ts` (`Posed` : `pose?: 'stand' | 'flat'`, absent = trépied ; `Stored` et `Posed` : `cover?: string`, utilisé en partie 6 ; `version: 10`)
- Modify: `src/core/library/library-book.ts` (`posedSchema`, schéma `stored`, `z.literal(10)`, `migrateV9` = montée de version seule, chaîne `migrate`, état initial)
- Modify: `src/core/library/surface.ts` (`topSize` d'une carte selon la pose), `src/core/library/item-models.ts` (pose à plat : boîtier couché, couverture vers le haut ; trépied : le présentoir de PR #309 sous le nom de trépied), `src/core/library/carried-items.ts` (`posedPlacement` selon la pose)
- Modify: `src/core/library/room-grid.ts` (`moveToTop` accepte une carte : `stored` → `posed` pose trépied ; `poseCard`, `setPose`)
- Test: `tests/core/library/library-migration-v10.test.ts` (ajouter à `scene-piece`), `tests/core/library/posed-cards.test.ts` (idem)

**Interfaces:**
- Produces:
  - `type Pose = 'stand' | 'flat'` ; `poseOf(p: Posed): Pose`
  - `topSize({ shape, box, pose })` : trépied → `storedModel(shape, box).w × POSED_DEPTH_CM` ; à plat → `storedModel.w × storedModel.h`
  - `poseCard(layout, hostId, shape, slug, id, x, z, pose = 'stand'): Layout | null` (slug déjà posé ou place prise → null)
  - `setPose(layout, id, pose): Layout | null` (ne tient plus à sa place → null)
  - `migrateV9(raw)` : v9 → v10, rien d'autre ne change

- [ ] **Step 1: Write the failing tests** : un état v9 migre à l'identique avec `version: 10` et reste idempotent ; `topSize` d'un
  CD à plat = `{ w: 14, d: 12.5 }` ; `setPose` d'un DVD vers `flat` contre un voisin → null, plan inchangé ; `moveToTop` d'un CD
  rangé → `posed` trépied au même slug ; `moveToBoard` d'un `posed` → `stored` ; `cover` (texte non vide, `https:`) relu, une
  valeur invalide est écartée sans perdre l'objet.
- [ ] **Step 2: Run** `npm run test:famille -- scene-piece` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): cartes posées sur trépied ou à plat (stockage v10)`.

### Task 4.2: Cartes posées dans la pièce et dans les vues

**Files:**
- Modify: `src/content/RoomView.tsx:524` (`carried` dessine les `posed`), `src/content/LibraryPanel.tsx:976-977` (« meuble non vide » compte les `posed`), `src/content/placement.ts:79` (`hostId` d'un `posed`), `src/content/furniture-drag.ts` (refus d'un `posed` avec `reason`), `src/content/arrange/ArrangeView.tsx:125` (`contentOf` : image d'un `posed`), `src/content/furniture-zoom.tsx` (`garnishOf` : `posed`)
- Test: `tests/content/room-carried-3d.test.tsx`, `tests/content/arrange-view.test.tsx`, `tests/content/furniture-drag.test.ts`

- [ ] **Step 1: Write the failing tests** : un `posed` CD trépied et un `posed` DVD à plat sont dessinés dans la pièce
  (`[data-carried]`), dans la vue Modifier et dans le zoom du bureau, avec leur pochette ; supprimer le bureau demande confirmation
  quand il ne porte qu'une carte posée ; une carte posée jouée sur la chaîne disparaît de sa place pendant la lecture.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece scene-lumiere` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): cartes posées dessinées partout`.

### Task 4.3: Ajout ＋, réglette 🃏, carte en attente

**Files:**
- Create: `src/content/arrange/CardStrip.tsx` (réglette défilante, même source que `CardPickerDialog.tsx` : cartes pas encore dans la pièce)
- Modify: `src/content/arrange/ArrangeView.tsx` et `ArrangeShelf.tsx` (`mode: 'move' | 'add'` ; carte en attente à halo doré ; ✓ pose, ✕ annule)
- Modify: `src/content/LibraryPanel.tsx` (bulle : ＋ « Ajouter une carte ici » pour bureau et étagère) et `src/content/build-drawer.tsx` (« Ajouter une carte » : cible « meuble », puis vue ＋ avec la carte en attente)
- Modify: `src/core/whats-new/entries.ts` → fiche `bibliotheque-v35` (poses + ajout à l'endroit exact)
- Test: `tests/content/arrange-add.test.tsx` (ajouter à `scene-piece`)

**Interfaces:**
- Produces: `onAdd(card: { slug: string; shape: ShelfShape }, at: { hostId: string; x: number; z: number } | { shelfId: string; level: ShelfLevel; order: number }): Promise<unknown> | void` — LibraryPanel : `editLayout((l) => poseCard(…) / storeCard(…))`.

- [ ] **Step 1: Write the failing tests** : ＋ ouvre la vue avec `[data-card-strip]` ; toucher une carte → `[data-pending]` à
  `firstFreeTopSpot` (bureau) ou `firstFreeBoard` (étagère) ; toucher une autre carte remplace l'attente ; glisser puis ✓ → `onAdd`
  une fois au bon endroit ; ✕ visible seulement avec une carte en attente, ✕ → rien ; une carte déjà dans la pièce n'est pas dans
  la réglette ; tiroir « Ajouter une carte » → choix du meuble → vue ＋ avec la carte en attente.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**, fiche `bibliotheque-v35`.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece` + `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Capture, commit** `feat(bibliotheque): ajout d'une carte à l'endroit exact`, **PR, fusion, pré-prod.**

---

## Partie 5 — Bulle d'une carte dans la vue Modifier (branche `feat/bulle-carte-modifier`)

### Task 5.1: Changements d'une carte (cœur)

**Files:**
- Modify: `src/core/library/room-grid.ts`
- Test: `tests/core/library/card-edit.test.ts` (ajouter à `scene-piece`)

**Interfaces:**
- Produces:
  - `setDisplayOf(layout, id, display: StoredDisplay): Layout | null` (carte rangée ; `'back'` seulement pour un jeu ; ne tient plus → null)
  - `setShapeOf(layout, id, shape: ShelfShape): Layout | null` (carte rangée ou posée ; ne tient plus → null ; efface `cover`, `box`, `caseColor` ; présentation invalide pour le nouveau format → défaut du format)
  - `unplaceCard` existant pour 🗑

- [ ] **Step 1: Write the failing tests** : CD → DVD sur une tablette pleine → null, plan inchangé ; CD → livre sur une tablette
  qui a la place → `shape: 'book'`, présentation par défaut (tranche) ; un jeu `display: 'back'` passé en CD → `'cover'` ; une carte
  avec `cover` changée de format → `cover` effacé ; carte posée à plat changée en livre qui chevauche un voisin → null.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): présentation et format d'une carte posée`.

### Task 5.2: Bulle dans la vue

**Files:**
- Create: `src/content/arrange/CardBubble.tsx`
- Modify: `src/content/arrange/use-top-drag.ts`, `use-board-drag.ts` (toucher < `SLOP_PX` sur une carte → `onTapCard(id)` ; sur un petit objet → rien), `ArrangeView.tsx`, `ArrangeShelf.tsx`, `src/content/LibraryPanel.tsx` (réutiliser `DisplayButtons` :1581 ; ⓘ ouvre la fiche comme `onCard`)
- Modify: `src/core/whats-new/entries.ts` → fiche `bibliotheque-v36`
- Test: `tests/content/card-bubble.test.tsx` (ajouter à `scene-piece`)

- [ ] **Step 1: Write the failing tests** : toucher une carte sans glisser ouvre `[data-card-bubble]` ; sur une tablette :
  « Présenter de face / sur la tranche / de dos » (jeu) ; sur un plateau : « Sur un trépied » / « À plat » ; quatre boutons de format
  (« CD », « DVD », « Jeu vidéo », « Livre » en `aria-label`, glyphes à l'écran), celui du format actuel pressé ; un changement refusé
  affiche « Plus de place sur cette tablette. » et ne change rien ; ⓘ ouvre la fiche ; 🗑 retire la carte ; glisser une carte ne
  l'ouvre pas ; toucher un petit objet n'ouvre rien ; chaque changement accepté est enregistré tout de suite (intention, pas instantané).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**, fiche `bibliotheque-v36`.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece` + `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Capture, commit** `feat(bibliotheque): bulle d'une carte dans la vue Modifier`, **PR, fusion, pré-prod.**

---

## Partie 6 — Versions de pochette (branche `feat/versions-pochette`)

### Task 6.1: Sources de versions

**Files:**
- Modify: `src/core/spotify/spotify-api.ts` : `findCovers(title: string, performer?: string, limit = 8): Promise<string[]>` (recherche d'albums, `images[0].url` de chaque résultat, schéma zod comme `findCover`)
- Modify: `relay/src/deezer.ts` + `relay/src/index.ts` : route `GET /deezer-covers?title&artist` → `{ covers: string[] }` (recherche d'album Deezer, `cover_xl`), entrée dans `LIMITS`, cache 30 jours
- Modify: `relay/src/tmdb.ts` : ajouter `^/movie/\d+/images$` à `PATHS` ; `src/core/screen/tmdb-api.ts` : `posterVersions(query: string): Promise<string[]>` (recherche du film puis ses affiches, langues `fr,en,null`)
- Create: `src/content/cover-versions.ts` : `coverVersions(card: { slug: string; title: string; performer?: string }, shape: ShelfShape): Promise<string[]>` — CD : `findCovers` si Spotify lié, sinon ou si vide → Deezer ; DVD : `posterVersions` ; jeu : versions TheGamesDB du service de boîtes (`boxartUrl`) ; livre : couvertures des candidats d'`BookService` ; toute erreur → `[]`
- Test: `tests/relay/deezer-covers.test.ts` (famille `relais`), `tests/relay/tmdb.test.ts`, `tests/content/cover-versions.test.ts` (famille `fiche`)

- [ ] **Step 1: Write the failing tests** : Spotify renvoie 3 pochettes → Deezer n'est pas appelé ; Spotify vide ou non lié →
  Deezer appelé, ses `cover_xl` renvoyées ; relais en erreur → `[]` ; DVD : affiches TMDB dans l'ordre fr, en, sans langue ;
  relais TMDB : `/movie/603/images` accepté, `/movie/603/videos` toujours refusé ; route Deezer : paramètres manquants → 400, cache
  posé.
- [ ] **Step 2: Run** `npm run test:famille -- relais fiche` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm run test:famille -- relais fiche` + `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(pochettes): versions de pochette CD, DVD, jeu, livre`.
- [ ] **Step 6: Redéploiement du relais** — action extérieure : le contrôleur demande l'accord de l'utilisateur, puis redéploie comme d'habitude.

### Task 6.2: Choisir une version dans la bulle

**Files:**
- Modify: `src/content/arrange/CardBubble.tsx` (bouton « Choisir la pochette », grisé sans version ; réglette de vignettes ; « Pochette d'origine »)
- Modify: `src/core/library/room-grid.ts` : `setCoverOf(layout, id, cover: string | null): Layout | null`
- Modify: résolution de l'image par objet — `imageOfPlaced(p) = p.cover ?? imageOf(p.slug)` utilisée dans `RoomView`, `garnishOf`, `ShelfBoardZoom` :142, `ArrangeView.contentOf`
- Modify: `src/core/whats-new/entries.ts` → fiche `bibliotheque-v37`
- Test: `tests/content/card-bubble.test.tsx`, `tests/content/room-carried-3d.test.tsx`

- Ajout (décision utilisateur 2026-10-18) : bouton **🔄 « Changer de carte »** dans la même bulle, réglette `CardStrip` (partie 4) ; `replaceCard(layout, id, slug, shape?): Layout | null` dans room-grid.ts — garde id, place, présentation/pose, efface `cover`, refuse (null) si le slug est déjà dans la pièce ou si la nouvelle carte ne tient pas ; tests : remplacement à la même place, refus avec message.
- [ ] **Step 1: Write the failing tests** : choisir une version enregistre `cover` sur l'objet et la pièce la dessine ; la fiche
  de la carte et la Collection gardent leur image ; « Pochette d'origine » efface `cover` ; sans version le bouton est grisé ;
  pendant la recherche, un indicateur, puis la réglette.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**, fiche `bibliotheque-v37`.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece fiche` + `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Capture, commit** `feat(bibliotheque): choisir la pochette d'une carte posée`, **PR, fusion, pré-prod.**

---

## Partie 7 — Zoom de la chaîne hi-fi (branche `feat/zoom-chaine`)

Inchangée : reprendre les tâches 5.1 et 5.2 du plan précédent (`2026-10-17-disposition-objets-meuble.md`, « Partie 5 »), avec
deux ajustements : la fiche WikiHow devient `bibliotheque-v38`, et l'image de la pochette passe par `imageOfPlaced` (partie 6).
