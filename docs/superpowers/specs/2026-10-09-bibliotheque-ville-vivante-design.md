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
- **Vacances scolaires, récupérées automatiquement** : l'extension ne porte plus de table à mettre à jour à la main. Le relais Cloudflare existant gagne une route `/school-calendar?zone=…` qui lit le calendrier officiel (jeu de données ouvert « calendrier scolaire » de data.education.gouv.fr, nom exact et format à vérifier à l'implémentation), le réduit à `{zone, année scolaire, périodes[{nom, début, fin}]}` et le met en cache côté relais (24 h). L'extension le garde en cache local (7 jours, une requête au plus par jour) et en tire les périodes de l'année scolaire en cours et de la suivante. **Repli** si le relais est injoignable ou que la réponse est invalide : dernier calendrier mis en cache, puis un petit relevé embarqué (une année scolaire, dates fixes de Toussaint, Noël, été) ; au pire, semaine normale. Aucune donnée personnelle ne part : seule la zone est envoyée.
  Effet pendant les vacances : **plus aucun groupe d'école**, circulation un peu réduite et sans vraie pointe du matin, plus d'enfants dehors, moins de costumes.
- **Zone scolaire** : les vacances **diffèrent selon la zone** (A, B, C en métropole, Corse et chaque territoire d'outre-mer ont leur propre calendrier). La zone est **déduite automatiquement de la position** quand le joueur a accordé la géolocalisation (la même que pour le soleil) : le relais convertit la position arrondie à 0,1° en département (service ouvert de l'État, sans clé), puis une petite table embarquée département → académie → zone donne la zone. La position n'est jamais enregistrée. Sans position, ou hors de France, on utilise le réglage manuel de la zone dans le panneau Ciel (choix « Automatique », A, B, C, Corse ou outre-mer), « Automatique » étant le réglage par défaut avec repli sur une zone par défaut (à choisir à l'implémentation).
- **Fêtes selon la région** : les jours fériés et les fêtes sont **calculés localement** (dates fixes et Pâques), sans récupération, car leurs règles ne changent pas. Ils suivent aussi la région quand elle compte : en Alsace-Moselle s'ajoutent le Vendredi saint et le 26 décembre (déduit du département), et les territoires d'outre-mer ont leurs fêtes locales, proposées plus tard si besoin.
- **Fêtes et événements du calendrier** : liste de données (date ou plage, heures, poids, événement), jouée en plus des événements ordinaires :
  - **24 décembre** : le **père Noël** repasse **toutes les 15 minutes** dans le ciel, **à partir de la nuit tombée** (crépuscule du soir, d'après l'heure du ciel) **jusqu'à l'aube**. Un passage par quart d'heure d'horloge murale, tiré de la graine : même passage dans toutes les fenêtres et après un rechargement. Le décalage dans le quart d'heure, la hauteur et le sens varient d'un passage à l'autre.
    - **Passage simple** : le traîneau et ses rennes traversent le ciel (clochettes de lumière, traînée scintillante).
    - **Passage avec livraison** (environ un passage sur trois, au tirage) : le traîneau descend, **se pose sur le toit d'un immeuble** de la rangée proche (position et hauteur lues sur les immeubles de `citySkyline`, donc il se pose réellement sur un toit visible dans une fenêtre), le père Noël en descend avec sa hotte, disparaît dans la cheminée ou derrière le rebord quelques secondes, revient, remonte à bord et repart. Une fenêtre d'immeuble proche s'allume brièvement pendant la livraison.
    - Sans fenêtre dans la pièce, rien ne se voit ; ni passage ni animal n'ont de coût caché.
    - Le 24 de jour il n'y a rien, le 25 il reste les passages de l'aube. Un animal éveillé peut le regarder (réaction à un événement, hors périmètre ici).
  - **Autres fêtes retenues**, toutes en données (date ou règle, heures, poids) :

