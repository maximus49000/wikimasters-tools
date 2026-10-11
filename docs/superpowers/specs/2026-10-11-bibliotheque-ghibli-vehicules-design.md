# Bibliothèque Ghibli : véhicules et circulation

Suite de la refonte Ghibli (spec générale `2026-10-10-bibliotheque-ghibli-design.md` ; G1 décor, G2 ciel, G3 humains fusionnés). Le découpage prévoyait les véhicules en G5 ; l'utilisateur les a avancés le 2026-10-11 (« les véhicules ne sont pas naturels du tout ») et a fixé, maquette à l'appui, les exigences ci-dessous.

## Décisions validées (2026-10-11)

Maquette de référence : `.superpowers/brainstorm/vehicules-ghibli/maquette.html` (planche `planche.png`, circulation `circulation.png`).

- **Style** : même grammaire que les pantins. Trait d'encre brun (`#33241f`), chaque pièce en ombre teintée de violet et partie éclairée décalée vers la lumière (en haut à gauche), liseré clair, reflets francs du ciel sur les vitres, chromes, ombre douce au sol. La nuit, les vitres sont chaudes et les phares diffusent un halo.
- **Diversité** : sur dix voitures à l'écran, aucune silhouette ni couleur ne se répète. Les voitures sortent d'un **générateur** (12 types de carrosserie × proportions continues × peinture × détails), la suite étant partagée par toutes les voies d'une scène. **Époque** : surtout des années 50 à 70, façon Kiki, avec des modèles plus récents adoucis (recommandation acceptée).
- **Véhicules vivants** :
  - les **roues tournent** avec la distance réellement parcourue ;
  - le **pot d'échappement fume** (bouffées laissées dans l'air, denses à l'accélération, lentes au ralenti) ;
  - un **conducteur est au volant**, et il y a des passagers ;
  - la caisse plonge du nez au freinage et s'assied à l'accélération ; les **feux stop** s'allument.
