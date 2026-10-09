# Ville vivante, vague 1b-iv-a : la rue commerçante

Date : 2026-10-09. Statut : design validé avec l'utilisateur (conversation du 2026-10-09).
Suite de `2026-10-09-bibliotheque-ville-vivante-design.md` (1a, 1b-i fusionnées). Notes d'origine :
`docs/superpowers/notes/2026-10-09-ville-commerces-decisions.md`.

## But

Donner à la scène Ville des commerces au rez-de-chaussée des immeubles du premier plan : chacun a un nom, un type, des
horaires, un intérieur visible par la vitrine, des clients ; il ouvre, ferme, passe « À vendre » ou est reloué, et une
équipe vient changer l'enseigne. L'utilisateur doit être « presque toujours surpris d'une ouverture » : grande variété de
types et de noms, noms locaux tirés d'OpenStreetMap autour de lui.

## Découpage

- **1b-iv-a (ce document)** : cycle de vie, noms (relais + liste écrite), devanture, enseigne, rideau, écriteau « À vendre »,
  intérieur FIXE par type (mobilier adapté + vendeur), clients qui entrent/sortent et restent debout derrière la vitrine,
  équipe du matin avec échelle.
- **1b-iv-b (plus tard)** : gestes à l'intérieur par type (prendre une baguette, coupe de cheveux, verre au comptoir…),
  terrasse du bar, file + videurs de la boîte, camion de déménagement et mobilier porté.

## Principe : calculé, pas mémorisé

