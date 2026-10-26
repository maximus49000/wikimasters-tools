# Passeport de la ville — notes de maquette

Maquette (pas du code produit) : `maquette.html`, auto-suffisant, jouable dans un navigateur.
Modes par chaîne de requête : `?portrait=1` (1080 × 2340), `?t=800` (état figé à 800 ms, pour les planches, `&tap=1` dessine
l'onde d'appui), `?who=1..4` (habitant), `?fiches=1` (quatre passeports ouverts), `?planche=ouverture` (six images).
Planches : `planche-ouverture.png`, `planche-fiches.png`, `planche-portrait.png` (rendu Chrome via playwright-core).

## Ce qui existe déjà / ce qui vient du jeu

- La flèche de suivi (`data-follow-marker`, `M-7 -10 L7 -10 L0 0 Z`) et la caméra qui suit la personne touchée : inchangés.
  Dans la maquette la flèche est dessinée 44 × 32 px (2 × le jeu) pour rester lisible sur 2340 px — **proposition**, à trancher.
- Les données de la page d'identité sont celles de `IdCard` (`src/core/library/city/id-card.ts`) : `first`, `age`, `job`,
  `situation` (célibataire / couple / enfant de), `children`, `quarter` (null = habite ici). Deux champs **proposés** en plus :
  l'étage de l'habitant (« habite ici, 2ᵉ gauche », connu par le `Dwelling`) et, pour la nounou, « rend visite à la famille
  Martin, 2ᵉ gauche » (le foyer qui l'emploie, connu par `nannyFor(hh)`).
- Le portrait reprend la tenue `Outfit` de `people.ts` (peau, cheveux + couleur, haut + couleur, accessoire) avec les règles du
  pantin Ghibli : aplats, trait encré `#33241f`, ombre nette = mélange 30 % `#4a3a6a` puis 5 % noir (`shadeOf`). Cols selon le
  haut (costume : revers + cravate ; chemise : col ; manteau/veste : revers + fermeture ; pull : col rond épais), écharpe,
  bretelles du cartable, bandoulière du sac. Le vrai produit devrait rendre la tête du pantin cuit (`bake.ts`) de face plutôt
  que ce dessin simplifié.

## Disposition (paysage 2340 × 1080, 1 px = 1 px écran)

| Élément | Taille / position |
| --- | --- |
| Bouton passeport | disque 120 px, bord 4 px encre, ombre nette 0/7 px ; centre à **+110 px à droite** de l'axe de la tête et **32 px au-dessus** du sommet du crâne (à côté de la flèche, pas au-dessus). Il suit la personne mais **ne dodeline pas** (cible stable sous le doigt). Glyphe : petit carnet bordeaux 38 × 52 avec emblème or, pas de texte. |
| Flèche | 44 × 32 px, dodeline ± 6 px, période ≈ 900 ms (sinus), pointe au sommet du crâne. |
| Pénombre | voile `#1A1422` à 58 % sur toute la rue (la scène continue de vivre derrière). |
| Carnet fermé | 560 × 760 px (ratio ≈ 88 × 125 mm), coins 18 px, bord 4 px encre, ombre nette 12/14 px. Échelle écran : `min((2340−160)/1120, (1080−100)/760)` ≈ **1,29** → carnet fermé 722 × 980 px, ouvert 1445 × 980 px, centré. |
| Page d'identité | 560 × 760 : bandeau « PASSEPORT DE LA VILLE · FR · WIKIMASTERS » (20 px, bordeaux, filet 3 px) ; photo 200 × 240 (cadre encre 4 px, ombre nette) ; prénom 46 px gras ; 🎂 âge 28 px ; 💼 métier 24 px ; puis lignes 23 px : 💞/👪 situation, 👶 enfants, 🏠 habite ici / 🧭 vient de, 🚪 rend visite à ; numéro « N° 1000 · document de jeu » 15 px ; tampon 220 px en bas à droite. |
| Intérieur de couverture (page gauche) | crème foncé, emblème en bordeaux à 45 %, mention « délivré par la Ville de Wikimasters… aucune valeur hors de la Bibliothèque » (22 px). |
| ✕ | disque 104 px en haut à droite (40 px des bords) ; apparaît de 900 à 1100 ms. Toucher le voile ferme aussi. |

Portrait (1080 × 2340) : même carnet à l'échelle `min((1080−80)/1120, 0,6·2340/760)` ≈ **0,89** (ouvert 1000 × 678 px), centré
à 46 % de la hauteur ; la rue derrière est à la même échelle qu'en paysage (tailles sur le petit côté de l'écran).

