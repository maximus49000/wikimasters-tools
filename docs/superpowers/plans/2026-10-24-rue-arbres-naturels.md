# Arbres de la rue naturels (V5) : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** les arbres de la rue sont alignés naturellement (boulevard), plantés dans un carré de terre, et dessinés avec un
squelette continu, des rameaux fins et une couronne aérée par essence ; en automne les feuilles restantes sont portées par
les rameaux.

**Architecture :** placement dans `rue-verte-plan.ts` (règle A « boulevard »), nouveau modèle pur d'arbre de rue
`src/core/library/paint/rue-trees.ts` (axes + tubes + nuages de feuilles, port de la maquette V5), fosse en deux passes
(arrière dans la tranche, lèvre + grille dans le calque des arbres), intégration dans les couches au vent existantes
(`rue-sprites.ts`, `street-trees.tsx`). La colline garde `hill-trees.ts` inchangé.

**Tech Stack :** TypeScript, Canvas 2D, React, Vitest (`recordingCtx`).

**Spec :** maquette validée par l'utilisateur le 2026-10-24 (« On y go ! ») :
`docs/superpowers/maquettes/rue-arbres-naturels/` — `notes.md` (§1 implantation A, §2 pied P2/P3, §6 V4 squelette continu,
§7 V5 pointes fines / couronnes aérées, §4 ce qui change dans le code) et `maquette.html` (code de référence à porter :
`treeModelV4` + modifications V5, `tubePath`, `paintSkeletonV4`, `leafCloud4`, `paintLeavesV4`, fosse P1/P2/P3). Planches :
`planche-implantation.png`, `planche-pied.png`, `planche-houppier.png`, `planche-tronc.png`, `avant-apres.png`.

## Global Constraints

