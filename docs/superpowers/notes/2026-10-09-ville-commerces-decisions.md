# Ville vivante : commerces et décisions de la vague 1b-i (notes de conversation, 2026-10-09)

Notes prises pendant la préparation du plan de la vague 1b-i. Rien n'est encore implémenté.

## Vague 1b-i (moteur d'événements) : décisions prises

- Découpage de la vague 1b en trois PR : 1b-i événements ordinaires, 1b-ii fêtes et père Noël, 1b-iii décors de longue durée.
- Maquette des 17 événements validée comme base (visualisation dans la conversation, non sauvegardée).
- Véhicules d'événement : l'ambulance roule plus vite et les voitures de sa file **se rangent** (décalage vers le bord, puis retour) ; bus, tram, camion-poubelle et livreur roulent à la vitesse de leur file, et les voitures qui seraient collées à eux s'effacent pendant leur passage.
- Fréquence « de temps en temps » : environ 2 créneaux de 25 s sur 10 lancent un événement, 2 événements au plus en même temps.
- **Feux d'artifice : ils partent de derrière les immeubles** (masque qui suit la silhouette des toits), pas devant.
- **Route remontée** (première tâche du plan) : sol de la ville à 0,70 de la hauteur au lieu de 0,78 ; depuis la fenêtre la plus basse, même petite (3 lignes), on voit les deux files ; trottoir d'en face en bas. Fenêtres allumées des immeubles (`citySkyline` pose les siennes sur 0,78) et sol de la météo (`scene-weather.tsx`, GROUND et ARC_FOOT de la ville) à recaler.
- L'enseigne néon sort de la liste des événements : elle est remplacée par les commerces ci-dessous.

## Commerces (demande de l'utilisateur)

- Des **locaux commerciaux**, toujours au **rez-de-chaussée**. Un immeuble qui a un commerce garde **aussi une porte d'entrée** pour que les habitants rentrent chez eux.
- Un local est **ouvert une certaine période**, puis **ferme**. Ensuite, soit il est **à vendre** (pancarte), soit il est **reloué directement** et une nouvelle enseigne ouvre.
- **Pose d'une enseigne = action particulière** : des personnes arrivent **avec la nouvelle enseigne et une échelle**, **enlèvent l'ancienne**, **posent la nouvelle**, puis **repartent avec l'ancienne hors du champ**. Elle a lieu en journée.
- **Sans relouage** (pas de nouvelle enseigne) : la même équipe vient avec une échelle, **enlève seulement l'ancienne enseigne** et **pose le panneau « À vendre » à sa place**, puis repart avec l'ancienne enseigne hors du champ.
- Les enseignes lumineuses sont posées par les habitants en journée (locaux dédiés).
- **Clients** : ils entrent dans les commerces **le jour** (magasins, pharmacie…) et **la nuit** (boîtes de nuit, bars…), selon le type de commerce.

## Décisions validées (2026-10-09)

- Les commerces sont une **vague à part, juste après la 1b-i** (« 1b-iv »), avec mini-spec, maquette et plan.
- Un commerce reste **ouvert 3 à 12 semaines**, puis **1 à 3 semaines « À vendre »**, ou il est **reloué tout de suite**.

## Second temps (après les bases des commerces)

- **Devanture cohérente avec l'activité** : un bar a son comptoir, ses tabourets et sa **terrasse** ; des clients s'y **assoient et boivent un verre**, un **serveur** vient les servir.
- Pharmacie : à préciser (phrase de l'utilisateur restée inachevée).
- **Boîte de nuit** : **file d'attente** et **videurs** devant.
- **On voit l'intérieur** des commerces.
- **Diversité** de mobilier et de styles : jamais deux commerces identiques.
- **Relocation avant ouverture** : on **sort l'ancien mobilier** et on **installe le nouveau** ; un meuble lourd est **porté par plusieurs personnes** ; tout passe par un **camion de déménagement**.

## Questions ouvertes

- Liste des types de commerce et de leurs horaires, part des rez-de-chaussée occupés par un commerce (à fixer dans la mini-spec de la vague commerces).
