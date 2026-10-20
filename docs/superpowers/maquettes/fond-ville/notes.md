# Le fond vivant de la Ville — notes de la maquette (2026-10-20)

Maquette jetable, à valider **avant tout code** : `maquette.html` (page autonome, sans réseau), assemblée par `node build.mjs`.
Spec : `docs/superpowers/specs/2026-10-20-ville-fond-design.md` (audit §2, catalogue §3 tout retenu, A à O).

**Ce qui est vrai code de l'appli, ce qui est maquette.** `build.mjs` bundle deux fois (vite, lib iife) `src/core/library`
via `entree-appli.ts` : `AVANT` = le peintre tel quel (décor actuel, captures « avant ») ; `RUE` = le même code avec
`hill-painter.ts` remplacé par un stub (`stub-hill-painter.ts`, fond transparent) et, pour `facade-painter.ts` seulement,
`SHADOW_K = 0` (`cel-sans-ombre.ts` : l'ombre en biais du défaut 3 disparaît). Le premier plan (façades, toits, rue,
entrées, arbres, mobilier) est donc **pixel pour pixel celui de l'appli**, peint par `paintCityTile`. Le fond corrigé et la
vie sont dans `src/*.js` (JS lisible, pensé pour être porté dans `hill-painter.ts`, `city-plan.ts`, `facades.ts` et un
nouveau calque) : `01-outils` (cellulo, temps, météo, ciel), `02-plan-fond` (plan corrigé + emplacements de la vie),
`03-fond-peint` (statique : à peindre dans les tranches), `04-vie-fond` (animé : calque), `05-scene` (composition, galerie).

- Galerie : `maquette.html` sans paramètre (31 canvas ; `node capture.mjs` les exporte dans `captures/`). Mode animé :
  `?h=18.5&speed=1&seed=7&date=2026-10-27&meteo=soleil|nuages|pluie|brouillard|neige&zoom=colline|funi|tour|ruelle|mur&scale=2`
  (`speed` en minutes de scène par seconde réelle, 1 = temps réel ; espace pause, ← → ±10 min, + − vitesse ; le HUD compte
  les éléments animés en vue). Débogage : `?T=15.005&seed=7&date=…&meteo=…&view=x0,y0,w,h,scale` (+ `avant=1`).
- Scène 1 440 × 340 (h réaliste), captures ×2 ; zooms ×3 ; séquence de fumée ×4. Toute la scène est une **fonction pure de
  (graine, date, heure, météo)** : pas d'état caché, une même heure redonne la même image.

## 1. Captures (`captures/`)

