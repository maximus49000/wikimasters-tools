# Bibliothèque Ghibli — G6 : la pièce

Date : 2026-10-24. Statut : **maquette VALIDÉE par l'utilisateur** (v3, `docs/superpowers/maquettes/g6-piece/` : `piece-ghibli.html` animée et autonome, `piece-ghibli.png` page entière, `anim-1..4.png` instants de l'animation). Prochaine étape : le plan d'implémentation.

Suite de la refonte Ghibli (spec générale `2026-10-10-bibliotheque-ghibli-design.md`). G1 à G5 sont fusionnées (ville, ciel, humains, véhicules, commerces, fêtes). G6 redessine **l'intérieur de la pièce** : meubles, petits objets, murs, sol, fenêtres, décors muraux et lumière. G7 traitera les animaux.

## 1. Intention

L'utilisateur veut « retrouver le style Ghibli des dessins animés » dans sa pièce : du **naturel, ni plus ni moins**, et de l'esthétique. Aujourd'hui la pièce fait « cubique » : des boîtes 3D à faces unies pâles, sans trait franc ni ombre portée, des murs et un sol en deux aplats, des halos flous. Elle ne ressemble pas à un intérieur réel.

La pièce est le **premier plan** de l'appli, à quelques centimètres des yeux sur le téléphone. La moindre erreur se voit : trait qui bave, ombre décalée, angle raté, balancement saccadé. La barre de qualité est donc plus haute que pour la ville.

