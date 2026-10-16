# Ouverture d'un objet dans la scène — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dans « Ma Pièce », toucher un album / film / jeu / livre l'ouvre (boîtier qui pivote, sélecteur à gauche, disque ou couverture à droite) ; une chaîne hi-fi posée dans la pièce reçoit le disque en lecture.

**Architecture:** Logique pure dans `src/core/library/` (formes ouvrables, modèle du sélecteur, géométrie, état du poste dérivé du lecteur). Rendu dans une couche DOM (CSS 3D) au-dessus du SVG de la scène, sur le modèle de `furniture-zoom` / `use-furniture-zoom`. Les données viennent des services existants (`getMusicService`, `getPlayerSource`, `getScreenService`, `getGameService`, `getBookService`). Le poste est un nouveau petit objet `small-hifi` du modèle 3D maison.

**Tech Stack:** TypeScript, React 18 (Shadow DOM de la surcouche), vitest 5 + jsdom (`act` + `createRoot`, sans @testing-library), WXT (extension) + WebView Android.

**Spec:** `docs/superpowers/specs/2026-10-16-ouverture-objet-scene-design.md`

## Global Constraints

- Disque **centré dans son plateau, jamais décalé** ; rotation par `transform: rotate` sur un calque intérieur, reflet asymétrique + pochette pour la voir.
- Choisir une piste **ne ferme pas** le boîtier ; seul le disque vole au poste (par-dessus le boîtier, qui reste en grand et centré). Fermeture **manuelle** (✕, retour, Échap).
- Boîtier dont le disque est au poste : se ferme **vers le poste** (pochette couchée devant) ; sinon vers sa place d'origine. Place d'origine **vide** tant que l'objet est au poste. Rouvrir la pochette : même effet d'ouverture, **plateau vide** (moyeu + « Le disque est sur le poste »).
- Paysage forcé : `lockOrientation('landscape')` ; si l'écran reste en hauteur, couche tournée de 90° en CSS.
- Mouvement réduit (`reducedMotion()` de `./ghibli-sky`) : fondu 150 ms, ni vol ni pivot.
- Image : `createMediaArt(...).primary` puis `fallback`, puis `imageOfCard(slug)` ; sans image : aplat `bookColor(slug)` + titre.
- Glyphes, pas de texte, pour les boutons (ⓘ ✕ ⏯ ⏏ ⛶) ; cibles tactiles 44 px.
- Poste `small-hifi` « Chaîne hi-fi » : **sur un bureau uniquement, 2 emplacements consécutifs (60 cm)**, pochette couchée devant ; seul le **premier posé** (ordre du layout) sert.
- L'état du poste se **déduit** de `getPlayerSource().current()` (`view.card?.slug`, `view.track?.playing`) : rien de mémorisé à part.
- Visuels faits par Opus, **aboutis dès les Tasks 2, 8 et 9** (style cellulo : aplats + trait encré + ombre nette, détaillés, jamais un polygone brut). Règle du projet : chaque fichier de visuel ou de séquence porte le commentaire `// Fable n'est pas passé : à reprendre lors d'un rattrapage Fable.` (item-case.tsx, hifi-art.tsx, disc-flight.tsx), rappelé dans la PR.
- Extension **et** Android ; fiche WikiHow dans la même PR ; tests rangés dans la famille `scene-piece`.

## Review Focus

- Toucher deux fois très vite / pendant une animation → une seule couche, aucune phase coincée (test Task 3).
- Lecture lancée ailleurs (fiche du site) d'un album présent dans la pièce → son disque va au poste ; carte absente de la pièce → poste vide mais bulle remplie (test Task 7).
- Le poste est retiré (mode Aménager) alors qu'un disque y tourne → l'objet réapparaît à sa place, pas de place vide fantôme (tests Tasks 7 et 8).
- Service en erreur ou `{status:'none'}` → objet ouvert quand même, sélecteur qui le dit, ⓘ disponible (tests Tasks 4, 11, 12).
- Tidal (lien externe, état de lecture inconnu) → disque posé au poste au choix de la piste, sans suivre la pause (test Task 4).

---

### Task 1: Logique pure de l'objet ouvert

**Files:**
- Create: `src/core/library/opened-item.ts`
- Test: `tests/core/library/opened-item.test.ts`