Comme le reste de la ville (passants, entrées, événements), tout se calcule à partir de la graine de la pièce et de la
date. Seule exception : **une date de départ par pièce**, `Room.cityEpoch?: number` (ms, champ facultatif, sans migration,
état reste v5), posée la première fois que la scène Ville est affichée dans cette pièce (`repo.updateQuiet`). Une pièce
sans `cityEpoch` (avant la pose, ou build qui l'a perdu) utilise le jour courant comme départ et le pose. Un build
antérieur ignore et retire le champ au parsing s'il ne le connaît pas (acceptable : la rue repart de zéro).

La date de la ville est la date RÉELLE (jour civil local), même si l'heure de la Bibliothèque est forcée (jour/nuit/manuelle) :
l'heure forcée ne choisit que l'heure du jour.

## Où

- Seuls les immeubles du premier plan dont la partie visible fait **au moins 38 px** reçoivent un local (≈ 60 % des
  immeubles ; choix de l'utilisateur : on n'élargit pas les immeubles).
- Dans un immeuble à local, l'entrée des habitants est poussée **au bord** (gauche ou droite, tiré) avec sa marge ;
  le local occupe le reste du rez-de-chaussée : enseigne au-dessus, vitrine, porte vitrée du magasin.
- `doorsFor` reste la source des entrées d'habitants ; un nouveau `shopSlotsFor(width, height, seed)` donne les locaux et
  la position de l'entrée recalée. Les tirages existants de `doorsFor` ne changent pas pour les immeubles sans local.
- Les locaux sont identifiés par un index stable (`shop-<n>` dans l'ordre des immeubles).

## Cycle de vie (par local)

Suite de périodes à partir de `cityEpoch` (jour 0), tirées par un générateur propre au local :

1. **Départ** : tous les locaux sont OUVERTS. La première période d'ouverture a une durée tirée (3 à 12 semaines) et le jour
   0 tombe au hasard à l'intérieur (on part d'un « âge » tiré), pour que les premiers changements soient étalés.
2. **Ouvert** : 3 à 12 semaines (durée en jours entiers).
3. Fin d'ouverture : **reloué tout de suite** (1 fois sur 2) ou **À vendre** 1 à 3 semaines, puis reloué.
4. **Jour de changement** : le premier jour de la période suivante ; jamais un dimanche ni un jour férié (repoussé au
   jour ouvré suivant, ce qui allonge la période précédente). Ce jour-là, le local est fermé jusqu'à la fin du chantier.
5. **Nouveau commerce** : type tiré parmi les 32, jamais le même que le précédent ni que celui d'un autre local actuellement
   visible dans la pièce (si plus de choix : la contrainte « autres locaux » est levée) ; nom tiré (voir Noms).

Le calcul est borné : on itère les périodes depuis le jour 0 (≈ 7 par an et par local). Fonction pure
`shopStateAt(slot, epochDay, day, minutes, names)` → `{ phase: 'open' | 'closed' | 'for-sale' | 'works', shop, works? }`.

## Types (32) et horaires

| Type | Jours | Heures | Mobilier visible | Clients |
|---|---|---|---|---|
| Boulangerie | mar.-dim. | 7h-20h (dim. -13h) | vitrine à gâteaux, panières à baguettes | très nombreux matin et midi |
| Pâtisserie | mar.-dim. | 9h-19h | présentoir réfrigéré, gâteaux étagés | après-midi, week-end |
| Chocolatier | mar.-sam. | 10h-19h | étagères de boîtes, comptoir | peu nombreux |
| Boucherie | mar.-sam. | 8h-19h30 | vitrine réfrigérée, billot, crochets | matin |
| Poissonnerie | mar.-sam. | 8h-13h | étal de glace pilée | matin |
| Fromager | mar.-sam. | 9h-19h30 | meules, cloches | réguliers |
| Primeur | lun.-sam. | 8h-20h | cagettes colorées (store) | réguliers |
| Caviste | mar.-sam. | 10h-20h | casiers à bouteilles, tonneau | fin de journée |
| Épicerie | lun.-sam. | 8h-21h | rayonnages, caisse | réguliers |
| Supérette | tous les jours | 8h-23h | rayonnages, frigos lumineux | jour et soir |
| Pharmacie | lun.-sam. | 9h-19h30 | croix verte, comptoir, tiroirs | réguliers |
| Fleuriste | mar.-dim. | 9h-19h (dim. -13h) | seaux de fleurs, plantes (store) | réguliers |
| Librairie | mar.-sam. | 10h-19h | bibliothèques, table de nouveautés | après-midi |
| Disquaire | mar.-sam. | 11h-19h | bacs de vinyles, platine | peu nombreux |
| Magasin de jeux | mar.-sam. | 10h-19h | boîtes empilées, table de démo | après l'école, mercredi |
| Coiffeur | mar.-sam. | 9h-19h | fauteuils, miroirs, bacs | réguliers |
| Opticien | mar.-sam. | 10h-19h | présentoirs de lunettes | peu nombreux |
| Tatoueur | mar.-sam. | 11h-20h | fauteuil, flash au mur | rares |
| Friperie | mar.-sam. | 11h-19h | portants de vêtements | après-midi |
| Antiquaire | mer.-sam. | 14h-19h | meubles anciens, lustre | rares |
| Animalerie | mar.-sam. | 10h-19h | aquariums, cages | après-midi |
| Vélociste | mar.-sam. | 9h-19h | vélos suspendus, établi | réguliers |
| Laverie | tous les jours | 7h-22h | hublots de machines | toute la journée |
| Café | lun.-sam. | 7h-20h | comptoir, percolateur, tables (store) | matin et midi |
| Restaurant | mar.-sam. | 12h-14h30, 19h-23h | tables nappées, bougies le soir | midi et soir |
| Pizzeria | tous les jours | 11h30-14h, 18h-23h30 | four à bois, comptoir | midi et soir |
| Kebab | tous les jours | 11h30-14h, 18h-23h30 | broche, comptoir | midi et soir |
| Sushis | tous les jours | 11h30-14h, 18h-23h30 | tapis roulant, comptoir | midi et soir |
| Salon de thé | mer.-dim. | 14h-19h | tables rondes, présentoir de théières | après-midi |
| Salle d'arcade | tous les jours | 14h-1h | bornes lumineuses | soir |
| Bar | tous les jours | 17h-2h | comptoir, tireuses, tabourets | soir et nuit |
| Boîte de nuit | jeu.-sam. | 23h-5h | piste, boule à facettes, lumières | nuit |

(32 lignes : la restauration rapide compte 3 types de dessin distincts.) Une plage qui passe minuit appartient au jour où
elle commence (le bar du samedi ferme dimanche à 2 h). Jours fériés : fermés, sauf supérette, laverie, bar, boîte,
arcade, pizzeria, kebab, sushis. Le catalogue est une table de données (`SHOP_DEFS`) : id, libellé, jours, plages,
jours fériés ouverts ou non, palette (enseigne, intérieur), store oui/non, profil de clientèle (courbe par heure), étiquettes
OSM correspondantes, noms écrits.

## Noms

- **Relais** : nouvelle route `GET /shops?lat=…&lon=…` (position arrondie à 0,1°, comme `/department`). Le relais
  interroge Overpass (`around:25000`) sur les étiquettes du catalogue, ne garde que `name`, regroupe par type du catalogue
  (au plus 30 noms par type, dédoublonnés, longueur ≤ 24 caractères), répond `{ ok: true, names: { bar: [...], ... } }`.
  Délai d'attente 20 s, cache mémoire 30 jours par case (même schéma que `department.ts`), erreur → 502 et l'extension
  se rabat sur la liste écrite. Relais à redéployer.
- **Extension** : requête seulement si la pièce affiche la scène Ville et que la position est connue (même source que la
  zone scolaire : position accordée, jamais redemandée de force). Résultat gardé EN MÉMOIRE (comme le département) ;
  échec mémorisé 24 h (clé locale sans position). La position n'est jamais enregistrée.
- **Choix** : nom tiré parmi les noms locaux du type ; s'il n'y en a pas (ou pas de réponse), dans la **liste écrite**
  (10 à 15 noms par type, souvent à jeux de mots : « L'Hair du temps », « Au Pain Perdu », « Le Zinc »…). Jamais deux
  fois le même nom parmi les locaux de la pièce. Le choix dépend de la liste disponible : un nom peut différer d'un
  appareil à l'autre (limite assumée) ; type et dates sont identiques partout.

## Dessin (`shop-sprites.tsx`)

- **Devanture** : enseigne (bandeau aux couleurs du type, nom en petit texte SVG ajusté à la largeur, ≈ 4 px de haut :
  lisible seulement en grande fenêtre/plein écran, choix de l'utilisateur, pas de bulle), vitrine, porte vitrée ; store en
  toile pour café, fleuriste, primeur.
- **Intérieur fixe** vu par la vitrine (clip sur la vitrine) : mur + sol du type, mobilier adapté (tableau ci-dessus),
  vendeur à son poste pendant l'ouverture. Un `<g>` par type, dessiné une fois et réutilisé. La nuit, ouvert : intérieur
  et enseigne éclairés ; enseigne éteinte quand c'est fermé.
- **Fermé** : rideau métallique baissé (lamelles), enseigne éteinte.
- **À vendre** : enseigne déposée (bandeau nu + fixations), vitrine vide (intérieur nu), **écriteau type vente immobilière**
  collé dans la vitrine (carton blanc et orange, « À VENDRE »).
- Les ouvriers et clients réutilisent `PersonSprite` (bleu de travail = nouveau profil `worker`).

## Clients

Mécanisme des habitants (`doors.ts`) : un client arrive depuis le bord (ou une rue latérale), entre par la porte du
magasin, apparaît derrière la vitrine, debout devant le comptoir, 20 à 60 s, ressort et repart. Présence = profil de
clientèle du type × activité de la ville (`cityIntensity`) × ouvert ; densité plafonnée pour ne pas dépasser le nombre de
passants visibles de la 1a (au plus 2 clients dans un local, ≈ 4 en route par 720 px). Aucun geste (1b-iv-b).

## Équipe du matin (chantier)

Le jour de changement : début tiré entre 8 h 30 et 9 h 30, fin vers 12 h. Deux ouvriers (profil `worker`) arrivent à
pied avec une échelle (et la nouvelle enseigne si le local est repris, ou l'écriteau). Étapes minutées, pauses semées
entre elles : poser l'échelle ; monter ; dévisser l'ancienne enseigne (ou décoller l'écriteau si on sort d'« À vendre ») ;
descendre avec ; passer la nouvelle enseigne (ou coller l'écriteau dans la vitrine) ; la poser ; plier l'échelle ; repartir
avec l'ancienne enseigne hors du champ. Fonction pure `worksAt(works, minutes)` → étape + avancement. Pendant le chantier,
magasin fermé, sans client.

## Mouvement réduit

Devantures, intérieurs, enseignes, rideau, écriteau affichés selon l'état ; aucun client en route ; pendant un chantier,
l'équipe est figée sur l'échelle (étape « pose »).

## Architecture

- `src/core/library/city/shops/` (moteur pur, testé) : `catalog.ts` (`SHOP_DEFS`, 32 types, noms écrits), `slots.ts`
  (locaux + entrée recalée), `lifecycle.ts` (périodes, jour de changement, choix du type/nom), `hours.ts` (ouvert ou non
  à une date/minute, jours fériés), `works.ts` (étapes du chantier), `customers.ts` (trajets et présence des clients).
- `relay/src/shops.ts` (+ route dans `relay/src/index.ts`, tests).
- `src/content/use-shop-names.ts` (requête, mémoire, échec 24 h), `src/content/shop-sprites.tsx` (devantures,
  intérieurs, rideau, écriteau, échelle), `src/content/shops-layer.tsx` (couche dans la scène Ville, boucle d'animation
  partagée avec `city-life.tsx`), pose de `cityEpoch`.
- Coût : au plus ~10 locaux par 720 px ; intérieurs statiques ; seuls vendeur, clients et équipe bougent.

## Tests

Vitest (`--maxWorkers=4`) : invariants du cycle (tous ouverts au départ, changements étalés, jamais dimanche/férié,
type jamais répété à la suite ni en double visible, À vendre 1-3 semaines), horaires (minuit, fériés), noms (local puis
écrit, pas de doublon), chantier (étapes ordonnées, fin vers 12 h), relais (parsing Overpass, cache, erreurs), rendu jsdom
(rideau fermé, écriteau, mouvement réduit). Vérification à l'œil dans Chrome (extension rechargée).

## Fiche WikiHow

`bibliotheque-v23` (la v22 reste réservée à la vague 1c) : à quoi servent les commerces, d'où viennent les noms
(OpenStreetMap à 25 km autour de toi, sinon une liste écrite), comment vit un local (ouvert, À vendre, reloué, équipe du
matin), limites.

## Limites assumées

- ≈ 60 % des immeubles seulement ont un local (immeubles étroits non élargis).
- Enseignes peu lisibles en petite fenêtre.
- Nom pouvant varier d'un appareil à l'autre (position connue ou non).
- Pas de gestes à l'intérieur avant la 1b-iv-b.
- Cache du relais en mémoire d'isolat : « 30 jours » au mieux.
