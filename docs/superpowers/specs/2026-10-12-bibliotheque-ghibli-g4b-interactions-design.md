# Bibliothèque Ghibli — G4b : interactions employés-clients dans les commerces

Date : 2026-10-12. Statut : maquette animée VALIDÉE par l'utilisateur (`.superpowers/brainstorm/g4b-interactions/maquette.html`, faite par Fable). Consigne : les trois étapes G4b-1, G4b-2, G4b-3 sont implémentées en un seul passage, sans envoi intermédiaire ; fusion + pré-prod ; captures montrées à la fin.

## 1. But

Aujourd'hui, derrière la vitrine, employés et clients rejouent chacun une boucle de geste par famille (`gestureAt`, 6 à 14 s), sans lien entre eux ; le client reste 20-60 s tiré au hasard. G4b remplace cela, **en Ghibli seulement** (le dessin classique ne change pas), par de vraies interactions :

- vivantes et authentiques (fidèles à la vraie vie) ;
- **jamais deux fois identiques** (caractères + aléas + décisions qui dépendent de la situation) ;
- qui mettent en lien le plus de monde possible (employé qui jongle, renfort, clients qui se reconnaissent, groupes) ;
- lisibles par le corps d'abord, avec de rares pictogrammes manga (~1 s au-dessus de la tête), jamais de bulle de texte ;
- reproductibles : même boutique + même heure + même graine = même scène (deux fenêtres cohérentes, banc `date=` stable, rechargement sans saut).

## 2. Décisions de l'utilisateur (brainstorming 2026-10-12)

| Sujet | Choix |
|---|---|
| Granularité | C : squelette par famille (8) + étapes signature des métiers parlants, avec variantes |
| Variantes | caractère du client (pressé, bavard, indécis, habitué, perdu) + aléas indépendants |
| Échanges | C : à plusieurs (jongle, renfort, employés entre eux, clients qui se reconnaissent, boutique vide vivante) ET visites en groupe (couple, parent + enfant, amis) |
| Lisibilité | B : langage du corps + pictos rares dessinés main (`?`, `!`, ♪, traits de joie, goutte, cœur) |
| Affluence | B+ : plus de monde selon métier et heure, et un peu plus encore ; plafond relevé modérément (mesures téléphone en fin de migration) |
| Moteur | A + un peu de B : metteur en scène déterministe par l'heure, avec décisions émergentes rejouées en pas fixes et réactions à la rue |

## 3. Architecture

### 3.1 Vue d'ensemble

```
cast.ts (arrivées d'un créneau)  ──►  director.ts (simulation à pas fixes, par boutique et créneau)  ──►  Score (partition)
                                              ▲                                                         │
                         street.ts (pluie, défilé, car, klaxons)                         score-read.ts : actorsAt(score, t)
                                                                                                        │
                                       content : ShopScene (Ghibli) remplace ShopCustomers/StaffLayer intérieurs
```

Tout le cœur est dans `src/core/library/city/shops/scene/` (fonctions pures, testables sans DOM). Le rendu reste dans `src/content/` et réutilise le pantin (sprites PNG de `figure-host`).

### 3.2 Créneaux