**Interfaces:**
- Produces:
  - `type Opening = 'jewel-cd' | 'vinyl-sleeve' | 'dvd-case' | 'game-case' | 'book'`
  - `openingOf(p: Placed): Opening | null` — `stored` : cd→jewel-cd, dvd→dvd-case, game→game-case, book→book ; `wall` : vinyl, sleeve-*→vinyl-sleeve ; tout le reste → null.
  - `type SelectorRow = { kind: 'track'; track: Track; listen: Listen } | { kind: 'video'; label: string; video: { kind: 'youtube'; key: string } | { kind: 'hls'; url: string; poster?: string; pageUrl: string } } | { kind: 'synopsis'; text: string } | { kind: 'link'; label: string; url: string }`
  - `type SelectorModel = { rows: SelectorRow[]; empty: string | null }` (`empty` = message quand `rows` est vide).
  - `musicRows(listen: Listen | null): SelectorModel` — vide : `"Aucune piste trouvée"`.
  - `layerFrame(screen: { w: number; h: number }): { rotated: boolean; w: number; h: number }` — `rotated` si `h > w` (largeur/hauteur échangées).

- [ ] **Step 1: Tests** — `openingOf` pour chaque forme rangée, chaque `WallShape` (poster → null), `small`/`computer` → null ; `musicRows(null)` et `musicRows({kind, items: []})` → `{ rows: [], empty: 'Aucune piste trouvée' }` ; `musicRows` avec 2 pistes → 2 lignes `track` dans l'ordre ; `layerFrame({w:400,h:800})` → `{ rotated: true, w: 800, h: 400 }`, `layerFrame({w:800,h:400})` → `{ rotated: false, w: 800, h: 400 }`.
- [ ] **Step 2:** `npx vitest run tests/core/library/opened-item.test.ts` → FAIL (module absent).
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** même commande → PASS.
- [ ] **Step 5:** Ajouter `'opened-item.*'` et `'hifi.*'` à `lib(...)` et `'opened-item*'`, `'item-case.*'`, `'hifi*'`, `'selectors.*'` à `c(...)` de `scene-piece` dans `tests/familles.ts:84`. Commit `feat(bibliotheque): logique de l'objet ouvert`.

### Task 2: Boîtier ouvert (CSS 3D)

**Files:**
- Create: `src/content/opened-item/item-case.tsx`
- Test: `tests/content/item-case.test.tsx`

**Interfaces:**
- Consumes: `Opening` (Task 1).
- Produces: `ItemCase(props: { opening: Opening; phase: 'opening' | 'open' | 'closing'; from: Box | null; to: Box | null; cover: string | null; color: string; title: string; disc: 'in' | 'spinning' | 'away'; reduced: boolean; selector: ReactNode; right?: ReactNode })`. Attributs DOM : `[data-item-case][data-phase]`, `[data-case-lid]`, `[data-case-disc][data-disc]`, `[data-case-tray-empty]`. `right` remplace le disque (vidéo, couverture du livre).

- [ ] **Step 1: Tests** — `phase='open'` : le couvercle a `transform` contenant `rotateY(-180deg)` ; `phase='opening'` avec `from` : le boîtier part de `from` (transform `translate(...) scale(...)`) ; `disc='spinning'` : le calque intérieur a l'animation de rotation, le **conteneur du disque n'a aucun `translate`** ; `disc='away'` : pas de disque, `[data-case-tray-empty]` présent avec « Le disque est sur le poste » ; `opening='book'` : pas de disque, couverture à droite ; `reduced` : pas de rotateY, transition d'opacité 150 ms ; `closing` avec `to` : le boîtier se dirige vers `to`.
- [ ] **Step 2:** `npx vitest run tests/content/item-case.test.tsx` → FAIL.
- [ ] **Step 3:** Implémenter (couvercle `transform-origin` gauche, `backface-visibility:hidden`, face intérieure = `selector` ; durées : vol 500 ms, pivot 700 ms après le vol ; trait encré 2 px, aplats). Boîtiers définitifs : cristal (charnière, encoches du plateau, moyeu), DVD et jeu (boîtier plastique, clip central), pochette vinyle (carton, bord usé), livre (dos, tranche des pages).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(bibliotheque): boîtier ouvert`.

### Task 3: Hook de la couche (phases, historique, orientation)

**Files:**
- Create: `src/content/opened-item/use-opened-item.ts`
- Test: `tests/content/opened-item-hook.test.tsx`

**Interfaces:**
- Consumes: `lockOrientation`, `unlockOrientation` (`../orientation-lock`), `reducedMotion`.
- Produces: `useOpenedItem(opts: { onBeforeClose?: () => boolean; restoreOrientation: () => void }): { opened: OpenedState | null; open(placedId: string, from: Box | null): void; close(to: Box | null): void }` avec `OpenedState = { placedId: string; from: Box | null; to: Box | null; phase: 'opening' | 'open' | 'closing' }`. Même modèle d'historique que `use-furniture-zoom.ts` (clé `wmtOpened`).

- [ ] **Step 1: Tests** (fake timers) — `open` → phase `opening` puis `open` après 1200 ms (150 ms si réduit) ; `history.state.wmtOpened` posé ; `lockOrientation('landscape')` appelé ; `close` → `closing` puis `null`, `restoreOrientation` appelé ; `popstate` ferme ; `onBeforeClose()` true → reste ouvert ; **`open` pendant `opening`/`closing` ignoré** (Review Focus 1).
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(bibliotheque): couche de l'objet ouvert`.

