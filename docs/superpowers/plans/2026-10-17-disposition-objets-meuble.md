# Disposition des objets d'un meuble + zoom de la chaîne — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Choisir soi-même où va chaque objet posé sur un bureau ou une étagère (vue Modifier en 3/4 plongeante), poser une carte à
l'endroit exact, et voir la chaîne hi-fi en grand.

**Architecture:** Le cœur (`src/core/library`) passe des emplacements entiers (`slot` 0..3) à des positions en cm sur le plateau du
porteur (`x`, `z`), avec un contrôle de chevauchement par empreintes au sol ; la migration v9 garde les positions dessinées à
l'identique. La projection 3D (`furniture-render3d.ts`) reçoit une caméra en paramètre : la pièce garde la caméra de face, la vue
Modifier et le zoom de la chaîne utilisent une caméra plongeante sur les mêmes modèles. L'interface (`src/content`) ajoute une couche
plein écran « vue Modifier » ouverte depuis la bulle d'actions, et un zoom de la chaîne qui remplace `HifiBubble`.

**Tech Stack:** TypeScript, React (contenu de l'extension WXT + WebView Android), zod (schéma du stockage), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-16-disposition-objets-meuble-design.md` (validée telle quelle le 2026-10-17).

## Global Constraints

- **Version de stockage : 9** (et non 8 comme écrit dans la spec : `main` a pris la v8 entre-temps, PR boîtes de jeux). `migrateV8`
  convertit v8 → v9 ; sauvegarde brute avant migration comme pour v7 (même mécanisme dans `library-repo.ts`).
- Positions visibles **identiques** après migration (anti-objectif) : aucun objet ne bouge à l'écran.
- Porteurs : bureau (`desk`, plateau 120 × 60 cm) et dessus d'étagère (`shelf`, 80 × 30 cm) ; tablettes d'étagère en ordre seulement.
- La chaîne hi-fi reste réservée au bureau. Empreinte de la chaîne = poste 56 × 26 cm **+ 14,5 cm devant** (`SLEEVE_MAX_D`), même largeur.
- L'ordinateur compte pour les chevauchements par son **empreinte réelle** (pièces de l'écran), il n'est pas déplaçable.
- Tablette pleine : largeurs + 1 cm entre deux objets ≤ 74 cm (`SHELF_INNER_CM`) ; objet trop haut pour sa tablette refusé ; débordement
  ancien toléré.
