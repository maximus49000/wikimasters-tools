# Façades parisiennes — notes de la maquette (2026-10-18)

Maquette jetable : `maquette.html` (canvas 2D, aucune dépendance). Captures : `rue-jour-10h.png`, `rue-jour-10h-zoom.png`,
`rue-crepuscule-19h.png`, `rue-nuit-22h.png`, `rue-nuit-22h-zoom.png`, `rue-nuit-2h.png`, `lucarnes-planche.png`, `avant-apres.png`.
Échelle : 1 px de maquette = 1 px de scène (captures ×2, zooms ×4, planche ×3).

## Mise en page (`facadeLayout(b, ground, seed)` — pure et déterministe)
Entrée : `{ x, w, h }` en px de scène + sol + graine. Générateur `mulberry32(seed ^ hash('facade') ^ round(x*8))`, comme le moteur.

- **Type** : `haussmann` si `w ≥ 56` et `h ≥ 120` (78 %), sinon `faubourg` (plus modeste : enduit, volets, toit simple).
- **Toit** : haussmann → mansarde zinc, `roofH = clamp(round(h × 0.12), 14, 20)` dont **terrasson 4 px** (bande plate claire) et
  brisis (trapèze rentré de 2,5 px par côté, joints debout) ; faubourg → zinc 11 px ou tuile 12 px, deux versants à faible pente,
  faîtage à 42 % de la largeur.