### Task 4: Couche + sélecteur musique

**Files:**
- Create: `src/content/opened-item/OpenedItemLayer.tsx`, `src/content/opened-item/selectors.tsx`
- Test: `tests/content/opened-item-layer.test.tsx`, `tests/content/selectors.test.tsx`

**Interfaces:**
- Consumes: Tasks 1-3 ; `getMusicService()`, `getPlayerSource()`, `isPlayingUri`, `usePlatform`, `tidalUrl`, `TIDAL_HOME_URL` (comme `ListenSection.tsx:106-159`).
- Produces:
  - `MusicSelector(props: { slug: string; title: string; onPlayed: (track: Track) => void })` — `service.view(slug, title)` puis `musicRows` ; toucher une piste : `service.play(track, listen, { slug, title })`, puis `onPlayed(track)` si le résultat est `null` ; piste en cours marquée (`isPlayingUri`) ; Tidal : lien externe + `onPlayed(track)`.
  - `OpenedItemLayer(props: { placed: Placed; card: { title: string; imageUrl?: string }; cover: string | null; color: string; state: OpenedState; disc: 'in' | 'spinning' | 'away'; hasHifi: boolean; onInfo(): void; onClose(): void; onPlayed(track: Track): void; onAddHifi(): void; right?: ReactNode; selector?: ReactNode })` — glyphes ⓘ ✕ (+ ⏯ si une piste de cet objet joue, via `getPlayerSource().toggle()`) ; sans poste : glyphe « ajouter un poste » → `onAddHifi`. Attribut racine `[data-opened-item]`, `position:absolute; inset:0; z-index:40`, tournée de 90° si `layerFrame(...).rotated`.

- [ ] **Step 1: Tests** — sélecteur : service mocké (`setMusicService`) qui renvoie 3 pistes → 3 lignes ; clic → `play` appelé avec `{ slug, title }` et `onPlayed` reçu ; `play` renvoie un message → pas d'`onPlayed`, message affiché ; `view` en erreur / vide → « Aucune piste trouvée » (Review Focus 4) ; Tidal → `<a href>` + `onPlayed` (Review Focus 5). Couche : ⓘ → `onInfo`, ✕ → `onClose`, Échap → `onClose` ; `hasHifi=false` → glyphe d'ajout présent ; écran 400×800 → `transform` contient `rotate(90deg)`.
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(bibliotheque): sélecteur de pistes de l'objet ouvert`.

### Task 5: Brancher l'ouverture dans la pièce (sans poste)

**Files:**
- Modify: `src/content/LibraryPanel.tsx` (`onCard` de `FurnitureZoom` ~l.1249 ; toucher d'un objet du mur dans `onCardTap` ~l.717 ; rendu ~l.1253)
- Test: `tests/content/library-panel.test.tsx` (cas ajoutés)

**Interfaces:**
- Consumes: Tasks 1-4 ; rectangle de départ : `getBoundingClientRect()` de `[data-board-card="<slug>"]` (second zoom) ou de `[data-card="<id>"]` (mur), converti dans le repère de la scène.
- Produces: dans `LibraryPanel`, `openedFor(slug): Placed | undefined` ; l'objet ouvrable ouvre la couche au lieu de `setViewing` ; ⓘ → `setViewing(slug)` par-dessus (z-index de `RoomCardDialog` > couche) ; `onBeforeClose` de la couche = fiche ouverte. Sans poste, `disc` = `'spinning'` si `getPlayerSource().current()` a `card?.slug === slug` et `track?.playing`, sinon `'in'`. Image : `createMediaArt` (déjà branché dans la surcouche : réutiliser l'instance passée à la scène, sinon `imageOfCard`).