- Rendu = maquette V5 (essences platane/tilleul, robinier, frêne, cerisier ; palettes et paramètres des tables de `notes.md`).
- Implantation A : pas 60 px, phase tirée 30-50, centre libre cherché à ± 12 px, sinon la place reste VIDE (les voisins ne
  bougent pas) ; `PIT_HALF` 7 ; obstacles inchangés (`PIT_*_CLEAR`, portes, lampadaires ± 9) ; une essence par tronçon (coupé
  au passage piéton et à l'arrêt de bus) ; même âge (h 42 ± 3, rayon 20 ± 1,5) ; 1 jeune au tuteur sur 10 (pied P3).
- Pied : carré de terre 14 × 5,4 entre `walkY + 0,6` et `curb − 0,4` ; couloir des passants intact ; P2 grille ajourée pour les
  adultes, P3 herbe pour les jeunes, P1 terre nue pour une fosse vide.
- Rien ne flotte à aucune date (feuilles toujours sur un rameau dessiné) ; le tronc ne change jamais de taille ; saisons
  (`foliageOf`, `bloomOf` existants) respectées ; rien n'apparaît ni ne disparaît sur place.
- Vent : mêmes calques et même boucle à 15 Hz qu'aujourd'hui (squelette fixe, nuages de feuilles par charpentière au vent) ;
  aucune écriture SVG par image ; Android d'abord : temps de cuisson et fluidité mesurés sur le S26 avant livraison.
- Graphisme classique inchangé ; la colline (`hill-trees.ts`, `treeModel`) inchangée.
- Commits/PR en français, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; tests par familles touchées
  (`npm run test:famille -- scene-ville …`), une seule session de tests à la fois ; pas de fiche WikiHow (fiche globale en fin de G7).

## Review Focus

1. Un arbre jeune / vide / adulte voisin d'une porte, d'un lampadaire ou de l'arrêt : la place sautée ne décale pas les voisins.
2. Automne (15 oct. → 1er déc.) : aucun nuage de feuilles loin de son axe porteur ; hiver : dentelle de rameaux, pas de moignons.
3. Vent : la couche fixe (squelette) et les couches au vent (feuillage par charpentière) restent jointes (pas de feuilles qui
   se détachent du bois de plus d'1 px).
4. Coût : cuisson d'un arbre (axes 60-110, nuages 80-200) — temps et mémoire des couches sur le S26.
5. Pied : la lèvre de terre recouvre le collet sans que le tronc paraisse coupé ; l'ombre reste sur le trottoir.

---

### Task 1 : implantation A « boulevard »

**Files :** Modify `src/core/library/paint/rue-verte-plan.ts` (§1 de `streetVerdure`, constantes) ; Test
`tests/core/library/paint/paint-city-rue.test.ts`.

**Interfaces :**
- Produces : `RuePit` gagne `species: 'platane' | 'tilleul' | 'robinier' | 'frene' | 'cerisier'` (remplace l'union actuelle ;
  garder un alias de compatibilité si d'autres modules lisent l'ancienne valeur, sinon adapter), `section: number` (index du
  tronçon), `finish: 'grille' | 'herbe' | 'terre'`, `y` = pied du fût (`FOOT_Y` de notes §2).
- Constantes exportées : `PIT_PITCH = 60`, `PIT_SEARCH = 12`, `PIT_HALF = 7`.
- [ ] Tests rouges : pas constant (écart entre fosses = multiple de 60 à ± 24 près), places sautées sans décaler les voisins,
  une essence par tronçon, tailles 42 ± 3 / 20 ± 1,5, au plus 1 jeune sur 10 places, `finish` cohérent, obstacles respectés
  (tests existants adaptés), déterminisme ; plancher de densité recalé (mesurer puis figer).
- [ ] Implémentation, vert, commit `feat(ville): arbres de la rue en alignement de boulevard (une essence par tronçon)`.

### Task 2 : modèle d'arbre de rue V5 (pur) et peintre

**Files :** Create `src/core/library/paint/rue-trees.ts` ; Test `tests/core/library/paint/paint-city-rue-arbres.test.ts`
(famille scene-ville via `paint-city-*`).

**Interfaces :**
- `export type RueAxis = { level: 0..5; pts: …; w: … (demi-largeur continue); parent: number; mass: number; dead?: boolean }`,
  `export type RueCloud = { x; y; r; rot; k1; k2; axis: number; mass: number; rank: number }`,
  `export type RueTreeModel = { axes: RueAxis[]; clouds: RueCloud[]; box: Box; masses: number; species; … }`.
- `export function rueTreeModelV5(pit: RuePit): RueTreeModel` — déterministe (graine de la fosse), port de `treeModelV4`+V5.
- `export function paintRueSkeleton(ctx, m, opts)` (trait encré commun puis tubes, ombre du flanc, brindilles en traits
  dégressifs, nœuds, écorce) et `export function paintRueClouds(ctx, m, D, opts: { mass?: number; … })` (taille par date
  `sat((d − rank)/0,36)`, couleurs de saison, floraison du cerisier, mouillé).
- [ ] Tests rouges : déterminisme ; continuité (demi-largeur décroissante le long de chaque axe, fille ≤ mère au départ,
  Σ filles ≤ 70 %) ; pointes fines (bout des axes terminaux < 0,2 px) ; aucun nuage à plus de 1,3 r de son axe porteur ;
  chaque nuage rattaché à une charpentière (`mass`) ; budget (axes ≤ 120, nuages ≤ 220) ; en hiver `paintRueClouds` ne dessine
  rien, en été tous les nuages ; à toute date, nuage de taille > 0 ⇒ son axe est dessiné.
- [ ] Implémentation (port fidèle de `maquette.html`, mêmes constantes), vert, commit `feat(ville): modèle d'arbre de rue continu (V5)`.

### Task 3 : pied de terre et intégration au calque des arbres

**Files :** Modify `src/core/library/paint/rue-verte-painter.ts` (fosse arrière dans la tranche : bordure + terre ; plus de
grille sur le béton), `src/core/library/paint/rue-sprites.ts` (couche fixe = squelette + collet + lèvre + grille/herbe ;
couches au vent = nuages par `mass` ; boîte des sprites), `src/content/street-trees.tsx` (si les couches changent),
`src/core/library/paint/city-painter.ts` (`PAINT_VERSION` + 1) ; Tests `tests/core/library/paint/paint-city-rue.test.ts`,
`tests/content/street-trees.test.tsx`.
- [ ] Tests rouges : la tranche peint la fosse (terre) sous chaque arbre et plus de grille sur le béton ; la couche fixe contient
  la lèvre et la finition après le fût ; les couches au vent ne contiennent que des nuages ; jeunes et fosses vides ; boîte des
  sprites englobe tubes + nuages + lèvre ; vent : décalage max entre feuillage et bois ≤ 1 px.
- [ ] Implémentation, vert (`npm run test:famille -- scene-ville scene-meteo`), commit
  `feat(ville): arbres de la rue plantés dans un carré de terre, squelette et feuillage V5`.

### Task 4 : captures, mesures, livraison (contrôleur)

- [ ] Banc `.superpowers/harness-fond` : rue 1 440 px aux dates de la maquette (7 juillet, 15 avril, 1er nov., 15 nov., hiver),
  comparées aux planches ; captures envoyées à l'utilisateur.
- [ ] S26 (`abc2.sh`, `pan.sh`) : fluidité, temps avant que la ville soit prête, flashs ; pas de régression contre main.
- [ ] `tsc`, familles, build ; PR, fusion, `npm run preprod`.