- **Rez-de-chaussée** : `GF = 30` (inchangé : boutique + porte cochère de l'immeuble, travée de bord, `doorBay = 0 | n-1`).
- **Entresol** : 11 px, haussmann de `h ≥ 150` (60 %), petites fenêtres basses, jamais allumé la nuit (bureaux, seuil `u ≥ 0,75`).
- **Travées** : `n = clamp(round((w − 6) / 17), 2, 5)` (15 pour le faubourg) ; pas `pitch = w / n` ; **centres `x + pitch × (i + 0,5)`**
  (marges égales, toutes les fenêtres à l'aplomb sur toute la hauteur). Largeur de fenêtre `winW = clamp(pitch × 0,42, 5, 8)`,
  arrondie au demi-pixel.
- **Étages** : `avail = h − roofH − GF − entresol` ; `n = round(avail / 17)` (14,5 faubourg), borné 1..7 ; poids **noble ×1,25**
  (premier étage au-dessus de l'entresol, haussmann), **dernier ×0,85**, autres ×1 ; on retire un étage tant qu'un étage
  descend sous **10 px** (téléphone). Hauteur d'étage propre à chaque immeuble (les bandeaux ne s'alignent donc qu'à l'intérieur
  d'un immeuble : choix à valider, les voisins ont souvent des niveaux proches mais pas égaux).
- **Fenêtres** : standard `h × 0,62` posée à 42 % de la hauteur libre ; porte-fenêtre (`french`, étage noble et étage à balcon
  filant) `h × 0,72` jusqu'au plancher ; dernier étage `h × 0,56` ; cage `(winW − 2,5) × 0,4 h` à **mi-étage** (palier).
- **Balcons** : filant (dalle en débord + garde-corps 5,5 px, barreaux au pas de 1,5, deux volutes par travée, pot de fleurs)
  à l'étage noble et au dernier étage carré si `n ≥ 4` ; balconnets (4 px, largeur fenêtre + 2,4) sur 60 % des autres étages
  haussmanniens ; volets persiennés (faubourg) de part et d'autre, jardinières sur 35 % des fenêtres de faubourg.
- **Cage d'escalier** : `stairBay = doorBay` si `n ≥ 4` (65 %) ; colonne de petites fenêtres à l'aplomb de la porte ;
  `stair = { u, floorsLit }`, allumée quand `u < litFrac × 0,8`, du bas vers le haut sur `floorsLit` paliers (l'imposte de la
  porte s'allume avec).
- **Logements** : par étage, les travées hors cage sont découpées en groupes de **2 ou 3** (`splitBays` : 2→[2], 3→[3],
  4→[2,2], 5→[2,3] ou [3,2]) ; un logement = `{ u, tone, curtain{color, style side|voile}, props[lamp|plant|shelf|null] }`.
- **Lucarnes** (`dormersFor`) : mansarde → type principal par immeuble (fronton triangulaire 60 % / cintré 40 %), posé sur
  **50 % des travées** (hors cage) ; 20 % œil-de-bœuf à la place ; au-dessus de la cage : rien ou œil-de-bœuf ; au moins une
  lucarne ; tabatière sur le terrasson (50 %, décalée de 3 px). Toits simples → une capucine au plus (travée proche du
  faîtage), une tabatière ailleurs (60 %). Résultat : jamais une rangée identique, jamais une par colonne.
- **Cheminées** : souches en brique `#C2724E` de 4 px, 3 pots, aux murs mitoyens (4 px du bord, seconde si `w > 70`),
  **toujours dans la boîte `h` de l'immeuble** (la silhouette du moteur ne change pas).

## Lumière (`ENV = { dark, tint, litFrac, hour }`)
- Tous les aplats passent par `amb(c) = mix(c, NIGHT #1E2A5A, dark)` (`dark` : 0 à 10 h, 0,32 à 19 h avec teinte DUSK
  `#6A4A7A`, 0,64 la nuit). Les lumières et leurs lueurs sont peintes en couleurs brutes, par-dessus.
- `litFrac` reprend la courbe semaine de `city/window-lights.ts` : 0 (jour), 0,38 (19 h), 0,66 (22 h), 0,02 (2 h). Logement
  allumé si `home.u < litFrac` ; les 2-3 fenêtres d'un logement s'allument ensemble, même teinte, mêmes rideaux.
- Teintes : chaude `#FFD86A` (38 %), crème `#FFF0C0` (28 %), orangée `#FFB048` (22 %), télé `#9CC4FF` (12 %, barre claire au
  milieu) ; cage `#F4F0D8` ; reflet clair en haut de vitre (30 % de la hauteur).
- **Lueur qui retombe** : deux paliers plats `rgba(255,214,130,0.22)` (bord net), forme trapèze à fond arrondi de
  `d = clamp(0,7 h, 4, 9)` px sous l'appui, + liseré fin autour du cadre (0,16), appui `#FFE8B0`, jardinière et dalle/garde-corps
  de balcon teintés devant une porte-fenêtre allumée (barreaux en silhouette sur la vitre).
- **Vitres éteintes** : nuit `#232D52` mélangé à 25 % au mur ambiant (jamais plus clair que le mur), reflet `rgba(150,170,230,0.22)` ;
  jour `#7FB4E0` + reflet blanc 0,72 (on voit peu l'intérieur) ; rideaux visibles éteints (teintés par l'ambiance).
- Boutiques : vitrine le jour, rideau métallique `#8A8AA0` de 20 h à 7 h. Lampadaires : cône + flaque `rgba(255,222,150,0.22)`.
- Fond : peint AVANT le premier plan ; une fenêtre du fond n'apparaît jamais devant un immeuble plus proche (ordre du peintre,
  déjà celui de `paintCityTile`).

## Couleurs
Pierre `#EDE2C8 #E8DCC0 #F0E6D0 #E4D6BA #EAD5B0 #F2E8D4` · enduits faubourg `#F6E2B4 #EEC79A #CFE0B8 #E0C8A0 #F4D89C #E6BCD0` ·
zinc `#8290A2 #98A4B4 #7A8AA0` · tuile `#C86A40 #B4523A` · brique `#C2724E` · fer `INK #2A1A18` · bois des portes
`#2F5D50 #2E4A6E #5A3A2E #3A4A3A` · volets `#8FA88C #6A7A9A #B8705A #7A8A6A` · rideaux `#F4E6D0 #C85A3A #5A7AA8 #E8C890 #8A5A8E` ·
ombre = `shade(c, t)` vers `#5A4A9C`, rehaut = `light(c, t)` vers `#FFF6D0` (cel.ts inchangé).

## Fonctions de `maquette.html` à porter
`facadeLayout`, `splitBays`, `dormersFor` (→ `city/facades.ts`, remplace `lampsOf`/`extraFloorWindows` pour le premier plan) ;
`paintFacade`, `paintWindow`, `paintBalcony`, `paintRoof`, `paintChimney`, `paintDormer`, `paintGroundFloor` (→ `paint/city-painter.ts`,
en gardant les devantures et entrées existantes) ; `litFraction`/`homeLit`/`stairLit` (→ `city/window-lights.ts`, seuil par
logement et non par fenêtre) ; `amb` (→ remplace la grille éteinte/allumée par fenêtre dans `ghibli-night.tsx`).
Hors maquette : `streetLots`, `farRow`, `paintSky`, `paintStreet`, `paintOldBuilding` (avant/après).

## Choix à valider
1. Gabarits : la maquette tire `w` 44-110 et `h` 100-220 comme demandé ; le moteur donne 40-70 × 64-160 (après ×1,6) : il faudra
   soit élargir les lots (`citySkyline`), soit accepter 2-3 travées et 3-4 étages sur les immeubles actuels.
2. « 2ᵉ étage » = premier étage au-dessus de l'entresol (il n'y a pas la place d'un 1er étage distinct sous 160 px).
3. Hauteur d'étage par immeuble (bandeaux non alignés entre voisins) plutôt qu'une hauteur commune à la rue.
4. Cheminées contenues dans `h` (pas de dépassement de silhouette) ; les pots affleurent le haut du toit.
5. Les vitrines passent au rideau métallique la nuit dans la maquette : dans l'app, ce sont les devantures existantes qui décident.
