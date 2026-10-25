# Arbres de rue naturels — maquette (2026-10-24)

Demande : « L'implantation des arbres en bord de route n'est pas naturelle ; les arbres n'ont pas de branche connectée aux
feuilles restantes en automne ; au sol l'arbre vole sur le béton mais n'est pas implanté dans un parterre de terre. »

Fichiers : `maquette.html` (autonome, canvas 2D, ×3 / ×4 / ×8), `planche-implantation.png`, `planche-pied.png`,
`planche-automne.png`, `planche-houppier.png`, `planche-tronc.png`, `avant-apres.png`. Repère = scène Ville à 340 px de haut (`cityMetrics`) : `ground` 238, `doorY` 240,
`walkY` 252, `curb` 258,4. Style cellulo : aplats, trait encré `#2A2238`, ombre nette violette `rgba(70,50,130,0.26)`.

## 1. Implantation — recommandé : variante A (boulevard)

| | A — boulevard (reco.) | B — rythme des façades | Actuel |
|---|---|---|---|
| règle | pas constant **60 px** à partir d'une phase (40 px), centre libre cherché à **± 12 px** (pixel par pixel, gauche/droite alternés), sinon **la place reste vide** (on saute, les voisins ne bougent pas) | un arbre au milieu de chaque trumeau entre deux portes consécutives (entrée ou porte vitrée, ± DOOR_MARGIN) si l'intervalle ≥ 36 px, décalage ≤ 12 px sinon rien | pas 48 + rng × 24, recherche ± 21 px → espacements 34-93 px, trous et paquets |
| essence | **une par tronçon** (coupé au passage piéton) : platane / tilleul / marronnier ; cerisier réservé aux placettes | tournante | tirée par arbre |
| taille | même âge : fût 42 ± 3 px, rayon 20 ± 1,5 | idem | fût 34-52, rayon 16-24 |
| jeune au tuteur | 1 place sur 10 (remplacement), couvre-sol P3 | — | 12 % + 4 % de fosses vides |

Obstacles (demi-largeur de fosse `PIT_HALF` = **7** au lieu de 5) : entrée ± `DOOR_MARGIN`, porte vitrée de local ± 4,
lampadaire ± 9 (−2 : la grille peut frôler le socle), passage piéton et poteau du feu ± (`CROSS_HALF` + 6), arrêt de bus ± 26,
scènes de la Fête ± (`STAGE_HALF` + 4), bords de l'image ≥ 2 px. Inchangé par rapport à `PIT_*_CLEAR`, seule la demi-fosse grandit.

Pourquoi A : un alignement au pas régulier se lit tout de suite comme voulu ; un trou devant une porte ou un arrêt de bus reste
« dans le rythme ». B dépend des largeurs d'immeubles (tirées 58-92 px) : écarts 36 → 120 px, arbres collés aux lampadaires,
et dans une rue de locaux (portes vitrées + entrées) il ne reste presque plus de trumeau assez large.

## 2. Pied d'arbre — carré de terre à la bordure

Géométrie (px monde) : carré **14 × 5,4**, de `walkY` + 0,6 = 252,6 à `curb` − 0,4 = 258 (le couloir des passants `doorY → walkY`
reste libre, comme aujourd'hui). Pied du fût `FOOT_Y` = 255,4 (centre du carré en perspective ; aujourd'hui `curb` − 1,4 = 257).

Couches, de l'arrière vers l'avant :
1. bordure de pierre `#CDBDA0`, face avant `#B8A68A` (0,8 px), trait encré 0,5 ;
2. terre : fond `#5A4634`, surface `#7A5E44` (retrait 0,4 / 0,6), 9 mottes `#6A5038` (1-2 × 0,5 px) ;
3. **fût avec collet** : le polygone du fût s'évase sur ses 3,2 derniers px (demi-largeur 1,25 w0 → 1,9 w0, courbe quadratique)
   et descend 0,8 px **sous** la surface ; une lèvre de terre `#6A5038` (demi-ellipse 3,6 × 0,9) est repeinte devant ;
4. ombre portée du fût : parallélogramme de la lèvre à `curb` + 1,8 (pente h × 0,2) — même direction qu'aujourd'hui ;
5. finition : **P2 grille en fonte ajourée** (3 anneaux 0,55 px `#3E3A3A` de rayons 2,4 / 4,4 / 6,4 écrasés × 0,38, 10 barreaux
   rayonnants 0,45 px, reflet `#8A8478` sur l'arc du haut) ou **P3 couvre-sol** (brins `#5E9A50` 0,5 px tous les 1,1-1,9 px hors
   ± 2,6 du fût, 6 points `#56A844`) ; P1 = terre nue (fosse vide / jeune plantation).
   Reco : P2 pour les adultes, P3 pour les jeunes au tuteur et les fosses « vides ».