Glyphes (règle « glyphes au lieu de texte ») : 🎂 âge, 💼 métier, 💞 célibataire / en couple avec, 👪 enfant de, 👶 enfants,
🏠 habite ici, 🧭 vient de, 🚪 rend visite à. Les libellés « Âge », « Profession », « Situation » ne sont pas écrits : la phrase
suffit (« en couple avec Virginie », « 2 enfants : Léa (6), Tom (3) », « pas d'enfant » en gris).

## Animation d'ouverture (1 400 ms au total)

| Fenêtre | Quoi | Courbe |
| --- | --- | --- |
| 0 → 80 → 220 ms | le bouton s'enfonce à 90 % puis revient | linéaire |
| 60 → 420 ms | le carnet **fermé** naît sur le bouton (échelle 0,10 → 1,29, opacité 0 → 1 sur 90 ms, rotation −10° → 0°) et glisse jusqu'au centre de l'écran | sortie douce `1−(1−x)³` |
| 60 → 520 ms | le voile monte à 58 % | sortie douce |
| 420 → 520 ms | pause, carnet fermé au centre | — |
| 520 → 1120 ms | la **couverture pivote** autour de son bord gauche (`rotateY 0 → −180°`, perspective 2600 px, deux faces : bordeaux devant, crème derrière) ; en même temps le livre glisse de 280 px (une demi-page) vers la gauche pour que le livre ouvert reste centré | entrée-sortie douce (cubique) |
| 900 → 1100 ms | ✕ apparaît | linéaire |
| 1120 → 1400 ms | le **tampon** « VU · 25 · 10 · 2026 » se pose (échelle 1,7 → 1, opacité 0 → 82 %, −14°, fondu multiplié) | sortie douce |

Fermeture : même chronologie à rebours, jouée en **0,55 ×** (≈ 770 ms) : le tampon s'efface, la couverture se referme, le carnet
redescend dans le bouton, le voile se lève. Déclencheurs : ✕, appui sur le voile (en dehors du carnet), bouton retour Android.

## Couverture (stylisée, document de jeu)

Bordeaux `#6B1F30` (dos `#4A1522`), or `#D8B35A`. Texte : « VILLE DE WIKIMASTERS » (26 px, espacé 4 px) en haut, emblème
300 px (couronne de feuilles, trois toits de la ville, une carte à jouer), « PASSEPORT » (40 px) / « DE LA VILLE » (20 px) en
bas. Pas de Marianne, pas de puce biométrique, pas de bande MRZ, numéro fantaisie `N° 1000 + 37·i` : rien qui ressemble à un
vrai titre d'identité.

## Propositions à trancher

1. Le bouton à **côté** de la flèche (droite, légèrement plus haut) plutôt qu'au-dessus ; il ne dodeline pas.
2. Pour un visiteur, la ligne 💞 « célibataire » vient de `IdCard` (partenaire inconnu) : on peut la **masquer** pour les
   visiteurs (le jeu ne connaît pas leur vie de famille) et ne garder que 🧭 / 🚪.
3. Le tampon « VU » daté du jour du jeu, la ligne « habite ici + étage » et « rend visite à » sont des ajouts hors `IdCard`.
4. Le voile laisse la rue vivre derrière (58 %) ; si c'est trop chargé sur téléphone, passer à 70 %.
