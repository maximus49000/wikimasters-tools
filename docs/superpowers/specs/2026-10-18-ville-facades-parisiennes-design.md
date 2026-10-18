# Ville Ghibli — façades parisiennes, fenêtres en travées et lumière de nuit (design)

Date : 2026-10-18. Chantier 1 sur 3 de la refonte « naturelle et logique » de la scène Ville (2 : vie au-dessus de la rue,
3 : fond de la ville). Maquette validée par l'utilisateur : `docs/superpowers/maquettes/facades-parisiennes/` (`maquette.html`,
captures PNG, `notes.md` = source des valeurs à porter).

## 1. Intention

L'utilisateur trouve que le placement des fenêtres « n'est pas naturel » et que la lumière de nuit ne l'est pas non plus. Il veut
une rue « un peu parisienne » au niveau des bâtiments, avec des fenêtres de toit « différentes et plus logiques ». Ce chantier
pose aussi les fondations du chantier 2 (habitants derrière les fenêtres et sur les balcons) : logements, balcons praticables,
portes-fenêtres, cage d'escalier.

Constats dans le code actuel (cause des défauts) :
- Grille du moteur `scene-world.ts` `lampsOf` + `city/facades.ts` `extraFloorWindows` : colonnes de 10 px dès 4 px du bord
  gauche (marge droite de 1 à 11 px), rangées de 14 px et fenêtres 5 × 7 pour tous les immeubles, première rangée dans le toit
  → une lucarne à chaque colonne ; aucun lien avec la porte ou la boutique.
- Nuit (`ghibli-windows.tsx`) : halo carré 10 × 12 à bord net par fenêtre (les halos voisins forment des blocs), allumage
  fenêtre par fenêtre au hasard, vitres éteintes plus claires que le mur.
- Bug : les fenêtres allumées du mur du fond (`FarLight`, `farWindows`) sont dessinées dans le même calque que celles du premier
  plan, donc par-dessus les immeubles proches (petits carrés pâles flottants sur les façades).

## 2. Objectifs

1. Façades haussmanniennes (et quelques immeubles de faubourg plus modestes) dans le langage cellulo, conformes à la maquette :
   pierre crème en aplats, rez-de-chaussée inchangé (devantures, portes), entresol, étage noble, balcons filants et
   balconnets en fer forgé, corniches et bandeaux, toits brisés en zinc (terrasson + brisis), souches de cheminées en brique.
2. Fenêtres en **travées** : 2 à 5 travées centrées (marges égales), à l'aplomb sur toute la hauteur et de la porte ; hauteur
   d'étage propre à chaque immeuble ; étage noble plus haut (portes-fenêtres), dernier étage plus bas.
3. **Fenêtres de toit logiques** : lucarnes sur certaines travées seulement, de type adapté au toit (fronton triangulaire,
   fronton cintré, œil-de-bœuf dans le brisis du zinc ; capucine sur toit simple ; tabatière sur le terrasson) ; jamais une
   rangée identique, jamais une par colonne (règles `dormersFor` de la maquette).
4. **Lumière de nuit naturelle** :
   - un logement = 2 ou 3 fenêtres d'un même étage, qui partagent un seuil d'allumage, une teinte et des rideaux ;
   - **une famille n'allume souvent qu'une pièce** (consigne de l'utilisateur) : un logement allumé peut n'éclairer qu'une
     de ses fenêtres (la télé, par exemple) ; voir §5.3 ;
   - cage d'escalier (colonne de petites fenêtres à l'aplomb de la porte) qui s'allume étage par étage ;
   - lumière qui retombe : lueur à bord net mais de forme douce sous l'appui, sur les volets, la jardinière, la dalle et le
     garde-corps du balcon (plus de halo carré) ;
   - vitres éteintes sombres la nuit (jamais plus claires que le mur), reflet du ciel le jour.
5. Corriger le bug des fenêtres du fond visibles devant les immeubles proches.

## 3. Non-objectifs

- Personnages derrière les fenêtres, sur les balcons ou les toits, volets qui bougent, fumées : chantier 2.
- Colline, mur du fond (hors bug §2.5), ciel, saisons : chantier 3.
- Changer les gabarits des immeubles : **décision de l'utilisateur (option 1)** — on garde les largeurs, hauteurs, positions,
  boutiques et portes actuelles ; les immeubles étroits auront 2 ou 3 travées et moins d'étages que sur la maquette.
- Pas de fiche WikiHow (fiche globale à la fin de G7) ; pas de mesures téléphone par PR (campagne après G7).

## 4. Anti-objectifs (échec même si « ça marche »)

