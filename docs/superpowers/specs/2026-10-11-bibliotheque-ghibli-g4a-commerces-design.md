# Bibliothèque : G4a, décor des commerces en cellulo (devantures par métier, intérieurs détaillés, entrées d'immeuble)

Première moitié de G4 (spec Ghibli : « Commerces : devantures, enseignes, stores, 32 intérieurs, entrées d'immeuble »). Les devantures, les intérieurs vus par la vitrine et les entrées d'immeuble passent au langage cellulo du décor livré (PR #256) : aplat, ombre nette violette, rehaut, trait encré. G4b (scénarios d'interaction employé-client) fera l'objet de sa propre spec.

Références validées en conversation (2026-10-11), dossier `.superpowers/brainstorm/g4-commerces/` :
- `devantures.html` : six familles de devantures par métier, états d'un local, trois entrées d'immeuble, rue de jour et de nuit. Extérieurs validés dès la première version.
- `interiors.js` + `interieurs.html` : les 32 intérieurs détaillés (v2). La v1 a été refusée (« les vinyles ne ressemblent pas du tout à des vinyles, les bouteilles non plus ») ; la v2 est validée.
- Captures : `zoom-day.png`, `zoom-night.png`, `board.png`, `states.png`, `doors.png`, `int-0.png` à `int-30.png`.

Le code de la maquette est la référence du dessin : le portage reprend ses formes, couleurs et proportions.

## Décisions

- **Périmètre** : devantures (encadrement, bandeau et nom, store, étal, ardoise, enseigne en drapeau, néon, lanternes), vitrine et porte vitrée, intérieurs (fond et premier plan), rideau roulant, local vide « À vendre », travaux, entrées d'immeuble. Graphisme classique strictement inchangé.
- **Devanture par métier** (choix de l'utilisateur) : six familles.

| Famille | Métiers | Signes distinctifs |
|---|---|---|
| A · Boiserie | boulangerie, pâtisserie, chocolatier, fromagerie, caviste, antiquaire, librairie, salon de thé | pilastres et corniche en bois peint, lettres à empattements (dorées si le bois est sombre, sinon couleur `ink`), soubassement à panneaux, petits bois, applique en laiton |
| B · Étal | boucherie, poissonnerie, primeur, fleuriste, épicerie fine | store festonné rayé blanc, étal sur le trottoir à l'ouverture (cageots, seaux de fleurs, glace pilée), faïence pour boucherie et poissonnerie |
| C · Café-restaurant | café, restaurant, pizzeria, kebab, sushis | store au nom du lieu sur le lambrequin, ardoise sur le trottoir (café, restaurant, pizzeria), lanterne (restaurant), store tricolore (pizzeria), panneau-menu (kebab, sans store), noren et lanterne en papier (sushis, sans store) |
| D · Boutique | supérette, opticien, disquaire, jeux, coiffeur, friperie, animalerie, vélos, laverie | bandeau plat en lettres grasses, cadre fin, enseigne en drapeau à pictogramme (lunettes, disque, manette, enseigne de barbier, cintre, patte, roue, hublot ; la supérette n'en a pas) |
| E · Pharmacie | pharmacie | encadrement en pierre, bandeau « PHARMACIE », croix verte en drapeau (allumée la nuit) |
| F · Nuit | bar, boîte de nuit, arcade, tatoueur | façade sombre, nom en néon (tube éteint de jour, allumé la nuit avec halo à bord net), cordon et poteaux devant la boîte ouverte |

- **Rendu en images mises en cache** (comme les voitures, `vehicle/car-host.tsx`) : chaque local est peint sur un canvas hors écran puis gardé en PNG (data URL, la CSP du site refuse `blob:`). Le détail des intérieurs ne coûte donc qu'une fois.
- **Trois couches par local**, pour que le personnel et les clients restent entre elles :
  1. **fond** : mur, étagères, marchandises, mobilier du fond (dans la vitrine) ;
  2. **premier plan** : comptoir, fauteuils, tables, étal intérieur, plus la teinte et le reflet diagonal de la vitre (devant le personnel, dans le calque animé à la place de `ShopInteriorFront`) ;
  3. **façade** : encadrement, bandeau et nom, store et son ombre, porte, soubassement, enseigne en drapeau, lanternes, étal et ardoise du trottoir, panneau « À vendre », bâche de travaux. La vitrine y est **percée** (transparente) pour laisser voir le fond et le personnel.
- **Ordre d'empilement** : façade et fond dans le décor (le fond sous la façade, dans le `<svg>` imbriqué de la vitrine comme aujourd'hui) ; personnel, clients et premier plan dans le calque animé (inchangé) ; rideau roulant au-dessus.
- **Clés de cache** : métier × largeur de vitrine (arrondie au dixième) × côté de la porte × état (`open`, `closed`, `empty`, `works`) × couche × lumière (jour au 1/8, comme les pantins et les voitures) × vitrine allumée. Nom du commerce dans la clé de la façade (il est peint dans l'image).
- **Nuit** : teinte appliquée à la peinture par paliers (`tone` de `city-sprites` à la lumière quantifiée), sauf les éléments lumineux peints « allumés » quand le local est ouvert la nuit : vitrine (fond et premier plan aux couleurs de jour réchauffées), néons, croix, lanternes, applique, panneau-menu du kebab. La flaque de lumière sur le trottoir et son reflet sur la chaussée (bords nets) sont dessinés par `GhibliShopFront`, hors filtre, comme les flaques des lampadaires.
- **Entrées d'immeuble** : les trois modèles validés (porte cochère cintrée à imposte rayonnante sous clé de voûte ; double porte vitrée à ferronnerie sous corniche ; porte à panneaux sous imposte à petits bois), encadrement en pierre, marche, plaque émaillée bleue avec numéro, interphone en laiton. Elles ne changent jamais : **peintes dans les tranches du décor** (`paintCityTile`), le `variant` de `doorsFor` choisissant le modèle et la graine la couleur du bois. L'imposte allumée (hall éclairé la nuit, `hallU < 0.6`) est posée par-dessus en SVG hors filtre, comme les fenêtres de `GhibliWindows`. Le sprite `EntranceSprite` n'est plus dessiné quand le décor peint est affiché.
- **Rideau roulant** : même mécanique (`RollingShutter`, transition CSS), redessiné en cellulo quand le graphisme est Ghibli : lames ombrées, coffre encré, poignée ; rideau sombre pour la famille F.
- **Comportements inchangés** : cycle de vie des locaux, horaires, place du vendeur (`post`) et des clients (`seat`), relève, déménagement par tranches (le cache de tranches reste un rectangle posé sur l'image du fond), enseigne portée et posée par les ouvriers, panneau porté.
- **Polices** : génériques seulement (`serif` pour la boiserie, `sans-serif` gras pour les boutiques, `cursive` italique pour les néons), le nom étant comprimé à la largeur du bandeau (`measureText`). Rendu à vérifier sur la WebView Android.

## Architecture

### Cœur (`src/core/library/paint/`)

- `shop-paint-ctx.ts` : `ShopPaintCtx` étend `PaintCtx` des appels utilisés par la maquette (`translate`, `rotate`, `scale`, `bezierCurveTo`, `roundRect`, `lineCap`, `lineJoin`, `font`, `textAlign`, `textBaseline`, `fillText`, `strokeText`, `measureText`). Un vrai contexte 2D le satisfait ; les tests passent un faux contexte enregistreur.
- `shop-cel.ts` : primitives de la maquette (forme cellulo `cel`, `R`, `RR`, `E`, `P`, trait, point, reflet de vitre, texte comprimé). Réutilise `SUN`, `COOL`, `INK`, `shade`, `light` de `cel.ts`.
- `shop-families.ts` : table métier → famille et pictogramme (le nom peint vient de `ShopView.sign.name`).
- `shop-front-painter.ts` : `paintShopFacade(ctx, spec)` et la géométrie partagée (vitrine `W0` selon la famille : pilastre, soubassement). Repère local : x de 0 à la largeur du local, y = 0 en haut du rez-de-chaussée, 30 au sol ; débords permis (store, drapeau, étal, ardoise) dans une marge fixe.
- `shop-interiors/` : les 32 intérieurs de `interiors.js`, répartis comme aujourd'hui (`alimentation.ts`, `boutiques.ts`, `restauration.ts`, `services.ts` pour pharmacie, coiffeur, laverie, vélos, tatoueur et nuit), plus `kit.ts` (murs, sols, étagère, comptoir, suspension, cadre, plante, bouteille, vinyle, pochette, rangée de livres, baguette, boule, croissant, gâteau, macarons, poisson, steak, meule, part, cageot, fruits, lunettes, fleur, seau, cintre, écran, chaise bistrot). Chaque intérieur se coupe en deux passes, `back` et `front` (le premier plan : ce qui est devant le personnel), et rend la place du vendeur, comme les intérieurs SVG actuels.
- `door-painter.ts` : les trois entrées, appelées par `paintCityTile` pour les portes de la tranche (`doorsFor` ajouté au plan de peinture : `plan.doors`). `PAINT_VERSION` passe à 3.

### Contenu (`src/content/`)

- `shop/shop-host.tsx` : registre des images (même conception que `car-host`) : peinture à la demande, plafond de 120 images (les moins récemment demandées partent), budget de peintures par image (1 couche), demande non renouvelée depuis 2 images jetée, `SHOP_PX = 4` pixels par unité (détails de 0,1 unité lisibles sur téléphone).
- `shop/ghibli-shop-front.tsx` : `GhibliShopFront` (façade + fond dans la vitrine) remplace `ShopFront` dans `scene-city.tsx` quand le graphisme est Ghibli ; tant que l'image n'est pas prête, le `ShopFront` classique reste affiché (pas de trou).
- `shop/ghibli-shop-glass.tsx` : premier plan (`<image>`) qui remplace `ShopInteriorFront` dans `StaffLayer` et dans le calque des clients en Ghibli.
- `shop-sprites.tsx` : `RollingShutter` prend `ghibli` et dessine le rideau cellulo.
- `ghibli-windows.tsx` (ou voisin) : impostes allumées des entrées.

## Hors périmètre

Scénarios d'interaction employé-client, objets manipulés, durées par métier, enchaînements (G4b) ; terrasses, files, stands de bière (déjà en pantins, inchangés) ; lampadaires et fêtes (G5) ; fiche WikiHow (globale à la fin de G7).

## Vérification

- **Tests unitaires** : déterminisme (même spécification → même suite d'appels sur le faux contexte) pour chaque famille et chaque intérieur ; place du vendeur dans la vitrine pour les 32 métiers et toute largeur de 8 à 60 ; vitrine percée (aucun aplat dans `W0` sur la couche façade) ; clés de cache distinctes par état, côté, lumière ; entrées peintes aux positions de `doorsFor` et seulement dans leur tranche (`tileItems`).
- **Banc** (`.superpowers/harness-ville`, `art=ghibli`, `shops=20700`) : captures midi, nuit, local fermé, à vendre, travaux, déménagement, zoom ×4 ; comparaison avec la maquette.
- **Mesures** : temps de peinture d'un local (3 couches) au banc et sur le téléphone, avec un objectif sous 10 ms ; nombre d'images en cache ; ms par image à 8 h et 21 h sans régression notable (campagne Android complète prévue après G7).
- **Captures validées par l'utilisateur** avant la PR.

## Risques

- **Polices** différentes sur Android : le nom est comprimé à la largeur du bandeau, donc pas de débordement ; l'aspect peut varier.
- **Mémoire** : environ 20 locaux visibles × 3 couches × paliers de lumière ; environ 160 Ko décodés par façade de 60 × 42 unités ; le plafond de 120 images borne la mémoire à environ 20 Mo au pire.
- **Repeinte au changement de palier de lumière** : tous les locaux visibles en même temps ; le budget de 2 peintures par image l'étale, l'ancienne image restant affichée en attendant.