| Fichier | Ce qu'on y voit |
|---|---|
| `comparatif-graine{1,7,42}.png` | AVANT (décor actuel) au-dessus, APRÈS (D1-D6 + vie) en dessous, 7 juillet 15 h. Aussi en fichiers séparés `avant-*` / `apres-*`. |
| `avant-graine7-nuit.png` / `apres-graine7-nuit.png` | 27 octobre 23 h : défaut 1 (fenêtres allumées posées sur les toits du fond) avant ; après, toutes sous l'égout. |
| `ete-15h.png` | 7 juillet 15 h, soleil : linge aux fenêtres du fond, parasols des terrasses, trafic de l'après-midi, cabines. |
| `automne-18h30.png` | 27 octobre 18 h 30 (coucher 18 h 20) : fenêtres et réverbères qui s'allument en vague, étourneaux, pointe du soir. |
| `nuit-23h.png` | extinctions une à une, volets tirés, tour et dômes illuminés, cadran éclairé, cabines et gares éclairées. |
| `hiver-8h.png` | 10 février 8 h, nuages : fumées, brume au creux de la colline, lève-tôt, arbres nus, aube. |
| `14juillet-14h.png` | drapeaux tricolores sur la tour et les dômes, parasols. |
| `pluie-11h.png` | 8 juillet, pluie : linge rentré, parasols repliés, ciel bas, pas de vols. |
| `zoom-colline-{ete,hiver}.png` | l'échappée ×3 : route en lacets bordée de haies, bosquets, vigne en rangs, square, grands arbres, réverbères, funiculaire, cabine à quai ; fumées, brume et arbres nus l'hiver. |
| `zoom-funiculaire{,-nuit}.png` | croisement des deux cabines à mi-pente (18 h 30 min 55 s), cabines éclairées la nuit. |
| `zoom-tour{,-14juillet,-nuit}.png` | pigeons qui tournent à l'heure pile (15 h 00 min 12 s), posés sur le beffroi avec le drapeau, cadran de nuit. |
| `zoom-ruelle.png` | une fente du premier plan : mur du fond à étages, fenêtres sous l'égout, ruelle en retrait sous le haut du rez-de-chaussée. |
| `zoom-mur{,-nuit}.png` | bandeaux, corniche, travées, volets, linge ; à 22 h 10 volets qui se ferment, fenêtres allumées. |
| `fumee-seq-1..4.png` | 8 h 30 + 0 / 2 / 5 / 9 s : le panache naît au conduit et se dissipe (×4). |
| `rue-cerisiers-11h.png`, `rue-printemps-11h.png` | 2 avril (cerisiers en fleurs, pousses des parterres) ; 28 avril (tulipes, glycine, chandelles des marronniers, feuillage tendre). |
| `rue-ete-15h.png`, `rue-automne-15h.png`, `rue-novembre-15h.png` | 7 juillet (platanes, tilleuls, marronniers, géraniums et lavande) ; 27 octobre (jaunissement, vigne vierge rouge, chrysanthèmes, feuilles mortes) ; 14 novembre (chute en cours, tapis de feuilles). |
| `rue-hiver-11h.png`, `rue-neige-11h.png`, `rue-nuit-22h.png` | 10 février (arbres nus, bruyères et paillage) ; 20 janvier sous la neige (branches et parterres enneigés) ; 27 octobre 22 h (houppiers éclairés par les lampadaires). |
| `zoom-pied-arbre{,-printemps}.png`, `zoom-parterre{,-automne}.png` | pied d'arbre ×3 (fosse à grille, pied fleuri, ombre au sol, houppier devant la façade avec son ombre) ; parterre, bacs, pots ×3. |
| `annee-planche.png` | une année : même coin de rue (haut) et même coin de colline (bas), le 15 de chaque mois à 14 h (janvier sous la neige). |

## 2. Corrections de l'audit (D1 à D6) — correspondance avec le code

Tirage de la rue, de la colline et du mur du fond **inchangé** (`citySkyline`, `cityFacades`, `hillPlan`) ; seules les
hauteurs dessinées et le dessin changent → `PAINT_VERSION` 9 → 10.

| Défaut | Maquette (`02-plan-fond.js`, `03-fond-peint.js`) | Dans l'appli |
|---|---|---|
| D1 fenêtres sur le toit | grille à `eave + 3 + f × 11`, `eave = top + FAR_ROOF_H` | `paintFarWall` (hill-painter.ts l. 231) et `farWindows` (facades.ts l. 22) : `top + 5` → `top + FAR_ROOF_H + 3` (décalage de 4 px) ; test « aucune fenêtre ne recoupe toit ni ciel ». |
| D2 / D5 immeuble coupé bas, bout de toit | `top = min(top, minNearTop − FLOOR)` où `minNearTop` = plus haut de `roofLineY` des immeubles et socles du premier plan sur la largeur de l'immeuble | à faire dans `cityPaintPlan` (city-plan.ts), pas dans le peintre : `farWindowHidden`, `sky-clip.ts` (`cityTopY`) et `snow-painter.ts` lisent `b.top`. |
| D3 triangles en biais | ombre seulement si voisin **mitoyen** (`left.x + left.w ≥ x − 2`) et plus haut ; trapèze de l'égout à `eave + FLOOR`, largeur `0,55 × (y − left.top)` plafonnée à `0,45 w`, ton `shade(wall, 0.28)` | `paintFarWall` (l. 203) et `paintFacade` (facade-painter.ts l. 50) ; `LEFT_GAP` 26 → 2 pour l'ombre (le trait des mitoyens garde sa règle). |
| D4 mur jusqu'au trottoir | le mur s'arrête à `ground − GROUND_FLOOR` ; en dessous, ruelle : `shade(wall, 0.5)`, bande d'ombre à droite, rebord clair + trait à la coupure, porches sombres tous les 14 px, pavés de cour, sol `ground − 3` | `paintFarWall` : `h = ruelleY − eave`, puis `paintRuelle`. Fenêtres bornées à `ruelleY`. |
| D6 dalles plates | plafond `top ≥ H × (0,20 + 0,08 u)` (tiré par immeuble) ; bandeau par étage (ligne claire 0,8 + ombre 0,6), corniche (ombre 2 px + rehaut 0,6), travées de 8 px, volets `look.shutters` (déjà tirés) ouverts (battants 0,7 px) ou tirés | `cityPaintPlan` pour le plafond, `paintFarWall` pour le dessin. |

