# Pluie naturelle (design)

Date : 2026-10-20. Maquette validée par l'utilisateur : `docs/superpowers/maquettes/pluie-naturelle/` (`maquette.html`, captures PNG,
`notes.md` = toutes les formules, valeurs, couleurs et recommandations de portage ; elle fait foi pour les valeurs).

## 1. Intention

L'utilisateur trouve la pluie artificielle : « moins de traits parallèles qui tombent », des « marques sur les vitres », « comme dans la
vraie vie ». Il veut deux expériences distinctes :
- **dans la pièce**, on est **derrière la vitre** : des gouttes perlent sur le verre, grossissent et coulent ;
- **dans la vue de la rue en plein écran**, on est **dehors** : une pluie naturelle et vivante.

L'intensité **reste celle de la météo réelle du lieu** (consigne de l'utilisateur) : tout se règle à partir de `precip`, du vent, du
jour/nuit et de l'orage déjà fournis par la météo de l'app ; aucun réglage indépendant.

## 2. Objectifs

1. **Pluie qui tombe (les deux vues)** : remplacer les deux motifs SVG de traits identiques (`rain-far`, `rain-near` de
   `src/content/scene-weather.tsx`) par des gouttes individuelles sur trois profondeurs (loin / moyen / proche) de longueurs, vitesses,
   opacités, épaisseurs et inclinaisons variées, avec rafales de vent (`gust`) et biais propre à chaque goutte — plus aucune grille ni
   hachure régulière. Valeurs : `notes.md` §Tout découle de precip et §Valeurs.
2. **Vue rue (dehors)** : éclaboussures au sol (couronne + gouttelettes), anneaux dans les flaques existantes (`puddles`), sol mouillé
   et reflets des lumières, brume de pluie, halos autour des lampadaires la nuit ; en scène Ville seulement : gouttes qui tombent des
   bords (auvents des boutiques, corniches, toits, descentes de gouttière) et ruissellement du caniveau vers une grille.
3. **Vue pièce (derrière la vitre)** : sur le verre de chaque fenêtre de la pièce, gouttes posées qui arrivent une à une et
   grossissent, coulures qui dévalent par à-coups en laissant une trace, absorbent les gouttes sur leur passage, sèment des perles,
   fusionnent et zigzaguent ; buée légère en bas effacée par les coulures ; la nuit, les gouttes prennent la couleur des lumières
   qu'elles ont derrière elles (vitrines, lampadaires, fenêtres). La pluie extérieure reste visible derrière, plus douce (70 % des
   gouttes, couche proche réduite). Remplace les `GlassDrops` actuels (ellipses animées en SMIL de `src/content/window-art.tsx`).
4. **Logique d'apparition** : rien ne surgit d'un coup quand la pluie commence (les gouttes arrivent progressivement, le sol se mouille
   en ~2 s et sèche en ~20 s comme les `WET_ON/WET_OFF` actuels) ; quand la pluie s'arrête, les gouttes de la vitre restent puis
   sèchent ou coulent, elles ne disparaissent pas toutes d'un coup.

## 3. Non-objectifs

- La neige, les nuages, le brouillard, l'arc-en-ciel et les rayons ne changent pas.
- L'éclair existe déjà dans la couche météo (`flash`, `bolt`) : on le garde, on ne le duplique pas (la maquette en dessinait un).
- Pas de nouvelle source météo, pas de réglage d'intensité dans l'interface.
- Le décor de rue de la maquette (façades simplifiées) n'est pas porté : on garde le décor de l'app.

## 4. Anti-objectifs