Fleurs de saison (`paintFlowersRow`), flaque de pluie et feuilles mortes restent, sur la terre (y = `FOOT_Y` + 0,4).

## 3. Automne — touffes portées par les rameaux

Deux causes dans `hill-trees.ts` :
- `treeModel` : la touffe est posée à t ∈ [0,45 ; 1] du rameau avec une gigue de ± 0,4 r : au bout de la chute, la touffe
  rétrécie n'est plus sur le bois ;
- `paintBranches('fine', { d })` : un rameau n'est dessiné que s'il est NU (`rank − d + 0,1`) ; le rameau qui porte encore une
  touffe (rank < d) et toutes les branches intermédiaires (rang plus faible) restent invisibles → les feuilles flottent, et les
  rameaux nus du bout apparaissent avant leur branche (lv 2) → brindilles détachées.

Règles de la maquette (rang du bas de `planche-automne.png`) :
1. **ancrage** : t ∈ [0,7 ; 1] (bout du rameau), gigue ± 0,125 r ; la touffe rétrécit sur place (`rr = r × size`) ;
2. **visibilité d'un segment** = max( règle « nu » actuelle, `carry` × sat((0,97 − d)/0,1), sat((0,3 − d)/0,2) ), où `carry` = 1
   si une touffe de taille > 0 est dans le sous-arbre du segment (les rameaux et branches qui mènent aux feuilles restantes
   apparaissent dès que le feuillage perd 3 %, à plein dès 13 %) ; sous d = 0,3 tout le squelette est plein ;
3. **remontée** : alpha(parent) = max(alpha(parent), alpha(enfants)) — une branche est toujours au moins aussi visible que
   ses rameaux, rien ne flotte ;