- Une façade qui repasse en grille régulière, des lucarnes alignées à chaque colonne, des fenêtres collées à un bord.
- Des fenêtres d'un même logement allumées séparément au hasard, ou un halo rectangulaire visible.
- Un objet qui apparaît ou disparaît d'un coup (la lumière garde son fondu de 4 s).
- Une baisse de fluidité sur Android : le décor fixe reste peint une fois par tranche ; le calque de nuit animé ne grossit pas.
- Un changement de tirage qui déplace les immeubles, les boutiques ou les portes.

## 5. Ce qui est décidé

### 5.1 Moteur (la ville classique reste le moteur de référence)

- `citySkyline` garde **exactement** son tirage (y compris les appels à `lampsOf`, qui consomment le générateur) : rien ne
  bouge dans la rue.
- Nouvelle fonction pure et déterministe `facadeLayout(b, ground, seed)` (port de la maquette, valeurs de `notes.md` §Mise en
  page) dans `city/` : type (haussmann / faubourg), toit, entresol, travées, étages, fenêtres (`std | french | top | stair |
  mezz`), balcons, cage d'escalier, logements (`splitBays`), lucarnes (`dormersFor`), cheminées. Générateur
  `mulberry32(seed ^ hashString('facade') ^ round(x*8))`.
- `cityFacades` remplace, pour le premier plan, la liste `lamps` par les fenêtres de `facadeLayout` ; chaque `Lamp` gagne sa
  taille (`w`, `h`), son type, son logement (`home`) et son étage. Le seuil `u` d'une fenêtre est celui de son logement (les
  fenêtres d'un logement s'allument ensemble). Les consommateurs des fenêtres d'immeubles sont `ghibli-windows.tsx`,
  `scene-city.tsx` (vue classique), `paint/city-plan.ts`, `paint/snow-painter.ts`, `city/santa.ts` et `city/event-place.ts` : ils
  lisent la taille de chaque fenêtre au lieu de la constante 5 × 7. (Les lampadaires `city/lamps.ts` et les lampes de la pièce
  `light/*` ne sont pas concernés.)
- **Seuils haussmann / faubourg ramenés aux gabarits actuels** *(choix de Claude, d'après l'intention « un peu parisienne »)* :
  les seuils de la maquette (`w ≥ 56`, `h ≥ 120`, entresol `h ≥ 150`) donneraient à peine 10 % d'immeubles haussmanniens avec les
  gabarits gardés (simples 40-70 × 64-160 étirés, tours de jumeaux 26-44 de large). Ils sont mis à l'échelle pour qu'environ
  **70 à 80 % des lots** soient haussmanniens (mansarde, frontons, balcons filants), le reste en faubourg pour la variété ;
  l'entresol apparaît sur les plus hauts. Les tours de jumeaux peuvent être haussmanniennes (étroites : 2 travées).
- **Aplomb sur la porte sans la déplacer** *(choix de Claude)* : l'entrée de l'immeuble est collée à un bord du lot (centre à 10 px
  du bord, côté fixé par `shopSlotsFor`). Les centres des travées de bord sont posés à **10 px des deux bords** et les autres au
  pas `(w − 20) / (n − 1)` : marges égales et aplomb exact sur la porte. Jumeaux : la porte est celle du socle, dont le bord
  coïncide avec celui de la tour du même côté, donc la même règle met cette tour à l'aplomb ; la cage d'escalier est dans
  cette tour. Lots coupés au bord du monde : la règle s'applique à la partie visible, où la porte est déjà recentrée.
- **Lucarnes habitées** *(choix de Claude)* : chaque lucarne (hors tabatière et œil-de-bœuf) est une chambre sous les toits,
  donc un petit logement d'une fenêtre, qui entre dans `lamps` et suit la logique d'allumage ; œils-de-bœuf et tabatières
  restent du décor.
- **Décors existants** *(choix de Claude)* : antennes, gouttières et cheminées sont gardées (redessinées selon le nouveau toit) ;
  volets, jardinières, lierre et linge ne restent que sur les immeubles de faubourg ; le balcon générique (`balconyRow`) est
  remplacé par les balcons de la mise en page. Le linge et le lierre animés éventuels relèvent du chantier 2.
- **Neige** *(choix de Claude)* : `snow-painter.ts` est adapté aux nouveaux toits (terrasson et brisis de la mansarde, zinc et
  tuile à faîtage décalé, cheminées aux murs mitoyens, lucarnes) dans ce chantier, pour que la neige tombe au bon endroit ;
  `SNOW_VERSION` incrémentée. Les autres effets saisonniers restent au chantier 3.
