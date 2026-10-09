# Bibliothèque — morceau 8a : lumière intérieure (socle et rayons)

Suite de `2026-10-09-bibliotheque-meteo-design.md`. Le lot « lumière intérieure » est coupé en trois : **8a** (ce document : socle, rayons des fenêtres, lumière ambiante), **8b** (lampes cliquables, ombres des meubles), **8c** (ombres des animaux). Les décisions de rendu (validées sur maquettes le 2026-10-09) sont dans `docs/superpowers/notes/2026-10-09-lumiere-interieure-decisions.md`.

## Objectif

Éclairer l'intérieur de la pièce d'après ce qui se passe derrière les fenêtres : un rayon de soleil par fenêtre, sa taille et sa direction suivant le soleil réel de la scène, atténué par les nuages, et une lumière ambiante qui baisse quand on s'éloigne des fenêtres. Espace et Terre vue d'en haut (hors `WEATHER_SCENES`) n'ont ni rayons ni lumière ambiante calculée : la pièce reste dessinée comme avant.

## Hors périmètre (8b, 8c)

Lampes cliquables, ombres des meubles et des animaux. Dans 8a les meubles ne reçoivent que la lumière ambiante, et le rayon se pose sur le sol (pas de tache sur le mur en 8a) sans être occulté.

## Données

- **Aucun état persistant, pas de migration** : la lumière se recalcule depuis le ciel (`Sky`), la météo (`clock.read`) et les fenêtres de la pièce.
- Réglage local **Lumière Actif/Inactif** (défaut Actif), clé `wmt:library-light`, hors état de la Bibliothèque, pour les appareils lents. Rangée dans le panneau Ciel.

## Moteur pur (`src/core/library/light/`, sans React, testé)

- `sun-dir.ts` : élévation `e` du soleil (globale, de `sunFrac` et de sa hauteur dans le panorama, via `celestialPlace`) ; azimut **par fenêtre** = x du soleil dans le panorama partagé − x du centre de la fenêtre. Aucun filtrage par la visibilité du soleil dans le verre : tant que le soleil est levé, chaque fenêtre a son rayon.
- `beam.ts` : projection exacte du verre sur le sol : parallélogramme commençant à la distance `Hb / tan(e)` du mur (`Hb` = hauteur du bas du verre au-dessus du sol). Atténuation des rayons rasants (en `sin(e)`). Pas de rayon sous un seuil d'élévation.
- `attenuation.ts` : nuages n'importe où dans le panorama → tous les rayons baissent (`1 − cloud` lissé) ; soleil partiellement masqué → rayon proportionnel (`1 − sunCoverage`) ; trouée en pluie fine → filets plus rayon (réutilise `godRayTarget`).
- `ambient.ts` : lumière du ciel qui décroît avec la distance à la fenêtre (somme sur les fenêtres) ; **adaptation de l'œil** : de jour par ciel clair, l'éclairage artificiel est négligeable ; par temps couvert, sous la pluie, à l'orage et la nuit, il est utile (ce facteur est calculé en 8a mais n'agit qu'en 8b) ; ciel nocturne : teinte froide faible. Pas de halo de la fenêtre sur le mur la nuit.
- `light-map.ts` : assemble le tout en une grille basse résolution (1 pixel pour 6 unités SVG) : `{ w, h, shade: Float32Array, beam: Float32Array, tint }`. Pure, déterministe pour (ciel, météo, pièce).

## Rendu

- Un canvas hors écran basse résolution est redessiné **3 à 4 fois par seconde** puis injecté dans le SVG de `RoomView` comme `<image>` (`toDataURL`) en un seul calque RGBA en fusion normale (l'ombrage est une teinte translucide, le rayon une lueur chaude translucide). Placé **au-dessus des meubles et des animaux, sous les bulles et les cases**.
- Arrêt de la recomputation : onglet caché, mouvement réduit (une seule image figée), réglage Inactif, scène sans ciel terrestre.
- Nouveau hook `useLightMap(room, view)` dans `src/content/` ; `RoomView` ne reçoit qu'une URL d'image et ses dimensions.

## Tests

- Unitaires du moteur : géométrie du parallélogramme (positions et surface), azimut par fenêtre, atténuation (nuages, soleil masqué, trouée), décroissance de l'ambiant avec la distance, courbe d'adaptation, déterminisme.
- Composant : montage avec fausse horloge ; pas d'`<image>` de lumière si réglage Inactif, mouvement réduit après la première image, ou scène spatiale.
- Pas de test de rendu canvas en jsdom : **vérification manuelle Chrome** à prévoir (rendu des rayons, fusion normale du calque, coût sur pièce de 96 colonnes) puis APK à la demande.

## Livraison

Fiche WikiHow `bibliotheque-v13` (à quoi sert la lumière, d'où viennent les données, comment ça marche, limites). PR, fusion, pré-prod. Mémoire à mettre à jour.

## Risques

- `toDataURL` 3-4 fois par seconde sur de larges pièces : résolution plafonnée (≈ 400 × 90 px) et chronométrage à mesurer en vérification manuelle ; repli = fréquence réduite à 1 par seconde.

## Écarts assumés en 8a

- Pas de trouée en pluie fine (godRay) en 8a : les rais de `scene-weather` existants restent, le rayon ne suit que `hidden`.
- Pas de hook `useLightMap` : `LightLayer` possède la boucle de repeinture.
- La sortie est un unique tableau RGBA, pas `{shade, beam, tint}`.
- L'élévation est une courbe sinusoïdale de `sunFrac` (6° à 62°), non dérivée de `celestialPlace`.
- L'atténuation rasante sin(e)^0.6 vit dans `attenuation.ts`, pas dans `beam.ts`.
- Le couvert nuageux est volontairement compté deux fois (`hidden` l'inclut déjà et `beamGain` applique 1 − 0,85·smooth(cloud)) : réglage à revoir à la vérification manuelle Chrome.
- La lumière ignore les rectangles de verre : aucune ombre sur la vue extérieure.