Le mur du fond est peint dans l'ordre de `plan.buildings` (chevauchement de 4 px, comme aujourd'hui). Échappée (§3) : par
bande de 1 080 px, la suite d'immeubles entiers du fond (118 à 178 px) où le premier plan est le plus bas ; ces immeubles
sont au **minimum permis** (`minNearTop − FLOOR`) et les maisons des rangs 1-2 sont écartées sur cette largeur (rang 0 :
seulement la voie du funiculaire). C'est un changement du plan de la colline (`hillPlan`), pas de la rue.

## 3. Vie du fond — où chaque chose se rend dans l'appli

Trois rendus possibles, du moins cher au plus cher : **(T)** peint dans les tranches fixes (clé de cache étendue) ; **(S)**
calque SVG « vie-fond » à nœuds constants dont seule la pose / l'opacité change (`transform`, `opacity`, `d`) ; **(L)** calque
des lumières existant (`GhibliWindows`), hors étalonnage. Le calque (S) se place **entre les tranches peintes et
`GhibliNightLight`**, sous le filtre d'étalonnage (il se teinte seul la nuit), avec deux `clipPath` fixes par plan : « au-dessus
du premier plan » (`nearTop`, échantillon de `roofLineY` tous les px) et « au-dessus du premier plan et du mur du fond »
(`hillTop`). Rien de la colline ne passe ainsi devant un immeuble. La maquette fait exactement cela avec deux `Path2D`.

