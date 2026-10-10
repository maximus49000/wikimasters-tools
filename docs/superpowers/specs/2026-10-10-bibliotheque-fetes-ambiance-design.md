# Bibliothèque, scène Ville : ambiance de fête (vague 1b-ii-b)

Suite de la vague 1b-ii-a (Nouvel An, 14 juillet en feux d'artifice, père Noël). Complète le tableau des fêtes de `2026-10-09-bibliotheque-ville-vivante-design.md` : Épiphanie, Saint-Valentin, Pâques, 1er mai, Fête de la musique, Armistice, défilé du 14 juillet, passants festifs. Les longs décors avec échelles restent dans 1b-iii.

Tout reste calculé depuis la date et l'heure : aucun état ajouté (le format de la pièce reste v5), aucun `Math.random`.

## 1. Calendrier (`city/calendar.ts`)

- `FestivityId` gagne : `epiphany`, `valentine`, `easter`, `may-day`, `music`, `armistice`.
- `festivitiesOn(date)` accepte les dates calculées : Pâques via `easterSunday(year)`, Épiphanie = premier dimanche de janvier. Les dates fixes restent dans `FESTIVITIES`.
- Plages (minutes, `[début, fin)`, jamais à cheval sur minuit) :

| Fête | Jour | Plage |
| --- | --- | --- |
| Épiphanie | 1er dimanche de janvier | 10 h – 18 h |
| Saint-Valentin | 14 février | 10 h – 23 h |
| Pâques | dimanche de Pâques | 9 h – 18 h |
| 1er mai | 1er mai | 8 h – 18 h |
| Fête de la musique | 21 juin | 17 h – 24 h |
| Armistice | 11 novembre | 8 h – 18 h |
| Fête nationale | 14 juillet | ajout 10 h – 12 h (défilé) ; 21 h – 24 h existe déjà |
| Nouvel An | 31/12 21 h 30 – 24 h, 1/1 0 h – 1 h | plage étendue pour les passants festifs |

## 2. Passants festifs (`city/intensity.ts`, `city/people.ts`)

- `CityIntensity` reçoit `festive: { id: FestivityId; share: number } | null` (part de passants portant la marque de la fête) et `crowd` (multiplicateur d'affluence appliqué à `walkers`) : fort à la Fête de la musique et au 14 juillet, faible le 1er janvier, le 25 décembre et le 11 novembre.
- `pedestriansFor` : aucun tirage ajouté aux passants existants. Les passants propres aux fêtes (couples de la Saint-Valentin, petits groupes d'enfants de Pâques) sont ajoutés EN FIN de liste, avec un rôle `festive` ; leur présence est pilotée par `festive.share`. Les rues actuelles ne changent donc pas.
- Une tenue festive est une couche de rendu choisie par `p.u < festive.share` (aucun tirage de plus) : couronne dorée (Épiphanie), ballon-cœur (Saint-Valentin), panier d'œufs (Pâques), brin de muguet (1er mai), drapeau ou coquelicot (14 juillet, Armistice), serpentine ou bonnet (Nouvel An), accessoire de musique (Fête de la musique).

## 3. Événements (`city/events.ts` + sprites)

Nouveaux `CityEventId`, tous en données (`EVENT_DEFS`, poids de base nul, `festWeight` seulement) :

- `fest-balloons` (ciel) : ballons-cœur (Saint-Valentin) ou ballons-lapins (Pâques), le jour, sans pluie.
- `bells` (fixe, discret) : cloches de Pâques qui oscillent en hauteur, quelques dizaines de secondes.
- `street-band` (fixe, trottoir, plusieurs minutes) : musiciens ; le soir de la Fête de la musique, cônes de lumière colorés qui tournent.
- `parade` (rue, file du premier plan, 14 juillet de 10 h à 12 h) : convoi de 3 à 4 véhicules pavoisés ; mêmes règles d'effacement des voitures (`yields`) que les autres véhicules d'événement.
- Drapeaux aux entrées d'immeuble le 11 novembre, le 14 juillet et le 1er mai, pour une partie seulement d'entre elles (même mécanisme que les décors d'entrée existants).
- `conditionsKey` contient déjà les fêtes actives : le programme se recalcule au passage d'une plage horaire.

## 4. Garde-fous

- Mouvement réduit : seuls les éléments fixes restent figés (cloches, musiciens) ; le défilé et les ballons ne partent pas.
- Sans fenêtre dans la pièce, rien n'est calculé ni affiché.
- Plafond de figurants existant (`sprite-budget`) inchangé : les passants festifs y comptent.
- Les événements de fête respectent `MAX_EVENTS`.

## 5. Livraison

Un spec, un plan, deux PR :

1. Calendrier, intensité, passants festifs, tests du moteur.
2. Événements, sprites, captures sur le banc `.superpowers/harness-ville` (paramètre `date=`), fiche WikiHow `bibliotheque-v26`.

## 6. Tests

- Moteur : dates calculées (Pâques, Épiphanie), plages, déterminisme, passants existants identiques à partir de la même graine, `festive` nul hors fête.
- Programme d'événements : un événement de fête n'apparaît que pendant sa plage ; `parade` jamais hors 14 juillet 10–12 h.
- Rendu : jsdom pour la présence des sprites et le mouvement réduit.

## Hors périmètre

Décors de longue durée avec échelles (1b-iii), réaction des animaux (1c), troupes à pied au défilé, événement de rue propre à la Saint-Valentin.

## 7. Extension du 2026-10-10 : équipes d'installation, scène, grand défilé

Demandes de l'utilisateur, intégrées à la PR 2 (une seule PR élargie). Elles remplacent, dans les §3 et §4 ci-dessus, la scène des musiciens, le défilé de 4 véhicules et les drapeaux d'entrée toujours présents.

### 7.1 Règle générale

Tout humain entre en scène et en sort de manière naturelle, jamais d'apparition ni de disparition sur place : les gens arrivent et repartent à pied, par les entrées d'immeuble (fondu court à l'encadrement de la porte, comme les habitants) ou les bords de la rue ; les musiciens arrivent à pied sur la scène et en repartent à minuit. Tout élément ajouté au décor est posé par un humain et retiré par un humain. Ce qui est hors de portée de la main se pose avec une **échelle** ou un **camion élévateur à nacelle**. Tout est calculé depuis la date et l'heure (aucun état, pas de `Math.random`) ; l'équipe est une fonction de l'heure comme dans `shops/works.ts` et `moving.ts`.

### 7.2 Moteur d'installation (`city/install.ts`, pur)

- Temps absolu : `abs = dayNumber(date) * 1440 + minute`. Le calendrier regarde la veille et le lendemain (un décor déborde sur d'autres jours).
- Un **jeu de décor** (`DecorSet`) : id, fête, équipement (`ladder` | `lift` | `hand`), fenêtre de montage `{ dayOffset, from, to }`, fenêtre de démontage, éléments. Un élément a un id, une position x, une hauteur (`high`), un seuil `u` (ordre d'intervention tiré de la graine, différent au montage et au démontage).
- Les éléments d'un jeu sont traités **un par un** par l'équipe du jeu : l'élément k occupe un créneau consécutif de la fenêtre. Pour un élément, `itemPhase(set, item, abs)` rend `absent | { phase: 'installing' | 'removing', step, progress } | present`. Avant son créneau de montage l'élément est absent ; après, présent ; pendant le démontage c'est l'inverse.
- Étapes par équipement : `ladder` = arrive, ladder-up, climb, fix, descend, ladder-down, leave ; `lift` = arrive (le camion vient se garer sous l'élément), deploy, rise, fix, lower, stow, leave ; `hand` = arrive, place, leave. Le démontage joue les mêmes étapes (le geste « fix » devient « unfix »).
- Jeux de décor retenus :

| Jeu | Fête | Équipement | Montage | Présent | Démontage |
| --- | --- | --- | --- | --- | --- |
| Drapeaux de lampadaires (un par lampadaire) | 14 juillet, 11 novembre, 1er mai | `lift` | veille 9 h à 17 h | jusqu'au lendemain | lendemain 9 h à 17 h |
| Drapeaux d'entrée (une entrée sur deux, `hallU < 0.5`) | idem | `ladder` | veille 9 h à 17 h | idem | lendemain 9 h à 17 h |
| Scène de la Fête de la musique : plancher, ossature, projecteurs (3 étapes d'un même ensemble) | 21 juin | plancher `hand`, ossature et projecteurs `lift` | le jour 9 h à 16 h | de 16 h jusqu'à la nuit | nuit du 21 au 22, 0 h à 4 h (équipe de nuit) |
| Barrières du défilé (tous les 120 px au bord de la chaussée) | 14 juillet | `hand` | 7 h à 8 h | route fermée | 12 h 30 à 13 h 30 |

- Rendu : travailleurs, `LadderSprite` existant (shop-sprites), un camion élévateur à nacelle (nouveau sprite), une camionnette garée au bord de la rue qui range les échelles. Le plafond de figurants existant (`sprite-budget`) compte les équipes.
- Arrivées et départs (aucun humain n'apparaît ni ne disparaît sur place) : la camionnette de l'équipe à pied (`city/van.ts`, pur) arrive en roulant dans la file de circulation depuis le bord du monde le plus proche, se range contre le trottoir quelques minutes avant le premier créneau à pied de la fenêtre (`footWindow`), ouvre sa portière arrière ; les ouvriers en descendent (cachés par la carrosserie) et sont à la portière au début du créneau, rejoignent leur élément à pied, y reviennent après le dernier créneau et y remontent ; elle repart en marche avant jusqu'au bord opposé. Montage, démontage de nuit de la scène et dépose des barrières suivent le même principe. Le camion élévateur reste hors champ la première minute de son arrivée et a quitté le champ à la dernière de son départ ; ses ouvriers sortent de la cabine au déploiement et y rentrent au repli. Un camion élévateur qui longe le trottoir passe devant la camionnette garée (elle ne s'efface jamais). Mouvement réduit : ni équipe ni véhicule.

### 7.3 Scène de la Fête de la musique

Une structure réelle : plancher de scène, deux montants métalliques et une traverse portant **3 projecteurs**. Les cônes de lumière partent de chaque projecteur et visent un musicien (plus de cône flottant). Visible de jour (projecteurs éteints), projecteurs allumés quand il fait nuit. Les musiciens (guitare, micro, tambour) arrivent à pied sur la scène, l'un après l'autre, depuis le bout de la rue le plus proche (16 h 46 à 17 h : ils longent le trottoir, montent sur le plancher par le côté et gagnent leur place), jouent de 17 h à minuit et en repartent à pied par le même chemin (0 h 01 à 0 h 15), avant l'équipe de nuit (moteur pur `musicianAt`). Les faisceaux ne s'allument que lorsqu'ils sont en place (nuit, 17 h à minuit). L'événement `street-band` du moteur est supprimé : la scène est un jeu de décor, les musiciens sont calculés depuis l'heure.

### 7.4 Route dédiée et grand défilé du 14 juillet (`city/parade.ts`, pur)

- **Route fermée** de 8 h à 13 h 30 le 14 juillet (jusqu'à la fin de la dépose des barrières) : aucune voiture, aucun vélo, aucun bus, tram, ambulance ni autre événement de rue (seul le cortège roule). Les barrières sont un jeu de décor posé de 7 h à 8 h.
- **Cortège** de 10 h à 12 h, flux continu sur les deux files de la route (vers la droite), un flux indépendant par file (tirages distincts, départ de la file du fond décalé de 12 s, file du fond dessinée plus petite et derrière celle du premier plan), calculé sans état. Premier plan : une fanfare ouvre la marche et les sapeurs-pompiers ferment ; fond : porte-drapeaux en tête, camions en queue, sans fanfare. Entre les deux, une suite tirée de la graine par file (motards, porte-drapeaux, fanfare militaire, colonne de soldats à pied, cavaliers de la Garde, jeeps pavoisées, camions militaires, chars), à vitesse commune pour ne rien faire se chevaucher dans une même file.
- **Défilé aérien** à 10 h : passage de la Patrouille de France (traînées bleu-blanc-rouge) puis hélicoptères.
- **Foule de spectateurs** (`crowdLevel(minute)`, `crowdFor(seed, width)`, rendu `parade-crowd.tsx`) : massée sur le trottoir, derrière les barrières (dessinées sur la chaussée), en trois rangs (espacement moyen 9, 14 et 20 px ; les rangs de derrière un peu plus hauts sur le trottoir et plus petits). Niveau 0 avant 8 h 30, monte jusqu'à 1 à 10 h, 1 jusqu'à 12 h 15, retombe à 0 à 13 h 15 ; chaque spectateur a son seuil `u` (en place si `u < crowdLevel`), donc arrivée et départ échelonnés. Les gens arrivent et repartent à pied (`spectatorAt(s, t, dayStartS)` → absent / en marche / debout) : moitié par une entrée d'immeuble proche (fondu court à l'encadrement de la porte), moitié par un bord de la rue (hors champ) ; ils partent en avance (longueur du trajet / pas de marche) pour être à leur place à l'instant voulu, marchent dans un couloir derrière la foule puis se glissent dans leur rang ; au départ, ils rejoignent l'entrée ou le bord le plus proche. Aucun fondu sur place. Drapeaux tricolores et mains agités (SMIL déphasé), téléphones levés, familles au premier rang, enfants sur les épaules. Spectateurs debout statiques et mémoïsés, marcheurs (peu nombreux à la fois) placés à chaque image ; devant une entrée, le rang du fond s'écarte. Hors du plafond des figurants (sinon clients et équipes disparaîtraient) : la foule remplace les marcheurs ordinaires, réduits à 30 % pendant la fermeture (`CLOSED_WALKERS`). Environ 166 spectateurs pour 720 px, dont environ 8 par 100 px animés.
- Drapeaux de lampadaires et d'entrées (jeux de décor ci-dessus) ; quelques passants portent un drapeau (`festive` bastille).
- Mouvement réduit : le cortège et le défilé aérien ne partent pas ; les décors posés restent figés, aucune équipe animée ; la foule est dessinée à son niveau courant, immobile (seulement les spectateurs en place, personne en marche) ; seuls les musiciens en place sont dessinés.

### 7.5 Ce que cela change dans la PR 2 déjà commitée

Retirés : événements `street-band` et `parade` (moteur et sprites de la tâche 6), `doorFlag` toujours présent (tâche 7), test du défilé et des vélos de la tâche 7. Conservés : `fest-balloons`, `bells`, fiche WikiHow (à compléter).

### 7.6 Fête de la musique : route privatisée, foule et stands de bière

Demande de l'utilisateur : « la route est privatisée (pas de voiture), et une foule s'installe devant les scènes. Des stands de bière sont montés dans la rue à plusieurs endroits distribuant des boissons ; les gens peuvent faire la queue pour prendre une bière. » La règle générale du §7.1 s'applique (entrées et sorties à pied, décor posé et retiré par des humains, tout calculé depuis la date et l'heure). Moteur pur d'abord ; le rendu suit.

- **Calendrier** : `music` est actif le 21/6 de 17 h à minuit et le 22/6 de 0 h à 4 h 30. Une fête qui passe minuit n'a qu'un jour d'ancrage (`festivityStartsOn`) : les décors et la fermeture de la route sont calculés une seule fois, depuis le 21/6.
- **Route privatisée** (`roadClosed(date, minute)`, `city/parade.ts`) : du 21/6 à 13 h (début de la pose des barrières en travers : aucune voiture ne traverse une barrière posée ; d'abord prévu à 14 h) jusqu'au 22/6 à 5 h, fin de toute la dépose de nuit (stands jusqu'à 5 h, barrières de 4 h 30 à 5 h) ; aucune voiture, aucun vélo, aucun événement de rue (`CityIntensity.closed`), marcheurs ordinaires réduits à `CLOSED_WALKERS`. La fermeture ne dépend que du calendrier. Le cortège ne part que le 14 juillet (`paradeOn`). Barrières (`barriers-music`, à la main) : deux en travers de la chaussée (une par file, champ `lane`) à chaque bout de la rue, posées de 13 h à 14 h le 21/6, retirées de 4 h 30 à 5 h le 22/6.
- **Scènes** : N = max(1, round(largeur / 700)) scènes (`stage-music-0`, …), une par part de rue avec un léger tirage (`stageXs`) ; mêmes fenêtres et même ordre qu'au §7.2.
- **Stands de bière** (`beer-stands-music`, `beerStandsFor`) : max(2, round(largeur / 240)) stands sur la chaussée, répartis régulièrement sur la longueur de rue libre (à plus de 82 unités du centre d'une scène : jamais sur une scène). Chaque stand : un comptoir avec ses fûts (`stand-counter`, à la main, sorti de la camionnette) puis un auvent (`stand-awning`, à l'échelle) ; l'auvent se pose après son comptoir et se retire avant lui. Montage le 21/6 de 12 h à 15 h 30, dépose le 22/6 de 2 h 30 à 5 h (équipe de nuit).
- **Service** (`city/beer.ts`) : de 17 h à 1 h, seulement comptoir et auvent posés (`servingOpen`). Deux serveurs par stand, en place avant l'ouverture, arrivés à pied (bout de la rue ou entrée d'immeuble proche) ; à la fermeture, tirage : ils repartent à pied ou restent derrière le comptoir jusqu'à l'arrivée de l'équipe de nuit (2 h 30). Clients (`beerSchedule`) : une arrivée toutes les 8 à 14 s, deux fois plus souvent de 19 h à 23 h ; un serveur sert un client en 11 à 17 s ; la file (ordre d'arrivée) se forme en pointe et se vide ensuite ; au plus 8 personnes en attente (une arrivée qui trouverait la file pleine est repoussée). Plus d'arrivée 5 min avant la fermeture. La file s'étire en ligne, du côté tiré du stand, et avance d'un cran (1,5 s) quand la tête part au comptoir (4 s). Les clients viennent à pied d'un bout de la rue ou d'une entrée d'immeuble proche, et repartent à pied en buvant (`queueAt` : en marche, en file, au comptoir, repartant). Aucun saut de position.
- **Foule** (`city/music-crowd.ts`) : demi-cercles denses devant chaque scène (quatre rangs, un spectateur toutes les 8 unités sur 160 unités et plus, sur la chaussée, tournés vers la scène, la plupart dansent tant que les musiciens jouent, jusqu'à minuit), deux petits groupes de 2 ou 3 personnes un verre à la main de l'autre côté de chaque stand, un fond de foule clairsemé ailleurs ; personne sur un stand ni dans sa file. Arrivées à pied de 17 h à 20 h (bout de la rue ou entrée d'immeuble proche, fondu seulement à l'encadrement de la porte), départs à pied de 23 h 30 à 1 h ; le temps absolu est continu à travers minuit.
- **Repère** : `x` en px du monde, `depth` en unités sous le bord du trottoir (y = curb + depth × unit ; négatif = sur le trottoir, seuil des entrées) ; chemins à pied communs (`city/walk-path.ts`).
- **Rendu** (`install-layer.tsx`, partie `street` ; `music-street.tsx` ; `music-sprites.tsx`) : la chaussée de la rue privatisée est dessinée après les lampadaires et les camionnettes, du plus loin au plus proche (`depth`) : auvents (derrière les serveurs), serveurs, comptoirs (fûts, tireuse, chope peinte, gobelets), clients en file et au comptoir, spectateurs, équipes ; les personnes en marche sont rangées à leur profondeur (tranches de 4 unités, re-rendu au changement de tranche). Barrières en travers : une par file (`lane`), vue de biais, de 10 à 36 unités (file du fond) et de 36 à 61 (file proche) : le passage le long du trottoir reste libre pour les camionnettes. Plusieurs scènes, chacune avec son trio (tenues propres), ses projecteurs et faisceaux (`data-stage-band-group`). Serveurs (`data-beer-server`, `data-serving` au service) en tablier, bras vers la tireuse ; clients (`data-queue-person`, `data-mode`) : le gobelet est posé sur le zinc les 4 dernières secondes du service, puis tenu à la main en repartant (le bras le porte à la bouche) ; foule (`data-music-spectator`) : rebonds SMIL déphasés pour les danseurs (un sur trois lève le bras), gobelet pour les buveurs, rien contre les barrières des bouts de la rue. Personnes en place mémoïsées, marcheurs placés à chaque image. Ni la foule, ni les serveurs, ni les clients ne comptent dans le plafond des figurants (aucun `data-worker`) : comme la foule du défilé, ils remplacent les passants ordinaires. Mouvement réduit : décors et personnes en place figés, personne en marche, aucune animation. Camionnettes de la Fête de la musique (scènes, stands, barrières) : elles longent le trottoir (pas de file de circulation) chacune dans sa rangée (décalée de 2,5 unités en profondeur, `data-van-row`) et se garent à l'écart les unes des autres. Mesure : environ 7 000 nœuds SVG dans la scène à 21 h pour 1 080 px (dont 4 600 sur la chaussée, 200 spectateurs, 70 clients), contre 2 400 un jour ordinaire.

### 7.7 Tout est apporté et emporté par des humains

Demande de l'utilisateur : tout élément qui arrive ou part est apporté ou emporté par des humains ; rien n'apparaît dans les mains. Pour chaque élément d'un jeu à équipe à pied (barrières, planche de la scène, comptoirs, drapeaux d'entrée, auvents), l'équipe fait un aller-retour depuis l'arrière de la camionnette garée (et non plus d'un élément au suivant) : pendant le premier quart du trajet aller, elle sort l'objet par la portière arrière ouverte (il glisse de la carrosserie à leurs mains ; sur la chaussée, il apparaît à la portière) ou descend l'échelle de la galerie du toit (bras levés) ; l'objet est tenu jusqu'à sa place ; au retour, ils remontent l'échelle sur la galerie. À la dépose, ils viennent les mains vides, soulèvent l'objet, le rapportent et le rangent pendant le dernier quart du trajet retour. Le drapeau ou la toile roulée de l'auvent voyage à la main (passé à l'équipier pendant qu'on dresse l'échelle). L'échelle n'est dessinée sur la galerie que lorsque personne ne la tient. Les objets portés glissent avec les porteurs (même transition CSS). Chaque objet porté porte `data-carried` (`hands`, `held` pour l'échelle dressée, `van` encore à moitié dans la camionnette) ; un test balaye les minutes de pose et vérifie qu'il est toujours près d'un porteur ou de la camionnette, et qu'il n'apparaît qu'à la camionnette. Les ouvriers qui descendent de la camionnette (ou y remontent) restent cachés par la carrosserie la plus grande part de la descente, puis gagnent l'arrière.
