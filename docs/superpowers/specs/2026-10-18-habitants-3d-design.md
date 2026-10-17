# Habitants 3D — conception

Date : 2026-10-18. Statut : relu (contrôle constructeur fait), à valider par l'utilisateur.

## Intention

Remplacer l'apparence de **tous** les personnages humains de la ville Ghibli (rue, commerces, gros plans au zoom) par des
habitants 3D générés, sans perdre un seul geste ni une seule allure d'aujourd'hui, et pouvoir revenir à l'ancien rendu en
un geste si la pré-production ne convainc pas.

Les habitants 3D reprennent tout ce qui a été mis au point au banc d'essai
(`.superpowers/autosprite/garde-robe/banc/` : `wardrobe.js`, `catalogue.js`, `face.js`, `face-layer.js`, `dress.html`) :

- corps de base générés par AutoSprite (modèles 3D articulés, squelette Mixamo, style Ghibli « cellulo ») ;
- garde-robe modélisée par le code : hauts, bas, jupes et robes avec plis, manteaux, chaussures à semelle, chaussettes, col
  de chemise, rayures et carreaux, casquette ;
- coiffures (courte, raie, dégarnie, couronne, rasé, frisé, afro, carré, longs, queue, chignon, mise en plis, couettes,
  tresses, frange d'enfant) et barbes (pleine, courte, moustache, bouc) ;
- 8 teintes de peau naturelles, cheveux vraisemblables selon la peau et l'âge ;
- règles de ce que chaque type peut porter (pas de jupe ni de barbe pour qui n'en porte pas, pas de barbe pour l'enfant,
  pas de casquette pour les anciens) ;
- visage : clignement animé (descente 70 ms, tenue 40 ms, remontée 130 ms, intervalle 2–6 s, parfois double), 7 émotions
  (neutre, content, heureux, triste, surpris, fâché, inquiet) avec transitions douces (~0,4 s).

## Ce qui compte (dit par l'utilisateur)

- Les trois scènes comptent autant : passants de la rue, scènes des commerces, personnages vus de près au zoom.
- Serait un échec, même avec de beaux personnages :
  1. une ville qui **saccade** sur le S26 ;
  2. un **temps d'attente** avant que les personnages apparaissent ;
  3. des personnages **pas naturels** ;
  4. la **perte de gestuelle**, notamment dans les animations des boutiques.
- Retour arrière : **pas d'interrupteur visible**. Un réglage dans le code, qu'on ne bascule qu'après en avoir parlé
  ensemble (petite PR + pré-prod). L'ancien rendu reste intact dans le code.
- Plus de diversité : générer **deux silhouettes de femme supplémentaires** (une femme forte, une femme grande) avec
  AutoSprite, chaque envoi validé par l'utilisateur au préalable (skill `/autosprite`).

## Objectifs

1. Chaque humain dessiné par le moteur Ghibli (`GhibliFigure` et tout ce qui passe par `FigureRegistry`) est rendu en 3D.
2. Le **squelette du pantin reste le moteur du mouvement** : `poseOf()` (allures `stand`, `step`, `walk`, `seated`,
   `climb`, `pedal`, `mount`, `crouch`, `perch`, les 56 gestes `ArmPose`, le penché `lean`, la rotation de tête `head`)
   pilote les os du modèle 3D. Aucune scène n'a besoin d'être réécrite.
3. Chaque personnage a une identité 3D **stable** (même graine → même habitant, d'une ouverture à l'autre).
4. Aucune attente visible : tant que l'image 3D d'une pose n'est pas prête, l'ancien pantin s'affiche à sa place.
5. Fluidité sur le S26 (Android d'abord) mesurée sur le vrai téléphone avant la pré-prod.
6. Retour arrière en changeant une seule constante.

## Non-objectifs

- Pas d'animations externes (Mixamo, Quaternius) : le pantin fournit déjà tous les mouvements. On pourra les ajouter plus
  tard (le squelette Mixamo le permet).
- Pas de physique des cheveux ou des tissus (cheveux longs rigides, jupes qui suivent bassin et cuisses).
- Pas de nouveau réglage dans l'interface.
- Les animaux, véhicules et objets ne changent pas.

## Anti-objectifs

- Effacer ou casser l'ancien pantin (il doit rester complet, testé, et réactivable).
- Afficher un emplacement vide ou un personnage qui « pop » en retard à l'écran.
- Faire baisser la cadence de la ville sous celle d'aujourd'hui sur le S26.
- Grossir le bundle Android au point de ralentir l'ouverture du site.

## Contraintes connues (relevées dans le code)

- Pas de three.js aujourd'hui (`package.json`) ; aucune page n'utilise WebGL ni Worker.
- Android : tout le code est un seul fichier injecté (`wikimasters-overlay.js`, `vite.android.config.ts`,
  `MainActivity.java:113-133`). Pas de dossier `public/`. La page hôte refuse les URL `blob:` (d'où les `data:` PNG).
- Sprites : `figure-host.tsx` peint **synchroniquement** sur un canvas 2D partagé, `SPRITE_BOX = {x0:-20, y0:-64, w:40,
  h:74}` en unités du pantin (adulte ≈ 40 unités), `SPRITE_PX = 3` (image 120×222), au plus 8 sprites par image dans
  `flush()`, plafond `FIGURE_SPRITES_MAX = 2400`, clé de sprite = palette + `keyString(FigureKey)`.
- Les objets tenus et les sites (vélo, selle, plateaux…) s'accrochent aux points de `anchorsOf()` / `rideFrame()`.
- Tenue d'aujourd'hui : `Outfit` de `people.ts` (cheveux, haut, bas, accessoire, couleurs) + `work` (`vest`/`apron`) +
  `umbrella` + teinte de nuit et imperméable sous la pluie (`figurePalette`).
- Identités stables déjà présentes partout (ids d'habitants, de clients, de personnel, graines des cyclistes et des
  occupants de voiture… liste dans l'annexe A).
- Interrupteur existant : `art-setting.ts` (`ENGINE_VIEW = 'classic-engine'`, valeur interne jamais écrite par
  l'interface).

## Ce qui est décidé

### 1. Interrupteur (retour arrière)

Une constante dans le code, par exemple `CITIZENS_3D = true` (fichier dédié, `src/content/figure/citizen-config.ts`).
- `true` : les humains Ghibli passent par le rendu 3D (avec repli sur le pantin tant qu'une image n'est pas prête).
- `false` : comportement exact d'aujourd'hui ; le code 3D n'est même pas chargé.
Les tests de l'ancien pantin restent tous en place et continuent de tourner. Pas d'interface. Basculer = PR d'une ligne.

### 2. Le pantin pilote la 3D

Pour chaque pose (`FigureKey`), on calcule `poseOf()` comme aujourd'hui, puis on oriente les os Mixamo du modèle pour que
chaque segment pointe dans la même direction que le segment du pantin : bassin (position, `pelvisTurn`, `lean`), colonne
(`shoulderTurn`), cuisses → genoux → chevilles → orteils, bras → coudes → mains, cou → tête (`headFrame`). On copie des
**directions**, pas des longueurs : chaque silhouette garde ses proportions.

Les points d'accroche (`handR`, `handL`, `head`, `headTop`, `nape`, `seat`, mains au guidon) sont recalculés depuis le
modèle 3D posé (projection des os) et remplacent ceux du pantin pour les figures 3D, pour que plateaux, outils, sacs et
vélos tombent dans les vraies mains.

### 3. Rendu en images (sprites)

Même principe qu'aujourd'hui : une pose = une image gardée en mémoire. Le rendu 3D se fait dans un contexte WebGL caché
(three.js), avec la même caméra orthographique plongeante de 12°, en aplats (« toon » 2 tons) + trait d'encre, puis
converti en `data:` PNG comme le pantin.
- File de rendu au **budget de temps** par image (et non plus « 8 par image ») pour ne jamais faire saccader la ville.
- Tant que l'image 3D n'existe pas, le sprite du pantin actuel est affiché (repli invisible pour l'utilisateur, pas
  d'emplacement vide).
- Clé de sprite 3D = graine d'habitant + tenue + `FigureKey` + palier de lumière (nuit) + état du visage.

### 4. Identité de chaque habitant

Chaque personnage garde sa graine actuelle (annexe A). Le générateur du banc (`citizen(seed)`) choisit type de corps,
taille (±5 %), peau, coiffure, barbe, casquette, motifs. Il **respecte** ce que la scène impose déjà :
- `child` / enfants → base enfant ;
- tenue de travail `vest` / `apron` → gilet orange à bande claire / tablier par-dessus la tenue ;
- costume (`suit`, profils « affaires ») → chemise + col + pantalon sombre ;
- couleurs de tenue choisies par la scène (personnel d'un commerce, uniformes) → reprises telles quelles ;
- parapluie, imperméable sous la pluie, teinte de nuit → comme aujourd'hui.
Les accessoires d'aujourd'hui sont ajoutés en 3D : sac à dos, sac, mallette, ballon, écharpe, parapluie.

### 5. Visage

Clignement et émotions comme au banc (calque de visage en shader). Une variante de sprite par état du visage n'est
produite que là où le visage se voit (gros plan au zoom, scènes des commerces) ; dans la rue à petite taille, visage neutre
yeux ouverts (pas de sprites inutiles).

### 6. Diversité

Bases : homme fort, homme maigre, femme frêle, papy, mamie, enfant + **femme forte** et **femme grande** à générer (envois
AutoSprite validés un par un par l'utilisateur, ~53 crédits chacune : personnage + modèle 3D).

### 7. Fichiers 3D

Les modèles d'AutoSprite (≈ 18 Mo chacun, 150 000 triangles, texture 4096 px) sont allégés hors ligne (quelques milliers
de triangles, texture 512 px) avec leurs repères de visage pré-calculés. Ils ne sont pas mis dans le bundle : ils sont
servis par un hébergement à nous (relais Cloudflare déjà en place) et gardés sur l'appareil après le premier
téléchargement (comme les pochettes). Tant qu'ils ne sont pas là, le pantin s'affiche.

### 8. Vérification

- Tests : familles `scene-pietons`, `scene-commerces`, `scene-circulation`, `scene-evenements` + nouvelle famille pour le
  rendu 3D (à créer, ou rattachée à `scene-pietons`).
- Mesure sur le S26 (cadence, temps d'apparition, mémoire) avant la pré-prod ; comparaison avec l'interrupteur à `false`.
- Captures montrées à l'utilisateur au fil de l'eau.
- Fiche WikiHow (nouveauté visible) dans la même PR que la fonctionnalité.

## Réponses de l'utilisateur après relecture

- **Première ouverture (images 3D pas encore prêtes) : option (b).** Les passants n'entrent sur le trottoir qu'une fois
  leurs images 3D prêtes (la rue se remplit progressivement par les bords, d'où ils arrivent déjà) ; les commerçants et
  personnages fixes restent en pantin jusqu'à ce que leurs images soient prêtes, puis basculent.
- **Extension Chrome et application Android : les deux** reçoivent les habitants 3D (three.js dans les deux bundles).

## Choix du rédacteur (à vérifier en lisant)

- **Émotions** : chaque habitant a une humeur de fond tirée de sa graine (surtout neutre ou content) ; les scènes des
  commerces en déduisent d'autres selon le geste (payer, recevoir → content ; trinquer → heureux ; attendre longtemps →
  inquiet ; éternuer → surpris…), table de correspondance dans le code. Les variantes de visage (émotion, clignement) ne
  sont produites que lorsque le personnage est assez grand à l'écran (gros plan, scènes des commerces).
- **Gros plans au zoom** : seconde résolution d'images (plus de pixels par unité) pour les vues zoomées, pour que la 3D
  reste nette de près.
- **Nombre d'habitants différents** : pas de limite a priori (chaque graine garde son habitant) ; cache d'images à
  plafond + rendu au budget de temps ; si la mémoire du S26 l'exige, un regroupement en un nombre fixe d'apparences sera
  proposé à l'utilisateur avant d'être fait.
- **Gestes** : test automatique de tolérance (position des mains 3D par rapport aux cibles du pantin, pour les 56 gestes et
  toutes les silhouettes) + planches des 56 gestes par silhouette montrées à l'utilisateur.
- **Hébergement des modèles** : fichiers statiques du Worker relais (section `[assets]` de `wrangler.toml`, déployée par
  Workers Builds à la fusion) : aucune action de l'utilisateur.
- **Nouvelles silhouettes** : générées tôt (envois validés un par un), mais la pré-prod ne les attend pas ; elles
  rejoignent le tirage dès qu'elles sont prêtes.
- **Repli** : le pantin reste le dessin de secours pour toute figure dont le modèle ou l'image 3D manque.

## Laissé au constructeur

- Le découpage en tâches et en PR, l'ordre exact.
- La façon d'alléger les modèles (outil, niveau de détail) tant que le rendu reste fidèle et le poids raisonnable.
- Le budget de temps exact de la file de rendu, la stratégie de préchauffage (poses les plus fréquentes d'abord).
- L'emplacement des fichiers 3D sur le relais et le cache local (en s'inspirant de `cover-cache.ts`).
- Comment rapporter les couleurs d'une scène vers les pièces de la garde-robe.

## Annexe A — identités stables (relevé du code)

Habitants (`doors.ts:91`), clients (`shops/customers.ts:74`), acteurs des scènes (`shops/scene/cast.ts:55`), personnel
(`city-shops-life.tsx:515`), ouvriers (`:392`), terrasses (`shop-terrace.tsx:632,693`), boîte de nuit
(`shop-queue.tsx:133,256`), déménageurs (`moving-truck.tsx:277`), installations et groupe (`install-layer.tsx:236,243`),
bière (`beer.ts:144,257`), foule de la musique (`music-crowd.ts:68`), défilé (`parade.ts:164`, uniformes
`parade-sprites.tsx:274`), Père Noël (`santa-layer.tsx:15`), cyclistes (`vehicles.ts:59`, `traffic/engine.ts:228`),
occupants de voiture (`traffic/cars.ts:82`), motards (`traffic/special-art.ts:461`), piétons des passages et de l'arrêt
(`traffic-layer.tsx:512,587`), événements (`city-event-sprites.tsx:62`), passants (`people.ts:105`, ids `ped-i` …).