| Réf. | Élément | Rendu | Règle (heure, date, météo, tirage) |
|---|---|---|---|
| A | fenêtres allumées colline + mur | (L) rects à opacité : `windowLit(u, minutes, day, daylight, gloom)` de window-lights.ts, seuil `u` par fenêtre | ≤ 8 par immeuble du fond (`FAR_WINDOWS_MAX`, tirage sans remise comme `farWindows`), 1-2 par maison ; cachées si recoupées par le premier plan (fond) ou par le premier plan + mur (colline) : même test que `farWindowHidden`. Alpha 0,5 (mur, `FAR_LIGHT`), `0,5 × (1 − haze)` (colline). Lumière atténuée à 15 % derrière un volet fermé. 382 fenêtres allumables sur 1 440 px (graine 7), 140-176 allumées la nuit. |
| B | volets du fond | (T) tranche de 10 min (`shutterK`) | fermés à `closeAt` ∈ [21 h 20, 23 h 40], rouverts à `openAt` ∈ [7 h, 9 h 10] (30 s de battement), par fenêtre ; 35 % des fenêtres se ferment 14 h-18 h 30 les après-midis d'été ensoleillés ; 8 % de logements vides. |
| C | fumées | (S) 7 bouffées par cheminée (disques), `cx cy r opacity` | jours froids (nov.-mars, neige) ; 30 % des cheminées par jour (tirage `fumee-<clé>` + date) ; 6 h 20-8 h 40 et 17 h-21 h 50 (+ décalage propre, 3 min de fondu) ; bouffée toutes les 1,4 s, vie 9 s, dérive `0,5 + 2,2 × vent` px/s. 34 cheminées fumantes sur 127 le matin d'hiver (graine 7) → **à plafonner à ~12 en vue** (les plus proches / visibles). |
| D | trafic de la route | (S) 2 rects + 2 points par véhicule, nœuds réservés (8 par échappée) | départs par (graine, bande, date, heure) : 5/h aux pointes 7-9 h et 17-19 h (2-3 le week-end), 3/h en journée, 2/h en soirée, 0,4/h la nuit ; voiture 6,5-8,5 px/s, bus (15 %) 5,5 ; entre derrière une maison du rang 2 (ou du rang 0), sort derrière l'autre. 2-3 véhicules en vue par échappée. |
| E | horloge | (S) 2 lignes `transform: rotate` | heure de la scène (`minutes`). |
| F | vols | (S) nuée : 36 rects (étourneaux) ou 6 chevrons (martinets), nœuds fixes | oct.-fév. : 3 passages de 75 s entre coucher − 1 h 20 et coucher ; été 4, printemps 2 passages de martinets de 40 s entre coucher − 3 h 10 et − 0 h 25 ; aucun sous forte pluie ; traversée bord à bord à 20 px/s. |
| G | arbres | (T) saison ; (S) balancement : 2 disques clairs par bouquet, `translate` | vert / roux / nu (traits) / fleuri (`LEAF_SEASON`) ; balancement seulement si vent ≥ 0,25, ±1,2 × vent px. 61 bouquets : **à sauter sur Android** (ou un seul `<g>` translaté pour tous). |
| H | linge du fond | (T) tranche de 10 min (`laundryK`) | jours sans pluie, vent < 0,7 ; 25 % des immeubles (tirage du jour) ; pendu 9 h 10-10 h 25 pièce par pièce (1 min), rentré 16 h 50-18 h 25. |
| I | grue | (S) 4 lignes + 2 rects | semaines tirées (10 sur 52, par échappée) ; montée lundi 7-9 h, démontée vendredi 17-19 h ; flèche `−0,5 + 0,55 sin(tw / 45)` sur le temps ouvré (lun.-ven. 8-17 h), figée sinon ; feu rouge clignotant la nuit (L). |
| J | funiculaire | (S) 2 cabines (4 rects) + 2 câbles | 6 h-0 h 45 ; cycle = montée 110 s puis attente, toutes les 5 min (10 min après 21 h) ; deux voies écartées de 4,4 px, croisement à mi-pente ; gares au-delà des bouts de voie (quai de pierre) ; fenêtres éclairées la nuit (L). |
| K | réverbères | (L) points : `lampLit` de lamps.ts + seuil `daylight < u` (0,40-0,47) | route (un tous les 22-30 px), deux par gare, chapelet de crête (un tous les 48-64 px) : 46 lampes sur 1 440 px, allumées en vague au crépuscule, éteintes 23 h 45-0 h 15 (`offJitter`). |
| L | pigeons | (S) 6 chevrons (posés : 6 rects sur la corniche du beffroi) | heures pleines de 8 h à 21 h, 40 s de vol (rayon qui s'ouvre 5 s, se referme 5 s). |
| M | brume | (S) 2 bandes + 12 écharpes (`roundRect`) à opacité | automne-hiver 5 h-10 h 30 (`0,75 × (1 − rampe 8 h 50 → 10 h 40)`), brouillard (`fog`) ; dérive `0,3 + 1,5 × vent` px/s ; découpe « colline ». |
| N | monuments, drapeaux | (L) lavis chaud alpha 0,28 (tour, flèche, dôme) ; (S) drapeau : 3 polygones, 3 poses clés | lavis du crépuscule (`daylight < 0,4`) à 1 h (fondu 0 h 54-1 h) ; drapeaux les 14 juillet, 8 mai, 11 novembre (`publicHolidays`), hissés 8 h, amenés au coucher, cadence `2 + 6 × vent` poses/s. |
| O | terrasses | (T) tranche de 10 min (`parasolK`) | 40 % des maisons à croupe / mansarde des rangs 1-2 ; pots toujours ; parasol ouvert (20 s) été, `cloud < 0,5`, 12 h-13 h 30 → 19 h-20 h, replié sous la pluie. |

**Verdure de la colline (retour utilisateur : « la colline est trop vide »)** — tout est **peint dans les tranches** (T), aucun
nœud animé ajouté ; le balancement (G) reste limité aux bouquets des maisons déjà comptés. Même langage que les bouquets
(masses sombre / moyen / clair, rehaut en haut à gauche, trait encré), brume selon le rang, saison appliquée (vert vif au
printemps et l'été, roux et or en automne, nus l'hiver ; persistants sombres : cyprès, haies ; vigne en feuilles l'été, en
ceps nus l'hiver). Tirage par graine et position (`verdure-rang-<rang>`, `verdure-crete`, échappée), jamais régulier :

- **Échappée** (`escapeVerdure`, 02-plan-fond.js) : 6-9 bosquets de 1-3 bouquets (r 2-5 px), 2-3 grands arbres isolés
  (marronnier à quatre masses, peupliers en fuseau, cyprès), haies le long de deux ou trois tronçons de route (côté amont,
  4 px de la chaussée), un square (pelouse claire, allée, arbre), une **vigne en rangs** (parcelle en pente, rangs de 3,2 px,
  ceps tous les 2,8 px), parfois un potager. Rien ne couvre la route (distance ≥ rayon + 2,5), la voie du funiculaire
  (≥ rayon + 7) ni les gares ; la route, la voie et les gares sont peintes après la verdure. Coût : 25-40 formes par échappée.
- **Rangs de maisons** : dans chaque creux ≥ 3 × s entre deux maisons, un bouquet, un grand arbre (si ≥ 6 s) ou un potager
  derrière la maison (si ≥ 10 s, 30 %), sauf si la maison y a déjà son bouquet ; 22 % des maisons ont un massif qui dépasse
  derrière le toit (peint avant la maison). Coût : ~1 forme par creux (≈ 60-90 par scène de 1 440 px, 3 rangs).
- **Crête** : un grand arbre ou un bouquet tous les 40-115 px sur la ligne de crête, brume 0,38 (silhouettes sur le ciel) :
  ≈ 20 par scène.
- Coût total : ≈ 150 formes cellulo de plus par scène, peintes une fois par tranche (≈ 1-2 ms par tranche de 360 px) ;
  **zéro nœud animé ajouté**.

**Éléments animés en vue, scène de 1 440 px (graine 7, compte du HUD)** : été 15 h → 2-3 véhicules + 2 cabines + 6 pigeons
(à l'heure pile) ; crépuscule d'automne → 2 véhicules, 2 cabines, 36 étourneaux (un seul `<g>`), 151 fenêtres (opacité) ;
nuit 23 h → 2 cabines, 1 véhicule, 140 fenêtres ; matin d'hiver → 34 fumées (à plafonner à 12), brume, 2 cabines, 2
véhicules, 140 fenêtres. Budget proposé : **≤ 40 nœuds qui bougent par image** hors fenêtres, pose relue à 10 images/s
pour la fumée et la brume, 30 pour les cabines et les véhicules (ils sont petits : 4-6 px).

**Clé de cache des tranches** (poses lentes B, H, O, G-saison, neige sur les toits) : `PAINT_VERSION | seed | height | tile |
… | saison | neige | tranche de 10 min`. Une tranche se repeint donc au plus 6 fois par heure (en pratique quand un volet,
un parasol ou une pièce de linge change dans la tranche : on peut ne repeindre que si le hachage des états change).

## 3 bis. Verdure de la rue principale (`src/03b-rue-verte.js`, couche peinte PAR-DESSUS le premier plan)

Dans l'appli : à peindre dans les tranches de `paintCityTile`, après `paintTree` et `paintFurniture` (ordre : fosses et
pieds → bacs, parterres, pots → troncs → houppiers), avec une clé de cache qui ajoute la date (calendrier) et « balayé /
non balayé » (7 h 30). Le plan (`streetVerdure`) se calcule dans `cityPaintPlan` à côté de `trees` / `furniture`, avec les
mêmes entrées (`blocked` = entrées ± DOOR_MARGIN et locaux, `plan.trees`, `plan.furniture`, `lampsFor`).

| Élément | Emplacement (tirage par graine et position) | Interdits |
|---|---|---|
| Arbres en fosse (grille en fonte 8 × 3,2 px à la bordure, `curb − 1,4`) | un tous les 52-82 px, 7 essais décalés de ± 7 px ; platane (×2), tilleul (×2), marronnier, cerisier ; 14 % jeune au tuteur, 8 % fosse vide ; tronc 21-32 px (13 jeune), houppier r 11-18 px (4-5,5 jeune), inclinaison ± 1 px ; 45 % de pieds fleuris | entrées ± 4 (+2), lampadaires ± 9, arbres existants du plan ± (r + 6), mobilier ± 3, 8 px à chaque bout d'un local (porte du commerce), autres éléments ± 3 |
| Bacs de trottoir | 40 % des locaux ≥ 30 px : 1-2 bacs de 6-9 px collés à la façade (ground + 0,5), côté vitrine, jamais devant la porte | entrées, mobilier |
| Parterre | 50 % des immeubles sans commerce : 12-22 px au pied, haie basse ou fleurs | entrées, mobilier, arbres |
| Grimpante | 15 % des façades, sur l'arête (x ± 1,5), du sol à 6-36 px au-dessus du rez-de-chaussée ; glycine ou vigne vierge | — (sur le mur, hors fenêtres) |
| Pots devant une porte | 30 % des entrées, un ou deux côtés, hors du vantail | — |
| Herbe entre les pavés | une touffe tous les 30-75 px au bord de la chaussée (curb + 0,8 … + 2,4) | — |

**Passage des passants** : le couloir `doorY → walkY` (ground + 2 … ground + 14, soit 12 px) reste libre sur toute la
longueur : les fosses sont à la bordure (curb − 5 … curb, sous `walkY`), les bacs, parterres et pots collés à la façade
(ground … ground + 3,5, au-dessus de `doorY`). Les **terrasses** (deux rangs de tables entre doorY et walkY, devant la
vitrine) ne croisent ni fosses ni bacs. Éléments de l'appli qui passeraient DEVANT un houppier ou un tronc : rien (les
passants, véhicules, terrasses, files et stands sont dans les calques animés au-dessus des tranches : un passant marche
donc devant le tronc, comme devant les arbres existants). Éléments que la couche masquerait si on la mettait au-dessus
des calques : aucun, elle reste dans les tranches.

**Perf** : ≈ 20 arbres, 10 bacs, 8 parterres, 4 grimpantes, 10 pots, 25 touffes par 1 440 px, peints une fois par tranche
(≈ 1 ms par tranche) ; tapis de feuilles : 0 à ~1 500 rectangles de 1 px en novembre. Aucun nœud animé ; le balancement
éventuel resterait limité aux arbres déjà comptés (même choix que la colline : à sauter sur Android).

## 3 ter. Calendrier des saisons (`foliageOf`, `bloomOf`, `bedState`, `leavesOnGround` dans `src/01-outils.js`)

Progressif, par jour de l'année, jamais une bascule à date fixe ; `?date=AAAA-MM-JJ` règle la date dans la maquette.
Chaque arbre a un décalage propre de ± 7 jours (tiré de sa clé) et son essence une avance d'automne :
platane − 10 j, tilleul − 8, peuplier − 5, marronnier − 4, cerisier − 6, vigne − 6, glycine − 2, bouquet 0, chêne + 4.

| Étape | Dates (± décalage) | Rendu |
|---|---|---|
| Débourrement | 25 mars → 25 avril (densité 0 → 1), vert tendre jusqu'à fin mai | masses réduites (0,4 + 0,6 d), tons `tender` → `summer` |
| Plein feuillage | mai → septembre | tons `summer` |
| Jaunissement | 1er octobre → 15 novembre (+ avance d'essence) | tons `summer` → `gold` ou `roux` (tiré par arbre) |
| Chute | 20 octobre → 25 novembre (+ avance) | masses qui s'éclaircissent, branches visibles sous 75 % |
| Nu | fin novembre → 25 mars | branches encrées, masses grises à 45 % |
| Persistants | toute l'année | cyprès, haies, lierre : `EVERGREEN` |
| Feuilles mortes | chute cumulée depuis le dernier balayage (un matin sur trois à 7 h 30, tiré graine + date) | 60 % sous les arbres, 40 % sur le trottoir ; ramassées = 0 |
| Floraisons | cerisiers 20 mars → 15 avril (roses avant les feuilles) ; glycine 10 avril → 20 mai (grappes) ; marronniers 25 avril → 25 mai (chandelles) ; tilleuls 5 → 28 juin (points crème) ; vigne vierge rouge 1er octobre → 5 novembre | montée en 1/4, descente en 1/3 de la période |
| Parterres (jardiniers de la ville) | bulbes 15 mars → 31 mai (pousses, fleurs 1er avril → 10 mai, fanées 10 → 30 mai) ; sol nu 31 mai → 5 juin ; géraniums et lavande 5 juin → 5 octobre (fanées dès le 20 septembre) ; sol nu 5 → 10 octobre ; chrysanthèmes 10 octobre → 30 novembre (fanées dès le 20 novembre) ; sol nu 1er → 5 décembre ; bruyères et paillage 5 décembre → 10 mars | fanées : fleurs brunies et penchées, mélangées aux fraîches selon la part |
| Neige | météo `neige` | calottes blanches sur les masses (arbres de rue et de colline), parterres et bacs blancs, herbe de la colline blanche |
| Herbe de la colline | pâle au printemps, sèche (ocre) de septembre à décembre, grise l'hiver | progressif |

## 4. Couleurs et constantes (toutes dans `01-outils.js` / `02-plan-fond.js`)

- Palette reprise telle quelle de hill-painter.ts et city-plan.ts (HAZE `#9CC0E4`, GRASS `#5E9A50`, STONE `#EAD6B0`, SPIRE,
  DOME_C, BRICK, GLASS_FAR `#5A7AA8`, HILL_WALLS/ROOFS, SHUTTERS). Ajouts : ROAD `#E4C89A`, CABIN `#C8463A`, BUS `#E8B040`,
  CARS (6), drapeau `#2E4A9A / #F4F0E8 / #D84040`, fumée `#ECE8E4`, brume `rgba(232,238,246, α)`, lumières `#FFDFA0` /
  `#C4D8FF` (celles de `GhibliWindows`), réverbère `#FFE8B0` + halo 0,25.
- Verdure : persistants `#2E5A3A #3E7048 #5C8E5A` (cyprès), haie d'hiver `#4A5A48 #5A6E56 #6E8468`, vigne : sol `#B89A6A`
  mêlé d'herbe, feuilles été `#3A7A38 #62A848`, automne `#B07A2A #D8A840`, ceps d'hiver encrés ; potager : terre `#A8865E`.
- Saisons des feuillages : printemps `#4E8A3A #8CC46A #F4C8D8`, été = TREE_TONES, automne `#8A4A24 #D07A30 #F0B040`, hiver
  `#6A5A50 #8A7A6A #A89888` à 55 % + branches encrées ; herbe : été GRASS, printemps `light(GRASS, 0.2)`, automne mélangée
  à `#B89040` (35 %), hiver mélangée à `#9A9A80` (45 %), neige `#E8ECF0`.
- Étalonnage de nuit : `gradeFor(daylight, twilight, gloom)` de grade.ts, appliqué tel quel (feColorMatrix) ; `daylight`
  comme sky.ts (rampe de 60 min autour du lever / coucher, table de Paris interpolée au jour).
- FLOOR 11, BAY 8, FAR_WINDOW 3,5 × 5, FAR_ROOF_H 6, FAR_CAP 0,20-0,28 H, RUELLE_H = GROUND_FLOOR 30, COL_W 118, BAND 1 080,
  FUNI_GAP 2,2, PUFF_P 1,4 s, PUFF_LIFE 9 s.
- Tirages : `rngOf(seed, clé, date)` = `mulberry32((seed ^ hash(clé) ^ (hash(date) + 1) × 2654435761) >>> 0)` ; les tirages
  de structure (fenêtres, seuils, volets, terrasses, échappées, lampes) n'ont pas de date, les tirages du jour (fumées,
  linge, vols, trafic) en ont une.

## 5. Choix faits

1. **Plafond du mur du fond à 0,20-0,28 H** (au lieu de 46 px du haut) : le mur redevient un « quatrième rang » et la colline
   se voit partout au-dessus. Les immeubles les plus hauts du tirage y perdent jusqu'à 3 étages dessinés.
2. **Une échappée par bande de 1 080 px**, là où le premier plan est le plus bas : c'est le seul endroit où la route, le
   funiculaire et la grue sont lisibles ; les maisons de la colline y sont écartées (changement du plan de la colline).
3. Funiculaire à **deux voies** (cabines côte à côte au croisement) et gares au-delà des bouts de voie : la cabine reste
   visible à quai, rien ne disparaît dans un mur.
4. Ombre portée D3 appliquée aussi au premier plan (repeinte par-dessus dans la maquette ; dans l'appli : facade-painter.ts).
5. La vie du fond est **entièrement rendue par la lumière, la fumée, la silhouette et le mouvement d'ensemble** : aucun pantin
   (une fenêtre du fond fait 3,5 px).
6. Fumées à 30 % des cheminées, pas 50 % : au-delà, le fond fume de partout et le coût grimpe.

## 6. Questions ouvertes pour l'utilisateur

1. Hauteur du plafond du mur du fond : 0,20-0,28 H (maquette) ou plus haut (0,15) pour garder des immeubles-tours ?
2. L'échappée (route + funiculaire + grue) par bande de 1 080 px : une seule, ou deux plus petites (route d'un côté,
   funiculaire de l'autre) ? Faut-il la grue (I) ailleurs que dans l'échappée ?
3. Balancement des arbres (G) : à garder seulement sur ordinateur (61 bouquets), ou à supprimer (saison seule) ?
4. Fumées : plafond à 12 panaches en vue, ou moins (8) ?
5. Les volets du fond en tranche de 10 min repeignent la tranche jusqu'à 6 fois par heure : acceptable, ou volets figés par
   demi-journée (fermés la nuit, ouverts le jour, sans l'après-midi d'été) ?
6. Nuées d'étourneaux de 36 points : taille (36) et nombre de passages (3) à ajuster ?
7. Rue : espacement des arbres (52-82 px) et part des fosses vides / jeunes arbres ; faut-il des arbres aussi devant les cafés (les terrasses sont entre la façade et `walkY`, la fosse à la bordure : pas de conflit) ? Les grimpantes sur 15 % des façades : trop ?
8. Calendrier : dates à ajuster (avance des platanes, fréquence du balayage un matin sur trois) ? Magnolias non faits (cerisiers seulement).
9. Densité de la verdure de la colline : ≈ 150 formes par scène (bosquets, haies, vigne, square, potagers, arbres de crête) ; en vouloir plus ou moins ?
10. Faut-il un cycle de jour de la tour (cloche visible ?) : pour l'instant seuls les pigeons marquent l'heure pile.