- [ ] **Step 1: Tests** — second zoom : toucher un CD → `[data-opened-item]` présent, pas de `RoomCardDialog` ; toucher un poster du mur → `RoomCardDialog` comme avant ; ⓘ → les deux présents, retour Android ferme d'abord la fiche ; disque `spinning` quand le lecteur mocké joue une piste de cette carte.
- [ ] **Step 2:** `npx vitest run tests/content/library-panel.test.tsx` → FAIL. **Step 3:** Implémenter. **Step 4:** → PASS.
- [ ] **Step 5:** `npm run test:famille -- scene-piece` → PASS. Commit `feat(bibliotheque): toucher un album l'ouvre`.

### Task 6: Objet `small-hifi`

**Files:**
- Modify: `src/core/library/library-types.ts` (`SMALL_ITEMS` + `'hifi'`, `SmallKind` + `'small-hifi'`), `furniture-catalog.ts` (`LABELS['small-hifi'] = 'Chaîne hi-fi'`, `SMALL_ITEM_OF`, groupe `{ id: 'music', label: 'Musique', kinds: ['small-hifi'] }` dans la catégorie `deco`), `item-models.ts` (`ItemShape`, modèle `'small-hifi'`, liste l.180), `carried-items.ts` (`SMALL_SHAPE.hifi`, `smallPlacement` centré sur 2 emplacements), `room-grid.ts` (`smallSpan`, `firstFreeSurfaceSlot`, `placeSmall`, `moveSmall`, `surfaceSlotRectOn`), `library-book.ts` (~l.185 validation), `src/content/furniture-drag.ts:46`
- Test: `tests/core/library/room-grid-hifi.test.ts`, cas ajoutés à `tests/core/library/item-models.test.ts`, `library-book.test.ts`

**Interfaces:**
- Produces:
  - `smallSpan(item: SmallItem): 1 | 2` (2 pour `hifi`).
  - `canHostSmall(hostKind: HostKind, item: SmallItem): boolean` (`hifi` → `desk` seulement).
  - Modèle `'small-hifi'` : `{ w: 56, d: 26, h: 18 }` — corps 30 cm entre deux enceintes 13 cm, platine + puits CD sur le dessus, décalques `face:hifi` (avant) et `top:hifi` (dessus). Pas de migration : `SMALL_ITEMS` est un enum zod qui s'élargit (version reste 7).

- [ ] **Step 1: Tests** — `placeSmall` d'un hifi sur un bureau vide → slot 0, occupe 0 et 1 ; un second petit objet prend le slot 2 ; hifi sur une étagère → `null` ; bureau avec ordinateur (slots 1-2 bloqués, 0 et 3 libres mais non contigus) → hifi `null` ; validation `library-book` refuse un hifi chevauchant un autre petit objet ; `smallPlacement` du hifi en slot 0 centré sur la largeur des 2 emplacements.
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter. **Step 4:** → PASS.
- [ ] **Step 5:** `npm run test:famille -- scene-piece` → PASS. Commit `feat(bibliotheque): chaîne hi-fi posable sur un bureau`.

### Task 7: État du poste (pur)

**Files:**
- Create: `src/core/library/hifi.ts`
- Test: `tests/core/library/hifi.test.ts`

