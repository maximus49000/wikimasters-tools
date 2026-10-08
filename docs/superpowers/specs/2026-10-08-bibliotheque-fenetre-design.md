# Bibliothèque — morceau 5a : fenêtre, six scènes, heure

Complète `2026-10-08-bibliotheque-design.md` (vision en 7 morceaux). Validé en discussion le 2026-10-08 (maquette d'un panorama vu par deux fenêtres de tailles différentes). Le morceau 5 est coupé en trois : **5a** (ce document : fenêtre, 6 scènes, heure, activité nocturne), **5b** météo, **5c** Cité de dirigeables (Steampunk). Les vrais événements (au moins 15 par scène) restent au morceau 7.

## Objectif

1. Un nouvel objet mural, la **fenêtre**, de taille réglable.
2. Un **décor par pièce** (ville, campagne, montagne, mer, espace, Terre) dessiné une seule fois sur toute la largeur : toutes les fenêtres sont des cadres sur ce même décor.
3. Une **heure globale** (réelle, jour, nuit, manuelle) avec soleil, lune, étoiles, lever et coucher calculés localement.
4. Une **activité humaine selon l'heure** : lumières des immeubles et passants logiques (beaucoup de monde en début de soirée, presque personne vers 3 h).

## Données

- `Room.scene: SceneId` (`'city' | 'countryside' | 'mountain' | 'sea' | 'space' | 'earth'`), défaut `'city'`.
- `LibraryState.time: TimeSetting` : `{ mode: 'real' } | { mode: 'day' } | { mode: 'night' } | { mode: 'manual', minutes: number }` (minutes depuis minuit, 0 à 1439). Défaut `{ mode: 'real' }`.
- `Placed` gagne `{ id; kind: 'window'; col; row; w; h }` : accroché au mur comme un objet `wall`, mais de taille propre. `w` de 3 à 12, `h` de 3 à 10 (le mur fait 12 lignes), défaut 6×5.
- Version d'état 2 → 3 : migration qui ajoute `scene: 'city'` à chaque pièce et `time: { mode: 'real' }`. Un build antérieur ne lit pas l'état v3 (même limite connue qu'aux morceaux précédents).
- `rectOf` et `canHang` prennent en compte la taille de la fenêtre. Pose, déplacement (appui long puis glisser) et refus (cases fautives qui clignotent) suivent la mécanique des objets muraux. Aucune étagère devant la fenêtre : mêmes cases que les autres objets muraux.

## Taille réglable

- La fenêtre sélectionnée en mode Aménager affiche des glyphes − et + pour la **largeur** et pour la **hauteur**, case par case, de 3×3 à 12×10. Un agrandissement qui chevauche un objet ou sort du mur est refusé (cases qui clignotent). Rétrécir est toujours permis. Le décor derrière ne change pas : seul le cadre grandit, donc le point de vue s'élargit.

## Décor continu

- Chaque scène est une fonction `(largeur en pixels, ciel, activité) → couches SVG` : ciel (dégradé en bandes), astres, lointain, proche, sol. Le contenu varie le long de la bande grâce à un générateur pseudo-aléatoire à graine fixe (graine = scène + abscisse) : deux rendus identiques.
- Le décor est un `<g>` unique dans `<defs>` ; chaque fenêtre est un `clipPath` à son emplacement qui l'affiche avec `<use>`. Le raccord entre fenêtres est ainsi exact sans synchronisation.
- Les éléments mobiles vivent dans ce repère monde. Position = `x0 + vitesse × (t − départ)` pour une **horloge unique** de la pièce : un passant vu à gauche puis à droite respecte le délai distance ÷ vitesse. Une `actor` est une description (sprite, sol, vitesse, sens, créneau d'activité, graine), jamais du code propre à un acteur.
- 5a fournit le moteur et un jeu de figurants par scène : nuages qui défilent (toutes les scènes terrestres), passants et voitures en ville, troupeau et tracteur à la campagne, randonneur en montagne, bateaux en mer, satellite et sonde dans l'espace, station sur la Terre. Les événements rares et scénarisés viennent au morceau 7.

## Ciel et heure

- `sky.ts` (pur, testé) : `skyAt(date, minutes, position) → { phase, sunAltitude, moonAltitude, sunPos, moonPos, colors, starsOpacity }`. Phases : nuit, aube, jour, crépuscule, avec transitions continues. `sunTimes(date, position)` donne lever et coucher (formule astronomique simplifiée, sans service externe).
- Position : géolocalisation du navigateur, demandée seulement la première fois que le joueur choisit l'heure réelle, avec accord ; refusée ou indisponible → longitude déduite du fuseau horaire, latitude moyenne de 45°. Rien n'est envoyé ; la position n'est pas conservée (seul le résultat « accord donné » l'est).
- Modes : **réelle** (heure de l'appareil), **jour** (midi solaire), **nuit** (minuit), **manuelle** (curseur 0 à 24 h). Les modes forcés restent cohérents avec l'activité ci-dessous.
- Espace : toujours sombre, étoiles, planètes ; indifférent à l'heure. Terre vue d'en haut : face éclairée ou côté nuit avec villes lumineuses selon l'heure (la lumière des villes suit la même courbe d'activité).

## Activité humaine selon l'heure

- `activityAt(minutes) → 0..1` (pure, testée) : faible le matin avant le lever puis presque nulle en journée (lumières peu visibles), maximale en début de soirée (≈ 19 h à 22 h), décroissant jusqu'à un minimum vers 3 h à 4 h, avec un petit regain avant l'aube.
- **Lumières** : chaque fenêtre d'immeuble tire de sa graine une heure d'allumage (soirée) et une heure d'extinction (22 h à 5 h, étalées) ; quelques fenêtres « insomniaques » restent allumées toute la nuit ; quelques lueurs bleutées d'écran. Allumage et extinction par fondu de quelques secondes (jamais de bascule brute). Au crépuscule les lumières s'allument en cascade, vers 2 h il n'en reste que quelques-unes.
- **Passants et trafic** : le nombre de figurants humains et de véhicules actifs suit la même courbe ; chacun a un créneau et un sens tirés de la graine.
- Autres scènes : ville et port de la mer (lumières et barques, plus discrets), fermes éclairées à la campagne, un refuge en montagne.

## Interface

- Fenêtre : catégorie « Déco » du catalogue ; le cadre suit le style de la pièce (laiton riveté en Steampunk).
- Panneau « Ciel » en mode Aménager (sous le sélecteur de style) : six glyphes de scène (de la pièce active), quatre glyphes d'heure (réelle, jour, nuit, manuelle) avec curseur d'heure pour la manuelle, et lever/coucher du jour affichés. Tout en glyphes avec infobulle.
- Performance : une seule horloge par pièce (requestAnimationFrame limité à ~30 images/s), suspendue quand la vue est cachée, la page en arrière-plan ou en mouvement réduit (le décor reste affiché, figé à l'heure courante). Éléments SVG animés limités ; les lumières d'immeubles sont mises à jour par paquets.

## Fiche WikiHow et nouveautés

- Fiche `bibliotheque-v7` (fenêtre, taille, scène, heure, activité nocturne ; à quoi ça sert, d'où viennent les données, limites) et entrée « Quoi de neuf ».

## Tests

- `sky` : phases, lever/coucher connus (Paris, solstices), repli fuseau.
- `activityAt` : monotonie des phases (soirée > 3 h), bornes.
- Migration v2 → v3 et validation zod des fenêtres (taille, bornes).
- `rectOf/canHang` avec taille variable ; redimensionnement refusé/accepté ; déplacement.
- Continuité : deux fenêtres, même acteur, décalage de passage = distance ÷ vitesse.
- Rendu : jsdom pour la structure (clipPath par fenêtre, scène, panneau Ciel) ; le rendu visuel est vérifié à la main dans Chrome.

## Hors périmètre

Météo (5b), Cité de dirigeables (5c), événements scénarisés (morceau 7), animaux (6), éclairage intérieur de la pièce selon l'heure (proposé seulement si demandé), parallaxe entre couches.

## Risques

- Dessin de six scènes riches : livrer d'abord la ville et la mer complètes, les autres en version sobre mais cohérente, à enrichir.
- Géolocalisation dans une WebView Android : prévoir le repli fuseau sans erreur.
- Coût de rendu de grandes bandes (96 colonnes) avec beaucoup de fenêtres d'immeuble : limiter le nombre d'éléments, mise à jour par paquets.
