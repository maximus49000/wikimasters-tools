# Plan — Ville Ghibli : le fond vivant (chantier 3)

Spec : `docs/superpowers/specs/2026-10-20-ville-fond-design.md`. Maquette validée le 2026-10-20 :
`docs/superpowers/maquettes/fond-ville/` (`notes.md` = correspondance avec le code, `src/*.js` = code de référence à porter).
Le graphisme classique reste inchangé. Pas de mesure téléphone par PR, sauf la mesure de la PR 3 qui conditionne le vent.

## PR 1 — Audit des bâtiments (D1 à D6)

1. `city-plan.ts` :
   - `nearSilhouette` (haut du premier plan par x, même ligne que `roofLineY`) ;
   - `farTops`, appliqué après les arbres et le mobilier pour ne pas changer leur tirage :
     - **D2 / D5** : un étage (`FAR_FLOOR`) au-dessus du plus haut voisin du premier plan ;
     - **D6** : plafond entre 0,20 et 0,28 × H, tiré par immeuble ;
     - **D1 / D4** : grille complète `wins` (travées de 8, étages de 11, sous l'égout, au-dessus de la ruelle) ;
     - `lit` : au plus 8 fenêtres allumables, jamais cachées par le premier plan ni par le voisin du fond.
2. `hill-painter.ts` `paintFarWall` :
   - bandeaux d'étage, linteaux, volets ouverts ;
   - **D3** : ombre seulement d'un voisin mitoyen, sur un étage ;
   - **D4** : ruelle sous le haut du rez-de-chaussée (porches, pavés) ;
   - corniche.
3. `facade-painter.ts` : **D3** sur le premier plan (trapèze sur un étage, voisin mitoyen seulement).
4. `ghibli-windows.tsx` : lumières du fond lues dans `plan.buildings[].lit`. Le classique garde `farWindows`.
5. `PAINT_VERSION` 9 → 10.
6. Tests :
   - grille sous l'égout et au-dessus de la ruelle ;
   - fenêtres allumables jamais cachées ;
   - hauteurs D2 / D6 ;
   - ombre mitoyenne seulement ;
   - déterminisme.
7. Captures au banc (`.superpowers/harness-fond`), avant / après sur les graines de l'audit.

## PR 2 — Fond et colline

Port de `02-plan-fond.js`, `03-fond-peint.js` et `04-vie-fond.js` :
- **Échappée** par bande de 1 080 px (`hillPlan` et `farTops`) : route en lacets, funiculaire, escalier, square, kiosque,
  fontaine, marché, verger, ruisseau, moulin, château d'eau, chapelle ;
- **Colline sans trous** : passe de comblement sur un masque géométrique (herbe nue de 8 à 11 %, aucune zone de plus de
  12 × 8 px) ;
- **Vie lente**, peinte dans les tranches, avec une clé de cache étendue (saison, neige, tranche de 10 min) : volets (B), linge
  (H), toits-terrasses et verrières, parasols (O) ;
- **Vie animée** : calque SVG `vie-fond` à nœuds constants, sous l'étalonnage, avec deux clipPath fixes :
  - lumières (A, K, N), aiguilles de l'horloge (E) ;
  - fumées (C, au plus 12) ;
  - funiculaire (J), véhicules de la route (D), grue (I) ;
  - étourneaux et martinets (F), pigeons à l'heure pile (L) ;
  - brume (M), piétons, fanfare.

## PR 3 — Verdure de la rue et arbres

1. **Mesure d'abord** : banc ralenti ×4, vent des arbres par sprites cuits par masse et transformations à 15 Hz.
   - Si le budget est dépassé : animation de la rue et de l'échappée seulement (option validée).
   - Colline animée par tranches de 240 px sur Android.
2. **Arbres** : `treeModel` (squelette fixe toute l'année) et `paintLeaves` (masses lobées), calendrier `foliageOf` /
   `bloomOf`, test des 365 jours.
3. **Verdure de la rue** (`streetVerdure` dans `cityPaintPlan`) :
   - fosses, bacs, parterres, grimpantes, pots, herbe ;
   - feuilles mortes et balayage ;
   - mêmes interdits : entrées, vitrines, lampadaires, couloir des passants.
4. **Météo** :
   - pluie : feuillage luisant, gouttes, flaques ;
   - orage ;
   - feuilles et pétales emportés, sans création sur place ;
   - neige qui glisse des branches ;
   - oiseaux ;
   - mouvement réduit : tout est immobile.

## Reprise — état au 2026-10-20 (fin de session possible)

Branche de travail : `ccr-f0374a79-8v8eca`. Pour reprendre, relire ce plan, la spec et `maquettes/fond-ville/notes.md`.

- **PR 1 (audit D1 à D6)** : FAIT, fusionnée (#354).
  - `npm run preprod` reste à lancer par l'utilisateur, puis l'extension est à reconstruire.
- **PR 2a (colline peinte)** : EN COURS. Commit intermédiaire `bf8ad77` poussé (tsc propre, 417 tests ciblés au vert).
  - Nouveaux fichiers : `src/core/library/paint/fond-plan.ts`, `fond-painter.ts`, `fond-time.ts`, `hill-trees.ts`.
  - Fait :
    - échappée (route, funiculaire, escalier, square, kiosque, fontaine, marché, lavoir, verger, ruisseau, moulin aux ailes
      figées, chapelles, châteaux d'eau) ;
    - rang de crête, verdure, comblement sur masque géométrique ;
    - vie du mur du fond (volets 10 min, linge, toits-terrasses, verrières, antennes) ;
    - arbres de colline à squelette fixe et feuillage en masses, sans vent ;
    - `PAINT_VERSION` 11 ; clé de tranche étendue (date, neige, poses de la tranche de 10 min) ;
    - une maison gardée par échappée pour le père Noël.
  - Reste à faire :
    1. Brancher date, météo et neige dans `scene-city.tsx` et `painted-city` : garder l'ancienne image pendant la repeinte,
       jamais de retour au classique.
    2. Neige posée sur les nouvelles maisons et la crête (`snow-painter.ts`).
    3. [x] Tests : déterminisme du plan, échappée par bande hors des bords, route, voie, gares et escalier jamais recouverts,
       herbe nue (≤ 12 % et aucune zone de 12 × 8 px nue, graines 1/7/42 × 720/1440/2880), clé de tranche qui ne change
       qu'avec saison, neige et tranche de 10 min, raccord des tranches.
    4. Captures au banc (`.superpowers/harness-fond`) en été 15 h, en automne et en hiver sous la neige, comparées à
       `captures/ete-15h.png`, `colline-apres.png`, `gauche-apres.png` et `hiver-8h.png` ; corrections visuelles ;
       captures `maquettes/fond-ville/pr2a-*.png`.
    5. Suite complète. 13 échecs existent déjà sur main dans ce conteneur (habitants 3D, commerces, véhicules,
       installations, vie aux fenêtres, `library-scene`) : n'en ajouter aucun.
    6. Envoyer les captures à l'utilisateur, ouvrir la PR 2a, la fusionner s'il le demande, puis repartir de `main`.
- **PR 2b (vie animée du fond)** : À FAIRE, d'après `04-vie-fond.js` de la maquette. Calque SVG `vie-fond` à nœuds
  constants, sous l'étalonnage, avec deux clipPath fixes :
  - lumières (A, K, N) et aiguilles de l'horloge (E) ;
  - fumées (C, au plus 12) ;
  - cabines du funiculaire (J), véhicules de la route (D), grue (I) ;
  - étourneaux et martinets (F), pigeons à l'heure pile (L) ;
  - brume (M), piétons (12 par heure), fanfare du kiosque, jet de la fontaine, ailes du moulin.
- **PR 3 (verdure de la rue et arbres)** : À FAIRE.
  1. Commencer par la mesure au banc ralenti ×4 du vent par sprites cuits par masse à 15 Hz. Repli validé si le budget est
     dépassé : rue et échappée animées seulement, colline par tranches de 240 px.
  2. Arbres de rue (`03a-arbres.js` : `treeModel`, `paintLeaves`, test des 365 jours), verdure de la rue
     (`03b-rue-verte.js`), vent et météo (`04a-vent.js`).

Règles de l'utilisateur à respecter partout :
- naturel ;
- rien n'apparaît ni ne disparaît sur place ;
- saisons respectées ;
- le tronc ne change jamais de taille ;
- feuillage en masses, jamais en points ;
- pas de trous verts dans le fond.
