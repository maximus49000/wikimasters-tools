# Revue du décor du 2026-10-13 : une ville naturelle et vivante

Retours de l'utilisateur sur la scène Ville (graphisme Ghibli), triés selon l'état de la migration (G1 décor, G2 ciel,
G3 humains, G4 commerces, V1-V5 véhicules, G5 partie 1 faits ; G5 partie 2, G6, G7 à venir). Pas de Fable avant le
2026-10-17 : tout besoin de dessin est noté ici et repris quand Fable sera de nouveau disponible.

Règle générale (mémoire « humains naturels ») : **tout doit être naturel ET vivant**. On déroule chaque scénario réel de
bout en bout (qui apporte, qui pose, qui reprend, qui range, qui paie), et personne ne traverse une personne, un véhicule
ni un objet.

## Traité en code (déjà migré)

| # | Sujet | Lot |
|---|-------|-----|
| 1 | Bus à horaires (6 h 50 → 0 h 30, pointes, soir espacé ; dimanche réduit), personne n'attend la nuit, panneau « Prochain bus » (ligne + minutes) | PR #272 (fusionnée) |
| 2 | Marche de face ou de dos au passage piéton (effet « moonwalk ») | PR #273 (fusionnée) |
| 3 | Motos et scooters : les mains sur le guidon | PR #273 (fusionnée) |
| 4 | Vélos au feu rouge : arrêt avant le passage piéton, pied à terre ; remonter une file sans traverser un véhicule | PR #273 (fusionnée) |
| 5 | Déménageurs : équipe désorganisée et vivante (pas 3 qui entrent / 3 qui sortent), hayon rapide, entrée dans le camion sans être coupé en deux par le calque du camion | PR #277 (fusionnée) |
| 6 | Local déménagé : il se vide puis se remplit, les déménageurs sont visibles au travail à l'intérieur | PR #277 (fusionnée) |
| 7 | Café : le serveur pose la tasse, le client la prend, boit, la repose (plusieurs fois), la tasse reste jusqu'au débarrassage, le client paie avant de partir | PR #278 (fusionnée) |
| 8 | Piétons : respect des plans (contourner par derrière), attente vivante s'il n'y a pas la place (petits gestes, agacement), jamais à travers un objet ou un véhicule | lot piétons, version légère (choix de l'utilisateur) |
| 9 | Plus de passants et de vie sur le trottoir d'en face, sans cacher la ville (seulement des éléments bas ; lampadaire côté chaussée ; pas de gros arbre ni de bâtiment) | lot trottoir d'en face |

## À reprendre avec Fable (dessin)

- Meubles portés par les déménageurs : aujourd'hui des rectangles plats (vitrine, étagère, table, fauteuil) → vrais
  meubles en cellulo.
- Bouche des pantins pour boire (tête) : la tasse va à la bouche, mais la tête n'a pas de bouche dessinée.
- Panneau « Prochain bus » : afficheur SVG simple, à peindre dans le style du poteau (`bus-stop` du registre d'accessoires).

## À prendre en compte dans la suite de la migration

- **Grue (G5 partie 2, tâche des événements du ciel)** : mouvement pas naturel (rotation, levage d'une charge, câble qui
  descend et remonte, ouvrier dans la cabine), et elle ne doit jamais être cachée à 100 % par les nuages : la flèche reste
  sous la couche de nuages ou les nuages passent derrière elle.

## Déménagement : ce qui est fait et ce qui reste

Fait (lot déménagement) : planning par porteur (pas, temps de prise et de pose, cartons seul, meubles à deux, pauses sur le
trottoir), hayon manœuvré en 5 s par le premier arrivé (ouverture et fermeture ramenées à ~1 min 30 au lieu de 4 min),
descente de la cabine et remontée en passant derrière le camion, déménageurs visibles derrière la vitrine quand ils sont dans
le local, planning calé sur la minute où l'étape devient visible (personne ne surgit).

Reste :
- La vitrine se vide encore par tranches au rythme de l'étape, pas pièce par pièce avec les allers réels.
- « Calque du camion » : interprété comme les porteurs coupés par la caisse avant d'être arrivés au camion ; ils entrent
  désormais seulement par l'arrière. À confirmer avec l'utilisateur si le souci visait autre chose (passants coupés par le
  camion garé, par exemple).
- Meubles : aplats provisoires (Fable).

## Café : ce qui est fait et ce qui reste

Fait (lot café) : déroulé par convive (`shops/terrace-service.ts`) — servi 40 s à 2 min après s'être assis (le serveur
apporte la tasse et la pose, geste « give »), 6 à 12 gorgées étalées (prendre, boire à la bouche, reposer), occupations entre
deux (lire, téléphone, menton dans la main…), paiement avant de partir (serveur au carnet, carte ou billets), tasse qui reste
sur la table, même après le départ, jusqu'au débarrassage (geste « take », retour la tasse à la main) ; collègue qui sort si
le serveur est déjà dehors ; boisson = tasse (café, salon de thé) ou verre (bar, restaurant, pizzeria), plus de théière portée
à la bouche.

Reste : les convives classiques (graphisme non Ghibli) restent assis immobiles (pas de gestes) ; pas de service pendant
l'averse, le montage ni le démontage (les tasses disparaissent quand on rentre les tables : le serveur devrait les débarrasser
d'abord) ; bouche des pantins (Fable).

## Piétons : version légère (choix de l'utilisateur, 2026-10-13)

Fait : les passants gardent leur boucle mais contournent (`dodgeY`, city-life.tsx) — devant les terrasses ouvertes, derrière
les déménageurs et les piétons qui attendent au passage piéton (dessinés après eux) ; passants dessinés du plus loin au plus
proche ; déménageurs dessinés après les passants. « Des gens passent devant les voitures » (précisé : trottoir des
immeubles) : les piétons du passage piéton qui longent le trottoir des immeubles étaient dessinés devant toute la chaussée ;
ils sont maintenant derrière les voitures (`CrossingLayer part="far"`).

Reste : attente vivante (petits gestes, agacement) quand il n'y a pas de place — demande les agents simulés (version complète,
reportée) ; passants qui se croisent sur la même ligne (pas d'évitement entre eux).

## Point ouvert : la personne de la laverie coupée « avant l'arrivée du camion »

Précision de l'utilisateur (2026-10-13) : « personne de la laverie coupée avant l'arrivée du camion ». Pas reproduit : il faut
une capture au moment où ça arrive (quel commerce déménage, à quelle étape, quelle partie de la personne est coupée).