- Glyphes seulement, jamais de texte à la place (✋ ＋ 🃏 ✓ ✕ ⏯ ⏏ ⓘ) ; `aria-label` et `title` en français sur chaque bouton.
- Mêmes modèles 3D dans la pièce, la vue Modifier et le zoom : seule la caméra change.
- Le glissé suit le doigt (Android d'abord) : pendant le glissé, seul l'objet tenu est redessiné (transform), l'état n'est écrit qu'au lâcher.
- Visuels par Opus, avec la trace « Fable n'est pas passé » dans la description de PR (règle du projet).
- Chaque partie = une branche + une PR fusionnée + `npm run preprod` ; WikiHow : une **nouvelle** fiche (nouvel id) dans la PR de
  chaque fonctionnalité visible (parties 2 à 5), avec les rubriques « À quoi ça sert / D'où viennent les données / Comment ça marche /
  Limites ».
- Tests : seulement les familles touchées — `npm run test:famille -- scene-piece` (et `scene-commun` quand `depth-order` ou
  `furniture-render3d` change). Un nouveau fichier de test entre dans une famille existante de `tests/familles.ts`.

## Review Focus

1. **Chaîne + ordinateur sur le même bureau** : aujourd'hui impossible (emplacements 1-2 bloqués) ; avec les cm, ça tient tout juste
   (chaîne 40,5 cm de profondeur devant un écran dont l'empreinte commence à z = 41). Attendu : possible si la place existe, jamais de
   chevauchement — test dans la Tâche 1.1.
2. **Bureau ou étagère tourné à 45° / de profil / de dos** : la position en cm suit le meuble ; dans la vue Modifier le plateau est
   toujours montré de face. Attendu : un objet lâché à gauche dans la vue reste à gauche du plateau dans la pièce (repère du meuble) —
   test dans la Tâche 2.2.
3. **Objet lâché hors du plateau ou à cheval sur le bord** : rouge, retour à la place — test dans la Tâche 2.2.
4. **Carte au poste hi-fi posée sur un plateau** : une carte posée (nouvelle forme) peut aller au poste et sa place se vide pendant
   la lecture comme une carte rangée — test dans la Tâche 4.1.
5. **Bibliothèques liées** : passer un objet d'une étagère liée à l'autre change son porteur ; supprimer l'une n'emporte que ses objets —
   test dans la Tâche 3.1.

---

## Partie 1 — Données : positions en cm, migration v9, chevauchements (branche `feat/disposition-donnees`)

### Task 1.1: Plateau en cm (`surface.ts`)

**Files:**
- Create: `src/core/library/surface.ts`
- Test: `tests/core/library/surface.test.ts` (famille `scene-piece`)

**Interfaces:**
- Produces:
  - `type TopRect = { x: number; z: number; w: number; d: number }` (cm, repère du meuble, z = 0 au bord avant, z croît vers le fond)
  - `const HOST_TOP: Record<HostKind, { w: number; d: number }>` = `{ desk: { w: 120, d: 60 }, shelf: { w: 80, d: 30 } }` (lu dans `FURNITURE_MODELS`)
  - `const SLEEVE_ZONE_CM = 14.5` (exporter `SLEEVE_MAX_D` de `hifi.ts` sous ce nom)
  - `const POSED_DEPTH_CM = 8` (profondeur du chevalet d'une carte posée)
  - `type TopThing = { item: SmallItem } | { shape: ShelfShape; box?: BoxFormat }`
  - `topSize(t: TopThing): { w: number; d: number }` — petit objet : `ITEM_MODELS[shape].w/d` ; chaîne : `{ w: 56, d: 26 + SLEEVE_ZONE_CM }` ; carte : largeur du boîtier × `POSED_DEPTH_CM`
  - `topRectsOf(layout: Layout, hostId: string, ignoreId?: string): TopRect[]` — empreintes déjà prises : petits objets et cartes posés du porteur, plus l'ordinateur (bornes x/z de `placementBounds(computerPlacement(id))`)
  - `canPutOnTop(layout, hostId, thing: TopThing, x: number, z: number, ignoreId?: string): boolean` — dans le plateau (bords compris) et sans chevauchement (contact toléré : `a.x + a.w <= b.x` sépare)
  - `firstFreeTopSpot(layout, hostId, thing, ignoreId?): { x: number; z: number } | null` — z de 0 vers le fond, x de 0 vers la droite, pas de `TOP_STEP_CM = 2`, puis dernier essai collé au bord droit / fond ; null si le porteur refuse (`canHostSmall`) ou si rien ne tient

- [ ] **Step 1: Write the failing tests** — `surface.test.ts` :
  - `topSize({ item: 'hifi' })` vaut `{ w: 56, d: 40.5 }` ; `topSize({ item: 'alarm' })` vaut `{ w: 18, d: 7 }` ; `topSize({ shape: 'cd' })` vaut `{ w: 14, d: 8 }`.
  - Bureau vide : `firstFreeTopSpot` d'un réveil = `{ x: 0, z: 0 }`.
  - Un réveil déjà à `{ x: 0, z: 0 }` : le second va à `{ x: 18, z: 0 }` (premier pas libre, contact toléré).
  - `canPutOnTop` refuse `x = 120 - 17` pour un réveil (dépasse de 1 cm) et accepte `x = 102`.
  - Étagère : `firstFreeTopSpot(…, { item: 'hifi' })` = null.
  - Bureau avec ordinateur : la chaîne tient à `{ x: 0, z: 0 }` (empreinte 0..40,5 ≤ 41) et `canPutOnTop` la refuse à `z: 1`.
- [ ] **Step 2: Run** `npx vitest run tests/core/library/surface.test.ts` — Expected: FAIL (module introuvable).
- [ ] **Step 3: Implement** `surface.ts` avec les signatures ci-dessus. `topRectsOf` lit déjà les deux nouvelles formes de la Tâche 1.2 :
  `small` avec `x`/`z` et `posed` ; il ignore les objets sur tablette.
- [ ] **Step 4: Run** le même test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): plateau des meubles en cm (empreintes, place libre)`.

### Task 1.2: Types, schéma v9 et migration

**Files:**
- Modify: `src/core/library/library-types.ts:44-51` (union `Placed`), `:117` (`version: 9`)
- Modify: `src/core/library/library-book.ts` (`smallSchema`, nouveau `posedSchema`, `cleanEntries`, `migrateV8`, `migrate`, `createInitialState`, `z.literal(9)`)
- Modify: `src/core/library/library-repo.ts` (sauvegarde brute avant v9, même mécanisme que v7)
- Test: `tests/core/library/library-migration-v9.test.ts` (famille `scene-piece`) ; adapter `library-migration-v8.test.ts` (version attendue 9 après lecture)

**Interfaces:**
- Consumes: `canPutOnTop`, `firstFreeTopSpot`, `SLEEVE_ZONE_CM` (Tâche 1.1).
- Produces (union `Placed`) :
  - petit objet sur plateau : `{ id; kind: 'small'; item: SmallItem; hostId: string; x: number; z: number; lit?; city? }`
  - petit objet sur tablette : `{ id; kind: 'small'; item: SmallItem; hostId: string; level: ShelfLevel; order: number; lit?; city? }` (`hostId` = l'étagère)
  - carte posée sur plateau : `{ id; kind: 'posed'; shape: ShelfShape; hostId: string; x: number; z: number; box?: BoxFormat; caseColor?: string; slug: string }`
  - helpers dans `library-types.ts` : `type SmallOnTop`, `type SmallOnBoard`, `type SmallPlaced = SmallOnTop | SmallOnBoard`, `type Posed`, `isOnBoard(p: SmallPlaced): p is SmallOnBoard` (`'level' in p`) ; le `SmallPlaced` local de `room-grid.ts` est remplacé par celui-ci
  - `export function migrateV8(raw: unknown): unknown` (v8 → v9)
  - `export function slotToTop(hostKind: HostKind, item: SmallItem, slot: number): { x: number; z: number }`

- [ ] **Step 1: Write the failing tests** — `library-migration-v9.test.ts` :
  - `slotToTop('desk', 'alarm', 0)` = `{ x: 6, z: 26.5 }` (centre de l'emplacement 15 − 9 ; mi-profondeur 30 − 3,5).
  - `slotToTop('desk', 'hifi', 2)` : `x = 60 + 30 − 28 = 62`, `z = 30 − 13 − 14.5 = 2.5`.
  - Pour chaque `item` de `SMALL_ITEMS` et chaque emplacement valide de chaque porteur : `smallPlacement` après migration (Tâche 1.3)
    donne **exactement** les mêmes `x, y, z` que l'ancienne formule
    `x = host.w * (slot + span / 2) / n − m.w / 2, y = host.h, z = host.d / 2 − m.d / 2` (recopiée dans le test comme référence figée).
  - Un état v8 avec 4 petits objets sur un bureau migre en v9 sans perdre d'objet ; `parseLibraryState(once)` est idempotent.
  - Deux petits objets qui se chevauchent après lecture : le second est replacé à `firstFreeTopSpot` ; s'il ne tient nulle part, il est retiré.
  - Une carte `posed` et une carte `stored` avec le même `slug` : la seconde dans l'ordre du tableau est écartée.
  - Un `small` avec `level` sur un bureau (pas une étagère) est écarté.
  - `createInitialState().version` vaut 9.
- [ ] **Step 2: Run** `npx vitest run tests/core/library/library-migration-v9.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** : `migrateV8` convertit chaque `small` à `slot` entier via `slotToTop` (un `slot` abîmé est laissé tel quel :
  le schéma refusera la pièce comme avant) ; `smallSchema` devient une union (plateau `x`/`z` nombres finis ≥ 0 / tablette
  `level`/`order`) ; `cleanEntries` remplace la clé `hostId:small:slot` et le blocage de l'ordinateur par `canPutOnTop` sur ce qui a
  déjà été gardé (ordre du tableau), avec repli `firstFreeTopSpot` puis retrait ; les `small` sur tablette et les `stored` partagent la
  clé `shelfId:level:order` ; `posed` exige un porteur `desk`/`shelf` et compte dans les slugs. `compactShelves` recompacte les rangs
  communs aux deux genres d'objets de tablette (voir Tâche 3.1 pour `boardItems` ; ici, compacter `small` sur tablette avec les `stored`).
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece` — Expected: PASS (v6, v7, v8, v9 compris).
- [ ] **Step 5: Commit** `feat(bibliotheque): stockage v9, objets posés en cm`.

### Task 1.3: Brancher les cm partout où l'on lisait `slot`

**Files:**
- Modify: `src/core/library/room-grid.ts`, bloc « petits objets » (`SURFACE_SLOTS` … `surfaceSlotRectOn`, vers les lignes 411-495) — supprimer `SURFACE_SLOTS`, `COMPUTER_SLOTS`, `blockedSlots`, `usedSlots`, `smallSpan`, `firstFreeSurfaceSlot`, `surfaceSlotRectOn` ; garder `HostKind = 'desk' | 'shelf'`, `canHostSmall`
- Modify: `src/core/library/carried-items.ts:61-65` (`smallPlacement`), `:392-399` (`carriedPlacementOf` : `posed`)
- Modify: `src/core/library/hifi.ts` (exporter la zone ; `sleeveRest` inchangé, il reçoit la pose du corps)
- Modify: `src/core/library/opened-item.ts:12` (`openingOf` : `posed` comme `stored`) et `placedSlugs` (`posed`)
- Modify: `src/content/RoomView.tsx:152`, `src/core/library/light/occluders.ts:66`, `src/content/furniture-drag.ts:40-55`, `src/content/placement.ts:59`
- Test: `tests/core/library/carried-items.test.ts`, `tests/core/library/library-book.test.ts`, `tests/content/furniture-drag.test.ts` (adapter), `tests/core/library/hifi.test.ts`

**Interfaces:**
- Consumes: Tâches 1.1 et 1.2.
- Produces:
  - `smallPlacement(id: string, item: SmallItem, hostKind: HostKind, x: number, z: number): ItemPlacement` — chaîne : `z + SLEEVE_ZONE_CM` pour le corps du poste ; autres : `x`, `z` tels quels ; `y = host.h`
  - `placeSmall(layout, hostId, item, id): Layout | null` et `moveSmall(layout, id, hostId): Layout | null` — même porteur : garde `x`/`z` ; autre porteur : `firstFreeTopSpot`
  - `hasFreeHost(layout): boolean` via `firstFreeTopSpot` d'un objet d'1 emplacement (réveil)
  - `topRectOn(host: PxRect, kind: HostKind, angle: Angle, r: TopRect): PxRect` — remplace `surfaceSlotRectOn` pour la visée du glissé dans la pièce (rectangle de tout le plateau)
  - Ordre de dessin : les objets d'un même plateau se dessinent du fond vers l'avant (`z` décroissant) — dans `RoomView.tsx` et `furniture-zoom.tsx`, là où les placements portés sont triés (`placementDepth`)

- [ ] **Step 1: Write the failing tests** :
  - `carried-items.test.ts` : `smallPlacement('a', 'hifi', 'desk', 2, 2.5)` a `z = 17` ; `carriedPlacementOf` d'un `posed` renvoie une pose de face sur le plateau à `y = 75`.
  - `hifi.test.ts` : avec la chaîne à `x: 62, z: 2.5`, `sleeveRest` donne les mêmes coins qu'avant (chaîne à l'ancien emplacement 2).
  - `library-book.test.ts` : `moveSmall` vers un autre bureau prend `firstFreeTopSpot` ; vers le même garde `x`/`z`.
  - `opened-item.test.ts` : `openingOf` d'un `posed` CD = `'jewel-cd'`.
  - `room-depth.test.tsx` : deux réveils sur un bureau, celui à `z = 0` est dessiné après celui à `z = 30`.
- [ ] **Step 2: Run** `npm run test:famille -- scene-piece scene-commun scene-lumiere` — Expected: FAIL (signatures).
- [ ] **Step 3: Implement** les signatures ci-dessus ; `furniture-drag.ts` : la cible d'un petit objet est tout le plateau d'un porteur
  pour lequel `firstFreeTopSpot` n'est pas null.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece scene-commun scene-lumiere` puis `npx tsc --noEmit` — Expected: PASS, 0 erreur.
- [ ] **Step 5: Commit** `refactor(bibliotheque): plus d'emplacements entiers, positions en cm`.
- [ ] **Step 6: PR + fusion + `npm run preprod`** ; capture de la pièce avant/après sur le S26 : rien n'a bougé.

---

## Partie 2 — Caméra plongeante + vue Modifier d'un plateau (branche `feat/vue-modifier-plateau`)

### Task 2.1: Caméra en paramètre de la projection

**Files:**
- Modify: `src/core/library/furniture-render3d.ts:64-69` (constantes), `:166-182` (`layoutOf`), `projectOf`, `renderModel` et `Model3DArt`
- Modify: `src/core/library/carried-items.ts:407-429` (`hostNativePx`, `hostPointPx` : cache par caméra)
- Test: `tests/core/library/furniture-render3d.test.ts` (famille `scene-commun`)

**Interfaces:**
- Produces:
  - `type Camera = { pxPerCmX: number; pxPerCmY: number; depthPxPerCm: number }`
  - `const FACE_CAMERA: Camera` = les constantes actuelles (`PX_PER_CM_X`, `PX_PER_CM_Y`, `DEPTH_PX_PER_CM`)
  - `const PLUNGE_CAMERA: Camera` = `{ pxPerCmX: PX_PER_CM_X, pxPerCmY: PX_PER_CM_Y * 0.55, depthPxPerCm: PX_PER_CM_Y * 0.8 }` (point de départ ; à régler à l'œil contre la maquette `docs/superpowers/maquettes/disposition-objets/index.html`)
  - `layoutOf(model, angle, cam = FACE_CAMERA)`, `projectOf(model, angle, p, cam = FACE_CAMERA)`, `hostNativePx(hostKind, angle, p, cam = FACE_CAMERA)`, prop `camera?: Camera` de `Model3DArt`

- [ ] **Step 1: Write the failing tests** : avec `FACE_CAMERA`, les instantanés existants ne bougent pas ; avec `PLUNGE_CAMERA`, le
  plateau du bureau (y = 75) projeté a une hauteur à l'écran ≥ 1,5 × celle de la caméra de face (on voit le dessus).
- [ ] **Step 2: Run** `npm run test:famille -- scene-commun` — Expected: FAIL.
- [ ] **Step 3: Implement** : la caméra traverse les fonctions de projection ; aucun appel existant ne la passe.
- [ ] **Step 4: Run** `npm run test:famille -- scene-commun scene-piece` — Expected: PASS, instantanés inchangés.
- [ ] **Step 5: Commit** `feat(rendu): caméra paramétrable, vue plongeante`.

### Task 2.2: Cœur du glissé sur un plateau (`arrange.ts`)

**Files:**
- Create: `src/core/library/arrange.ts`
- Test: `tests/core/library/arrange.test.ts` (famille `scene-piece`)

**Interfaces:**
- Consumes: `canPutOnTop`, `topSize`, `TopRect` (1.1) ; `Camera`, `PLUNGE_CAMERA` (2.1).
- Produces:
  - `type ArrangeFrame = { hostKind: HostKind; scale: number; origin: [number, number] }` — le plateau est toujours montré **de face** (angle 0) dans la vue, quel que soit l'angle du meuble dans la pièce
  - `topToScreen(f: ArrangeFrame, x: number, z: number): [number, number]` et `screenToTop(f, sx, sy): { x: number; z: number }` (inverse sur le plan `y = host.h`)
  - `type TopDrop = { ok: true; x: number; z: number } | { ok: false }`
  - `dropOnTop(layout, hostId, id, x, z): TopDrop` — `x`/`z` = coin avant gauche visé (le doigt tient l'objet par le point où il l'a saisi : l'appelant soustrait ce décalage)
  - `moveOnTop(layout, id, x, z): Layout | null` — écrit la nouvelle place ; null si `dropOnTop` refuse

- [ ] **Step 1: Write the failing tests** :
  - `screenToTop(f, ...topToScreen(f, 30, 12))` ≈ `{ x: 30, z: 12 }` (à 1e-6).
  - Réveil lâché à `x: 110` sur un bureau : refusé (dépasse) ; à `x: 102` : accepté.
  - Réveil lâché sur la lampe : refusé ; `moveOnTop` renvoie null et le plan est inchangé.
  - Bureau tourné (`angle: 2`) : un réveil déplacé à `x: 0` reste à `x: 0` dans le plan (repère du meuble, pas de l'écran).
- [ ] **Step 2: Run** `npx vitest run tests/core/library/arrange.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): glissé au cm sur un plateau (cœur)`.

### Task 2.3: Vue Modifier (plateau) + bouton ✋ dans la bulle

**Files:**
- Create: `src/content/arrange/ArrangeView.tsx` (couche plein écran, paysage, même conteneur que `OpenedItemLayer`)
- Create: `src/content/arrange/use-top-drag.ts` (pointer events, empreinte verte/rouge, retour à la place)
- Modify: `src/content/LibraryPanel.tsx:1300-1325` (bulle : bouton ✋ pour `desk` et `shelf`), état `arrangeHostId`
- Modify: `src/core/whats-new/entries.ts` → nouvelle fiche `bibliotheque-v33` (vue Modifier d'un plateau)
- Test: `tests/content/arrange-view.test.tsx` (famille `scene-piece`)

**Interfaces:**
- Consumes: `dropOnTop`, `moveOnTop`, `topToScreen`, `screenToTop` (2.2) ; `Model3DArt` avec `camera={PLUNGE_CAMERA}` (2.1) ; `editLayout` de `LibraryPanel`.
- Produces: `<ArrangeView layout room hostId mode="move" onCommit={(next: Layout) => void} onClose={() => void} />` (la partie 3 ajoute les tablettes, la partie 4 `mode="add"`).

- [ ] **Step 1: Write the failing tests** (Testing Library, pointer events simulés) :
  - Bulle d'un bureau en Aménager : bouton `aria-label="Modifier la disposition"` affichant ✋ ; absent pour une chaise.
  - Clic ✋ → `[data-arrange-view]` visible, un élément `[data-arrange-item="<id>"]` par objet du plateau, l'ordinateur marqué `data-fixed`.
  - Glisser un réveil vers une place libre puis lâcher → `onCommit` appelé une fois avec le réveil à la nouvelle place.
  - Pendant le glissé au-dessus de la lampe → `[data-footprint]` a `data-ok="false"` ; lâcher → `onCommit` non appelé, l'objet revient (`style.transform` vide).
  - Toucher sans glisser (déplacement < 4 px) → rien.
  - L'ordinateur ne se saisit pas.
  - ✓ (`aria-label="Terminer"`) ferme la vue.
- [ ] **Step 2: Run** `npx vitest run tests/content/arrange-view.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** : fond = mur et sol de la pièce (style de la pièce), meuble et objets dessinés avec `PLUNGE_CAMERA`
  au plus grand qui tient dans l'écran ; pendant le glissé, `transform: translate()` sur l'objet tenu et l'empreinte seulement ;
  `onCommit` au lâcher si `ok`. Pastille ✋ en haut à gauche, ✓ en haut à droite. Fiche WikiHow `bibliotheque-v33`.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece` — Expected: PASS.
- [ ] **Step 5: Vérifier** sur le S26 (APK pré-prod) : le glissé suit le doigt ; capture de la vue montrée à l'utilisateur.
- [ ] **Step 6: Commit, PR (trace « Fable n'est pas passé »), fusion, `npm run preprod`.**

---

## Partie 3 — Tablettes d'étagère dans la vue Modifier (branche `feat/vue-modifier-tablettes`)

### Task 3.1: Tablettes mixtes (cartes + petits objets)

**Files:**
- Modify: `src/core/library/room-grid.ts:149-320` (`boardItems`, `boardUsedCm`, `fits`, `shelfLayoutIn`, `dropOnShelf`, `firstFreeBoard`, `compactShelves`, `insertStored`)
- Modify: `src/core/library/carried-items.ts:364-374` (`storedPlacementsOf` → aussi les petits objets de tablette) et `carriedPlacementOf`
- Modify: `src/core/library/light/occluders.ts:83` (même rangement)
- Modify: `src/core/library/shelf-link.ts` si le passage d'un objet entre étagères liées passe par lui
- Test: `tests/core/library/library-book-cards.test.ts`, `tests/core/library/carried-items.test.ts`, nouveau `tests/core/library/board-mixed.test.ts` (famille `scene-piece`)

**Interfaces:**
- Produces:
  - `type BoardItem = Stored | SmallOnBoard` ; `boardItems(layout, shelfId, level, ignoreId?): BoardItem[]`
  - `boardWidthCm(p: BoardItem | StoredLike | { item: SmallItem }): number` (petit objet : `ITEM_MODELS[shape].w`) et `boardHeightCm(...)`
  - `boardClearCm(level: ShelfLevel): number` — hauteur libre lue dans le modèle (haut 56, milieu 57, bas 50 cm)
  - `dropOnShelf(layout, shelfId, level, xCm, item)` accepte un `BoardItem` ou un objet à poser ; nouveau refus `{ ok: false, reason: 'too-high' }`
  - `moveToBoard(layout, id, shelfId, level, order): Layout | null` — depuis le dessus ou une tablette, y compris d'une étagère liée (change `hostId`/`shelfId`)
  - `moveToTop(layout, id, hostId, x, z): Layout | null` — d'une tablette vers le dessus (petit objet ou carte : la carte devient `posed`)

- [ ] **Step 1: Write the failing tests** :
  - Une tablette avec un CD (14) et une lampe (15) : `boardUsedCm` = 30 ; la lampe est dessinée à `x0Cm = 15`.
  - `dropOnShelf` d'un objet de 75 cm de large refusé `shelf-full` ; d'un objet plus haut que `boardClearCm` refusé `too-high`.
  - Tablette qui débordait avant : rien n'est retiré à la lecture, un objet déjà dessus peut y changer de rang.
  - `moveToBoard` d'une lampe du dessus vers la tablette 1, rang 0 : elle passe `level: 1, order: 0`, les voisins se décalent, son `x`/`z` disparaît.
  - `moveToTop` d'un CD rangé vers le dessus : il devient `posed` au même `slug`.
  - Étagères liées A et B : `moveToBoard` d'un CD de A vers B change `shelfId` ; `removeFurniture(A)` n'emporte que ce qui reste sur A.
  - La lampe sur tablette éclaire toujours (`isLamp`) ; l'horloge sur tablette garde sa ville.
- [ ] **Step 2: Run** `npm run test:famille -- scene-piece scene-lumiere` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece scene-lumiere` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): tablettes mixtes cartes + petits objets`.

### Task 3.2: Tablettes dans la vue Modifier

**Files:**
- Modify: `src/content/arrange/ArrangeView.tsx` (étagère : dessus + 3 tablettes ; étagères liées ouvertes ensemble, comme `shelf-board-zoom.tsx`)
- Create: `src/content/arrange/use-board-drag.ts` (place verte d'insertion, rouge si plein ou trop haut, voisins resserrés)
- Modify: `src/core/whats-new/entries.ts` → nouvelle fiche `bibliotheque-v34` (tablettes, cartes et objets mélangés)
- Test: `tests/content/arrange-view.test.tsx`

**Interfaces:**
- Consumes: `dropOnShelf`, `moveToBoard`, `moveToTop` (3.1) ; `dropOnTop` (2.2).

- [ ] **Step 1: Write the failing tests** :
  - Étagère : la vue montre `[data-arrange-board="0|1|2"]` et `[data-arrange-top]`.
  - Glisser un CD entre deux objets de la tablette 1 → `[data-insert]` visible `data-ok="true"` ; lâcher → `onCommit` avec le CD au rang visé.
  - Viser une tablette pleine → `data-ok="false"` ; lâcher → pas d'appel, retour.
  - Glisser une lampe d'une tablette vers le dessus → `onCommit` avec la lampe en `x`/`z`.
  - Deux étagères liées → une seule vue, on passe un CD de l'une à l'autre.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**, fiche `bibliotheque-v34`.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece` — Expected: PASS.
- [ ] **Step 5: Vérifier sur le S26, capture, commit, PR, fusion, `npm run preprod`.**

---

## Partie 4 — Cartes posées sur un plateau + ajout ＋ avec réglette (branche `feat/ajout-carte-endroit`)

### Task 4.1: Carte posée dessinée (chevalet)

**Files:**
- Modify: `src/core/library/item-models.ts` (pièce `easel` : chevalet 8 cm de profondeur, même style que le présentoir de PR #309)
- Modify: `src/core/library/carried-items.ts` (`posedPlacement(p: Posed): ItemPlacement`, de face, penchée comme le présentoir)
- Modify: `src/core/library/hifi.ts` (`hiddenAtHome` : rien à changer si `openingOf` couvre `posed` — le vérifier par test)
- Test: `tests/core/library/carried-items.test.ts`, `tests/core/library/hifi.test.ts`, `tests/content/room-carried-3d.test.tsx`

**Interfaces:**
- Produces: `posedPlacement(p: Posed): ItemPlacement` ; `carriedPlacementOf` la renvoie pour `kind: 'posed'`.

- [ ] **Step 1: Write the failing tests** : un `posed` CD sur un bureau est dessiné (`[data-carried="<id>"]`) sur le plateau ; joué
  sur la chaîne, `hiddenAtHome` le contient et il n'est plus dessiné à sa place ; un livre posé prend `bookColor(slug)`.
- [ ] **Step 2: Run** `npm run test:famille -- scene-piece` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): cartes posées sur un bureau ou une étagère`.

### Task 4.2: Mode ajout ＋, réglette 🃏, carte en attente

**Files:**
- Modify: `src/content/arrange/ArrangeView.tsx` (`mode="add"`, carte en attente à halo doré, ✓ pose, ✕ annule)
- Create: `src/content/arrange/CardStrip.tsx` (réglette défilante ; même source que `CardPickerDialog.tsx`, cartes pas encore dans la pièce)
- Modify: `src/content/LibraryPanel.tsx` (bulle : ＋ `aria-label="Ajouter une carte ici"` pour `desk`/`shelf`) et le parcours « Ajouter une carte » du tiroir (`build-drawer.tsx`) : cible « meuble » puis vue ＋ avec la carte déjà en attente
- Modify: `src/core/library/room-grid.ts` : `poseCard(layout, hostId, shape, slug, id, x, z): Layout | null` (refusée si slug déjà posé ou place prise)
- Modify: `src/core/whats-new/entries.ts` → nouvelle fiche `bibliotheque-v35` (ajout à l'endroit exact)
- Test: `tests/content/arrange-view.test.tsx`, `tests/core/library/library-book-cards.test.ts`

**Interfaces:**
- Consumes: `firstFreeTopSpot`, `firstFreeBoard`, `dropOnTop`, `dropOnShelf`, `storeCard` (existant), `poseCard`.

- [ ] **Step 1: Write the failing tests** :
  - ＋ ouvre la vue avec `[data-card-strip]` ; toucher une carte → `[data-pending]` à `firstFreeTopSpot` (bureau) ou `firstFreeBoard` (étagère).
  - Toucher une autre carte remplace la carte en attente (un seul `[data-pending]`).
  - Glisser la carte en attente puis ✓ → `onCommit` une fois avec la carte posée là (`posed` sur plateau, `stored` sur tablette).
  - ✕ visible seulement avec une carte en attente ; ✕ → aucun `onCommit`, la carte disparaît.
  - Une carte déjà dans la pièce n'est pas dans la réglette.
  - Tiroir « Ajouter une carte » → choix d'un meuble → vue ＋ avec la carte en attente.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**, fiche `bibliotheque-v35`.
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece` — Expected: PASS.
- [ ] **Step 5: Vérifier sur le S26, capture, commit, PR, fusion, `npm run preprod`.**

---

## Partie 5 — Zoom de la chaîne hi-fi (branche `feat/zoom-chaine`)

### Task 5.1: Pochette debout + CD qui tourne

**Files:**
- Modify: `src/core/library/hifi.ts` : `sleeveStand(hifi: { x; y; z }, kind: SleeveKind): { corners: V3[]; w: number; h: number }` — pochette debout face à l'utilisateur, à droite du poste, pleine taille (`SLEEVE_CM`, sans réduction)
- Create: `src/content/hifi/HifiZoom.tsx` (caméra `PLUNGE_CAMERA` serrée sur la chaîne ; pochette debout ; CD qui tourne dans le puits si `hifiState(...).spinning`, arrêté sinon ; afficheur qui fait défiler la piste)
- Test: `tests/core/library/hifi.test.ts`, `tests/content/hifi-zoom.test.tsx` (famille `scene-piece`)

**Interfaces:**
- Consumes: `hifiState`, `sleeveKindOf`, `smallPlacement` (1.3), `PLUNGE_CAMERA` (2.1).
- Produces: `<HifiZoom view albumTitle anchor onClose onEject onInfo />` — mêmes props que `HifiBubble` plus `onInfo`.

- [ ] **Step 1: Write the failing tests** : `sleeveStand` d'un CD fait 14,2 × 12,5 cm, bas à `y = hifi.y` ; `HifiZoom` montre
  `[data-hifi-disc]` avec `data-spinning="true"` en lecture et `"false"` en pause ; boutons ⏯ (`Lecture / pause`), ⏏
  (`Éjecter le disque`), ⓘ (`Fiche de la carte`), ✕ (`Fermer`) ; l'afficheur contient le titre de la piste.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(musique): zoom de la chaîne hi-fi`.

### Task 5.2: Le zoom remplace la bulle du lecteur

**Files:**
- Modify: `src/content/LibraryPanel.tsx:298, 939, 1500-1505` (toucher la chaîne hors Aménager → `HifiZoom` ; ⓘ ouvre la fiche comme le bouton « Carte » du lecteur)
- Delete: `src/content/hifi/HifiBubble.tsx` ; déplacer les cas utiles de `tests/content/hifi-bubble.test.tsx` vers `hifi-zoom.test.tsx`
- Modify: `src/core/whats-new/entries.ts` → nouvelle fiche `bibliotheque-v36` (zoom de la chaîne)
- Test: `tests/content/hifi-zoom.test.tsx`, `tests/content/library-sims-ui.test.tsx`

- [ ] **Step 1: Write the failing tests** : hors Aménager, toucher la chaîne ouvre `[data-hifi-zoom]` et plus `[data-hifi-bubble]` ;
  ⏏ éjecte et ferme ; en Aménager, toucher la chaîne ouvre toujours la bulle d'actions.
- [ ] **Step 2: Run** `npm run test:famille -- scene-piece` — Expected: FAIL.
- [ ] **Step 3: Implement**, fiche `bibliotheque-v36` (et rien sur `bibliotheque-v4`/`v5` : les anciennes fiches ne sont pas modifiées).
- [ ] **Step 4: Run** `npm run test:famille -- scene-piece scene-commun` puis `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Vérifier sur le S26 (son, disque qui tourne, pause), capture, commit, PR, fusion, `npm run preprod`.**

---

## Après la partie 5

La partie 6 de la spec (WikiHow + Nouveautés) est répartie dans les parties 2 à 5 (règle du projet : la fiche part avec la
fonctionnalité). La production reste sur ordre humain (`npm run promouvoir`).
