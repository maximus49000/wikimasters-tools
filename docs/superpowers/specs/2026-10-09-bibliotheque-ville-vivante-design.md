# Bibliothèque, morceau 7 : la ville vivante (vague Ville)

Premier lot du morceau 7 de `2026-10-08-bibliotheque-design.md`. Il remplace les acteurs `walker` et `car` de la scène Ville par une **vie ambiante** (passants et circulation qui suivent l'heure, la météo et le jour), y ajoute les **événements** de la ville, puis fait **réagir les animaux** aux promeneurs de chien. Les autres scènes (campagne, montagne, mer, espace, Terre) viennent dans des lots ultérieurs avec la même mécanique.

## Découpage en trois vagues

Une seule spec, trois PR, chacune avec sa fiche WikiHow et sa pré-prod.

- **1a. Vie ambiante** : moteur d'intensités, profils de passants, vêtements variés, circulation, école, semaine et week-end.
- **1b. Événements de la ville** : moteur d'événements par créneaux et une quinzaine de sprites.
- **1c. Réaction des animaux** aux promeneurs de chien (chien qui aboie à la fenêtre, chat qui sursaute ou feule).

## Principes communs

- **Déterministe et sans état.** Tout se calcule à partir de la graine de la pièce et de l'horloge murale, comme la météo. Toutes les fenêtres montrent la même scène, un rechargement la retrouve, rien n'est enregistré. Un tirage ne dépend jamais de `Math.random`.
- **Moteur pur** dans `src/core/library/city/` (testable sans DOM), rendu SVG dans `src/content/`. Les passants et les véhicules vivent dans le groupe d'acteurs existant (`SceneActors`) : la même boucle d'animation les place, les copies `<use>` des fenêtres ne coûtent rien de plus.
- **Entrées du moteur** : minutes de la journée (heure du ciel), **calendrier** (voir plus bas : type de jour, vacances scolaires, fêtes), météo (pluie, orage, brume, neige, couverture), lumière du jour. Heure forcée (jour, nuit, manuelle) : la date reste celle de l'appareil.
- **Mouvement réduit** : plus de déplacement, rien ne traverse. Seuls les éléments statiques restent (enseigne, appartement allumé), aucune réaction d'animal.
- **Densité plafonnée** pour la performance mobile : nombre maximal d'acteurs urbains visibles par fenêtre de 12 colonnes, au plus 2 à 3 événements simultanés.

## Calendrier

Module pur `src/core/library/city/calendar.ts`, calculé sur la date locale de l'appareil, sans service externe. Il fournit à tous les moteurs un `DayContext` : `kind` (`school`, `weekend`, `holiday`, `public-holiday`), `festivity` éventuelle et `progress` dans la fête.

- **Jours fériés** (France) : dates fixes (1er janvier, 1er et 8 mai, 14 juillet, 15 août, 1er novembre, 11 novembre, 25 décembre) et dates mobiles déduites de Pâques par calcul (lundi de Pâques, Ascension, lundi de Pentecôte). Un jour férié se comporte comme un dimanche : peu de circulation, pas d'école, plus de marcheurs et d'enfants dehors, aucun costume.
- **Vacances scolaires** : table de données (Toussaint, Noël, hiver, printemps, été) pour le calendrier officiel français, dates à relever à la source officielle (education.gouv.fr) au moment de l'implémentation. Pendant les vacances : **plus aucun groupe d'école**, circulation un peu réduite et sans vraie pointe du matin, plus d'enfants dehors, moins de costumes. Au-delà de la dernière année de la table, le calendrier retombe sur « semaine normale » sans erreur, et une note à la fiche WikiHow le dit.
- **Zone scolaire** : l'hiver et le printemps sont décalés selon trois zones (A, B, C). Zone : à trancher (voir « Points ouverts »).
- **Fêtes et événements du calendrier** : liste de données (date ou plage, heures, poids, événement), jouée en plus des événements ordinaires :
  - **24 décembre** : le **père Noël** repasse **toutes les 15 minutes** dans le ciel, **à partir de la nuit tombée** (crépuscule du soir, d'après l'heure du ciel) **jusqu'à l'aube**. Un passage par quart d'heure d'horloge murale, tiré de la graine : même passage dans toutes les fenêtres et après un rechargement. Le décalage dans le quart d'heure, la hauteur et le sens varient d'un passage à l'autre.
    - **Passage simple** : le traîneau et ses rennes traversent le ciel (clochettes de lumière, traînée scintillante).
    - **Passage avec livraison** (environ un passage sur trois, au tirage) : le traîneau descend, **se pose sur le toit d'un immeuble** de la rangée proche (position et hauteur lues sur les immeubles de `citySkyline`, donc il se pose réellement sur un toit visible dans une fenêtre), le père Noël en descend avec sa hotte, disparaît dans la cheminée ou derrière le rebord quelques secondes, revient, remonte à bord et repart. Une fenêtre d'immeuble proche s'allume brièvement pendant la livraison.
    - Sans fenêtre dans la pièce, rien ne se voit ; ni passage ni animal n'ont de coût caché.
    - Le 24 de jour il n'y a rien, le 25 il reste les passages de l'aube. Un animal éveillé peut le regarder (réaction à un événement, hors périmètre ici).
  - Proposés, à valider : 31 décembre (feux d'artifice à minuit), 14 juillet (feux d'artifice en soirée), 1er janvier, Halloween (passants déguisés, enfants le soir du 31 octobre), Pâques (enfants en chasse aux œufs), 1er mai (passants avec du muguet).
  - Les fêtes ajoutent aussi des décors discrets : lumières de Noël aux fenêtres des immeubles de la mi-décembre au 6 janvier.
- La fiche WikiHow indique que le calendrier suit la date de l'appareil et que les fêtes ont lieu à leurs dates réelles.

## Vague 1a : vie ambiante

### Intensités

Deux courbes calculées à la minute, entre 0 et 1 : `pedestrians(t)` et `traffic(t)`. Elles se composent d'une base horaire, d'un facteur jour (semaine ou week-end) et d'un facteur météo. Chaque passant ou véhicule possède un seuil `u` tiré de sa graine et n'est visible que si `u` est inférieur à l'intensité (même principe que `activity.ts`) : l'apparition et la disparition se font en cascade, sans à-coup. Les courbes sont des tables de points interpolées, faciles à régler.

### Semaine (lundi à vendredi)

- **Pointes de circulation à 8 h et à 17 h**, environ une heure chacune, avec montée puis descente progressives (pas de créneau brutal). Le pic de circulation est à 8 h et à 17 h 30.
- **Beaucoup de travailleurs en costume** à pied pendant les pointes, au pas rapide.
- **Aller à l'école** de 7 h 50 à 8 h 30 : des groupes famille (un adulte et un ou deux enfants avec cartable) qui marchent ensemble, dans un sens. À 8 h 30 plus aucun groupe.
- **Sortie d'école** de 16 h 45 à 17 h 15 environ : les mêmes groupes, en sens inverse.
- Le reste de la journée est calme (promeneurs, peu d'enfants).
- **Le mercredi**, l'école ne dure que de 8 h 30 à 12 h : même aller le matin (7 h 50 à 8 h 30), **sortie vers 12 h** (environ 11 h 45 à 12 h 15, groupes famille dans l'autre sens), **pas de sortie de 16 h 45**. L'après-midi du mercredi ressemble à un week-end calme : plus d'enfants dehors, la pointe de 17 h reste mais plus légère. Les vacances et les jours fériés sont gérés par le calendrier (section suivante).

### Week-end (samedi, dimanche)

- Circulation de pointe très atténuée, étalée sur la journée (courses, sorties).
- **Plus de marcheurs et de promeneurs**, presque aucun costume.
- **Beaucoup plus d'enfants qui jouent dehors** : petits groupes qui courent, ballon, trottinette, vélo. Présents dans la journée, pas à la tombée de la nuit.
- Un peu plus de sportifs le matin.

### Règles valables tout le temps

- **Beau temps** : beaucoup de piétons, circulation modérée sauf en pointe.
- **Pluie** : circulation favorisée, piétons beaucoup moins nombreux ; ceux qui restent ont un parapluie (groupes d'école compris), enfants dehors bien plus rares. **Orage** : encore moins. **Neige et brume** : piétons réduits, vitesse des véhicules réduite.
- **Nuit** : presque personne ; le creux vers 4 h de `activity.ts` est conservé.
- **Sportifs** : peu nombreux en toute circonstance.

### Profils de passants

Chaque passant tire un profil, un gabarit, un sens, une vitesse et une tenue.

| Profil | Allure | Particularités |
| --- | --- | --- |
| Promeneur | lente | parfois avec un chien (voir 1c), parfois sac de courses |
| Travailleur en costume | rapide | mallette ou sac, costume ou tailleur, jamais le week-end sauf rare |
| Sportif | course | tenue de sport, rare, matin et fin d'après-midi |
| Passant ordinaire | moyenne | tenues du quotidien |
| Enfant | variable | cartable (jour d'école), ballon, trottinette ou vélo (week-end), saute et court |
| Famille (adulte et enfants) | pas de l'enfant | un seul groupe, mêmes trajet et vitesse, adulte à côté de l'enfant |

### Diversité des vêtements

Un sprite de passant est **assemblé par couches** (tête et cheveux, haut, bas, chaussures, accessoire) plutôt que dessiné en entier : la variété vient de la combinaison, pas de dizaines de sprites.

- **Hauts** : t-shirt, pull, veste, manteau, imperméable (pluie), chemise, veste de costume, maillot de sport.
- **Bas** : pantalon, jean, jupe, robe, short, pantalon de costume, jogging.
- **Coiffure** : cheveux courts, longs, queue-de-cheval, chignon, bonnet, casquette, chauve ; carnation et couleur de cheveux variées.
- **Accessoires** : sac à dos, sac à main, mallette, cartable, parapluie, écharpe, lunettes.
- **Couleurs** : palette large pour chaque pièce (une dizaine de teintes par vêtement), tirée de la graine. Le profil limite les combinaisons : costume sombre ou gris pour le travailleur, couleurs vives pour le sportif et l'enfant. Deux passants voisins ne partagent presque jamais la même tenue.
- **Saison et température** : pas de saison dans l'extension, donc pas de contrainte ; seule la pluie impose imperméable et parapluie, et la neige des manteaux et bonnets.
- La nuit, les teintes suivent la lumière de la scène comme le reste du décor.

### Circulation

Voitures (plusieurs couleurs et gabarits), bus et utilitaires, vélos. La pluie augmente la part de voitures par rapport aux piétons et aux vélos. En pointe, plus de véhicules et un défilé plus dense ; la nuit, des véhicules isolés. Phares allumés la nuit, par temps sombre ou sous la pluie.

### Interface

Aucun réglage nouveau. La vie ambiante est le fonctionnement normal de la scène Ville. Les anciens acteurs `walker` et `car` disparaissent, et les lampes d'immeuble gardent `activity.ts`.

## Vague 1b : événements de la ville

### Mécanique

Le temps est découpé en **créneaux** d'environ 25 s. Pour un créneau donné, un tirage seedé (graine de la pièce et numéro du créneau) décide s'il y a un événement, lequel (pondéré parmi ceux possibles à cet instant), de quel côté il entre, à quelle hauteur et à quelle vitesse. Un événement long chevauche plusieurs créneaux : le moteur regarde aussi les créneaux précédents pour savoir ce qui est encore en vol.

Description d'un événement (donnée, pas code) : `id`, scène, poids, durée ou vitesse, type de trajet (traversée, point fixe, clignotement, boucle), plage d'heures, météo exigée ou interdite, niveau d'activité minimal, jour de la semaine éventuel. `eventsAt(scene, seed, t, context)` renvoie les instances actives avec leur progression de 0 à 1.

### Liste de la ville (17)

- **Ciel** : avion, hélicoptère, drone, ballon, cerf-volant (jour sans pluie), avion à banderole (jour sans pluie).
- **Rue** : bus, tram, ambulance (gyrophare, vitesse élevée), camion-poubelle (matin), livreur à vélo, promeneur de chien, grue (bras qui tourne, journée de semaine).
- **Pluie** : passants sous parapluie (déjà couverts par la vie ambiante ; ici des groupes pressés).
- **Fixes et nuit** : enseigne néon (soir et nuit), appartement qui s'allume (soir), feu d'artifice (nuit, sans pluie, rare).

Le promeneur de chien est un événement particulier : c'est lui qui déclenche la réaction de la vague 1c, et il est aussi tiré dans la vie ambiante.

## Vague 1c : réaction des animaux

S'appuie sur `pets/context.ts`, `brain.ts` et le moteur de scènes à deux.

- **Déclencheur** : un promeneur de chien passe dans l'axe d'une fenêtre de la pièce, avec un tirage par passage. Sans fenêtre dans la pièce ou en mouvement réduit, aucune réaction.
- **Chien éveillé** (tout sauf `sleep`) : il interrompt net ce qu'il faisait, court jusqu'à la fenêtre et aboie pendant quelques secondes, puis reprend le cours normal. Un chien qui dort ne voit et n'entend rien : aucune réaction.
- **Chat éveillé** près du chien qui aboie : sursaut, puis parfois (environ une fois sur trois) feulement en direction du chien ; il peut aussi s'enfuir sous le canapé selon sa position. Un chat qui dort ne réagit pas.
- **Robot** : aucune réaction pour l'instant.
- Le plan de l'animal est écrit comme les autres plans (action, trajet, horodatages absolus), la reprise après rechargement fonctionne donc sans cas particulier.

## Tests

- **Moteur (1a)** : déterminisme (même minute et même graine donnent le même résultat), courbes des pointes semaine et week-end, école (présence de 7 h 50 à 8 h 30 et de 16 h 45 à 17 h 15 du lundi au vendredi sauf le mercredi, où la sortie a lieu vers 12 h et rien à 16 h 45 ; absence le week-end, les vacances et les jours fériés), pluie (moins de piétons, parapluies), nuit, plafonds de densité, diversité (deux tirages voisins diffèrent de tenue), cohérence des profils (costume le week-end rare, cartable seulement un jour d'école).
- **Calendrier** : Pâques et fériés mobiles sur plusieurs années, bornes des vacances, repli hors table, le 24 décembre donne un passage par quart d'heure à la nuit tombée, aucun de jour ni en été, la livraison se pose sur un toit existant.
- **Événements (1b)** : conditions (aucun feu d'artifice de jour, aucun cerf-volant sous la pluie), plafond d'événements simultanés, progression continue au chevauchement de créneaux.
- **Animaux (1c)** : pas de réaction si le chien dort ou sans fenêtre, plan écrit une seule fois par passage, reprise après rechargement.
- **Rendu (jsdom)** : un groupe d'acteurs urbains par fenêtre, aucune erreur en mouvement réduit.

## Points ouverts

- **Zone scolaire** : réglage local (A, B, C) dans le panneau Ciel, ou valeur unique par défaut ? Les vacances de Toussaint, Noël et d'été sont les mêmes pour toutes les zones ; seuls l'hiver et le printemps diffèrent.
- **Fêtes à retenir** en plus du père Noël (liste proposée ci-dessus).
- **Vague du calendrier** : en 1a (jours et vacances) ; le père Noël et les fêtes arrivent en 1b avec le moteur d'événements.

## Livraison

Pour chaque vague : PR fusionnée, fiche WikiHow (`bibliotheque-v19` pour 1a, `v20` pour 1b, `v21` pour 1c, étapes : texte, comment, astuce), pré-prod, puis vérification manuelle dans Chrome (rendu jamais vu hors jsdom) et APK à la demande.

## Limites assumées

- Calendrier français uniquement (jours fériés, vacances scolaires, fêtes) ; pas de calendrier dans les autres pays.
- Table des vacances limitée aux années relevées ; au-delà, repli sur une semaine normale.
- Pas de réaction du robot ni des animaux à d'autres événements que le promeneur de chien (par exemple l'ambulance), à envisager plus tard.
- Pas de son.
- Les autres scènes viennent dans des lots ultérieurs avec le même moteur d'événements.