**Interfaces:**
- Consumes: `Layout`, `Placed` ; `PlayerView` (type seulement, depuis `src/content/player-source.ts` — le déplacer dans `src/core/music/player-view.ts` si l'import core→content est interdit par le lint).
- Produces:
  - `activeHifi(layout: Layout): Placed | null` — premier `small` d'item `hifi`.
  - `type HifiState = { hifiId: string | null; atHifi: string | null; spinning: boolean }` — `atHifi` = id du `Placed` (stored/wall) dont `slug === view.card?.slug` et `openingOf` non null.
  - `hifiState(layout: Layout, view: PlayerView): HifiState` — `spinning = atHifi !== null && view.track?.playing === true` ; sans poste : `atHifi = null`.
  - `hiddenAtHome(state: HifiState): ReadonlySet<string>` — `{ atHifi }` si poste et objet au poste.

- [ ] **Step 1: Tests** — 2 postes → le premier sert ; carte en lecture rangée dans la pièce → `atHifi` = son id, `spinning` suit `playing` ; carte en lecture absente de la pièce → `atHifi: null` (Review Focus 2) ; pas de poste → `hiddenAtHome` vide (Review Focus 3) ; `view.card` null → rien au poste.
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(bibliotheque): état du poste déduit du lecteur`.

### Task 8: Poste dans la scène

**Files:**
- Create: `src/content/hifi/hifi-art.tsx` (décalques `face:hifi`, `top:hifi`, disque posé en ellipse, voyant, afficheur), `src/content/hifi/use-hifi.ts`
- Modify: `src/content/deco-live.tsx` (`TableItem` + `'hifi'`, `tableFaceContent`), `src/content/RoomView.tsx` (masquer `hiddenAtHome`, pochette couchée devant le poste, `data-hifi` sur le groupe du poste, `data-hifi-sleeve` sur la pochette)
- Test: `tests/content/hifi-art.test.tsx`, `tests/content/hifi-scene.test.tsx`

**Interfaces:**
- Consumes: Task 7.
- Produces: `useHifi(layout: Layout): HifiState` (abonné à `getPlayerSource().subscribe`) ; `HifiDisc(props: { cover: string | null; color: string; spinning: boolean })`.

- [ ] **Step 1: Tests** — lecteur mocké sur une carte rangée + poste : l'objet n'est plus dessiné sur l'étagère, la pochette `[data-hifi-sleeve]` est dessinée devant le poste, le disque a l'animation de rotation ; pause → disque immobile ; poste supprimé du layout → l'objet revient sur l'étagère ; afficheur contient le titre de la piste.
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter (visuel définitif : enceintes en tissu, molette, afficheur qui fait défiler le titre, platine + bras, puits CD à couvercle fumé, voyant ; volumes arrondis par les décalques). **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(bibliotheque): disque et pochette sur la chaîne hi-fi`.

### Task 9: Vols du disque et du boîtier

**Files:**
- Create: `src/content/opened-item/disc-flight.tsx`
- Modify: `src/content/opened-item/OpenedItemLayer.tsx`, `src/content/LibraryPanel.tsx`
- Test: `tests/content/disc-flight.test.tsx`, cas ajoutés à `tests/content/opened-item-layer.test.tsx`

**Interfaces:**
- Consumes: Tasks 4, 7, 8 ; cible : `getBoundingClientRect()` de `[data-hifi]` ; si hors écran, point sur le bord le plus proche.
- Produces: `DiscFlight(props: { from: Box; to: Box; cover: string | null; color: string; reduced: boolean; onLanded(): void })` (900 ms, z-index au-dessus du boîtier). Dans la couche : `onPlayed` avec poste → vol puis `disc='away'` ; autre album déjà au poste → l'ancien disque disparaît du poste, son boîtier repart à sa place (masque levé), puis vol du nouveau. Fermeture : `close(to)` avec `to` = rectangle de `[data-hifi-sleeve]` si l'objet est au poste, sinon sa place d'origine. Toucher `[data-hifi-sleeve]` → `open(atHifi, rect de la pochette)`.

- [ ] **Step 1: Tests** (fake timers) — choisir une piste avec poste : boîtier toujours `open`, `DiscFlight` monté puis `[data-case-tray-empty]` ; ✕ → `close` vers la pochette ; rouvrir via la pochette → plateau vide, piste marquée ; changer d'album → ancien objet de nouveau visible à sa place avant l'atterrissage du nouveau ; réduit → pas de vol, disque `away` immédiat.
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(bibliotheque): le disque vole jusqu'au poste`.

### Task 10: Bulle « En lecture » et ajout d'un poste

**Files:**
- Create: `src/content/hifi/HifiBubble.tsx`
- Modify: `src/content/LibraryPanel.tsx` (toucher `[data-hifi]` en mode Visiter ; `onAddHifi` → `setMode('edit')` puis `startNew('small-hifi')`)
- Test: `tests/content/hifi-bubble.test.tsx`

**Interfaces:**
- Produces: `HifiBubble(props: { view: PlayerView; albumTitle: string | null; onClose(): void; onEject(): void })` — piste, artiste, album ; ⏯ → `getPlayerSource().toggle()` ; ⏏ → si `track.playing` alors `toggle()`, puis `setCard(null)` (le disque rentre, l'objet revient à sa place) ; « Rien en lecture » si `track` null.

- [ ] **Step 1: Tests** — bulle avec piste ; ⏯ appelle `toggle` ; ⏏ appelle `toggle` (si joue) puis `setCard(null)` et `hiddenAtHome` devient vide ; rien en lecture ; `onAddHifi` ouvre le mode Aménager avec le placement de `small-hifi`.
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter. **Step 4:** → PASS.
- [ ] **Step 5:** `npm run test:famille -- scene-piece` → PASS. Commit `feat(bibliotheque): bulle de la chaîne hi-fi`.

### Task 11: Film et jeu

**Files:**
- Modify: `src/core/library/opened-item.ts` (`screenRows`, `gameRows`), `src/content/opened-item/selectors.tsx` (`ScreenSelector`, `GameSelector`), `LibraryPanel.tsx` (sélecteur selon `opening`)
- Test: cas ajoutés à `tests/core/library/opened-item.test.ts`, `tests/content/selectors.test.tsx`

**Interfaces:**
- Produces:
  - `screenRows(view: ScreenView, bo: Listen | null): SelectorModel` — ligne `video` « Bande-annonce » si `detail.trailerKey`, puis pistes BO ; vide : `"Pas de bande-annonce ni de BO"`.
  - `gameRows(view: GameView, bo: Listen | null): SelectorModel` — ligne `video` depuis `detail.trailer` (`hls` : `pageUrl` = page Steam du jeu comme `GameSection`), puis BO.
  - BO : `service.soundtrack(`${mediaType}:${id}`, [title, originalTitle?])` / `` `game:${source}:${id}` `` ; lecture `service.play(track, listen, { slug, title })` (avec la carte : la BO va au poste).
  - Vidéo choisie → `right` = `<TrailerPlayer trailerKey>` ou `<HlsTrailerPlayer url poster pageUrl>` à la place du disque ; choisir une piste de BO remet le disque.

- [ ] **Step 1: Tests** — `screenRows` détail avec trailer + 2 pistes → 3 lignes (vidéo d'abord) ; `none`/`error` → message ; `gameRows` hls et youtube ; sélecteur : clic vidéo → lecteur à droite, pas de disque ; clic BO → `play` avec `{slug,title}`.
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(bibliotheque): ouvrir un film ou un jeu`.

### Task 12: Livre

**Files:**
- Modify: `src/core/library/opened-item.ts` (`bookRows`), `selectors.tsx` (`BookSelector`), `LibraryPanel.tsx`
- Test: cas ajoutés aux mêmes fichiers

**Interfaces:**
- Produces: `bookRows(view: BookView, reading: BookReading | null): SelectorModel` — `synopsis` si `detail.synopsis`, puis un `link` par `reading.links` (`label`, `url`) ; vide : `"Rien à lire pour ce livre"`. `ItemCase` `opening='book'` : `right` = couverture (`cover` ou aplat `bookColor`).

- [ ] **Step 1: Tests** — synopsis + 2 liens → 3 lignes ; `none` → message ; clic lien → `<a target="_blank">` ; couverture à droite, aucun disque.
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(bibliotheque): ouvrir un livre`.

### Task 13: WikiHow, vérification, livraison

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvelle entrée `id: 'ouvrir-objet'`, `theme: 'collection'`, `glyph: '💿'`, titre « Ouvrir un album dans la pièce », étapes text + how + tip : à quoi ça sert, d'où viennent les données (Spotify/Tidal, TMDB, Steam/IGDB, Open Library/Wikisource), comment (ouvrir, choisir, poste, pochette, ⏏), limites (Tidal sans suivi de pause, poste sur bureau seulement))
- Test: tests existants de `entries` (famille `fiche` / whats-new)

- [ ] **Step 1:** Rédiger l'entrée ; `npx vitest run tests/core/whats-new` → PASS.
- [ ] **Step 2:** `npm run test:famille -- scene-piece fiche` → PASS ; `npx tsc --noEmit` → 0 erreur ; `npm run build` → OK.
- [ ] **Step 3:** Captures (album ouvert, disque au poste, film avec vidéo, livre) montrées à l'utilisateur pour validation.
- [ ] **Step 4:** Commit, PR vers `main`, fusion, `npm run preprod` ; validation sur le téléphone (APK pré-prod) puis l'extension.
