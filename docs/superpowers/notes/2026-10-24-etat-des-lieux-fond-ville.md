# État des lieux — chantier 3 « le fond vivant » de la Ville Ghibli (2026-10-24)

Document de reprise en local. Références :
- spec : `docs/superpowers/specs/2026-10-20-ville-fond-design.md` ;
- plan, avec la section « Reprise » : `docs/superpowers/plans/2026-10-20-ville-fond.md` ;
- maquette validée : `docs/superpowers/maquettes/fond-ville/` (`notes.md` = correspondance avec le code, `src/*.js` = code de
  référence à porter, `maquette.html`).

## Où en est chaque PR

| PR | Contenu | État |
|---|---|---|
| 1 | Audit des bâtiments : carrés de couleur, immeubles du fond mal coupés (D1 à D6) | **Fusionnée** (#354) |
| 2a | Colline peinte : échappée, colline sans trous, toits du mur du fond, volets, linge, arbres de colline | **Fusionnée** (#355) |
| 2b | Vie animée du fond (calque `vie-fond`) | **Fusionnée** (#356), pré-prod 1925 |
| 3 | Verdure de la rue, arbres de rue au vent, particules ; corrections nuages, tapis, montage | **Faite** (branche `feat/ville-fond-pr3-verdure`, plan `plans/2026-10-24-ville-fond-pr3-verdure-vent.md`) |
| 3b | Colline au vent (tranches de 96 / 240 px) | **Reportée** : le budget de fluidité est pris par la rue à vent 0,5 ; seulement après mesure sur le S26 |

La pré-production n'a pas été lancée depuis ces fusions : `npm run preprod`, puis reconstruire l'extension.

## PR 2b : ce qui est fait (branche `ccr-f0374a79-8v8eca`)

Commits `eb0b241`, `534f714` et `aa0881a`, poussés, au-dessus de `main` (`de20117`).
- `src/core/library/paint/fond-vie.ts` (pur, testé) : modèle de la vie du fond, nœuds fixes, poses par image (`vieFrame`).
- `src/content/fond-life.tsx` : calque `vie-fond` à nœuds constants, placé entre les tranches peintes et la lumière de nuit,
  avec deux clipPath fixes et l'étalonnage des couleurs en JS ; branché dans `scene-city.tsx`.
- **Lumières** : fenêtres de la colline (A), réverbères en vague (K), monuments et drapeaux (N), aiguilles de l'horloge (E).
  Aiguilles et ailes du moulin sont retirées des tranches (`PAINT_VERSION` 12). Derrière un volet fermé, la lumière du mur du
  fond tombe à 15 % (`farLightK`, `ghibli-windows.tsx`).
- **Fumées** (C) : au plus 12 panaches.
- **Funiculaire** (J), voitures et bus sur la route (D), grue (I).
- **Oiseaux et ambiance** : étourneaux et martinets (F), pigeons à l'heure pile (L), brume (M), piétons, fanfare du kiosque,
  jet de la fontaine, ailes du moulin.
- **Tests** (`tests/core/library/paint/paint-city-vie.test.ts`) : déterminisme, nœuds constants sur 24 h, entrées et
  sorties, horaires, plafond des fumées, budget de 40 nœuds, mouvement réduit.
- **Banc** : mode `vie=1` de `.superpowers/harness-fond` ; captures `docs/superpowers/maquettes/fond-ville/pr2b-*.png`.
- **Mesure** (CPU × 4, 1 440 px, branche contre `origin/main`) : décor seul, +20 à +30 ms de tâches par seconde. Scène
  peuplée : le processeur est saturé dans les deux cas, avec un écart de tâches de 1 % au plus.

État vérifié le 2026-10-24 : `npx tsc --noEmit` passe ; `npx vitest run tests/core/library/paint` : 332 tests sur 332 au vert.

## PR 2b : ce qui reste

1. Lancer la suite complète (`npm test`, environ 10 min). Sur main, 15 échecs existaient déjà dans le conteneur cloud :
   habitants 3D, commerces, véhicules, installations, vie aux fenêtres, `library-scene`, et 2 tests intermittents de
   `traffic-layer`. Vérifier qu'aucun nouvel échec n'apparaît. En local, une partie de ces 15 échecs peut disparaître.
2. Regarder les captures `pr2b-*.png` et la scène dans l'appli (graphisme Ghibli, bouton 🎨) : crépuscule, nuit, matin
   d'hiver, dimanche d'été, 14 juillet.
3. Passer la PR en « prête », la fusionner, puis `npm run preprod`.

## PR 3 : bilan (2026-10-24)

- Verdure de la rue (`rue-verte-plan.ts`, `rue-verte-painter.ts`, `PAINT_VERSION` 14) : fosses devant les vitrines, jamais devant une
  porte, hors scène de la Fête de la musique, passage piéton et arrêt de bus ; bacs et parterres pied au mur ; calendrier réel.
- Arbres de rue au vent (`street-trees.tsx`, `rue-sprites.ts`, `fond-vent.ts`) : couches cuites et rognées, dessinées sur une toile 2D
  dans un `foreignObject` (écrire dans le SVG de la scène repeint tout le SVG : ~40 ms par image à CPU × 4) ; calque juste avant les
  lampadaires (jamais de fenêtre à travers un houppier) ; la ville peinte attend ses arbres (filet de 8 s).
- Particules et oiseau : vie décidée à la naissance, fin au sol en fondu ou par un bord.
- Mesure au banc (CPU × 4, 1 440 px, décor seul, surcoût vs main) : vent 0 +24, 0,2 +47, 0,5 +57 ms/s.
- Corrections signalées par l'utilisateur : nuages découpés au pixel, tapis secoué, camion d'Halloween (chargement, vitesse),
  véhicules et équipes de montage à allure normale.
- Reste : mesure sur le S26 (fluidité, mémoire, temps de cuisson au premier plan), colline au vent (PR 3b), limites connues
  (déménageurs derrière les arbres à l'arrière du camion, ≈ 1/3 de fosses en moins à 720 px).
- Banc Windows : `.superpowers/harness-fond/shot-win.mjs`, `perf3.mjs`, `vite.config.ts` (playwright-core hors dépôt + Chrome installé).

## Règles de l'utilisateur, valables partout

- Naturel.
- Rien n'apparaît ni ne disparaît sur place.
- Saisons respectées.
- Le tronc d'un arbre ne change jamais de taille.
- Feuillage en masses, jamais en points.
- Pas de trous verts dans le fond.
- Graphisme classique strictement inchangé.

## Reprendre en local

```sh
git fetch origin
git switch ccr-f0374a79-8v8eca   # ou : git switch -c ccr-f0374a79-8v8eca origin/ccr-f0374a79-8v8eca
npm ci
npx tsc --noEmit && npx vitest run tests/core/library/paint
npm test                          # suite complète
npx vite .superpowers/harness-fond --port 5231   # banc : ?seed=7&w=1440&h=340&scale=4, mode vie=1
```