Objectif à long terme, hors G6 : un humain vivra un jour dans la pièce et se servira des meubles (prendre un CD, regarder la télé, lire, s'asseoir dans le canapé). G6 doit préparer ces usages sans les réaliser.

## 2. Décisions de l'utilisateur (2026-10-24)

- **Découpage** : G6 couvre la pièce et les meubles qui réagissent ; G7 couvre les animaux, redessinés, et leurs gestes complets (le chien passe par l'entrée de la niche, met la tête dans la gamelle et mange).
- **Les 8 styles sont gardés** (scandinave, moderne, industriel, bohème, rétro 70, japandi, néon, steampunk). Chacun est redessiné façon Ghibli en gardant son identité, avec les règles de naturel.
- **Chaque meuble est un vrai objet 3D**, beau sous **ses 8 angles**. L'utilisateur refuse « une face jolie et le tour moche », les « meubles carrés sans vie » et le « style peint ou PowerPoint très cubique sans mouvement ». La logique de chaque phase (angle, état) est pensée avant le dessin.
- **Tout le catalogue d'un coup**, en une seule étape G6 et au même niveau d'exigence, pas par vagues.
- **Mobilier vivant** : un meuble réagit seulement quand il est utilisé, comme dans la réalité. Exemple de référence : le chat saute sur le rocking-chair, qui se balance puis s'amortit.
- **Aménagement neutre** : aucune réaction quand l'utilisateur pose, glisse ou tourne un meuble.
- **Lumière comme dans la vraie vie** : le jour qui entre par la fenêtre règle la luminosité de la pièce (heure, météo) ; les lampes l'éclairent davantage, et d'autant plus qu'il fait sombre.
- **Pas de film de référence en particulier** : l'esprit commun des intérieurs Ghibli (bois chaleureux, tissus vécus, plantes, objets du quotidien, lumière douce).
- **Maquette validée** (v3) : langage cellulo, technique « vrai volume 3D rendu en dessin animé », tour du meuble, 3 styles sur le canapé, animation du chat et du rocking-chair. Seuls le palmier, le saut du chat et la place du monstera ont été repris après la v2 ; le reste a été validé tel quel. Défaut connu de la maquette, sans effet sur l'appli : la lanterne y touche le socle du lampadaire, ce qui ne compte que pour la composition de la page.

## 3. Langage graphique (repris de la maquette)

- Le **cellulo** de la ville (voir `src/core/library/paint/cel.ts`) :
  - un aplat ;
  - **un** ton d'ombre à bord net teinté violet-bleu ;
  - un rehaut sur les arrondis ;
  - un trait encré brun foncé `#2A1A18`, d'épaisseur variable : épais en silhouette, fin sur les arêtes intérieures.
  - Ni grain, ni vignettage, ni flou.
- **Volumes arrondis et vécus** :
  - coussins bombés qui gardent un creux, accoudoirs ronds, patins courbes ;
  - bois aux formes adoucies, tissu qui tombe, plis suggérés par les creux et les arêtes encrées.
- **La pièce** :
  - mur à cimaise, avec un enduit discret en aplats et un léger dégradé de lumière vers la fenêtre, **sans tache parasite** ;
  - plinthes, parquet à lames (ou le sol propre au style) ;
  - rideaux qui respirent à peine ;
  - tache de soleil en biais au sol avec l'ombre des croisillons ;
  - ombres portées nettes des meubles au sol ;
  - flaques de lumière des lampes à deux tons nets, pas de halo flou.
- **Un style = un jeu de couleurs + des variantes de pièces** (pieds, capitons, rivets, plaid à franges, matières). Le volume du meuble ne change pas d'un style à l'autre.

## 4. Technique validée : un volume 3D unique, rendu en dessin animé

La maquette contient un mini-moteur (environ 250 lignes, `piece-ghibli.html`) qui sert de **référence de portage** :

- **Primitives arrondies** :
  - super-ellipsoïdes, avec déformation de creux pour les coussins, accoudoirs et assises ;
  - tubes le long de courbes (patins, arc du lampadaire, rachis des palmes) ;
  - tours de révolution (pieds, pots, lanterne, pouf) ;
  - feuilles planes déformées.
- **Rendu** :
  - z-buffer logiciel avec normales lissées quantifiées en 2 tons (base + ombre) et un rehaut ;
  - encre par détection de silhouette (trait épais) et d'arêtes (trait fin) ;
  - ombre portée projetée au sol.
- **Les 8 angles, les styles et les états** sortent du même modèle. On ne dessine jamais un angle à la main.

### Dans l'appli

- **Caméra de la maquette (choix de l'utilisateur, 2026-10-24)** :
  - la vue des meubles devient la **vraie perspective de la maquette** (focale `f = 650`, inclinaison `pitch` 0,24 rad, rotation `yaw` par pas de 45°), à la place de la projection affine actuelle (`FACE_CAMERA`, la profondeur montait à la verticale) ;
  - l'utilisateur a choisi ce rendu exact plutôt que de garder l'ancienne vue, en sachant que cela agrandit le chantier ;
  - **tout ce qui était calculé en pixels par l'ancienne projection est donc recalculé** avec la nouvelle caméra : emprise dessinée (`drawSize`, `groundTrace`), points des animaux (`poiPoint`, `perchAt`), cadres de face des décalques (`faceFrame`, `DecalArt`, `openingOf`), occulteurs, surplomb (`overhangOf`), zone de toucher (`hitRectOf`), ordre de dessin, boîtes de la lumière (`occluderBoxesOf`) ;
  - la caméra plongeante (`PLUNGE_CAMERA` : vue Modifier, zoom de la hi-fi) suit le même modèle de perspective, avec une inclinaison plus forte ;
  - les tests qui figent des valeurs en pixels sont mis à jour en conséquence, pas désactivés.
- **Le modèle reste en cm** (`furniture-models.ts`).
  - Il garde les mêmes `w/d/h`, les mêmes `pois`, `face`, `perch`, `glow`, `base` et la même emprise au sol en cases que le modèle actuel.
  - La grille, la demi-case, la rotation et les positions enregistrées (colonne, rangée, angle) ne changent pas : **aucune donnée enregistrée ne migre**.
- **Le dessin devient une image** :
  - chaque meuble est un sprite par (meuble, angle, style, état, contenu) ;
  - il est peint sur canvas puis posé en `<image>` en **data URL** (pas de `blob:` : la CSP du site les refuse) ;
  - mise en cache avec le modèle de la ville : file `paint-queue.ts`, canvas partagé `willReadFrequently` comme `figure-host.tsx`, LRU, budget de peinture par image, l'ancien rendu reste affiché tant que le nouveau n'est pas prêt.
- **Les contenus propres aux cartes** (couvertures, dos de livres, tranches de jeux, pochettes, écran, façade de la hi-fi) restent posés **par-dessus** le sprite, aux mêmes cadres de face qu'aujourd'hui (`faceFrame`, `DecalArt`). Raison : ces images viennent de sites tiers et rendraient le canvas illisible (`toDataURL` refusé). Le sprite prévoit la place (ouverture des étagères, présentoir, écran) ; les décalques sont redessinés dans le même langage.
- **Repli** : tant que le sprite d'un meuble n'est pas prêt, le dessin actuel (`Model3DArt`) s'affiche. C'est le même principe que la ville depuis la PR #281 : le classique est le moteur et le repli, Ghibli le seul rendu affiché. Vitest garde le classique par défaut (`__WMT_ART_DEFAULT__`).

## 5. Périmètre (tout le catalogue)

| Groupe | Éléments |
|---|---|
| Meubles au sol (`STANDING_KINDS`) | shelf, desk, chair, sofa, armchair, basket, bowl, kennel, plant, lamp, coffee-table, rug, globe, telescope, automaton, charger, rocking-chair, club-chair, loveseat, daybed, egg-chair, peacock-chair, pouf, square-pouf, beanbag, bench, dresser, side-table, cat-tree, monstera, strelitzia, palm, cactus, pampas, paper-lantern, arc-lamp |
| Objets portés (`ITEM_MODELS`) | monitor, small-plant, small-lamp, small-alarm, small-clock, small-station, small-hifi ; objets rangés cd, dvd, game, book ; présentoir incliné (`standPieces`) |
| Faces dessinées à la main | tranche de jeu (`game-spine.tsx`), hi-fi (`hifi-art.tsx` : façade, dessus, grilles, disque, pochette), faces de réveil, pendulette et station (`TableFace`) |
| Décors muraux (`deco`) | wall-clock, digital-clock, weather-station, barometer, panel-chalk, panel-letter, panel-neon, panel-cork, avec leurs animations (`deco-live.tsx`) |
| Objets muraux | poster, vinyl, sleeve-square, sleeve-round, sleeve-frame (`library-card-art.tsx`) |
| Fond de pièce | mur, sol, plinthe et motifs des 8 styles (`room-backdrop.tsx`, `DECORS`), cadres de fenêtres et rideaux (`window-art.tsx`), décor steampunk animé (`room-steampunk-decor.tsx`), contour néon |
| Ombres et lumière | ombre au sol des meubles (aujourd'hui un polygone gris à 16 %), lueur des lampes allumées (`lit`), calque de lumière (`light-layer.tsx`) |
| Vues dérivées | zoom de face d'un meuble (`furniture-zoom.tsx`), second zoom d'étagère (`shelf-board-zoom.tsx`), zoom de la hi-fi (`HifiZoom.tsx`, caméra plongeante), vue Modifier (`ArrangeView.tsx`, caméra plongeante), vignettes du catalogue (`furniture-thumb.tsx`), objet ouvert (`opened-item/`, CSS 3D) |

Le steampunk garde ses pièces propres (`STEAMPUNK_TRIM`, globe, télescope, automate) et son décor animé, redessinés en cellulo.

## 6. Mobilier vivant (G6)

Un meuble réagit **seulement quand il est utilisé**, avec une amplitude réaliste, une inertie et un amortissement. En G6, ses utilisateurs sont les animaux actuels, avec leurs actions existantes (`perch`, `sleep`, `hide`, `scratch`, `eat`/`drink`, `charge`). Le dessin des animaux reste celui d'aujourd'hui jusqu'à G7.

Réactions attendues :
- **Rocking-chair** : il bascule à l'arrivée et au départ d'un animal, puis s'amortit en quelques secondes, en roulant sur ses patins (rotation autour du centre de courbure). Il est immobile quand il est inoccupé.
- **Assises en tissu** (sofa, loveseat, armchair, club-chair, chair, daybed, bench, pouf, square-pouf, beanbag, coussin du panier, coussin du rocking-chair, egg-chair, peacock-chair) :
  - le coussin se creuse sous l'animal qui s'y pose ou y dort ;
  - **il garde le creux** un moment après son départ, puis reprend sa forme lentement ;
  - le pouf poire s'affaisse.
- **Fauteuil œuf suspendu** : il oscille doucement quand un animal y monte ou en descend.
- **Arbre à chat** : le plateau ploie légèrement à la réception ; le pompon suspendu se balance quand on le frôle.
- **Plantes** : les feuilles frémissent quand un animal passe contre elles, puis se calment.
- **Canapé, cachette dessous** (`hide`) : la jupe ou le tissu bouge à l'entrée et à la sortie.
- **Fauteuil griffé** (`scratch`) : léger tremblement du tissu pendant le geste.
- **Lampes** : l'allumage et l'extinction passent par un fondu court de la lueur, pas une bascule sèche.
- **Rideaux** : ils respirent à peine en permanence, un peu plus si la fenêtre a du vent dehors.

**L'animal suit le meuble** (mon choix, conséquence de l'anti-objectif « un objet qui en traverse un autre ») :
- quand un meuble bouge sous lui (bascule, creux, plateau qui ploie, oscillation), l'animal reçoit le même décalage et la même rotation ;
- il ne flotte jamais au-dessus du meuble et ne s'enfonce jamais dedans ;
- cela touche le placement des animaux (famille `scene-animaux`), pas leur dessin.

Sont exclus de G6 et laissés à G7 : la gamelle qui se vide, l'entrée par l'ouverture de la niche, la tête dans la gamelle, et tout geste d'animal.

**Aucune réaction pendant l'aménagement** (poser, glisser, tourner).

**Préparer l'humain** (mon choix : le minimum) :
- G6 n'ajoute aux modèles que ce dont ses propres réactions ont besoin : centre de bascule, zones de creux, points d'oscillation ;
- ces données sont décrites de façon générale (« le meuble bouge ainsi quand on s'y pose »), pour qu'un humain puisse les réutiliser plus tard ;
- **aucun nouveau point d'usage** n'est ajouté sur tout le catalogue, et **aucun humain** n'est ajouté.

## 7. Lumière

- **Le moteur de lumière actuel est gardé** (`src/core/library/light/*`, `light-layer.tsx`) : soleil, ciel, météo, lune, lampes, ombres portées, ombre des animaux.
- **Son rendu passe au cellulo** :
  - tache de soleil et flaques de lampes à bords nets en 2 tons, au lieu de halos dégradés ;
  - assombrissement de la pièce selon le jour qui entre par la fenêtre ;
  - les lampes éclairent davantage la nuit.
- **Répartition entre les sprites et le calque** (mon choix) :
  - le modelé cellulo des sprites a **une seule direction de lumière pour toute la pièce**, celle de la fenêtre principale, ou haut-gauche s'il n'y a pas de fenêtre ;
  - le côté éclairé ne change pas d'un meuble à l'autre ni la nuit, ce qui garde un cache raisonnable ;
  - jamais de miroir : un angle et son symétrique sont peints séparément ;
  - **la luminosité** (heure, météo, lampes, ombres portées) reste l'affaire du calque de lumière, posé par-dessus ;
  - les sprites ne sont pas assombris eux-mêmes, pour que la pièce ne soit jamais assombrie deux fois.
- **Pas de coin de pièce en fuite** (mon choix) : la pièce défile en largeur, donc le mur reste droit sur toute la longueur. Le pan de mur gauche de la maquette n'est pas repris. Les zones où l'on pose fenêtres, décors et meubles ne changent pas.

## 8. Contraintes

- **Android d'abord** : l'appli Android est la cible principale. La validation visuelle se fait sur le vrai téléphone (S26), à la taille réelle, sous les 8 angles et dans les 8 styles. La campagne de mesure de performance sur téléphone est prévue après G7, comme pour toute la refonte. Au banc, on mesure sur PC avec CPU ×4 et on compare à main.
- **Animations** :
  - aucun meuble ne doit être repeint à chaque image ;
  - les états animés (inclinaisons du rocking-chair, creux du coussin, oscillation du fauteuil œuf) sont **précalculés en un petit nombre de sprites** puis interpolés ou alternés ;
  - le nombre de paliers est laissé au constructeur, assez fin pour qu'aucune saccade ne se voie au premier plan.
- **Ne pas rompre** : le placement (demi-case, emprise, rotation), le surplomb, le toucher, les zooms, l'objet ouvert, la hi-fi, les notes de musique et le lien entre bibliothèques. Les familles de tests `scene-piece`, `scene-lumiere`, `scene-animaux` et `scene-commun`, plus `room-backdrop`/`room-window*` de `scene-ville`, doivent passer.
- **Vérification** : un **banc d'essai de la pièce** est à créer (aucun n'existe). Il affiche une pièce meublée par style, à heure et météo choisies, avec un animal qui déclenche les réactions, et une planche du catalogue sous les 8 angles.
- **Captures montrées à l'utilisateur au fil de l'eau**, étape par étape, en PNG publiés sur GitHub : il consulte depuis son téléphone.

## 9. Non-objectifs et anti-objectifs

- **Non-objectifs** :
  - redessiner les animaux et leurs gestes complets (G7) ;
  - ajouter un humain dans la pièce ;
  - ajouter de nouveaux meubles ;
  - les 5 autres paysages ;
  - une fiche WikiHow (une seule fiche globale à la fin de G7).
- **Anti-objectifs**, qui feraient échouer G6 même si « ça marche » :
  - un meuble beau de face et raté de profil ou de dos ;
  - un rendu « 3D lisse » ou « peint au pinceau » au lieu du dessin animé ;
  - des blocs cubiques ;
  - de l'agitation gratuite (un meuble qui bouge sans raison) ;
  - une saccade au premier plan ;
  - une tache ou un artefact sur le mur ;
  - un objet qui en traverse un autre.

## 10. Laissé au constructeur

- Le découpage interne en tâches et en commits, avec une seule PR en sortie.
- Le format exact des modèles arrondis, ajoutés à côté de `Model` ou en remplacement des pièces actuelles, tant que l'encombrement et les points d'intérêt sont conservés.
- La résolution des sprites (au moins 2× la taille affichée pour un trait net), le nombre de paliers de lumière et d'animation, les tailles de cache.
- Rendu dans le fil principal pendant les temps morts ou dans un worker (OffscreenCanvas), selon ce que supporte la WebView Android.
- La mise en scène fine de chaque réaction, dans les limites de la section 6.

## 11. Répartition des modèles (règle du 2026-10-17)

- **Fable** fait les volumes et le dessin de chaque meuble, la pièce, et la chorégraphie des réactions. Le code de la maquette est la source du portage.
- **Opus ou Sonnet** font le moteur de rendu, les caches, le branchement dans `RoomView`, les zooms, les tests et le banc.