| Fête | Date | Ce qu'on voit |
| --- | --- | --- |
| Nouvel An | 31 décembre soir, 1er janvier | feux d'artifice à minuit, passants qui fêtent la nuit, rue calme le 1er |
| Épiphanie | premier dimanche de janvier | couronnes dorées sur quelques enfants (discret) |
| Saint-Valentin | 14 février | couples qui se promènent, ballons en cœur dans le ciel |
| Pâques | dimanche de Pâques (calculé) | enfants en chasse aux œufs, cloches discrètes, ballons-lapins |
| 1er mai | 1er mai | passants avec du muguet, peu de costumes, circulation de férié |
| Fête de la musique | 21 juin soir | musiciens et petits groupes dans la rue, lumières colorées, foule le soir |
| Fête nationale | 14 juillet | défilé de véhicules le matin, feux d'artifice en soirée, foule à pied |
| Halloween | 31 octobre (décor du 24 octobre à environ une semaine après) | **la nuit d'Halloween (du coucher du soleil à environ 23 h), beaucoup plus de passants à pied avec des déguisements sur les trottoirs** (voir plus bas), décor monté puis retiré par les habitants |
| Armistice | 11 novembre | drapeaux, peu de circulation (férié) |
| Noël | du 1er décembre au 6 janvier | guirlandes et lumières de Noël aux fenêtres des immeubles ; 24 au soir : le père Noël (ci-dessus) ; 25 : rue très calme |

  - Une fête peut cumuler avec la météo et le calendrier (pas de feu d'artifice sous la pluie : il est simplement absent, sans report), et ne remplace jamais les règles de la vie ambiante : elle les module (poids des enfants, des couples, des costumes) et ajoute ses événements au moteur de la vague 1b.
  - **Décors de longue durée** (les lumières de Noël du 1er décembre au 6 janvier, le décor d'Halloween, et de même toute fête qui s'étale sur plusieurs jours) suivent un cycle calculé depuis la date et l'heure, sans état, avec **montage, présence puis démontage**. Chaque décor est une donnée : période, éléments (guirlandes, citrouilles, toiles, drapeaux), emplacements sur les immeubles, durées de montage et de démontage.
    - **Premier jour, montage** : dans la journée (de 9 h à 17 h environ), des installateurs posent les éléments en hauteur **avec des échelles, sans nacelle**. Les gestes sont cohérents : personne ne vole ni ne flotte. Pour chaque élément en hauteur, un installateur **arrive à pied en portant une échelle**, la **dresse contre la façade**, **monte**, pose l'élément, **redescend**, **reprend l'échelle** et la porte jusqu'à l'élément suivant. Les éléments à hauteur d'homme (porte, lampadaire bas) se posent sans échelle. En fin de journée (17 h), les échelles sont **portées jusqu'à une camionnette garée au bord de la rue et rangées**, puis l'équipe repart. Tout le monde voit la même progression, un rechargement la retrouve : la position de l'équipe est une fonction de l'heure.
    - **Pendant la période, en place** : les lumières de fête sont **éteintes le jour** et **allumées la nuit**, avec un allumage progressif au crépuscule et une extinction à l'aube, selon la lumière du jour de la scène. Elles se trouvent aux **fenêtres, aux portes, sur les façades et aux lampadaires**, jamais dans la rue : **pas de sapin dehors**. Les lumières décoratives d'une fenêtre sont **indépendantes de la lumière de la pièce** : un sapin ou une citrouille reste allumé alors que la pièce est éteinte.
    - **Dernier jour, démontage** : la séquence inverse, de 9 h à 17 h, avec les mêmes règles : l'équipe sort ses échelles de la camionnette, les porte, les dresse, monte, **décroche l'élément**, redescend et le range dans un sac ou un carton, puis va à l'élément suivant. En fin de journée, échelles et sacs sont rangés dans la camionnette. La nuit du dernier jour, ce qui reste n'est plus allumé.
    - **Noël** : du 1er décembre au 6 janvier ; montage le 1er, démontage le 6.
    - **Halloween** : le décor se **monte une semaine avant** (à partir du 24 octobre), de façon étalée : citrouilles, toiles d'araignée, guirlandes orange et chauves-souris apparaissent façade par façade au fil de la semaine, **posés par des habitants** : depuis la fenêtre, le balcon ou le pas de la porte pour ce qui est à portée de main, **avec une petite échelle portée par l'habitant** pour ce qui est en hauteur (même cycle : il la porte, la dresse, monte, pose, descend, la range chez lui). Après le 31 octobre, le décor est **retiré petit à petit, naturellement** : les habitants le retirent eux-mêmes les jours suivants (environ une semaine), chaque façade à son propre rythme, avec les mêmes gestes (échelle pour ce qui est en hauteur), sans jour unique de démontage. Les citrouilles et guirlandes d'Halloween brillent un peu la nuit.
    - Le moteur dérive l'état de chaque élément d'un seuil `u` tiré de sa graine (comme `lampLit`) : un élément est posé si `u` est inférieur à l'avancement du montage, et retiré si `u` est inférieur à l'avancement du démontage. La cascade est donc naturelle et sans état, et le décor apparaît en désordre plutôt qu'en bloc.
    - **Plusieurs styles de décoration par fête**, tirés par façade, fenêtre, porte ou lampadaire (un catalogue de sprites en données, extensible) :
      - **Noël** : **sapin dans une fenêtre** (chez certains habitants seulement, environ une fenêtre sur sept, jamais toutes ; allumé la nuit, y compris pièce éteinte), **branche ou couronne de houx sur la porte d'entrée**, guirlande lumineuse sur la façade, étoile ou bonhomme lumineux à la fenêtre, rideau de lumières, rennes lumineux sur un toit, père Noël qui grimpe à un balcon, **décors de lampadaire** (couronne, nœud rouge, guirlande en arc, ampoules colorées allumées avec le lampadaire).
      - **Halloween** : **citrouille dans une fenêtre** (chez certains habitants seulement, environ une fenêtre sur huit, jamais toutes ; allumée la nuit pièce éteinte, et **elle reste allumée plus tard que les pièces**), toile d'araignée ou fantôme sur la porte, sorcière (silhouette sur un balcon, balai posé contre un mur), araignée géante, chauves-souris, squelette assis, chaudron, corbeau perché, guirlande orange et violette, **décors de lampadaire** (lanterne citrouille, guirlande de chauves-souris).
      - Chaque façade reçoit un petit assortiment cohérent (un style dominant et un ou deux accents) plutôt qu'un mélange au hasard, pour que la rue reste lisible.
    - **Placement stable pendant la période, différent d'une année à l'autre** : les choix (quel style, quel emplacement, quelles couleurs) sont tirés d'une graine formée de la graine de la pièce, de l'identifiant de la fête et de l'**année de l'édition** (l'année où la période commence : l'édition de Noël commence en décembre et se termine début janvier de l'année suivante, donc le 3 janvier 2027 appartient à l'édition 2026). Pendant toute la période, y compris montage et démontage, rien ne se déplace ni ne change de style : seuls l'avancement du montage et du démontage (seuils `u`) et l'allumage varient. D'une année à l'autre, la rue est décorée autrement.
    - Sous la pluie, les installateurs de Noël ne sont pas visibles (ils attendent dans la camionnette) ; l'avancement reste calculé à l'heure pour rester déterministe.
    - **Les sapins ne se ressemblent pas** : chaque sapin de fenêtre tire sa forme (haut et élancé, large et touffu, petit sur le rebord), sa teinte de vert (ou blanc floqué, ou argenté), son sommet (étoile, boule, pointe) et sa décoration (boules de couleurs variées, guirlande en spirale, rubans, ou sapin nu). Le sprite est assemblé par couches comme les passants, jamais copié à l'identique d'une fenêtre à l'autre.
    - **Les guirlandes lumineuses ont des couleurs variées**, tirées par guirlande : multicolore, blanc chaud, blanc froid, rouge, bleu, vert, or, ou alternance de deux couleurs. Une guirlande a un mode d'allumage fixe (fixe, scintillement lent, chenillard doux) tiré de la graine, sans animation lourde (un seul `<animate>` d'opacité par guirlande, coupé en mouvement réduit).
  - Tout est dans une table de données : ajouter ou retirer une fête ne demande pas de code.
  - Les décors de fête (guirlandes, citrouilles, drapeaux) sont de petits sprites ajoutés au décor fixe, sans surcoût d'animation.

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