- Des traits tous parallèles ou une boucle reconnaissable.
- Une pluie qui cache la scène (la rue doit rester lisible derrière la vitre et sous l'averse).
- Une baisse de fluidité sur Android (l'app Android est la cible principale).
- Des gouttes qui apparaissent ou disparaissent sur place.
- Le flou CSS/canvas (`ctx.filter`) sur Android.

## 5. Ce qui est décidé

- **Technique** (recommandation de la maquette, choix de Claude) : un **canvas 2D dédié** à la pluie, animé par une boucle
  `requestAnimationFrame` propre, au-dessus de la scène et sous l'interface — un pour la pluie qui tombe (et le sol de la vue rue),
  un pour la vitre en vue pièce (découpé aux carreaux des fenêtres, par `clip` sur leurs rectangles). Les motifs SVG `rain-far` /
  `rain-near` sont retirés ; le reste de `WeatherLayer` (assombrissement, flaques, éclair, neige…) reste en place.
- **Les deux vues** : la pièce est rendue par `RoomView` avec ses fenêtres (`glassRect`) ; la vue de la rue en plein écran est le même
  composant avec `outside = true` (aucune vitre). Pluie qui tombe dans les deux ; vitre seulement quand `outside` est faux.
- **Toutes les scènes à météo** (`WEATHER_SCENES` : ville, campagne, montagne, mer) reçoivent la nouvelle pluie qui tombe et les gouttes
  sur la vitre ; les éléments liés au bâti (bords qui gouttent, caniveau, grille) n'existent qu'en Ville, accrochés aux vrais éléments
  du décor (boutiques et auvents, corniches et toits des façades, bordure du trottoir, une grille d'égout tirée).
- **Nuit** : les gouttes dehors restent visibles à 30 % hors des zones éclairées et ressortent dans les cônes des lampadaires et
  devant les vitrines allumées (sources de lumière réelles de la scène : lampadaires `lampsFor`/`lampLit`, vitrines ouvertes) ;
  sur la vitre, chaque goutte réfracte la couleur de ce qu'il y a derrière (échantillon basse résolution de la scène, rafraîchi
  quelques fois par seconde) et rayonne devant une source lumineuse.
- **Vitre** : buée légère (alpha max `0,1 + 0,14 P`) pour garder la rue lisible ; le vent penche peu les coulures (×0,35) ; pas de flou
  sur la scène derrière (voile seul).
- **Économies Android** : sprites des gouttes de vitre précalculés par rayon et teinte ; la boucle ne tourne que s'il pleut ou si la
  vitre a encore des gouttes, sinon les canvas sont vidés et la boucle arrêtée.
- **Ordre de dessin** *(choix de Claude, après relecture)* : la pluie reste à sa place actuelle dans l'empilement, pas par-dessus
  tout. En vue pièce, la scène, les acteurs, la pluie qui tombe puis les gouttes de la vitre passent **sous** les châssis, les
  meubles, la lumière de la pièce et l'interface. En vue rue, le sol mouillé (éclaboussures, anneaux, lame du caniveau, reflets) passe
  **sous** les passants et les voitures, comme les flaques actuelles (`groundId`), et la pluie qui tombe **au-dessus** d'eux. Comme
  tout est aujourd'hui dans un seul `<svg>`, les canvas sont insérés dans ce `<svg>` par `<foreignObject>` aux bons endroits
  (un canvas « sol » et un canvas « air », plus un canvas « vitre » en vue pièce). La première tâche du plan mesure ce choix au banc
  CPU ×4 ; s'il coûte trop, repli : découper le `<svg>` de `RoomView` en couches empilées (scène / pluie / pièce).
- **Couleur derrière les gouttes de la vitre** *(choix de Claude)* : pas de copie raster de la scène (elle est en SVG, trop cher et
  risque de canvas « sali »). La couleur réfractée est calculée à partir des sources connues : ciel (couleur du moment), lampadaires
  allumés, vitrines ouvertes et fenêtres allumées des immeubles — même principe que la fonction `lightAt` de la maquette.
- **Vue pièce, ce qu'on voit dehors** *(choix de Claude)* : le même moteur « dehors » tourne en mode doux (70 % des gouttes, couche
  proche réduite, éclaboussures ×0,4) ; les bords qui gouttent, le caniveau, les anneaux, les halos et la brume restent visibles à
  travers les fenêtres, puisque c'est la même rue.
- **Budgets** *(choix de Claude ; `notes.md` §Android fait foi)* : pour **toute la pièce** (réparti entre les fenêtres au prorata de la
  surface vitrée) et pour la vue rue — valeurs « téléphone » de `notes.md` §Pour que ça tienne sur Android (80 éclaboussures,
  40 anneaux, 220 gouttes posées, 12 coulures, 350 gouttes dehors en basse définition), valeurs de la maquette sur grand écran.
- **Fenêtre soulevée pendant un glissé** *(choix de Claude)* : sa copie n'affiche ni pluie ni gouttes pendant le glissé ; elles
  reprennent quand la fenêtre est posée.
- **Mouvement réduit** : une image fixe (gouttes figées dans l'air, gouttes posées sur la vitre), aucune animation.
- **Perfs** : régression ≤ 15 % des images/s au banc (CPU ×4, 1080 px) contre `main` sous averse de nuit, dans les deux vues.

## 6. Laissé au constructeur

- Découpage des fichiers (moteur pur de la pluie dehors, moteur pur de la vitre, composant(s) canvas), tant que la simulation est
  testable sans DOM et déterministe à partir d'une graine (pour les tests et les captures).
- Le pas de simulation, la résolution des canvas (au plus le devicePixelRatio, plafonné), la façon de récupérer les positions des
  boutiques, corniches et lampadaires depuis les modules existants.

## 7. Vérification

- Tests purs : nombre de gouttes conforme à `round(P^1,25 × 900)` plafonné ; aucune pluie à `P = 0` hors gouttes de vitre qui sèchent ;
  inclinaisons non toutes égales (dispersion minimale) ; éclaboussures et anneaux bornés ; coulures qui descendent, absorbent et fusionnent ;
  déterminisme à graine égale.
- Tests DOM : les motifs `rain-far`/`rain-near` ont disparu ; canvas « sol » et « air » à leur place dans l'empilement (sous les acteurs / au-dessus), canvas « vitre » sous les châssis et les meubles ; canvas de vitre absent en `outside` ;
  mouvement réduit = aucune boucle.
- Captures au banc (pièce jour bruine, pièce nuit averse, rue nuit averse, rue jour bruine, rue nuit orage) comparées à la maquette et
  envoyées à l'utilisateur ; mesure CPU ×4 contre `main`.
