# Pluie naturelle — notes de la maquette (2026-10-20)

Maquette jetable : `maquette.html` (canvas 2D, aucune dépendance, assemblée depuis `src/*.js` par `node build.mjs`).
Captures ×2 par `node capture.mjs` (Chrome headless + CDP, `file://`, simulation déterministe à 60 Hz jusqu'à `t`).
Rien dans l'app n'est modifié : le décor de rue de la maquette est une version simplifiée (ce n'est pas l'objet).

- Réglages en haut de page : vue (rue plein écran = dehors / pièce = derrière la vitre), intensité, vent, jour ↔ nuit, orage, pause,
  boutons des 5 préréglages ; le HUD donne le temps de rendu par image et les populations.
- Paramètres d'URL : `?preset=rue-nuit-averse&t=20&scale=2` (capture figée), `flash=1` (éclair figé), `zoom=x,y,w,h` (loupe),
  `view`, `precip`, `wind`, `daylight`, `storm` pour forcer une valeur.
- Captures : `piece-jour-bruine.png`, `piece-nuit-averse.png`, `rue-nuit-averse.png` (comparable à la capture de l'utilisateur),
  `rue-jour-bruine.png`, `rue-nuit-orage.png`.

## Tout découle de `precip` et du vent (aucun réglage indépendant)
Dans l'app, l'intensité reste celle de la météo réelle du lieu (`precip` 0-1, vent `wind` 0-1, `daylight`, orage). Le curseur de la
maquette ne fait que simuler ces conditions. Chaque élément se règle ainsi :

| Élément | Formule (P = precip, W = wind) |
|---|---|
| Nombre de gouttes dehors | `round(P^1.25 × 900)` : bruine 0,15 → ~85, pluie 0,5 → ~380, averse 1 → 900 ; répartition loin 42 % / moyen 36 % / proche 22 % |
| Derrière la vitre | 70 % de ce nombre, et la moitié de la couche proche rebascule en couche moyenne (plus doux), alpha × 0,85 |
| Inclinaison / dérive | vitesse horizontale = `v × (0,08 + 0,55 × W × gust(t))`, `gust` = somme de sinus lentes (0,45..1,55) → rafales ; chaque goutte a en plus un biais propre ±0,06 (plus de hachures parallèles) et les proches un balancement |
| Éclaboussures | une goutte proche qui touche le sol en fait toujours une, une moyenne 1 fois sur 4 (× 0,4 derrière la vitre) ; plafond 160 vivantes ; vie 0,3 s |
| Anneaux dans les flaques | probabilité par flaque et par seconde = `P² × rx × 0,11` (rx = demi-largeur de la flaque) ; plafond 90 ; vie 0,7-1,2 s |
| Gouttes des bords (auvent, corniche, toit, gouttière) | période `lerp(3,2 s, 0,45 s, P)` × 0,6 gouttière × 1,6 toit, déphasées par point ; la gouttière coule en filet continu au-delà de P = 0,55 |
| Ruissellement du caniveau | lame d'eau de hauteur `1,5 + 6 P` px (visible dès P > 0,08), `6 + 40 P` filets clairs qui courent à `60 + 120 P` px/s vers la grille, bouillon à la grille ∝ P |
| Sol mouillé / flaques | `wet` monte en 2 s sous la pluie (P > 0,08) et sèche en 20 s ; reflets des lumières et flaques ∝ `wet` (équivalent des `WET_ON/OFF` de l'app) |
| Halos des lampadaires (nuit) | rayon `40 + 56 P`, alpha `(1 − daylight) × (0,14 + 0,26 P)` |
| Brume de pluie | voile `#DCE4EC` (jour) / `#2A3450` (nuit) d'alpha `P × 0,1` (+0,06 la nuit) |
| Gouttes posées sur la vitre | cible `90 + 220 P` (arrivent une à une, 40/s max) ; rayon `0,9 + u^1,8 × 2,6` px (u aléatoire) ; grossissent de `0,08 P` px/s, se décrochent à 4 px |
| Coulures sur la vitre | naissance `lerp(0,08/s, 0,55/s, P²)` + les gouttes décrochées ; dévalent par à-coups (arrêts 0,1-0,6 s, vitesse max `25 + 9 r²` px/s), absorbent les gouttes posées sur leur passage, sèment des perles (toutes les 10-60 px, r 0,6-1,7), fusionnent entre elles, zigzaguent (marche aléatoire) + penchent avec `W × gust × 0,35 × 0,35` |
| Traces | vie 8 s, filet clair (`#FFFFFF` jour / `#C8D4EC` nuit, alpha 0,3 → 0) + bord encré 0,14 |
| Buée | voile `#EEF2F6` (jour) / `#C4CEE0` (nuit) de 45 % de la hauteur vers le bas, alpha max `0,1 + 0,14 P` (× 0,7 la nuit) ; effacée par les coulures (largeur r/2 à demi-résolution), repousse à 3 %/s ; 26 vieilles marques fixes en bas |
| Orage | éclair toutes les 4-9 s : flash 0,35 s (sous les gouttes pour qu'elles ressortent), tracé à 2 pointes + ramification |

## Valeurs (couleurs, tailles, vitesses)
- Gouttes dehors : `#E6EDF7` (jour) → `#C9D6EA` (nuit), **raw** (jamais teintées par `amb`). Couches (px de scène, scène 1000 px de large) :
  - loin : v 170-260 px/s, longueur 5-9 × (0,6..1,5), épaisseur 0,6, alpha 0,22 × (0,55..1,25), trait plein ;
  - moyen : v 300-420, longueur 9-16, épaisseur 0,9, alpha 0,36, trait en dégradé (queue transparente → tête opaque, cassure à 70 %) ;
  - proche : v 520-720, longueur 16-34, épaisseur 1,6, alpha 0,46, dégradé + halo flou (épaisseur +2,6, alpha × 0,22) ; 6 % de « grosses » avec une tête ovale.
  - Longueur ×(1 + 0,3 × inclinaison) ; `lineCap: round`.
- Nuit : alpha × `lerp(0,3 + 0,9 × min(1,2, lightAt), 1, daylight)` ; `lightAt` = cônes des lampadaires (demi-largeur 12 + 0,6 × dy, décroît sur 300 px) + boule de 80 px autour de la lanterne + 0,6 devant les vitrines allumées (0,35 sur le trottoir devant). Le reste de la pluie reste à 30 %.
- Éclaboussures : couronne = ellipse qui s'ouvre de 1 à 8 px (épaisseur 0,8) + 3-5 gouttelettes de 0,9 px éjectées vers le haut (60-150 px/s, gravité 900), ×1,3 pour les gouttes des bords, ×1,6 pour les grosses.
- Anneaux : ellipse rapport 0,26, rayon final 5-12 px, couleur gouttes + 30 % blanc, alpha 0,55 × (1 − âge) × P.
- Perles qui pendent : rayon 0,6 → 2,2 px pendant la période ; goutte qui tombe : ellipse 0,8 r × r(1 + v/250), gravité 900.
- Eau au sol : `#9FB4C8` (jour) / `#1C2440` (nuit) ; flaques = reflet du ciel (jour) ou noir bleuté + traînées des lumières (nuit), cerne encré alpha 0,5.
- Reflets sur le sol mouillé : traînée verticale sous chaque source, rangées de 1,6 px espacées de 2-5 px, 30 % manquantes, largeur ±60 %, longueur 150 px (lampadaire) / 70 px (vitrine), alpha décroissant en (1 − u)² ; force 0,14 + 0,5 × nuit (lampadaire), 0,05 + 0,16 × nuit (vitrine).
- Gouttes sur la vitre (cellulo) : corps = `mix(mix(couleur derrière, couleur éclairée, 0,5), blanc, 0,3 jour / 0,18 nuit)` alpha 0,6/0,68, ellipse r × 1,15 r ;
  haut assombri encre 0,14 (jour), **bas lumineux** = couleur éclairée + 40 % blanc (image inversée : la lumière du bas apparaît en bas de la goutte,
  le ciel en bas) ; bord encré `#2A1A18` alpha 0,5, épaisseur ≤ 1, de −0,3 à 1,9 rad (bas-droit) ; reflet blanc 0,85 en haut-gauche (0,26 r × 0,18 r).
  La « couleur éclairée » est le plus lumineux des échantillons pris 6 r au-dessus et 6 r au-dessous (ce que la goutte réfracte).
  La nuit, si cette luminance > 0,4 : halo radial 3,2 r d'alpha 0,7 × (L − 0,25) → les gouttes devant les vitrines et lampadaires rayonnent de leur couleur.
- Coulure : même goutte, étirée (×1,25 en hauteur) avec une queue triangulaire vers le haut (1,5 à 4 r) quand elle court.
- Vitre : flou 0,7 px sur la scène, voile `#C8D8E8` (jour) / `#1A2238` (nuit) alpha 0,14 + 0,08 P, reflet chaud de la pièce en bas à gauche la nuit (alpha 0,07).

## Pour que ça tienne sur Android (recommandations)
- **Technique : un canvas 2D dédié par vue** (pas de SVG) posé au-dessus de la scène, ou intégré à l'offscreen existant ; la pluie actuelle en `<pattern>` SVG
  coûte peu mais ne peut pas varier (c'est ce qui fait les hachures). Deux canvas en vue pièce : rue (derrière la vitre) + vitre (gouttes), ou un seul
  avec un `clip` sur les carreaux. Pas de `ctx.filter` sur Android (le flou 0,7 px de la vitre coûte cher : le remplacer par le voile seul, ou flouter
  une fois le calque statique de décor).
- **Budgets** : gouttes dehors plafonnées à **600** sur téléphone (`P^1,25 × 600`, la scène y est plus petite), 350 en basse définition ;
  éclaboussures 80, anneaux 40, gouttes des bords 40 points max ; vitre : 220 posées max, 12 coulures vivantes max, traces 120 points chacune.
- **Précalculé** : (1) le décor mouillé + reflets + flaques = calque statique, repeint seulement quand `daylight`/`wet`/`P` changent par pas (clé arrondie,
  comme `decorKey` ici) ; (2) **sprites de traits** : 3 couches × 4 longueurs × 2 alphas pré-rendus dans une feuille (`drawImage` au lieu de `stroke` +
  dégradé par goutte : le dégradé par trait est la partie la plus chère de la maquette) ; (3) **sprites de gouttes de vitre** : 6 rayons × 2 (jour/nuit),
  teintés par `globalAlpha` + un `fillRect` de la couleur échantillonnée en `source-atop` sur un petit canvas, ou plus simple : 3 teintes fixes
  (neutre, chaud, froid) choisies selon l'échantillon ; (4) l'échantillon de couleur derrière la vitre = `getImageData` sur une copie 1/8 toutes les
  250 ms (coût ~0,2 ms), jamais sur le canvas principal ; (5) halos de lampadaires = gradient créé une fois par taille.
- **Pas de simulation quand c'est invisible** : onglet caché, scène hors écran, `prefers-reduced-motion` (gouttes posées seules, sans coulures ni pluie),
  P = 0 → tout désalloué. Tick à 30 Hz pour la vitre (les coulures sont lentes), 60 Hz pour la pluie proche seulement.
- **Masque de buée** à ¼ de résolution (ici ½) ; repousse par un `fillRect` blanc à faible alpha, effacement `destination-out` des seuls 2 derniers points de trace.
- Ordre de dessin en vue pièce : décor → pluie adoucie → voile de verre → buée masquée → traces → gouttes posées → coulures → châssis.
- Mesure maquette (Chrome headless bureau, 1000×460 ×1, HUD après 9 s) : vue rue à P = 0,85 = **4,0 ms/img** (735 gouttes, 84 éclaboussures, 33 anneaux) ;
  vue pièce = **11,4 ms/img** (515 gouttes + 281 posées + 2 coulures + buée + `filter: blur`) : c'est la vue à optimiser (sprites de gouttes, pas de `filter`, tick 30 Hz). À mesurer sur le S26 une fois porté.

## Choix faits seul (à valider)
- Les gouttes de la vue rue restent visibles à 30 % hors des cônes de lumière la nuit (sinon la pluie disparaît entre deux lampadaires).
- Les traînées des coulures sont peu inclinées par le vent (× 0,35) : sur une vitre réelle, elles descendent presque droit et zigzaguent.
- Buée volontairement légère (max 0,24) pour garder la rue lisible ; les coulures y creusent des sillons plus sombres.
- Les flaques sont figées (positions fixes) ; dans l'app elles existent déjà (`puddles`) et les anneaux s'y poseraient.
- Les gouttes des bords sont attachées à des points fixes de la façade (auvent tous les 16 px, coins de corniche, faîte, descente de gouttière) : à relier aux vrais éléments du décor.
- Pas d'image de la pièce derrière (reflet intérieur) : seulement une lueur chaude dans le coin bas-gauche la nuit.

## Fonctions à porter
- `RainOutside` (03) : `spawn / step / addSplash / makeBolt / alphaAt / paint` → remplace les `<rect fill=url(#rain-*)>` de `scene-weather.tsx` par un calque canvas ;
  `lightAt(x, y)` (02) à alimenter par les vraies sources de la scène (lampadaires, vitrines allumées).
- `GlassRain` (04) : `step / paint / drawDrop / refreshSample / colorAt` → calque par fenêtre dans `RoomView` / `library-window` (rect `PANE`).
- `gust(t)` (01) : rafales partagées par les deux calques.
