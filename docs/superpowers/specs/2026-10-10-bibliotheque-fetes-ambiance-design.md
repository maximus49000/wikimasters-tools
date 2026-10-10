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

Tout élément ajouté au décor est posé par un humain et retiré par un humain. Ce qui est hors de portée de la main se pose avec une **échelle** ou un **camion élévateur à nacelle**. Tout est calculé depuis la date et l'heure (aucun état, pas de `Math.random`) ; l'équipe est une fonction de l'heure comme dans `shops/works.ts` et `moving.ts`.

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

### 7.3 Scène de la Fête de la musique

Une structure réelle : plancher de scène, deux montants métalliques et une traverse portant **3 projecteurs**. Les cônes de lumière partent de chaque projecteur et visent un musicien (plus de cône flottant). Visible de jour (projecteurs éteints), projecteurs allumés quand il fait nuit. Les musiciens (guitare, micro, tambour) jouent de 17 h à minuit sur la scène. L'événement `street-band` du moteur est supprimé : la scène est un jeu de décor, les musiciens sont calculés depuis l'heure.

### 7.4 Route dédiée et grand défilé du 14 juillet (`city/parade.ts`, pur)

- **Route fermée** de 8 h à 12 h 30 le 14 juillet : aucune voiture, aucun vélo, aucun bus, tram, ambulance ni autre événement de rue (seul le cortège roule). Les barrières sont un jeu de décor posé de 7 h à 8 h.
- **Cortège** de 10 h à 12 h, flux continu sur la file du premier plan (vers la droite), calculé sans état : une fanfare ouvre la marche, puis une suite tirée de la graine (motards, porte-drapeaux, fanfare militaire, colonne de soldats à pied, cavaliers de la Garde, jeeps pavoisées, camions militaires, chars, sapeurs-pompiers), à vitesse commune pour ne rien faire se chevaucher.
- **Défilé aérien** à 10 h : passage de la Patrouille de France (traînées bleu-blanc-rouge) puis hélicoptères.
- Foule dense sur les trottoirs (`festive` bastille, déjà en place), drapeaux de lampadaires et d'entrées (jeux de décor ci-dessus).
- Mouvement réduit : le cortège et le défilé aérien ne partent pas ; les décors posés restent figés, aucune équipe animée.

### 7.5 Ce que cela change dans la PR 2 déjà commitée

Retirés : événements `street-band` et `parade` (moteur et sprites de la tâche 6), `doorFlag` toujours présent (tâche 7), test du défilé et des vélos de la tâche 7. Conservés : `fest-balloons`, `bells`, fiche WikiHow (à compléter).