- **Occupants en mouvement logique** : inertie du buste (en avant au freinage, en arrière à l'accélération), tête qui suit les pavés, regards à l'arrêt (rétroviseur, se retourner), volant qui corrige, passagers qui parlent.
- **Plus de boucle** : les véhicules entrent par un bord du monde et sortent par l'autre.
- **Conduite humaine, pas une file de robots** :
  - chacun a son caractère : temps de réaction de 0,3 à 1,6 s, freinage anticipé très tôt ou tardif, accélération longue ou vive, vitesse voulue, distance de sécurité ;
  - il roule décalé dans sa voie et ondule ;
  - au feu et en bouchon, il ralentit, s'arrête et repart naturellement.
- **Bus** : passagers à l'arrière. Girouette avec le **numéro de ligne et la destination réels** du lieu géolocalisé (OpenStreetMap), sinon des lignes et terminus inventés mais plausibles. **Car scolaire avec des enfants** aux heures d'école.
- **Catalogue large** pour varier la route : voitures générées, plus des véhicules à part (bus, car scolaire, utilitaires, deux-roues, services).
- **Pas de mesures sur le téléphone** à chaque PR : une campagne de mesures à la fin de la migration Ghibli complète (consigne du 2026-10-11). Pas de fiche WikiHow par PR : une fiche globale à la fin de G7.

## Contraintes techniques constatées

- Aujourd'hui, `vehiclesFor` (`city/vehicles.ts`) place chaque véhicule sur une boucle du monde à vitesse constante par voie : la position ne dépend que du temps. Les événements de rue (`events.ts` : bus, tram, ambulance, benne, vélo livreur) sont des sprites à part, qui effacent par fondu les voitures qu'ils chevauchent (`yieldsFor`) ou les rangent (`pullOver`).
- La couche des acteurs est recopiée dans les fenêtres. Depuis la vague perf, le décor est dessiné une fois, mais les acteurs restent dans `<defs>`. Il ne faut donc ni id fixe, ni `clipPath` ou filtre à id, et le rognage se fait par `<svg>` imbriqué.
- Les humains Ghibli sont des sprites PNG peints sur canvas (`figure-host.tsx`, data URL : la CSP refuse `blob:`), dont la boucle change le `href`.
- Mouvement réduit : rien ne bouge.

## 1. Moteur de circulation (`src/core/library/city/traffic/`, pur, testé)

- **Agents** : chaque véhicule a une voie (`near` vers la droite, `far` vers la gauche, plus la piste cyclable au bord de `near`), une position `x`, une vitesse `v`, une commande d'accélération lissée, une distance parcourue, un décalage dans la voie et un caractère.
- **Caractère** (`temperament`, tiré par la graine du véhicule) : réaction 0,3 à 1,6 s, vitesse voulue × 0,82 à 1,15 avec un léger flottement, accélération 1,6 à 9 (douce, normale, vive), freinage confortable 2,5 à 11 (un tiers des conducteurs anticipent très tôt), temps de sécurité 0,6 à 1,9 s, marge à l'arrêt 2,5 à 7, place dans la voie ± 1,6 avec une ondulation lente.
- **Loi de poursuite** : IDM (Intelligent Driver Model), calculé sur ce que le conducteur **perçoit** :
  - l'état du véhicule de devant et celui du feu, tels qu'ils étaient il y a `réaction` secondes ;
  - jamais plus loin que la position réelle, pour qu'aucun choc ne naisse du retard ;
  - pied progressif : la commande rejoint la cible en environ 0,3 s ;
  - freinage franc en dernier recours, si l'écart passe sous 1,5 unité.
- **Entrées et sorties** :
  - la demande d'entrée suit l'intensité `traffic`, par voie, avec des arrivées en grappes (sortie d'un feu hors champ, heures de pointe) ;
  - un véhicule entre par le bord quand il y a la place, sinon il attend hors champ ;
  - il sort par l'autre bord ;
  - route fermée (14 juillet, Fête de la musique) : plus aucune entrée, les véhicules présents finissent leur traversée.
- **Pas de fixe** de 0,1 s, intégré entre deux images (interpolation pour l'affichage). Un seul moteur par pièce, partagé par les fenêtres.
- **Démarrage à chaud** : à l'ouverture de la scène, le moteur est simulé 120 s en avance, d'un coup : la rue est déjà peuplée et en mouvement naturel. Le résultat dépend de la graine et de l'heure de départ (minute de la scène) : deux ouvertures à la même minute donnent la même rue.
- **Obstacles et règles** :
  - **feux tricolores** : un carrefour hors champ à chaque bord, et un feu dans le monde si sa largeur dépasse 1 500 px ; cycle 30 à 45 s, orange 3 s ;
  - **arrêt de bus** : le bus marque l'arrêt, les voitures attendent derrière (une voie par sens, pas de dépassement) ;
  - **livraisons** : une camionnette s'arrête devant un commerce le temps d'un déchargement ;
  - **benne à ordures** : arrêts successifs ;
  - **ambulance** : plus rapide, sirène ; les véhicules de sa voie se rangent sur le bas-côté et repartent ensuite, ce qui remplace `pullOver`.
- **Passage piéton à feu à bouton-poussoir** (demandes du 2026-10-11, à la place des feux à cycle fixe) :
  - un passage entre deux feux, dans toutes les pièces, vers le milieu de la rue ;
  - le feu reste vert pour les voitures tant que personne n'attend ;
  - un piéton qui arrive au bord appuie sur le bouton : orange au bout de 3 s, mais jamais avant **25 s de vert**, sinon le feu serait toujours rouge aux heures de pointe ; puis 13 s de rouge ;
  - après 1 s de rouge pour tous, chacun traverse après son temps de réaction ; celui qui n'a plus le temps rappuie et attend le cycle suivant ;
  - les piétons arrivent d'un bord par un trottoir et repartent par l'autre ; leur nombre suit l'affluence des passants, et il n'y en a aucun quand la route est fermée ;
  - un voyant « appel enregistré » s'allume sur le boîtier.
- **Événements de rue → agents** : bus, tram, ambulance, benne et vélo livreur deviennent des agents du moteur. `events.ts` garde leur calendrier (heure de départ) ; le moteur les fait entrer par le bord à cette heure. Fin de `yieldsFor` et des fondus de voitures.
- **Mouvement réduit** : instantané du démarrage à chaud, immobile.

## 2. Générateur de voitures (`src/core/library/city/traffic/cars.ts`, pur, testé)

- **12 types de carrosserie** : citadine, compacte, berline, break, coupé, cabriolet, monospace, 4x4, pick-up, limousine, voiture « bulle », sportive. Chacun donne des plages de longueur, hauteur, ceinture de caisse, capot, coffre, pentes du pare-brise et de la lunette, arrondi, rayon des roues, garde au sol, nombre de vitres et forme de l'arrière (trois volumes, hayon, break, fastback, plateau, décapoté).
- **Peinture** : teinte imposée par la suite (nombre d'or), saturation et clarté tirées (pastel, profond, crème, presque noir), toit bicolore (30 %), bande de couleur sur le flanc (25 %).
- **Détails** : 5 jantes, pare-chocs chromés ou couleur caisse, phares ronds ou carrés, galerie avec bagage, roue de secours, toit ouvrant, antenne, jupes d'aile.
- **Occupants** : tenues tirées comme les passants. Il y a toujours un conducteur, et parfois un passager, un enfant à l'arrière, une casquette.
- **Suite** (`carStream`) : sur une fenêtre de 10, aucun type répété (12 types, dont deux réservés pour éviter la monotonie), des teintes éloignées. La suite est partagée par toutes les voies de la pièce.
- **Vitesse et caractère** : vitesse du modèle selon le type (sportive plus rapide, 4x4 et pick-up plus lents en ville).

## 3. Rendu Ghibli des véhicules (`src/content/vehicle/`)

- **Sprites peints** : chaque véhicule est cuit **une fois** en couches PNG, sur canvas, comme les pantins. Le cache est plafonné, avec un budget de rendus par image.
  1. **Caisse** : carrosserie, détails, ombre au sol, sans les roues ni les vitres.
  2. **Vitrage** : vitres semi-transparentes avec reflets, version jour et version nuit.
  3. **Roue** : une image par style de jante et taille, tournée par `rotate` selon la distance.
- **Assemblage par véhicule** : un `<g>` porte, dans l'ordre :
  1. l'image de la caisse ;
  2. un `<svg>` imbriqué rogné au vitrage, avec l'habitacle sombre et les occupants (bustes du pantin, sprites existants : allure assise, bras au volant) ;
  3. l'image du vitrage ;
  4. les roues ;
  5. les feux stop et les phares (formes simples allumées à la demande).

  La boucle n'écrit que des `transform` (position, tangage, rotation des roues, inertie des bustes) et l'état des feux.
- **Occupants** : pose choisie par la boucle selon l'inertie et un petit horaire de regards, pas plus de 4 images par seconde pour les regards.
- **Fumée** : une couche « échappement » au niveau du monde, par pièce, avec des bouffées en pool fixe (cercles réutilisés, pas de création à chaque image), émises au pot selon l'accélération.
- **Classique** : sprites actuels, mais posés par le moteur (plus de boucle, mêmes freinages) ; les roues classiques ne tournent pas.

## 4. Véhicules à part (Ghibli)

- **Bus urbain** : bicolore à la couleur de la ligne, passagers derrière chaque vitre, girouette avant (numéro et terminus) et latérale (prochains arrêts qui défilent).
- **Car scolaire** : blanc et bleu, panneau « transport d'enfants », enfants à chaque vitre. Il passe seulement quand `schoolTo` ou `schoolFrom` est actif, deux à quatre passages par créneau.
- **Utilitaires** :
  - deux Estafettes ;
  - Type H en tôle ondulée (laiterie, boulangerie, fleuriste : selon les commerces présents) ;
  - fourgon des Postes ;
  - camion-benne.
- **Services** :
  - ambulance (sirène, gyrophares) ;
  - police (gyrophare) ;
  - taxi (lumineux) ;
  - benne à ordures (deux éboueurs à l'arrière, en pantins) ;
  - tram (ligne du fond, inchangée dans son calendrier).
- **Deux-roues motorisés** : Vespa, mobylette, side-car avec passager, triporteur du laitier. Ce sont des pilotes en pantin : l'allure `mount` de G3c.
- **Vélos** : ceux de G3c deviennent des agents du moteur sur la piste cyclable. Ils freinent derrière un autre vélo et peuvent dépasser par la voie quand elle est libre.

## 5. Lignes de bus réelles (relais `/buslines`)

- **Requête** : relations `route=bus` (et `trolleybus`) dans un **cadre** de ± 3 km autour de la position arrondie à 0,1°, via `relay/src/overpass.ts`. On mesure avant de figer le rayon : leçon de `/shops`, où le filtre `around` faisait dépasser le délai.
- **Données retournées** : `ref` (numéro), `to` et `from` (terminus), `colour`, `name`, et les noms des arrêts (`public_transport=platform` membres de la relation), dédoublonnés, 8 lignes au plus.
- **Cache** du relais : 30 jours par case. Côté client, en mémoire de page, avec une pause de 24 h après un échec, comme `use-shop-names.ts`.
- **Repli** (position désactivée, échec, aucune ligne) : générateur déterministe par graine.
  - numéros de 1 à 99, parfois une lettre (« 12 », « C3 ») ;
  - terminus types : Gare SNCF, Hôtel de Ville, Place de la République, Centre hospitalier, Lycée…, Zone commerciale, Parc des expositions, Campus ;
  - noms de rues et de quartiers des commerces réels quand on les a.
- **Couleur** : la couleur de la ligne sert pour le bandeau du bus quand elle existe.
- **Car scolaire** : nom d'un établissement OSM proche (`amenity=school`, même cadre) sinon « Transport scolaire ».

## 6. Découpage en livraisons

| PR | Contenu |
|---|---|
| **V1** | Moteur de circulation (§1) branché sur les sprites actuels dans les deux graphismes : plus de boucle, caractères, feux, arrêt de bus, livraisons, ambulance qui fait ranger, événements de rue devenus agents, démarrage à chaud. |
| **V2** | Générateur de voitures (§2) et rendu Ghibli des voitures (§3) : sprites peints, roues, vitrage, occupants animés, feux stop, fumée. |
| **V3** | Véhicules à part en Ghibli (§4), dont le car scolaire aux heures d'école. |
| **V4** | Lignes de bus réelles (§5) : relais, repli, girouettes, arrêt de bus sur le trottoir avec des passants qui montent et descendent. |
| **V5** | Véhicules scénarisés en Ghibli : camionnettes, camion plateau et nacelle des équipes, camion de déménagement, véhicules du défilé (jeeps, camions, chars, pompiers, motos). Leurs scripts sont inchangés. |

Chaque PR : maquette ou captures auto-validées avant la PR, puis fusion, pré-prod, et captures montrées à l'utilisateur à la fin de chaque livraison.

## 7. Tests

- **Moteur** :
  - déterminisme (même graine, même minute, même rue) ;
  - aucun chevauchement entre deux véhicules d'une voie, sur 30 min simulées à toutes les intensités ;
  - arrêt au feu rouge avant la ligne ;
  - redémarrage échelonné selon les temps de réaction ;
  - l'ambulance fait ranger et repartir ;
  - le bus marque l'arrêt et les suivants attendent ;
  - route fermée sans entrée ;
  - sortie par le bord opposé ;
  - aucune valeur non finie ;
  - démarrage à chaud peuplé.
- **Générateur** :
  - dix voitures consécutives sans type répété ;
  - teintes deux à deux à plus de 0,08 tour ;
  - proportions dans les plages ;
  - silhouette fermée sans auto-intersection.
- **Rendu** :
  - un véhicule Ghibli rend caisse, vitrage, roues, conducteur ;
  - classique sans pantin ;
  - aucun `clipPath` ni id fixe ;
  - mouvement réduit immobile.
- **Relais** : requête en cadre, repli sur les serveurs, réponse réduite, cache.
