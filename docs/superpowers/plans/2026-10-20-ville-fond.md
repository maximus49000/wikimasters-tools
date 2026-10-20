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