- **Jumeaux sur socle** (deux tours sur un socle commun, `podium`) : chaque tour est mise en page au-dessus du socle (pas de
  rez-de-chaussée propre) ; le socle garde sa rangée de fenêtres, alignée sur des travées centrées du socle.
- Immeubles trop bas pour un étage de 10 px : un seul étage + toit ; le plancher d'un étage n'est jamais sous 10 px.
- Le mur du fond (`far`) garde sa grille actuelle (chantier 3).

### 5.2 Rendu Ghibli

- Peintre des façades réécrit d'après la maquette (`paintFacade`, `paintWindow`, `paintBalcony`, `paintRoof`, `paintChimney`,
  `paintDormer`), en gardant devantures et entrées existantes ; couleurs de `notes.md` §Couleurs ; ombre violette nette et
  rehauts de `cel.ts`. `PAINT_VERSION` incrémentée.
- Ce qui est fixe (pierre, fenêtres éteintes de jour, balcons, toits) reste peint dans les tranches du décor ; ce qui change
  avec l'heure (fenêtres allumées, lueur qui retombe, cage d'escalier, vitres sombres la nuit) est un calque au-dessus, avec le
  fondu de 4 s actuel.
- La lueur qui retombe est une forme peinte (trapèze à fond arrondi, deux paliers plats, `rgba(255,214,130,0.22)`), cuite une
  fois par taille de fenêtre et teinte, réutilisée (pas un halo par fenêtre calculé à chaque image).
- Vitres éteintes la nuit : `#232D52` mélangé à 25 % au mur ambiant, reflet discret ; de jour : `#7FB4E0` + reflet.
- Fenêtres allumées du mur du fond : dessinées sous les immeubles du premier plan (corrige le bug), même logique d'allumage.

### 5.3 Logique d'allumage

- Courbe horaire inchangée (`city/window-lights.ts` : semaine / week-end / jours fériés, presque rien entre 2 h et 4 h, pic du
  soir) ; obscurité inchangée (`darkness`, mauvais temps compris).
- Seuil par **logement** (`home.u`) et non par fenêtre.
- **Une seule pièce** : un logement allumé n'allume pas toujours toutes ses fenêtres. Chaque logement a une pièce principale
  tirée (une de ses fenêtres) ; selon l'heure, une part des logements allumés n'éclaire que celle-ci (plus fréquent en fin de
  soirée : télé, lecture ; moins à l'heure du dîner). La pièce seule garde la teinte du logement ; la lueur bleutée de télé
  vient de préférence d'une pièce seule en soirée. Déterministe en (logement, heure).
- Cage d'escalier : allumée quand quelqu'un entre ou sort par la porte de l'immeuble, du bas vers l'étage atteint, minuterie
  courte, puis extinction ; jamais allumée en continu. *(Choix de Claude)* Elle réutilise la minuterie existante des halls
  (`hallUntil`, `HALL_TIMER_S`, `HallLights` dans `city-life.tsx`) et vit dans ce même calque animé, à côté des lumières de hall :
  quelques nœuds par porte, acceptés malgré l'anti-objectif « le calque animé ne grossit pas » (le surcoût est borné par le
  nombre de portes visibles). L'étage atteint est tiré de façon déterministe par (trajet, porte).
- Entresol : bureaux, jamais allumé la nuit.

## 6. Laissé au constructeur

- Découpage exact des fichiers et des types (`FacadeLayout`, extension de `Lamp`) tant que les consommateurs sont tous adaptés.
- Formule exacte de la part « une seule pièce » par heure (au moins : ≈ 20 % au dîner, ≈ 50 % après 22 h).
- Comment le classique (`classic-engine`, vue de contrôle au banc) dessine les nouvelles fenêtres (rectangles simples suffisent).
- Ordre et détails de la cuisson des lueurs, tant que le coût par image reste au niveau actuel.

## 7. Vérification

- Tests du moteur : marges égales, aplomb des travées, étage ≥ 10 px, au moins une lucarne et jamais une par travée sur un toit
  à mansarde, tirage de `citySkyline` inchangé (positions, largeurs, hauteurs, boutiques, portes identiques à main),
  fenêtres d'un logement au même seuil, « pièce seule » déterministe.
- Tests de rendu : aucune fenêtre du fond devant un immeuble proche ; fondu conservé ; classique sans régression fonctionnelle.
- Captures au banc (jour 10 h, 19 h, 22 h, 2 h, pluie de nuit) comparées à la maquette, envoyées à l'utilisateur.
- Mesure au banc (CPU ×4) contre main : pas de régression > 15 %.