**Deux files, on roule à droite** : face aux immeubles, la file du **premier plan roule vers la droite** de l'écran et celle du **fond roule vers la gauche** (la file du fond est dessinée un peu plus petite, pour la profondeur). Chaque véhicule appartient à une file et garde son sens ; les croisements sont donc naturels. Voitures (plusieurs couleurs et gabarits), bus et utilitaires, vélos sur la file du premier plan. La pluie augmente la part de voitures par rapport aux piétons et aux vélos. En pointe, plus de véhicules et un défilé plus dense sur les deux files ; la nuit, des véhicules isolés. Phares allumés la nuit, par temps sombre ou sous la pluie.

### Lampadaires

Des lampadaires bordent le trottoir (espacés régulièrement, positions tirées de la graine). Ils **s'allument au crépuscule** (selon la lumière du jour de la scène) et **s'éteignent vers minuit** (chacun entre 23 h 45 et 0 h 15, tiré de la graine, pour une extinction en cascade). Ils restent éteints jusqu'à l'aube, puis le jour de la scène reprend. Chaque lampadaire projette un cône de lumière et un halo, et porte les décors de fête de la période (voir plus bas). Les décors lumineux d'un lampadaire s'éteignent avec lui.

### Entrées d'immeuble et habitants

Chaque immeuble de la rangée proche a une **entrée d'immeuble** visible au pied de la façade, pas une porte de maison : double porte vitrée ou porte cochère sous un auvent ou un linteau, plaque de numéro, interphone, petit hall qui s'éclaire la nuit (variantes tirées de la graine, positions lues sur `citySkyline`). **Les habitants entrent et sortent** par ces entrées : un passant naît ou disparaît à l'encadrement au lieu d'apparaître au bord de la fenêtre ; le sens et le moment suivent la vie ambiante (matin : on sort pour le travail et l'école, soir : on rentre ; week-end : sorties de famille). L'entrée et la sortie sont un fondu court avec le hall qui s'éclaire. Les entrées portent le **décor de la fête en cours** (branche ou couronne de houx à Noël, toile d'araignée ou fantôme à Halloween), pour une partie seulement d'entre elles.

