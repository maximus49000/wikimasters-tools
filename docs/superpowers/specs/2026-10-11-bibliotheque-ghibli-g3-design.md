# Bibliothèque Ghibli G3 : les humains en pantin 3D

Suite de la refonte Ghibli (spec générale `2026-10-10-bibliotheque-ghibli-design.md`, G1 décor peint et G2 ciel fusionnés). G3 donne à **tous les humains** de la scène Ville un corps de pantin 3D rendu au trait Ghibli, et corrige la dette des apparitions en fondu.

## Décisions validées (2026-10-11)

- **Maquette animée validée** : `.superpowers/brainstorm/4473-1791678451/content/pantin-3d.html` (marche de profil et demi-tour, entrée de dos dans une porte, tour complet, assise de trois-quarts, taille réelle). Elle est la référence de dessin : capsules et enveloppes, contour encré brun (`#33241f`), ombre franche teintée de violet du côté opposé à la lumière (en haut à gauche), deux yeux, cheveux découpés sur la sphère de la tête.
- **Périmètre** : tous les humains (passants, habitants, clients, files, assis, gestes, foules, équipes, musiciens, cortège, cyclistes).
- **Dette des fondus corrigée dans G3** : personne n'apparaît ni ne disparaît sur place ; on entre et sort par un bord du monde, une porte ou un véhicule.
- **Approche A, poses précalculées** : 16 orientations × 12 images de marche, calculées par un moteur pur, rangées dans des symboles SVG ; chaque humain n'est qu'un `<use>` dont la boucle change la référence.
- **Trois livraisons successives**, vérifiées par moi seul (captures auto-validées), fusionnées et publiées en pré-prod l'une après l'autre ; l'utilisateur voit le tout à la fin de G3c :
  - **G3a** : moteur du pantin et vie ordinaire de la rue (détaillé ici).
  - **G3b** : gestes (commerces, personnel, bras levés, bras croisés, danse, gobelet, objets portés, échelle, serveurs, terrasses, musiciens, signes de fête, porteurs, équipes d'événements).
  - **G3c** : cortège du défilé et cyclistes.
- Une figure qui n'a pas encore sa version pantin garde son dessin actuel (ville mixte entre G3a et G3c, comme prévu par la spec générale).

## Contraintes techniques constatées

- La couche des acteurs vit dans `<defs>` et chaque fenêtre de la pièce la recopie par `<use>` (`RoomView`) : toute écriture dans cette couche invalide les copies. Donc **un humain = un seul élément animé** (un `<use>`), et les symboles des poses sont rangés **hors** de la couche recopiée.
- On ne peut pas lire la position d'un humain dans la page (il est dans `<defs>`) : la pose se calcule à partir de ce que chaque boucle sait déjà (position, sens, vitesse, étape du trajet).
- Pas d'id fixe, pas de `clipPath` ni de filtre à id dans la couche recopiée (souci WebView constaté en G1) : on rogne par un `<svg>` imbriqué, comme les clients derrière la vitrine.
- Le budget de fluidité est déjà entamé (≈ 40 ms par image dues aux fenêtres allumées de G1, dette connue) : G3 ne doit pas l'aggraver de façon visible.

## G3a en détail

### 1. Moteur du pantin (`src/core/library/figure/`, fonctions pures)

- `skeleton.ts` : repère 3D (y vers le haut, x vers la droite, z vers le spectateur), caméra orthographique légèrement plongeante (12°). `poseOf(yaw, phase, gait, opts)` rend les articulations : bassin, colonne, épaules, coudes, poignets, hanches, genoux, chevilles, orteils, cou, tête, avec l'angle propre de la tête. Allures : `stand` (immobile), `step` (petits pas sur place pendant un demi-tour, amplitude 0,35), `walk` (amplitude 1), `seated` (cuisses horizontales, tibias verticaux). Marche : flexion de hanche ±24°, genou qui plie en phase de balancier, bras en opposition, rotation du bassin ±6° et contre-rotation des épaules, hauteur du bassin fixée par la jambe d'appui (le rebond vient tout seul). Mêmes longueurs que la maquette (40 unités de haut, tête centrée vers y = 33).
- `geometry.ts` : projection, capsule, enveloppe convexe, réduction (zone éclairée).
- `head.ts` : région de cheveux, bonnet et casquette sur l'hémisphère visible, contour par marching squares, fermé le long du cercle de la tête.
- `dress.ts` : d'une tenue (`Outfit` actuel) vers des pièces (jambes, tronc, jupe, manteau, bras, mains, sac, sac à dos, écharpe, cheveux, couvre-chef, parapluie), chacune avec une **case de couleur** (peau, haut, bas, cheveux, chapeau, accessoire, chaussure, parapluie) plutôt qu'une couleur. La **signature de forme** d'une tenue ne garde que ce qui change la géométrie : coiffure, forme du haut (manteau, manches courtes, autre), forme du bas (jupe ou robe, short, pantalon), accessoire, parapluie, enfant.
- `bake.ts` : `bakeFigure(signature, yawIndex, phaseIndex, gait, opts)` rend, coordonnées arrondies au dixième, un trait d'encre par groupe (jambe, bras, tronc, tête, sac), puis par pièce l'ombre et la partie éclairée, avec la case de couleur de chaque tracé. Ordre de dessin : jambes, puis bras, tronc et sacs triés par profondeur, tête en dernier ; la masse arrière des cheveux longs est triée avec le corps.
- `gait.ts` : phase depuis la distance parcourue (une foulée complète = 23 unités du pantin, donc pas de pieds qui glissent quelle que soit la vitesse), orientation depuis le sens de marche (16 pas de 22,5°), plan de demi-tour (passage par la vue de face, environ 0,4 s, petits pas), orientation vers une porte (de dos) ou en sortant (de face).
- Tout est déterministe ; aucun `Math.random`.

### 2. Symboles et dessin (`src/content/figure/`)

- **Hôte des symboles** (`FigureHost`) : un groupe placé dans les `<defs>` de la pièce, **hors** de la couche recopiée, et fourni par contexte React. Il crée à la demande, par le DOM et sans re-rendu React, les symboles des poses demandées. Identifiants préfixés par l'identifiant du monde de la pièce. Plafond : 900 symboles au plus, les moins récemment utilisés retirés au-delà. Budget de création : 8 symboles par image au plus, plus un préchauffage pendant les temps morts (`requestIdleCallback`, repli `setTimeout`). Tant qu'un symbole manque, on garde la dernière image disponible de cette figure.
- **Figure** (`GhibliFigure`) : `<g data-figure>` portant les couleurs de la tenue en variables CSS (teinte de nuit par le même `tone` que le dessin actuel, ombre violette, encre assombrie la nuit), et un `<use>` vers le symbole de la pose. `poseFigure(node, pose)` n'écrit la référence que si elle change.
- **Sens** : en Ghibli, les boucles ne retournent plus le dessin en miroir (échelle positive) ; le sens est l'orientation du pantin. Le dessin classique garde son miroir.
- **Ombre portée au sol** : une ellipse teintée sous les pieds, dans le symbole.
- **Épaisseur du trait** : réglée sur les captures pour rester lisible autour de 24 px de haut (au moins 0,5 px à l'écran).
- **Mouvement réduit** : pose debout de profil (ou assise), aucune boucle, comme aujourd'hui.

### 3. Figures passées au pantin dans G3a

Chaque site choisit `GhibliFigure` quand le graphisme vaut `ghibli`, sinon `PersonSprite` (inchangé).

- **Passants** du trottoir, enfants accompagnés (même pantin réduit à 0,7) et couples : marche réglée sur leur vitesse, parapluie sous la pluie (bras levé qui tient le manche).
- **Habitants** qui sortent de leur immeuble ou y rentrent.
- **Clients des commerces** : sur le trottoir, passage de la porte, et derrière la vitrine debout ou assis (fauteuil, table), tournés vers leur place. Leur geste (bras, objet) arrive en G3b ; d'ici là, ils se tiennent à leur place, la tête qui s'oriente vers la vitrine.
- **File de la boîte de nuit** : membres tournés vers la porte, qui avancent d'un cran en marchant.

Restent dessinés comme aujourd'hui jusqu'à G3b ou G3c : personnel des commerces, terrasses, vigiles, foules et équipes des fêtes, musiciens, porteurs du déménagement, figurants des événements, cortège, cyclistes. Les signes de fête portés par les passants (couronne, ballon…) reviennent en G3b ; en Ghibli, ils ne sont pas dessinés entre-temps.

### 4. Entrées et sorties naturelles (dette des fondus), dans les deux graphismes

- **Passants ordinaires** : leur présence (`pedestrianGate`, recalculée à la minute) ne bascule que lorsqu'ils sont dans la marge hors champ du monde (`WORLD_MARGIN`). Celui qui doit partir finit sa traversée jusqu'au bord ; celui qui doit arriver attend son prochain passage par le bord. Plus aucun fondu. État gardé entre deux minutes (référence React). Au chargement de la scène, chacun est d'emblée à sa place.
- **Portes** (habitants, clients, porte du local) : on ne s'efface plus sur le seuil. En sortant, l'habitant apparaît dans l'ombre de l'entrée, avance vers la rue (de face en Ghibli), se tourne et part. En rentrant, il s'arrête devant la porte, se tourne de dos, avance dans l'ombre et passe derrière l'encadrement. Le passage est rogné à l'ouverture de la porte par un `<svg>` imbriqué, et l'intérieur s'assombrit à mesure qu'il s'enfonce (comme la maquette).
- **Trajets plafonnés** (`MAX_TRIP_PX`) : un trajet qui n'atteint pas le bord du monde se termine (ou commence) par la porte d'un autre immeuble la plus proche de ce point, au lieu de s'effacer en pleine rue.
- **File de la boîte** : la dernière personne visible arrive à pied depuis le bord de la façade au lieu d'un fondu.

### 5. Performance

Mesures sur le banc (`.superpowers/harness-ville`, paramètre `art=ghibli`), monde de 3 456 px, processeur ralenti ×4 : durée moyenne d'une image en Ghibli et en classique, nombre de symboles créés, temps de création d'un symbole, taille du DOM. Si l'image Ghibli dépasse le classique de plus de 5 ms : réduire les points des capsules, la grille de la tête ou le plafond de symboles, puis remesurer. Les chiffres vont dans la PR.

### 6. Tests

- Moteur : déterminisme ; pieds au sol à l'appui ; aucune valeur non finie ; 16 orientations distinctes ; demi-tour qui passe par la face ; région des cheveux (de face : front dégagé, de dos : tête couverte) ; signature de forme ; phase liée à la distance.
- Hôte : création paresseuse, plafond, budget par image, repli sur l'image disponible.
- Sites : figure Ghibli rendue quand le réglage est actif, dessin classique sinon ; plus aucune `opacity` de fondu sur les passants et les habitants ; présence qui ne bascule qu'au bord ; trajets de porte (sortie de face, entrée de dos, rognage).

### 7. Vérification et livraison

Captures auto-validées (Ghibli midi, soir, nuit, pluie ; classique pour comparaison ; zooms sur une porte, un client assis, la file), contrôle de chaque défaut visible avant PR, puis PR fusionnée et pré-prod. Pas de fiche WikiHow (une fiche globale à la fin de G7).

## Bilan de G3a (fusionnée, PR #242)

Les symboles `<use>` prévus en §2 se sont révélés trop coûteux (chaque changement de pose recopiait 45 éléments : 140 ms par image à 8 h) : les poses sont **peintes une fois en sprites PNG** (canvas, mêmes tracés) et chaque humain est un `<image>` (`src/content/figure/figure-host.tsx`, `ghibli-figure.tsx`). Palettes quantifiées au huitième de jour. Le passage d'une porte est commun (`src/content/door-passage.ts`). Restes pour G3b : arrivées de la file de la boîte depuis le bord, pas vif avant le demi-tour à sa porte, signes de fête.

## G3b en détail : les gestes

### 1. Moteur : bras, attitudes et points d'accroche

- **Poses de bras** (`ArmPose`) choisies par le site, calculées par cinématique inverse à deux segments (épaule → coude → main, coude orienté vers le bas et l'extérieur) vers une **cible de main** dans le repère du corps (devant, haut, côté), une par bras : `swing` (balancement de marche, actuel), `down`, `reach`, `hold`, `up`, `work` (les cinq gestes des commerces, bras droit ; l'autre le long du corps, sauf `work` : deux mains), `crossed` (bras croisés), `raise` (bras droit levé), `cheer` (deux bras levés), `cup` (gobelet à hauteur de poitrine), `carry` (deux mains devant à la taille, une charge entre elles), `overhead` (deux mains au-dessus de la tête), `tow` (main droite en arrière, tire une charge), `guitar`, `mic`, `drum` (musiciens).
- **Penché** (`lean` 0, 1, 2 : 0°, 8°, 16° vers l'avant) pour les gestes des commerces.
- **Allure `climb`** (monter à l'échelle, de dos, genoux qui se lèvent en alternance, mains aux montants) ; **allure `seated`** déjà là (convives, enfant sur les épaules : jambes de part et d'autre de la nuque).
- **Tenues de travail** dans la forme : gilet orange à bande (équipes), tablier blanc (serveurs, personnel de bouche) ; signature étendue.
- **Points d'accroche** `anchorsOf(key)` : main droite, main gauche, centre de la tête, haut de la tête, nuque (pour l'enfant porté), en unités du sprite. Les **objets tenus** (accessoires des commerces, drapeaux, téléphone, gobelet, instruments, pièces de scène, cartons, barrières) gardent leur dessin actuel et sont posés à la main du pantin ; les **signes de fête** (couronne, ballon, panier, muguet, drapeau, coquelicot, serpentin, note) à la tête ou à la main.
- La clé de sprite gagne `arms` et `lean`.

### 2. Figures passées au pantin dans G3b

- **Commerces** : gestes des employés et des clients (boucle `placeStaff` / `placeCustomers`, mêmes scripts `gestures.ts`), employés qui arrivent, lèvent le rideau (`overhead`), se relaient et repartent à pied (phase de marche tirée du temps et de la vitesse de la transition) ; équipe du chantier de l'enseigne (échelle, ancienne et nouvelle enseigne).
- **Terrasses** : convives assis à leur table, gestes de table ; serveurs qui marchent, plateau en main.
- **Boîte de nuit** : vigiles bras croisés ; **arrivées de la file depuis le bord du monde** (la personne qui rejoindra la file marche depuis le bord ou une porte proche, en avance de son arrivée) ; demi-tour à la porte sans pas vif (marche normale, demi-tour sur place ensuite).
- **Défilé du 14 juillet, foule** : spectateurs debout bras levé (drapeau, téléphone, main), enfant sur les épaules, arrivée et départ à pied ; entrée et sortie par les portes avec le passage de seuil commun.
- **Fête de la musique** : danseurs (rebond, bras levés), gobelets, serveurs des stands, files des stands, marcheurs ; musiciens (guitare, micro, tambour) qui arrivent à pied, montent sur la scène et jouent ; portes avec le passage de seuil commun.
- **Équipes d'installation** : ouvriers (gilet) qui portent, tirent, tiennent, montent à l'échelle, ouvrier de la nacelle ; **porteurs du déménagement** ; **figurants des événements** de la ville (ouvriers, passants sous la pluie, groupes) ; **père Noël** sur les toits.
- **Signes de fête** des passants (G3a les avait retirés en Ghibli).

Les cyclistes (y compris le vélo porteur des équipes) et le cortège restent pour G3c.

### 3. Mouvement et animation

- Les sites qui animent aujourd'hui par SMIL (rebond des danseurs, balancement des musiciens, drapeau agité) gardent leur SMIL sur le groupe porteur ; le pantin y est dans une pose fixe (une seule image), seul l'objet ou le corps entier bouge.
- Les sites qui ont une boucle posent le pantin à chaque image (marche selon la distance, gestes selon les scripts).
- Mouvement réduit : poses fixes, aucune boucle.

### 4. Performance, tests, vérification

- Même méthode que G3a (banc, processeur ×4, monde 3 456 px) ; la foule d'une fête compte jusqu'à ≈ 200 personnes : mesurer un 14 juillet (défilé) et un 21 juin (rue de la musique) en plus d'un jour ordinaire. Objectif : pas plus de 10 ms au-dessus de `main` en Ghibli, classique inchangé à ±3 ms.
- Tests : cibles de main atteintes (distance épaule-main ≤ longueur du bras, main près de sa cible), bras croisés devant le torse, signature étendue, points d'accroche, chaque site rend des pantins en Ghibli et son dessin actuel en classique, aucune nouvelle opacité de fondu, arrivées de la file depuis le bord.
- Captures auto-validées (commerces, terrasse, boîte, 14 juillet, 21 juin, chantier, nacelle, déménagement, pluie), correction de chaque défaut visible avant la PR.

## Bilan de G3b (fusionnée, PR #243) et vague perf Android (PR #244)

Gestes par cinématique inverse, tenues de travail, accroches et objets tenus livrés. Consigne ajoutée pendant G3b : **l'app Android est la cible principale** ; mesures et validation sur le vrai téléphone (S26 Ultra, WebView inspectée par CDP). La vague perf (décor des fenêtres dessiné une fois, un seul rectangle de découpe) a ramené le 21 juin à 19,5 ms et le 14 juillet à 17,9 ms par image sur le téléphone.

## G3c en détail : cortège et cyclistes

### 1. Moteur

- **Allure `pedal`** (cycliste) : bassin sur la selle à hauteur fixe, buste penché de 22°, chaque pied sur un cercle de pédalier (rayon 2,4) centré sous et devant la hanche, les deux pieds en opposition ; genou par cinématique inverse à deux segments, orienté vers l'avant. La phase (0–11) est un douzième de tour de pédalier.
- **Allure `mount`** (cavalier, motard) : bassin sur la selle à la même hauteur, cuisse vers l'avant et le bas (≈ 50°), tibia qui retombe le long du flanc ; aucune oscillation.
- Pour `pedal` et `mount`, pas d'ombre au sol dans le sprite (le véhicule porte le corps) ; nouvelle accroche **`seat`** (bassin projeté) : le site pose l'accroche sur la selle de son dessin.
- **Poses de bras** : `handlebar` (deux mains devant, à hauteur de la taille, bras presque tendus : guidon, rênes), `horn` (deux mains devant la bouche : trompette, clairon), `rifle` (main droite devant la hanche qui tient la crosse, bras gauche qui balance au pas), `flag` (main droite devant la poitrine qui tient la hampe, bras gauche qui balance). Le tambour-major alterne `raise` et `up` toutes les deux secondes.
- Clé de sprite inchangée dans sa forme (l'allure et le geste en font déjà partie).

### 2. Cortège du 14 juillet (`parade-sprites.tsx`, `parade-layer.tsx`)

- En Ghibli, **chaque marcheur** (fanfare, infanterie, porte-drapeaux) est un pantin à l'échelle actuelle (`FIG`), tenue = uniforme de l'unité (tunique → haut, pantalon → bas, peau tirée comme aujourd'hui, cheveux courts), **de trois-quarts vers la droite** (orientation 1) si les captures le confirment, sinon de profil.
- **Pas cadencé** : la phase de marche vient de la distance parcourue par le cortège depuis 10 h (tout le cortège roule à `PARADE_SPEED`) : tous au même pas, aucun pied qui glisse. Posée par la boucle du calque (déjà présente), seulement si la pose change.
- **Couvre-chefs** (képi, shako, bachi, bicorne, casque à crinière, calot, béret, plumet) : leur dessin actuel, accroché à la tête du pantin (même repère : centre de la tête à y = −33, rayon 4,4). **Instruments, fusils, hampes et drapeaux** : dessin actuel accroché à la main (ou au milieu des mains), sans les bras dessinés ; le SMIL des objets (drapeau qui flotte, baguettes) reste sur l'objet.
- **Cavaliers** et **motards** : pantin `mount` + `handlebar` posé sur la selle (accroche `seat`), cuirasse et casque à crinière (cavalier) ou casque blanc (motard, casquette blanche du pantin) ; le cheval et la moto gardent leur dessin.
- **Chef de bord des jeeps, chef de char, pompiers en cabine** : pantin debout dessiné derrière la caisse ou la tourelle (seul le haut du corps dépasse) ; les pompiers derrière la vitre de la cabine, rognés par un `<svg>` imbriqué.
- Classique inchangé. Mouvement réduit : le cortège ne part pas (comme aujourd'hui).

### 3. Cyclistes (`city-sprites.tsx`, `city-life.tsx`, `install-sprites.tsx`, `install-layer.tsx`)

- **Vélos de la rue** : en Ghibli, le cycliste est un pantin `pedal` + `handlebar` posé sur la selle ; le vélo garde son dessin. Le pédalier tourne avec la distance parcourue (un tour pour 2,2 fois la circonférence de la roue). Sur la file du fond, le groupe du vélo est retourné en miroir : le pantin y est retourné une seconde fois et orienté vers la gauche (jamais de pantin en miroir).
- **Vélo porteur** des équipes : même cycliste (gilet de chantier) tant qu'il est en selle ; il en descend déjà à pied (G3b).
- Classique inchangé ; mouvement réduit : pédales immobiles.

### 4. Performance, tests, vérification

- Mesures **sur le téléphone** (pré-prod debuggable, CDP) : 14 juillet pendant le défilé (≈ 60 marcheurs en même temps), jour ordinaire avec vélos. Objectif : pas plus de 3 ms au-dessus de `main` en Ghibli.
- Tests : allures `pedal` et `mount` (pieds sur le cercle du pédalier, longueurs de jambe constantes, aucune valeur non finie), accroche `seat`, gestes `handlebar` / `horn` / `rifle` / `flag`, phase du cortège commune à toutes les unités, chaque unité rend des pantins en Ghibli et son dessin en classique, cycliste en Ghibli (pédales qui tournent, file du fond non retournée).
- Captures auto-validées (fanfare, infanterie, drapeaux, cavalerie, motards, jeeps, char, pompiers, vélo des deux files, vélo porteur), puis PR fusionnée, pré-prod, et **présentation à l'utilisateur de toutes les captures de G3**.
