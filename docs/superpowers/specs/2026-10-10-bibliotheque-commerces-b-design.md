# Ville vivante, vague 1b-iv-b : le personnel, les gestes, la terrasse, la boîte de nuit et le déménagement

Date : 2026-10-10. Statut : design validé avec l'utilisateur (conversation du 2026-10-10), UNE SEULE PR.
Suite de `2026-10-09-bibliotheque-commerces-design.md` (1b-iv-a, PR #231). Notes d'origine :
`docs/superpowers/notes/2026-10-09-ville-commerces-decisions.md` (« Second temps »).

## But

Faire vivre l'intérieur et le devant des commerces : des gens de la ville y travaillent, ouvrent et ferment, se relaient ;
les clients et les employés font des gestes liés au type du commerce ; les bars et restaurants sortent une terrasse selon
la météo ; la boîte de nuit a un cordon, des videurs et une file ; un camion de déménagement vide puis remeuble le local
le jour d'un changement de commerce.

## Principe : tout est calculé

Comme 1b-iv-a : des fonctions pures de (graine de la pièce, local, jour, minute, météo). Aucun nouvel état mémorisé
(`Room.cityEpoch` reste le seul champ), aucune migration, l'état reste v5.

## 1. Personnel (`shops/staff.ts`)

- **Équipe par local** : 1 à 3 personnes selon le type et la largeur du local, tirées de la graine du local et du jour
  (profil `ordinary`, `suit` ou `worker`, tenue tirée ; la même personne reste reconnaissable dans la journée).
- **Plan du jour** `staffPlan(def, seed, slotId, date)` : suite de postes (qui est dans le local entre quelles minutes).
  - L'employé d'ouverture arrive à pied du bord de scène et franchit la porte **13 à 20 min** avant l'heure d'ouverture
    (amendé : 20 à 30 min au brief ; écart invisible à l'écran), lève le rideau (animation de 4 à 6 s), puis prend son
    poste. Le rideau est levé seulement quand quelqu'un est là.
  - **Relais** : défini **par plage** d'ouverture de plus de 9 h (amendé : une plage d'exactement 9 h, comme le bar, n'est
    pas relayée ; les restaurants à deux services non plus, l'invariant tient par l'ancre de l'équipe) ; une seconde équipe
    arrive avant que la première parte ; les deux se croisent à la porte.
  - **Affichage** : au plus **3 personnes visibles** par local (ancre d'abord, puis par arrivée), même quand le relais en met
    jusqu'à 6 à l'intérieur ; au moins une dès que le local est ouvert.
  - **Invariant : à toute minute où le local est « ouvert » (`isOpenAt`), au moins une personne est à l'intérieur.**
    Pauses : un membre ne part en pause que si un autre reste à l'intérieur ; une équipe d'un seul membre n'a pas de pause.
  - Pause de service (restaurant 14 h 30-19 h, pizzeria/kebab/sushis 14 h-18 h) : l'équipe finit son service, baisse le
    rideau, sort, revient avant la reprise (comme une ouverture : 13 à 20 min avant).
  - Fermeture : le dernier baisse le rideau, éteint, sort et repart vers le bord (côté tiré).
  - Un jour fermé (dimanche, férié, lundi selon le type) : personne.
- Fonction pure `staffAt(plan, minutes)` → pour chaque membre : `absent | walking-in | opening | working | switching | closing | walking-out`
  avec position le long du trottoir ou à l'intérieur et avancement. Réutilise le mécanisme de trajets des habitants
  (`doors.ts` : marche à `WALK_PACE`, aller-retour du bord du monde).
- **Raccord avec le chantier** (amendé, `dayShifts` de `city-shops-life.tsx`) : le jour de changement, personne avant la fin
  du chantier d'enseigne ; le nouveau locataire **ouvre à la fin des travaux si ses horaires le permettent** : on garde ses
  postes du jour qui finissent après le chantier, et son équipe est **clampée** (arrivée et lever du rideau repoussés à la fin
  du chantier s'ils tombaient avant, pauses antérieures retirées). Sinon il ouvre le lendemain. Le chantier suit le décalage
  du déménagement (§5).

## 2. Familles de gestes de travail (`shops/gestures.ts` + `shop-gesture-sprites.tsx`)

Huit familles ; chaque type de commerce en a une (`SHOP_GESTURES: Record<ShopTypeId, Family>`) et un accessoire propre :

| Famille | Types | Employé | Client |
|---|---|---|---|
| `counter` | boulangerie, pâtisserie, chocolatier, boucherie, poissonnerie, fromager, pharmacie, fleuriste | prend l'article sous la vitrine, l'emballe, le tend | reçoit le paquet (accessoire : baguette, boîte, sachet, bouquet, médicament…) |
| `till` | primeur, caviste, épicerie, supérette, animalerie | range un rayon, passe en caisse | prend un article au rayon, le pose à la caisse |
| `chair` | coiffeur, tatoueur | travaille debout derrière le client (ciseaux, aiguille) | assis dans le fauteuil |
| `browse` | librairie, disquaire, magasin de jeux, opticien, friperie, antiquaire | arrange une pile, répond | fouille un rayon, lève un objet, l'examine |
| `drink` | bar, café, salon de thé | verse, essuie un verre, sert | au comptoir, boit |
| `table` | restaurant, pizzeria, kebab, sushis | dresse, apporte un plat | assis à table, mange |
| `dance` | boîte de nuit, salle d'arcade | DJ/gérant derrière le pupitre ou la caisse | danse / joue (bras, balancement) |
| `machine` | laverie, vélociste | charge une machine / répare un vélo | charge son linge / attend près d'un vélo |

- Un geste = une courte séquence pure `gestureAt(family, role, t, seed)` → pose (bras, tête, accessoire) en fonction du
  temps, bouclée. Dessinée en SVG sur `PersonSprite` (nouvelles poses, aucun nouveau personnage).
- Les clients de `customers.ts` ne sont plus « debout 20 à 60 s » : pendant leur séjour (`inside`) ils font le geste de la
  famille (le client se place au comptoir/au rayon/au fauteuil/à la table de l'intérieur ; l'employé de service est
  tourné vers lui). Ils repartent avec un petit objet quand la famille s'y prête (`counter`, `till`, `browse`).
- Les accessoires font ≈ 3 à 5 px : visibles surtout en grande fenêtre ou plein écran (limite assumée).

## 3. Terrasse (`shops/terrace.ts`, `shop-terrace.tsx`)

- Types avec terrasse : **bar, café, restaurant, salon de thé, pizzeria**. Tables rondes + 2 chaises (2 à 4 tables selon
  la largeur du local) devant la vitrine, sur le trottoir.
- `terraceStateAt(def, seed, slotId, date, minutes, weather, hour)` → `none | setting-up | open | umbrellas | clearing`
  - **Montage** par l'équipe juste après l'ouverture (employé qui sort deux chaises, une table…), **démontage** à la
    fermeture (ou 30 min avant pour les bars).
  - **Pluie, neige, orage, vent fort, ou nuit froide** (heure de nuit sans réglage de température : de 22 h à 7 h, ou
    météo « neige ») : terrasse rentrée. Amendé : par mauvais temps les tables disparaissent aussitôt (`terraceAt` rend
    `none`, pas de démontage animé) ; seul le retour est retardé : 10 min de temps sec avant de ressortir (hystérésis). **Temps sec avec soleil fort** : parasols seulement par-dessus les tables.
  - Amendé : la règle « nuit froide » **coupe la terrasse du bar (et du restaurant) à 22 h** ; le démontage « 30 min avant la
    fermeture du bar » ne se joue donc jamais. Après le mauvais temps, la terrasse revient directement `open` (pas de
    montage animé). Le rendu agrège la météo des 10 dernières minutes pour l'hystérésis.
  - La météo vient de `src/core/library/weather/` (époques déterministes déjà utilisées par la rue).
- Clients attablés : 0 à 2 par table, tirés selon le type et l'affluence ; un serveur sort servir. Amendé : **plancher
  d'affluence de 0,3** (affluence = min(1, 0,3 + 0,9 × affluence du type × (0,6 + 0,4 × activité de la rue))), sans quoi
  les chaises restent presque toujours vides. Les clients de terrasse
  sont **en plus** des clients de l'intérieur, mais comptés dans le plafond global (voir Coût).
- Mouvement réduit : tables posées/rentrées selon l'état, parasols selon l'état, aucun client en route, une personne
  assise par table au plus.

## 4. Boîte de nuit (`shops/queue.ts`)

- Ouverte (jeu.-sam. 23 h-5 h) : cordon (deux potelets et une corde) devant la porte, **2 videurs** (profil `suit`,
  noir, bras croisés) debout de part et d'autre.
- **File** de 0 à 6 personnes qui avance : `queueAt(seed, slotId, t)` → positions dans la file, une personne entre
  toutes les 15 à 30 s (disparaît dans la porte), une nouvelle arrive au bout de la file. Longueur selon l'affluence
  (`crowdAt`) : maximum vers 0 h-2 h.
- Amendé : la file s'aligne du côté de la vitrine et **dépend de la largeur de la façade** : écart de 4,4 à 6,5 px entre deux
  personnes, au plus autant de personnes visibles que la place jusqu'à l'entrée des habitants le permet (1 à 6 ; ≈ 2 sur
  les façades les plus étroites, 6 sur les plus larges), la dernière visible arrive en fondu.
- Pas de file pour la salle d'arcade (hors périmètre).
- Mouvement réduit : cordon et videurs, 3 personnes immobiles dans la file.

## 5. Déménagement (`shops/moving.ts`)

Le jour du changement, avant le chantier d'enseigne existant :

- Nouveau plan `movingPlan(seed, slotId, day)` : début 8 h 00 à 8 h 30, fin entre 9 h 30 et 10 h ; le chantier de l'enseigne
  (`worksPlan`) est **décalé** : début entre 9 h 45 et 10 h 15, fin vers 13 h (`worksPlan` reçoit une borne basse, ses
  proportions de pas ne changent pas). Le local reste fermé tout du long.
- Étapes (`MOVING_STEPS`) : `truck-arrives` (un camion de déménagement roule jusqu'au trottoir, devant le local et se
  gare), `open-back` (hayon), `carry-out` (deux ou trois déménageurs sortent l'ancien mobilier ; **meuble lourd = deux
  ou trois personnes en file indienne le portant**), `pause`, `carry-in` (nouveau mobilier : même chose en sens inverse),
  `close-back`, `leave` (le camion repart). Cas `to-sale` : seulement `carry-out` ; cas `from-sale` : seulement
  `carry-in`.
- **La vitrine se vide puis se remplit** : `shopViewAt` gagne `moving: { step, progress, carrying }` et un `interior` à trois
  états (`before | empty | after`) selon l'avancement des portages (mobilier retiré progressivement : l'intérieur de
  l'ancien type s'efface par tranches, puis celui du nouveau apparaît par tranches).
- Les déménageurs sont des `worker` en tenue différente de l'équipe d'enseigne (casque ou bonnet).
- Un seul camion à la fois dans la rue : si deux locaux changent le même jour, le second est décalé de 2 h. Amendé
  (`movingOffsets`) : dans l'ordre des locaux, chaque déménagement est décalé par pas de **120 min** jusqu'à commencer après
  la fin du précédent ; le chantier d'enseigne et l'équipe du nouveau locataire suivent ce décalage. Au-delà de 5 changements
  le même jour (très rare), le dernier finit en soirée et son commerce n'ouvre souvent que le lendemain.
- Amendé : **les meubles du nouveau commerce restent** après le déménagement (intérieur `after` pendant le chantier
  d'enseigne et ensuite).
- Le camion se gare entièrement dans la scène (près d'un bord, il recule vers la porte) ; il peut couvrir le bas de la façade
  voisine (limite assumée).
- Mouvement réduit : camion garé et ouvert ; un porteur figé selon l'étape (chargé d'un carton pendant les portages, mains
  vides pendant le hayon et la pause, aucun à l'arrivée et au départ du camion).

## 6. Coût

- Au plus ~10 locaux par 720 px ; chaque local : ≤ 3 employés, ≤ 2 clients intérieurs, ≤ 4 clients de terrasse. **Plafond
  global** d'environ 40 sprites animés pour la scène Ville (au-delà, on supprime d'abord les clients de terrasse puis les
  clients intérieurs les plus éloignés du centre de la fenêtre) pour rester dans le budget de la 1a.
- Réalisé (`shops/sprite-budget.ts`, appliqué une fois par minute par la boucle de `CityLifeLayer`) : **40 par 720 px** de
  scène (jamais moins de 40), comme les budgets de la 1a. Comptés et jamais retirés : personnel visible, serveur et porteur
  de terrasse, équipe du chantier, déménageurs et camion, videurs, file de la boîte (pour sa longueur maximale). Chaque
  visite compte pour une silhouette dès que son local peut recevoir des clients. Retirés au besoin : convives de terrasse
  (cachés), puis visites suspendues pour la minute, chaque fois les plus éloignées du centre de la scène. Passants,
  habitants et véhicules restent dans le budget de la 1a (non comptés ici). Une rue de 720 px ordinaire reste sous 40.
- Intérieurs et terrasses statiques ; seuls les sprites, le rideau, la file, le camion bougent.

## 7. Architecture

- Moteur pur testé, `src/core/library/city/shops/` : `staff.ts`, `gestures.ts`, `terrace.ts`, `queue.ts`, `moving.ts`,
  extension de `works.ts` (borne de début), `view.ts` (champs `moving`, `staff`, `terrace`, `queue`), `customers.ts`
  (phase `inside` avec geste).
- Rendu : `src/content/shop-gesture-sprites.tsx`, `shop-terrace.tsx`, `shop-queue.tsx`, `moving-truck.tsx` ; `city-shops-life.tsx`
  (couche) lit le moteur et assemble.
- Aucune requête nouvelle, aucun changement du relais.
- Fiche WikiHow : `bibliotheque-v24` (personnel, gestes, terrasse, boîte de nuit, déménagement, limites).

## 8. Tests

Vitest (`--maxWorkers=4`) :
- **Invariant « jamais vide »** : pour chaque type, chaque jour de la semaine, chaque minute 0..1439, si `isOpenAt` alors
  au moins un membre `working`/`switching` à l'intérieur ; vérifié aussi les jours fériés, minuit passé (bar, boîte), les
  plages doubles.
- Relais : deux équipes se chevauchent au moins 5 min ; personne à l'intérieur quand c'est fermé.
- Rideau : ni levé ni baissé sans quelqu'un à la porte.
- Terrasse : pas de table par pluie/neige/orage/nuit ; montée seulement si le local est ouvert ; hystérésis.
- File : positions croissantes, longueur bornée, aucune sortie en dehors de l'ouverture.
- Déménagement : étapes ordonnées, `to-sale`/`from-sale` écourtés, intérieur `before → empty → after`, chantier d'enseigne
  après le déménagement, un seul camion à la fois.
- Rendu jsdom : mouvement réduit, une personne par table maximum, plafond global.
- Vérification à l'œil dans Chrome (banc `.superpowers/harness-ville/` si présent, sinon à recréer) : gestes visibles,
  rideau, terrasse sous la pluie, camion.

## Limites assumées

- Accessoires et gestes petits (≈ 4 px) : lisibles surtout en grande fenêtre.
- Les types d'une même famille ont des gestes proches, seul l'accessoire change.
- Personnel et clients : tenues tirées de la graine, un même habitant n'est pas « suivi » d'une pièce à l'autre.
- Terrasse décidée sur la météo de la rue (pas de réglage de température réelle).
- Meubles portés : représentés par un rectangle stylisé par type de meuble (table, vitrine, fauteuil, étagère…), pas le
  meuble réel de l'intérieur.