- Le temps de chaque boutique est découpé en **créneaux** dont la durée dépend de la famille : `counter`/`till`/`drink` 240 s, `browse`/`machine` 360 s (et le caviste, conseil long), `table` 600 s, `chair` 600 s (tatoueur 900 s), `dance` hors G4b (boîte et salle de jeux gardent leur logique actuelle).
- **Règle de raccord** : un créneau commence et finit avec la boutique au repos (employés à leur poste ou en activité de boutique vide, aucun client à l'intérieur). Les arrivées sont interdites dans la dernière part du créneau (`ARRIVAL_SHARE`), et le metteur en scène écourte (employé qui accélère, bavard qui écourte, indécis qui renonce) pour que tout le monde soit sorti avant la fin. Chaque créneau est donc indépendant : aucune simulation n'a besoin de la précédente.
- La marche dans la rue (avant la porte, après la porte) reste une fonction pure de la visite (`passageAt`, comme aujourd'hui) ; elle peut déborder sur le créneau voisin. La lecture à l'instant `t` consulte donc les créneaux `N-1`, `N`, `N+1` (clients qui arrivent ou repartent dans la rue).

### 3.3 Distribution (`cast.ts`)

Pour un créneau : graine = `hash(graine de la ville, slotId, date, index du créneau)`. Elle fixe :

- le nombre de **partis** (un parti = une personne seule ou un groupe), d'après `crowdAt` × activité de la ville × facteur d'affluence G4b (§6) ;
- pour chacun : composition (`solo` 70 %, `couple` 12 %, `parent-enfant` 8 %, `amis` 10 % — `amis` surtout bar/café/restaurant), heure d'arrivée à la porte, sens de marche et bout du trajet (comme `visitsFor`), tenues, **caractère** du meneur (`rushed`, `chatty`, `undecided`, `regular`, `lost`, `ordinary` — pondérés par métier et par heure : pressés le matin, bavards l'après-midi, habitués à la boulangerie et au bar), et un **sac d'aléas** tirés à l'avance (pièce qui tombe, monnaie introuvable, éternuement, téléphone, enfant qui tire la manche) avec leur probabilité ;
- les **connaissances** : paires de partis du créneau qui se connaissent (probabilité par métier : forte au bar et à la boulangerie).

### 3.4 Metteur en scène (`director.ts`)

Une simulation **à pas fixes** (`STEP = 0,25 s`) rejouée depuis le début du créneau, RNG `mulberry32` dérivé de la graine du créneau, sans `Math.random` ni horloge. Acteurs : les employés présents (d'après `staffAt` : seuls les employés `floor` derrière la vitrine prennent part ; ceux qui ouvrent/ferment gardent leur logique actuelle) et les clients des partis.

Chaque acteur est une petite **machine à états** qui, à chaque pas, lit ce qu'il voit (le « monde » du créneau : file, employés libres, tables libres, connaissances présentes, état de la rue) et choisit sa prochaine **action**. Une action = un geste de la bibliothèque (§4) avec une durée, une cible (place, comptoir, client, collègue) et éventuellement un objet et un picto. Exemples de décisions (validées dans la maquette) :

- employé libre → accueille le premier de la file ; occupé → signe « j'arrive » au suivant ; file ≥ 3 et collègue en réserve → l'appelle (`!`), le collègue sort de l'arrière-boutique ;
- boutique vide → activités de boutique vide (ranger, essuyer, regarder par la vitrine, téléphone, bâiller, s'étirer, lire, discuter entre collègues s'ils sont deux) ;
- indécis : désigne, main au menton (`?`), se ravise, redésigne (`!`) ; si la file grossit derrière lui, se décide vite ou renonce et ressort ;
- pressé : s'impatiente dans la file, paie sans contact, repart aussitôt ; peut renoncer si l'attente dépasse son seuil ;
- bavard : reste accoudé après avoir payé (♪), parle au voisin de file ; l'employé écourte d'un « j'arrive » quand d'autres attendent ;
- habitué : salue d'un geste, l'employé prépare sans qu'il parle ;
- perdu : regarde partout (`?`), demande ; l'employé pointe le rayon ;
- connaissances : `!`, saluts, bavardage ; l'une cède son tour ;
- groupes : le couple se regarde (cœur), l'enfant pointe les gâteaux et le parent le retient, les amis trinquent au bar (♪) et l'un demande la note d'un signe ;
- restaurant : placement (le serveur marche devant), menus, commande au carnet, passage en cuisine (arrière-boutique), service des assiettes, débarrassage, note ; jusqu'à 3-4 tables.

**Invariants** (testés) : un employé ne sert qu'un parti à la fois ; un client à l'intérieur a toujours une place libre (pas de chevauchement de x à moins d'une demi-silhouette, sauf groupe serré) ; personne ne se téléporte (entre deux pas, déplacement ≤ vitesse × pas) ; tout client entré ressort par la porte avant la fin du créneau ; un objet emporté a été pris quelque part (comptoir, étagère, seaux, cuisine) ; même graine → même partition.

Sortie : une **partition** (`Score`) par boutique et créneau : pour chaque acteur, une suite de **segments** `{ t0, t1, action, x0→x1, yaw, gait, arms, lean, headYaw, held, picto }`. Calculée une fois (≈ 1-3 ms visés par créneau sur PC), mise en cache (LRU par boutique, quelques créneaux), lue à chaque image par `actorsAt(score, t)` (recherche dichotomique + interpolation linéaire de x et yaw).

### 3.5 Réactions à la rue (`street.ts`)

Évaluées dans la simulation à partir de l'état de la ville **déjà déterministe** fourni au créneau : pluie (début d'averse → un client qui sortait attend à la porte que ça passe, ou ouvre son parapluie), défilé en cours (employé et clients s'approchent de la vitrine), passage du car scolaire / bus à l'arrêt devant la boutique (regard), **klaxon** (nouveau : le moteur de circulation V1 publie l'instant et la position d'un coup de klaxon quand un conducteur impatient attend derrière un véhicule arrêté plus de 4 s ; les acteurs à moins de 120 px tournent la tête ~1 s). Si une information n'est pas disponible au calcul du créneau (klaxons du créneau futur), la réaction est jouée en surcouche au rendu (tête seule, sans changer la partition).

## 4. Gestes, objets et pictos

- **Gestes** : nouvelles poses `ArmPose` du pantin (IK déjà en place dans `skeleton.ts`), portées de la maquette : `give`, `take`, `point`, `chin`, `wave`, `beckon` (« j'arrive » / appel), `pay-card`, `pay-cash`, `wipe`, `shelve`, `phone`, `yawn`, `stretch`, `read`, `toast`, `weigh`, `wrap`, `scissors`, `shampoo`, `taste`, `sniff`, `pour`, `notepad`, `plates`, `mirror`, `frames` (lunettes aux tempes), `hold-child`, `tug` (enfant), `sneeze`, `crouch-pick` (+ allure `crouch` nouvelle). Chaque geste animé = 2 à 4 **poses clés** discrètes (le sprite est cuit par pose) avec 1 pose intermédiaire pour les transitions ; lean et headYaw complètent. Les chorégraphies (enchaînement et durées des poses clés) sont écrites **par Fable** (consigne utilisateur : séquences d'animation et visuels par Fable).
- **Objets** : accessoire du métier (existant `ACCESSORY`) + objets d'interaction (pièce, carte, ticket, menu, carnet, assiette, verre, paquet, bouquet, monture, miroir, échantillon) dessinés en cellulo, accrochés aux ancres `handR`/`handL` (mécanisme `Held` existant). Un objet n'apparaît jamais dans le vide : il est pris (comptoir, étagère, seaux, cuisine) et posé ou emporté.
- **Pictos** : 6 dessins manga au trait tremblé (`?`, `!`, ♪, traits de joie, goutte de gêne, cœur), SVG en cellulo, petit saut d'apparition, ~1 s, au-dessus de l'ancre `headTop`. **Rares** : au plus un picto par acteur toutes les 8 s et au plus 2 visibles par boutique à la fois.

## 5. Étapes signature (G4b-3)

Greffées entre « demande » et « remise » du squelette de la famille : boucher (pose, pèse, emballe → paquet), fromager (coupe un éclat, fait goûter → traits de joie, emballe), opticien (tend une monture, essai aux tempes + miroir, seconde monture), coiffeur (installe, shampoing client renversé, ciseaux, miroir), fleuriste (va aux seaux, compose, emballe → bouquet), caviste (verse un fond, fait sentir, goûter), tatoueur (longue séance penché, pauses pour essuyer, goutte du client, miroir), pharmacien (pose la boîte, pointe la notice, le client hoche la tête), restaurant (enchaînement complet §3.4), barista au café (machine, mouture, tasse posée). Durées : vente rapide 30-60 s, conseil 2-4 min, long (coiffeur, tatoueur) jusqu'à la longueur du créneau.

## 6. Affluence et budget

- Facteur d'affluence G4b : `CUSTOMER_SCALE` 0,55 → 0,8, plus la forme `nightlife` (bar vendredi/samedi soir) ; capacité intérieure par famille (comptoir 4 dont file, bar 7, restaurant 4 tables, chaise 2 + 1 en attente).
- Plafond `SHOP_SPRITE_CAP` 40 → **52** par 720 px. Retrait inchangé (terrasse puis intérieur, du plus loin au plus proche), mais par **parti entier** (on ne coupe pas un couple) et jamais un acteur en pleine interaction visible au centre de la vue.
- Mesures : sur PC (banc, CPU ×4) main contre branche à 8 h, 12 h 30, vendredi 21 h ; si la branche dépasse main de plus de 15 %, baisser le plafond (et le noter dans la PR). **Mesures sur le téléphone reportées à la fin de la migration Ghibli** (consigne utilisateur) ; la PR le mentionne.

## 7. Rendu (`src/content/`)

- `shop-scene.tsx` (Ghibli) : pour chaque boutique visible, lit les partitions des créneaux `N-1..N+1`, place les acteurs intérieurs (repère de la vitrine, `INSIDE_SCALE`) et les clients dans la rue et les portes (réutilise `passageAt`, `door-passage`, `placeCustomers`), les objets et les pictos. Remplace en Ghibli `ShopCustomers` intérieurs et la partie « debout derrière la vitrine » de `StaffLayer` ; les ouvreurs/fermeurs, rideaux, terrasses, boîte de nuit, travaux et déménagements ne changent pas.
- Boucle d'image : aucune allocation par acteur hors changement de segment ; `poseFigure` (href de l'`<image>`) comme aujourd'hui ; budget de peinture de sprites par image inchangé (le sprite manquant garde l'image courante).
- **Défauts de la maquette à ne pas reproduire** : passants de rue à la mauvaise échelle devant la vitrine (le jeu a déjà ses échelles : `STREET_SCALE` dehors, `INSIDE_SCALE` dedans) ; occultation par le comptoir (les acteurs derrière le comptoir sont rognés à la ligne du plan de travail par le `<svg>` imbriqué de la vitrine, pas « jusqu'aux genoux ») ; pictos et légendes qui se chevauchent.

## 8. Tests et validation

- Unitaires (vitest, pur) : déterminisme (même graine → partition identique), invariants §3.4, raccord des créneaux (boutique au repos aux bornes), employés comme ressource, rareté des pictos, capacité, aucun objet sans prise, budget par parti entier, klaxon publié par le moteur de circulation.
- Banc `.superpowers/harness-ville` (paramètres `art=ghibli`, `date=`, `shops=`) : captures auto-validées par moi de chaque étape (caractères, aléas, boutique vide, file + renfort, bar vendredi soir, restaurant, 8 signatures, pictos, taille réelle) dans `.superpowers/captures-ghibli-g4b/` ; pas de scène vide au moment des captures (choisir l'heure d'après la partition).
- Mesures PC §6 (téléphone : fin de migration).
- Pas de fiche WikiHow (fiche globale à la fin de G7).

## 9. Hors périmètre

Boîte de nuit et salle de jeux (`dance`), terrasses, travaux, déménagement, rideau, dessin classique ; animaux (G7), pièce (G6), fêtes/lampadaires (G5).