4. ordre de dessin : ombre des masses, fût, **toutes** les branches (règle 2-3), feuilles par-dessus (elles recouvrent le bois
   qu'elles portent, le rameau entre dans la touffe).

Jaunissement : par touffe `sat(yel × 1,5 + rank × 0,5 + tf.yel × 0,2 − 0,4)` (les bouts d'abord). Dates de la planche :
1er sept. d 1 / 15 oct. 0,86 / 1er nov. 0,64 / 15 nov. 0,40 / 1er déc. 0,16 / hiver 0.

## 5. Houppier V3 — d'après les 4 photos de référence (retour « le haut de l'arbre pas naturel du tout »)

Photos : `b138add7` (platane / tilleul), `0e72b30a` (robinier étagé), `508d1ede` (frêne), `ad6cef53` (cerisier en fleurs).
Langage commun en cellulo (`treeModelV3`, `paintTrunkV3`, `paintBranchesV3`, `paintLeavesV3` dans la maquette) :
- **branches et rameaux toujours dessinés** (`#4A3A30`, frêne `#3A3230`, morts `#8A8078`), le feuillage se pose dessus : les
  bouquets qui restent en automne sont au bout d'un rameau visible **par construction** (plus de règle de visibilité à gérer) ;
- **bouquets dentelés** (`leafCloud` : 22 sommets, sin 4a + sin 7a, allongé × 1,3 / 0,8 dans le sens du rameau), 1 à 4 nuages par
  bout de rameau en recul de 0,95 r le long du rameau, rayon `tuft × hauteur de couronne` (0,07 à 0,12 → 4 à 6 px), plus des
  nuages sur les rameaux intermédiaires (`along`) ; 3 tons par nuage (ombre, moyen décalé en haut à gauche × 0,72, 1-2 touches
  claires), pointillé encré 0,8 px `rgba(42,34,56,.6)` ; ombre portée violette (+4, +5) ;
- **squelette** : tronc en fuseau (collet évasé, sinuosité `sinu` px à mi-hauteur) jusqu'à la fourche à `fork × hauteur totale`,
  `n0` charpentières ouvertes de `spread` rad, puis `depth` niveaux de 2-3 branches (ouverture `spreadSub`, longueur × `sub`,
  redressement vers le ciel `up`), arrêtées dans une **enveloppe** elliptique (largeur `W × CH`, centre `cy`, demi-hauteur `ry`) à
  partir du niveau 2 ; rang d'une touffe = 0,4 × distance normalisée + 0,3 × tirage − 0,12 (les bouts tombent d'abord).

| essence | fork | n0 / spread | enveloppe W, cy, ry | tuft, bouquet, density | particularités |
|---|---|---|---|---|---|
| platane / tilleul | 0,30 | 2 / 0,6 | 0,9 · 0,52 · 0,54 | 0,10 · 2-4 · 1 | fourche basse, 2 charpentières qui s'écartent, plus haut que large |
| robinier étagé | 0,55 | 3-4 / 0,55 | 1,15 · 0,68 · 0,42 | 0,12 · 3-4 · 1 | tronc fin (w 0,6) sinueux (2,2 px), gerbe en V, masses étagées larges en haut, vert olive |
| frêne | 0,50 | 2-3 / 0,7 | 1,1 · 0,56 · 0,52 | 0,10 · 1-2 · 0,8 | tronc droit sombre crevassé, 60 % des bouts garnis, rameaux morts au sommet (`dead`) |
| cerisier | 0,25 | 3-4 / 0,95 | 1,35 · 0,5 · 0,54 | 0,07 · 2-3 · 1 | éventail ouvert, large et bas (total 72 px), nuages le long des rameaux dès le niveau 2, `bloom` avril : tons roses + pétales au pied |

Palettes : platane vert `#4E8A3C #6CAE4C #9ED06A` → automne `#A8702A #D29A3A #EAC060` ; robinier `#5A7A34 #7A9A44 #A8BC60` →
`#B89A2A #DEC040 #F2E070` ; frêne `#4A7A3C #6AA050 #9CC870` → `#9A8A3A #C8B040 #E8D060` ; cerisier `#4A8A42 #6AB052 #9CD070` →
`#A0402A #D06A34 #F0A058`, fleurs `#D88AA8 #F0B0C8 #FCDCE8`. Écorces : `#C8B898 #7A6E5E #5A5250 #6A5A54`.

Hauteur totale des adultes 88 ± 4 px (cerisier 72), bas de la couronne = fourche (25-55 % selon l'essence) ; le tronc reste
visible sous la couronne. Échelle 1 vérifiée (bande du bas de la planche) : bouquets de 4-6 px lisibles, branches 0,4-2 px.

**Recommandé pour la rue** : une essence par tronçon (coupé au passage piéton et à l'arrêt de bus) — platane sur le tronçon
principal, robinier et cerisier sur les tronçons courts ; frêne en placette. Le « rideau » taillé n'a pas été retenu (rigide,
n'a de sens qu'en mur continu).

Dans le code : `rue-sprites.ts` dessine le fût + TOUTES les branches dans la couche fixe (`paintBranches` sans règle `d`), et les
grappes de feuilles (`which` = charpentière `mass`) dans les calques au vent comme aujourd'hui ; `treeModel` remplacé par le
modèle V3 pour les arbres de rue (la colline garde le sien) ; `paintLeaves` : `leafBlob` → `leafCloud` orienté + bouquets de
2-4 nuages par bout ; `tuftState` : même formule de taille, rang recalculé (0,4 / 0,3 / −0,12). La planche 3 (règle de
visibilité des rameaux) devient inutile avec V3, elle reste pour mémoire.

## 6. V4 — squelette continu (retour « encore trop géométrique, tronc pas naturel par rapport aux branches »)

Remplace la V3 dans toutes les planches « proposé » (`treeModelV4`, `tubePath`, `paintSkeletonV4`, `leafCloud4`, `paintLeavesV4`).

**Squelette = axes à largeur continue.** Chaque axe (tronc, charpentière, branche, rameau) est une Bézier quadratique de
contrôle décalé de ± `sinu` (tronc : 0,05 × L ; autres : 4-11 % de L) → courbe légèrement sinueuse, jamais un segment. Sa
demi-largeur suit w²(t) = ws² × (1 − k t) − Σ ws² × share_fille × lissage((t − t_fille)/0,18) : k = 12 % (tronc, charpentières),
35 % (branches), 75 % (rameaux : pointe fine). Les filles **naissent sur les flancs** de l'axe à des t tirés dans `kidsT`
(tronc : platane 0,80-0,96, robinier 0,82-1, frêne 0,8-1, cerisier 0,6-1 ; autres niveaux 0,4-0,95), avec une section
`share` × ws² (règle de Léonard : Σ filles ≤ 70 % de la mère, la **continuation** au bout garde le reste) ; côté alterné (80 %),
première charpentière du côté opposé à l'inclinaison du tronc (équilibre). Direction = tangente locale ± `ang`, redressée vers
le ciel de `up` (continuation : 1,6 × up, ≤ 0,8). Collet : × (1 + 0,75 e^(−9t)) sur le tronc. Inclinaison du tronc 0,03-0,08 rad.
Dessin : **un trait encré commun** (1,3 px, tous les tubes) puis les tubes remplis (contour continu, raccords pleins aux
fourches), flanc droit ombré (tubes décalés de 0,55 w découpés dans le squelette, `shade(bark, 0,42)`), nœuds sombres au départ
des charpentières, écorce qui pèle (platane), crevasses (frêne), rameaux morts `#8A8078` (frêne, haut de la couronne).

| essence | tronc L1 | L2 / L3 / L4 | départs tronc n, t, ang | autres niveaux n, ang | up | enveloppe W, cy, ry | bouquets r, dens(L3, L4), along |
|---|---|---|---|---|---|---|---|
| platane | 0,32 | 0,36 / 0,24 / 0,14 | 1 · 0,80-0,96 · 0,45-0,75 | 2-3 · 0,45-0,85 | 0,30 | 0,95 · 0,52 · 0,56 | 3,2 · 0,7 / 0,95 · 0,5 |
| tilleul | 0,32 | idem | 1 · 0,80-0,96 · 0,40-0,65 | 2-3 · 0,40-0,80 | 0,35 | 0,85 · 0,52 · 0,56 | 3,2 · 0,7 / 0,95 · 0,5 |
| robinier | 0,55 | 0,30 / 0,18 / 0,10 | 2-3 · 0,82-1 · 0,30-0,60 | 2-3 · 0,40-0,80 | 0,40 | 1,15 · 0,70 · 0,42 | 3,6 · 0,8 / 1 · 0,5 |
| frêne | 0,50 | 0,36 / 0,20 / 0,12 | 1-2 · 0,8-1 · 0,40-0,70 | 1-2 · 0,35-0,70 | 0,40 | 1,1 · 0,56 · 0,52 | 3,0 · 0,4 / 0,75 · 0,4 (+ morts) |
| cerisier | 0,25 | 0,34 / 0,22 / 0,12 | 2-3 · 0,6-1 · 0,60-1,00 | 2-3 · 0,50-0,90 | 0,20 | 1,4 · 0,50 · 0,54 | 2,5 · 0,85 / 1 · 0,8 |

(L = fraction de la hauteur totale ; w0 = (1 + 0,026 × total) × w, w = 1 / 0,95 / 0,62 / 0,85 / 0,8.)

**Feuillage.** Points de bouquet le long des branches (L3 : t = 0,35 · 0,7 · 1) et des rameaux (L4 : t = 0,25 · 0,5 · 0,75 · 1),
tirés à `dens` ; en chaque point 2-4 nuages de rayon r × (0,45-1,3) (soit **1,2 à 4,7 px** à l'échelle 1), jetés à ± 0,7 r,
orientés ± 0,4 rad autour du rameau. Nuage `leafCloud4` : 16 sommets, fréquences propres à chaque nuage (sin k1·a, k1 = 3-5 ;
sin k2·a, k2 = 6-9) → plus de lobes répétés ; 3 tons (ombre, moyen décalé (−0,22 r, −0,3 r) × 0,7, 1 touche claire si r > 1,6),
pointillé encré 0,7 px à 55 %. Rang de chute = 0,4 × distance au centre de l'enveloppe + 0,3 × tirage − 0,12 ; taille = sat((d −
rang)/0,36) ; les nuages rétrécissent sur place, sur un squelette toujours dessiné : rien ne flotte.

**Planche `planche-tronc.png`** : ×6, les 4 essences nues (hiver) pour juger la continuité tronc → charpentières → branches →
rameaux. **`planche-houppier.png`** : 5 colonnes (platane, robinier, frêne, cerisier été, cerisier avril/hiver) × (été, 1er nov.)
à ×4, puis la bande à l'échelle 1. **`avant-apres.png`** : APRÈS = A + P2/P3 + V4, platane / robinier / cerisier par tronçon.

Dans le code : `hill-trees.ts` garde `treeModel` pour la colline ; les arbres de rue passent à un modèle « axes + tubes »
(`rue-trees.ts` à créer : `treeModelV4`, `tubePath`, `paintSkeleton`, `paintClouds`), `rue-sprites.ts` dessine le squelette
complet dans la couche fixe (fût + branches, un seul remplissage), les nuages par charpentière (`mass` = index de la charpentière
du tronc, à propager dans `grow`) dans les calques au vent ; la boîte des sprites se calcule sur les tubes + nuages.
Coût : ~60-110 axes et 80-200 nuages par arbre adulte (contre 60 touffes) — à mesurer sur le S26 avant production.

## 7. V5 — pointes fines, dentelle de rameaux, couronnes aérées (retour « encore un petit effort »)

Sur la V4 (gardée) :
- **Pointes** : un axe terminal (niveau 5, ou demi-largeur ≤ 0,18) a w²(t) = ws² (1 − 0,97 t) et un bout en POINTE (plus de cap
  rond ; `pointed`) ; décroissance par niveau 12 / 20 / 35 / 55 / 97 %.
- **5ᵉ niveau** : chaque rameau (niveau 4) porte 2-4 brindilles courtes (L5 = 6-7 % de la hauteur, t ∈ 0,3-0,95, angle 0,5-0,95,
  section 15-25 %) ; les axes de demi-largeur < 0,5 px ne sont plus des tubes encrés mais des **traits dégressifs** (largeur 2 w
  par segment, 0,25 px minimum, bois sombre `#4A3A30`, frêne `#3A3230`, morts `#8A8078`) dessinés sous les tubes ; trait encré
  des tubes 1,3 px (tronc, charpentières) / 0,9 px (branches). En hiver : dentelle de brindilles en bordure, pas de moignons.
- **Couronnes aérées** : trouées franches = sous-arbre entier d'une branche de niveau 3 sans bouquet (`gap` : platane 25 %,
  tilleul/robinier/cerisier 20 %, frêne 40 %) ; bouquets surtout sur les niveaux 4-5 (t 0,4-0,8 / 0,6-1), peu sur le niveau 3
  (dens 0,25-0,5), 1-3 nuages de rayon tuft × (0,5-1,25) avec tuft 2,0-2,8 px (soit **1,0-3,5 px** à l'échelle 1) : plus
  d'unités, plus petites, réparties sur toute la hauteur de la couronne le long des branches.
- **Cerisier** : départs du tronc à t ∈ 0,5-1 (éventail ouvert), charpentières qui s'affinent, brindilles nombreuses.

## 4. Ce qui change dans le code

- `rue-verte-plan.ts` `streetVerdure` §1 : remplacer la boucle `x += PIT_STEP + rng() × PIT_STEP_SPREAD` + `PIT_SEARCH` 21 par
  `PIT_PITCH = 60`, `PIT_PHASE` (tirage 30-50), `PIT_SEARCH = 12`, **saut** si rien n'est libre ; `PIT_HALF = 7` ; essence par
  tronçon (index du tronçon entre deux `fixtures.lightX` / bords) ; `h = 42 ± 3`, `r = 20 ± 1,5` ; `y = FOOT_Y` (`curb − 3`) ;
  `young` 1/10 au compteur, `empty` → P1. `PIT_MIN_GAP` devient inutile (pas ≥ 60).
- `rue-verte-painter.ts` : `PIT` → `{ w: 14, h: 5.4 }`, fosse peinte en deux passes (`paintPitBack` avant les arbres dans la
  tranche, `paintPitFront` = lèvre + ombre + grille/herbe **dans le calque des arbres** après le fût, car la lèvre recouvre le
  pied) ; `rueSpan` élargi à ± 8 ; `paintFlowersRow` sur la terre.
- `hill-trees.ts` : `treeModel` (t et gigue des touffes : option `anchorTip` pour ne pas toucher la colline, ou appliquée
  partout), `Seg.parent`, `Tuft.seg` ; `paintBranches` : nouvelle option `{ carry: TuftState[] }` et remontée du max ;
  `paintTrunk` : option `collet`.
- `rue-sprites.ts` : couches `trunk` → fût + collet + branches (toutes, règle 2-3) ; `fine` disparaît (fusionnée) ; boîte des
  sprites : + 3 px en bas (lèvre, grille).
- `city/metrics.ts` : rien (le carré tient entre `walkY` et `curb`).
- WikiHow : fiche « Arbres de la rue » à mettre à jour (alignement, pied de terre).

Hors maquette : feuilles mortes au sol et vent inchangés ; neige sur la terre (liseré blanc de `paintFlowersRow`) suffit.
