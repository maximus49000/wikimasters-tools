# Bibliothèque : graphisme Ghibli, G2 — ciel vivant

Deuxième morceau de la refonte Ghibli (vision et règles générales : `2026-10-10-bibliotheque-ghibli-design.md`). G1 (décor fixe de la ville peint, PR #240) est fusionnée. G2 peint le ciel et la météo de la scène Ville.

Maquette validée le 2026-10-10 (`.superpowers/brainstorm/1944-1791664428/content/ciel-peint.html`) : ciel en touches de gouache, cumulus en volutes éclairés en haut à gauche (dessous violet le jour, doré au coucher, bleu nuit la nuit), soleil et lune peints avec halo, étoiles en croix, pluie en longues stries fines, neige douce et posée sur les toits, éclair à lueur, bancs de brume qui dérivent.

## Périmètre

- Scène **Ville** seulement, quand la bascule 🎨 (`wmt:library-art` = `ghibli`) est active. Campagne, montagne et mer gardent la couche météo et le ciel actuels, même bascule activée. Espace et Terre n'ont pas de météo.
- **Mécanique inchangée** : horloge météo (`weather-clock`), couverture = nombre de nuages visibles parmi la réserve, vent, fondus de nuages, hystérésis des gouttes sur la vitre, filets de lumière, éclairs (`lightningAt`), arc-en-ciel, flaques, variables `--wmt-overcast`, `--wmt-overcast-color`, `--wmt-sun-hidden`, `--wmt-precip` lues par la lumière de la pièce et la vitre. Seul le dessin change.
- **Inchangés en G2** : flaques, arc-en-ciel, filets de lumière, gouttes sur la vitre.

## Principe

Comme en G1 : on peint pendant les temps morts (canvas hors écran, `requestIdleCallback`, repli `setTimeout`), une pièce de peinture par créneau, résultat en data URL ; l'animation ne fait que déplacer des images et changer des opacités. Jamais de repeinture par image d'animation, jamais de filtre SVG sur un groupe en mouvement. Tirages par `mulberry32` dérivé de la graine, jamais `Math.random`. Résolution = `devicePixelRatio` plafonné à 2.

## 1. Ciel (décor fixe, mis à jour à la minute)

Dans `SkyAndStars` / `Celestial` (`scene-panorama.tsx`), variante Ghibli pour la Ville :

- **Fond** : dégradé horaire actuel (`sky.top` / `sky.bottom`), puis le voile gris du ciel couvert (`data-sky-veil`) comme aujourd'hui.
- **Texture** : par-dessus le voile, un motif (`<pattern>`) de touches de gouache semi-transparentes, claires et sombres, allongées à l'horizontale, peint une fois dans une tuile carrée qui se raccorde sur ses bords (touches reportées de l'autre côté). Il donne le grain quelle que soit l'heure, y compris sous un ciel gris.
- **Soleil** : image peinte une fois (disque en touches, halo radial), posée à `celestialPlace(sunFrac)`. Deux peintures : jour (jaune pâle) et coucher (orangé), fondues selon `twilight`. L'opacité suit `--wmt-overcast` comme aujourd'hui.
- **Lune** : image peinte une fois (disque en touches éclairé d'un côté, trois cratères, halo bleuté), posée à `celestialPlace(moonFrac)`.
- **Étoiles** : mêmes positions et même opacité (`sky.stars`, transition 4 s) qu'aujourd'hui ; dessinées en points doux, les plus brillantes (un dixième) avec une petite croix. Aucun scintillement : le décor fixe recopié par `<use>` ne doit pas être animé.

## 2. Cumulus (couche météo, en mouvement)

- **Formes** : `cloudShape(seed, k)` décrit le nuage n° k (0 à 11) : rangée basse de bulles au ventre plat, puis étages de bulles plus petites vers le sommet, toutes contenues dans le cadre du nuage (largeur 80 à 120 px à l'échelle 1, hauteur = 0,85 × largeur ; la réserve les agrandit de ×0,8 à ×1,9, comme les nuages actuels d'environ 70 px).
- **Peinture** : `paintCloud(ctx, shape, palette, seed)` peint les bulles du haut vers le bas (les basses recouvrent les hautes, volutes nettes), chaque touche éclairée selon sa position dans sa bulle (lumière en haut à gauche), contraste plus faible vers la base, liseré clair sur le bord éclairé des bulles hautes, ventre ombré.
- **Palette** : `cloudPalette(daylight, twilight, cloudDark)` → trois couleurs (lumière, milieu, ombre), mélange des palettes validées : jour `#FFFDF6 / #DCE3EE / #A6A3C9`, coucher `#FFE7B8 / #F1A783 / #7A6699`, nuit `#7381AE / #4B5687 / #262C58`, gris (pluie) `#C9CDD4 / #9AA0AC / #5E6474`, orage `#8B90A0 / #5B6070 / #2C3040`. `cloudDark` est l'obscurité déjà calculée par la boucle (pluie et ciel très couvert).
- **Crans** : chacune des trois entrées est arrondie au douzième ; la clé (version du dessin, graine, crans) désigne un jeu de 12 nuages peints. Cache mémoire de 3 jeux. Quand le cran change, le nouveau jeu est peint pendant les temps morts, puis les 12 `<image>` de `<defs>` changent de `href` d'un coup ; d'ici là l'ancien jeu reste affiché.
- **Réserve** : les emplacements actuels (`pool` : position, taille `s`, au plus 140) gardent leur nœud `data-wx-cloud` et leur opacité pilotée par la boucle ; leur contenu devient un `<use>` vers le nuage n° `i mod 12` (décalé par la graine), centré comme les ellipses actuelles. La bande et sa copie une largeur plus à gauche défilent comme aujourd'hui. Les nuances par nuage (`tone`) disparaissent : la variété vient des 12 formes.

## 3. Précipitations et phénomènes (couche météo)

- **Pluie** : mêmes motifs (`rain-far`, `rain-near`), même translation et inclinaison par la boucle. Contenu : stries longues (10 à 28 px) et fines (0,6 à 1,5 px), bleu très pâle, opacité variable, extrémités arrondies.
- **Neige qui tombe** : mêmes motifs (`snow-far`, `snow-near`) ; flocons en disque à dégradé radial (blanc au centre, transparent au bord), rayon 0,8 à 3 px.
- **Neige posée** : calque peint **par tranches de 360 px** (même découpe et même plan `CityPaintPlan` que G1) : neige sur chaque versant de toit (rangs de touches blanches qui suivent la pente, au-dessous de la silhouette, jamais au-dessus de `ground - h`), sur les cheminées, sur les rebords de fenêtres, sur le trottoir et la rue (couche irrégulière, plus mince au milieu de la rue). Placé dans le groupe sol de la météo, avec le même filtre d'étalonnage que la ville (`gradeFor` avec les mêmes `daylight`, `twilight` et `gloom` ; `gloom` devient une prop de la couche météo). Son opacité suit `snowCover` (écrite par la boucle seulement quand elle change). Remplace le rectangle `snow-cover` en mode Ghibli.
- **Brume** : bandeau peint une fois (trois bancs de touches très légères, répartition en cloche autour de leur hauteur, raccord gauche-droite), deux copies côte à côte translatées lentement par la boucle (environ 12 px/s, figé si mouvement réduit). Opacité = `fog × 0,8` comme aujourd'hui.
- **Éclair** : même chemin tiré par `lightningAt`, mais tracé brisé plus naturel (segments courts, déviation aléatoire tirée de l'instant de l'éclair), dessiné en trois traits superposés : lueur large bleutée, cœur, filament blanc. Flash du ciel inchangé.

## 4. Calques React

- `src/core/library/paint/sky-painter.ts` : `cloudShape`, `paintCloud`, `cloudPalette`, `paletteStep`, `paintSkyTexture`, `paintSun`, `paintMoon`, `paintFogBand` (fonctions pures sur `PaintCtx`).
- `src/core/library/paint/snow-painter.ts` : `paintSnowTile(ctx, { tile, width, height, seed, plan })`.
- `src/content/painted-sky.ts` : peinture hors écran et caches (texture, astres, jeux de nuages, brume, tranches de neige), sur le modèle de `painted-city.ts` (même repli jsdom, même injection pour les tests).
- `scene-weather.tsx` : lit le réglage par `useArtStyle()` (comme `scene-city.tsx`), Ghibli seulement si `scene === 'city'` ; nouvelle prop `gloom` (passée par `RoomView`) pour l'étalonnage de la neige posée. Les nœuds `data-wx` gardent leurs noms : la boucle ne change que pour les nuages (plus de `fill` par nuage), la brume (translation) et l'éclair (trois traits).
- **Prêt** : tant que la texture, les astres et le premier jeu de nuages ne sont pas prêts, le ciel et la météo actuels restent affichés ; ensuite fondu d'une seconde (bascule directe si mouvement réduit). La neige posée et la brume peintes s'affichent dès qu'elles sont prêtes ; jusque-là, le rectangle de neige et le dégradé de brume actuels.

## 5. Tests

- Peintres : déterminisme (même graine → mêmes appels sur un faux contexte), aucune touche hors du cadre du nuage, du motif ou de la tranche ; formes : 12 formes distinctes, bulles dans le cadre ; palette : bornes, continuité, crans ; neige : touches seulement sur toits, cheminées, rebords, trottoir et rue, jamais au-dessus de `ground - h`, raccord des tranches ; aucune dépendance à `Math.random`.
- Calques : ciel actuel tant que rien n'est prêt (et sous jsdom), échange des `href` au changement de cran, attributs `data-wx` conservés, autres scènes inchangées même bascule activée, ville classique inchangée bascule désactivée.

## 6. Validation

- Banc `.superpowers/harness-ville` (`art=ghibli`) : mesures sur processeur ralenti ×4, pièce de 96 colonnes : temps de peinture d'un jeu de nuages, coût par image de la bande de 140 nuages en `<use>` d'images. Si trop lent, plafond du nombre de nuages visibles (décidé sur mesure, consigné dans le plan).
- Captures à midi, au coucher, la nuit, sous la pluie, sous la neige (toits enneigés), sous l'orage et dans la brume, pièce étroite et pièce large ; validées par l'utilisateur avant la PR.

## Livraison

PR, fusion, pré-prod (`npm run preprod`), extension reconstruite ; APK à la demande. Pas de fiche WikiHow propre à G2 : fiche globale à la fin de G7.

## Hors périmètre

Humains (G3), commerces (G4), véhicules, fêtes, lampadaires (G5), pièce (G6), animaux (G7) ; ciel peint des autres paysages ; scintillement des étoiles ; flaques et arc-en-ciel peints.