### Déguisements d'Halloween

La nuit du 31 octobre (du coucher du soleil à environ 23 h), le moteur de vie ambiante augmente le nombre de piétons, surtout des enfants accompagnés et des groupes de jeunes, et **une grande partie des passants est déguisée**. Costumes (couche « déguisement » du sprite de passant, ajoutée par-dessus la tenue) : sorcière, fantôme, squelette, vampire, momie, zombie, diable, citrouille, chat noir, super-héros. Les enfants portent un seau ou un sac à bonbons et vont d'une entrée d'immeuble à l'autre. Avant et après cette nuit, quelques déguisements isolés seulement (veille et lendemain). Les voitures restent à peu près identiques, avec quelques phares de plus.

### Interface

Aucun réglage nouveau hormis la zone scolaire. La vie ambiante est le fonctionnement normal de la scène Ville. Les anciens acteurs `walker` et `car` disparaissent, et les lampes d'immeuble gardent `activity.ts`. Une maquette interactive de référence (passants, deux files, lampadaires, portes, décors) a été validée avec l'utilisateur dans la conversation du 2026-10-09.

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
- **Calendrier** : édition de la fête (Noël à cheval sur deux années) et placement identique pendant toute la période mais différent d'une année à l'autre, styles variés par façade, Pâques et fériés mobiles sur plusieurs années, lecture du format officiel (fixture), cache de 7 jours, repli en cascade, zone déduite d'un département, bornes des vacances, cycles de décor (Noël : montage, en place, démontage, lumières éteintes le jour et allumées la nuit ; Halloween : montage sur une semaine puis retrait étalé, éléments posés selon leur seuil), le 24 décembre donne un passage par quart d'heure à la nuit tombée, aucun de jour ni en été, la livraison se pose sur un toit existant.
- **Échelles et décors (1a/1b)** : l'équipe de montage porte, dresse, monte, descend et range ses échelles dans la camionnette en fin de journée, personne ne flotte, pas d'échelle pour ce qui est à hauteur d'homme, sapins tous différents (forme, teinte, sommet, décoration), couleurs de guirlande variées, entrées d'immeuble, déguisements nombreux la nuit d'Halloween et rares ailleurs.
- **Circulation et lampadaires (1a)** : sens des deux files (premier plan vers la droite, fond vers la gauche), lampadaires allumés au crépuscule et éteints entre 23 h 45 et 0 h 15, portes (un passant naît ou disparaît à une porte), décors de fête de fenêtre indépendants de la lumière de la pièce, citrouilles allumées plus tard que les pièces, jamais de sapin hors des fenêtres.
- **Événements (1b)** : conditions (aucun feu d'artifice de jour, aucun cerf-volant sous la pluie), plafond d'événements simultanés, progression continue au chevauchement de créneaux.
- **Animaux (1c)** : pas de réaction si le chien dort ou sans fenêtre, plan écrit une seule fois par passage, reprise après rechargement.
- **Rendu (jsdom)** : un groupe d'acteurs urbains par fenêtre, aucune erreur en mouvement réduit.

## Points ouverts

- **Source des vacances** : nom exact du jeu de données et format à confirmer à l'implémentation ; si la source change ou disparaît, seul le relais est à adapter.
- **Zone par défaut** quand la position est refusée et qu'aucun réglage n'existe : à choisir à l'implémentation.
- **Relais** : la route `/school-calendar` est à déployer (comme `/weather`) ; cela demande une action de ta part (déploiement Cloudflare), à planifier dans la vague 1a.
- **Vague du calendrier** : jours, vacances et zone en 1a ; le père Noël, les fêtes et les décors de longue durée arrivent en 1b avec le moteur d'événements.

## Livraison

Pour chaque vague : PR fusionnée, fiche WikiHow (`bibliotheque-v19` pour 1a, `v20` pour 1b, `v21` pour 1c, étapes : texte, comment, astuce), pré-prod, puis vérification manuelle dans Chrome (rendu jamais vu hors jsdom) et APK à la demande.

## Limites assumées

- Calendrier français uniquement (jours fériés, vacances scolaires, fêtes) ; pas de calendrier dans les autres pays.
- Vacances : si le relais et le cache sont indisponibles, repli sur le relevé embarqué puis semaine normale.
- Pas de réaction du robot ni des animaux à d'autres événements que le promeneur de chien (par exemple l'ambulance), à envisager plus tard.
- Pas de son.
- Les autres scènes viennent dans des lots ultérieurs avec le même moteur d'événements.
