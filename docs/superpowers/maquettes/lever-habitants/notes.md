# Maquette — lever et journées des habitants (un immeuble parisien)

Maquette jetable (pas de code produit). Fichiers :
- `modele.js` : modèle pur, tirages déterministes ;
- `maquette.html` : planches en SVG, `?planche=mardi|samedi|semaine|porte` ;
- `capture.mjs` : rendu PNG, `node capture.mjs <dossier de playwright-core>`.

Planches à valider :

- `planche-mardi.png` : mardi 3 novembre 2026. 12 logements, 25 habitants + Fatou la nounou. Frise de 5 h à 5 h, fenêtres allumées sous chaque logement. Chaque actif a sa ligne de travail : contrat, horaires, pause, durée effective.
- `planche-samedi.png` : samedi 7 novembre 2026, même immeuble.
- `planche-semaine.png` : 5 habitants, du lundi 2 au dimanche 8 :
  - Yasmine, parent, fonction publique, RTT le vendredi ;
  - Julie, cadre, nounou le soir ;
  - Sarah, serveuse en horaires coupés, repos dimanche + lundi ;
  - Monique, retraitée ;
  - Camille, jeune qui sort, RTT le lundi.
- `planche-porte.png` : la porte de l'immeuble le mardi. Qui sort, qui rentre, quand. On y voit aussi le retour de Sarah pendant sa coupure.

## Les règles

« **Règle** » : demandé par l'utilisateur (à respecter). « **Proposition** » : valeur ou choix par défaut, à valider.

| # | Règle | Origine |
|---|---|---|
| 1 | Habitants : familles avec ou sans enfants, personnes seules de tous âges, cadres, non-cadres, chômeurs, retraités, étudiants, colocs | Règle |
| 2 | Le lever est tiré **chaque jour, pour chaque personne**. Ce n'est jamais un trait fixe | Règle |
| 3 | Pas tous les retraités tôt ; certains debout vers 7 h même le dimanche. Chacun a sa probabilité « lève-tôt », tirée chaque matin | Règle (forme : proposition) |
| 4 | Jour travaillé : lever = début du travail − trajet − préparation. Stable d'un jour à l'autre, à quelques minutes près | Règle |
| 5 | Pas de travail le week-end, les jours fériés, ni en congé. **Exception restauration** : on peut travailler le samedi, avec 2 jours de repos ailleurs (Sarah : dimanche + lundi) | Règle |
| 6 | Jeunes enfants emmenés à l'école (8 h 20) et cherchés (16 h 30). **Un seul parent suffit** à chaque fois. Les grands (collège) y vont seuls | Règle |
| 7 | Les deux parents rentrent tard → une **nounou**, vraie personne. Elle arrive à pied, prend les enfants à l'école, entre avec eux, reste jusqu'au retour d'un parent, puis repart | Règle |
| 8 | Sorti la veille → lever plus tard s'il n'y a pas d'obligation (rattrapage) | Règle |
| 9 | Rendez-vous le matin → lever plus tôt ce jour-là, même chômeur ou retraité | Règle |
| 10 | Soirées : les jeunes sans enfant vont au bar, voire en boîte, surtout avant un jour sans travail. Les seniors font de petites sorties (resto, théâtre) et rentrent à 23 h au plus tard | Règle |
| 11 | Familles : sortent rarement, le samedi, avec la nounou | Proposition |
| 12 | La majorité respecte son sommeil : le coucher est calé sur le lever du lendemain. Une minorité va en boîte avant un jour travaillé, dort peu et se lève quand même | Règle |
| 13 | Sans travail le lendemain, sortie tardive ⇒ lever tardif (rattrapage) | Règle |
| 14 | **Droit du travail respecté** pour chaque actif et pour la nounou (voir la section suivante) | Règle |
| 15 | Horaires coupés pour certains métiers (restauration) : 2 services et une coupure, avec retour à la maison ou non | Règle |
| 16 | Congés selon le contrat : 35 h, 39 h + 11 RTT, forfait jours, fonction publique, restauration (voir « Contrats et congés ») | Règle |
| 17 | Lumières : on n'allume que quand il fait sombre (avant le lever du soleil + 20 min, après le coucher − 20 min) | Proposition (maquette) |

## Droit du travail (Règle)

Ces limites sont vérifiées automatiquement par `verifierDroit()` dans `modele.js`, sur la semaine générée. Le contrôle lit aussi la veille et les 2 jours suivants pour les repos à cheval sur deux semaines. Au moindre écart, le chargement du modèle lève une erreur. **Le contrôle passe** : les 12 actifs et Fatou respectent toutes les limites.

| Limite | Valeur | Source |
|---|---|---|
| Travail effectif par jour | ≤ 10 h | Code du travail, art. L3121-18 |
| Pause | ≥ 20 min dès 6 h de travail. Dans le modèle, aucune période de travail ne dépasse 6 h d'affilée | art. L3121-16 |
| Pause déjeuner modélisée | Bureau (cadres) : 45 min – 1 h 30, entre 12 h et 13 h. Postés (non-cadres) : 30 min, 3 h 30 – 4 h 30 après l'embauche. **Pas comptée comme du travail**, montrée à part sur la frise | Proposition |
| Repos quotidien | ≥ 11 h d'affilée entre deux jours, compté depuis la fin du **dernier** service | art. L3131-1 |
| Repos hebdomadaire | ≥ 35 h d'affilée (24 h + 11 h), en principe le dimanche | art. L3132-2 et L3132-3 |
| Durée hebdomadaire | ≤ 48 h sur une semaine | art. L3121-20 |
| Amplitude (début → fin, pause comprise) | ≤ 11 h en journée continue. ≤ 13 h en horaires coupés (convention HCR), la coupure n'étant pas du travail | Conséquence du repos de 11 h ; convention HCR |
| Fin de journée | Typiquement 16 h – 19 h. Cadres : 19 h 30 au plus tard, et seulement les jours longs (12 % des jours, + 30 – 60 min) | Proposition |
| Congés payés | ≥ 25 jours ouvrés (5 semaines) par an pour chacun | art. L3141-3 |

Bilan sur la semaine du 2 au 8 novembre :

| Personne | Contrat | Semaine | Jour max | Amplitude max | Repos quotidien min | Repos hebdo | CP / RTT par an |
|---|---|---|---|---|---|---|---|
| Karim | 39 h + 11 RTT | 39 h 00 | 7 h 48 | 8 h 18 | 15 h 42 | 63 h 42 | 25 / 11 |
| Sophie | forfait jours | 40 h 35 | 8 h 55 | 9 h 55 | 14 h 05 | 63 h 25 | 25 / 11 |
| Julie | forfait jours | 40 h 50 | 8 h 10 | 9 h 15 | 14 h 25 | 63 h 05 | 25 / 11 |
| Marc | forfait jours | 40 h 25 | 8 h 05 | 9 h 35 | 14 h 15 | 62 h 40 | 25 / 11 |
| Camille | 39 h + 11 RTT | 31 h 42 (RTT lundi) | 8 h 18 | 9 h 08 | 14 h 32 | 86 h 47 | 25 / 11 |
| Yasmine | fonction publique | 30 h 00 (RTT vendredi) | 7 h 30 | 8 h 00 | 16 h 00 | 88 h 00 | 25 / 15 |
| Samir | forfait jours | 38 h 45 | 7 h 45 | 9 h 15 | 14 h 25 | 63 h 20 | 25 / 11 |
| Léo | 35 h | 28 h 00 (congé lundi) | 7 h 00 | 7 h 30 | 16 h 30 | 80 h 00 | 25 / 0 |
| Manon | 39 h + 11 RTT | 39 h 57 | 8 h 45 | 10 h 00 | 15 h 07 | 61 h 45 | 25 / 11 |
| Sarah | restauration (HCR) | 37 h 30 | 7 h 30 | 11 h 30 (coupé) | 12 h 30 | 60 h 30 | 25 / 0 |
| Théo | forfait jours | 42 h 10 | 9 h 10 | 10 h 05 | 13 h 30 | 62 h 45 | 25 / 11 |
| Hélène | fonction publique | en congé | — | — | — | — | 25 / 15 |
| Fatou (nounou) | particulier employeur | 13 h 40 | 3 h 50 | 3 h 50 | 21 h 55 | 64 h 30 | 25 / 0 |

« Les deux parents rentrent tard → nounou » reste plausible dans ces limites. Les Martin finissent vers 17 h 50 – 18 h 15, puis 15 à 40 min de trajet : ils rentrent vers 18 h 15 – 18 h 55. La sortie d'école de 16 h 30 leur est donc impossible.

## Horaires coupés (Règle)

- **Sarah, serveuse** (5e gauche, colocation). Elle travaille du mardi au samedi :
  - 1er service 11 h – 14 h 30, 2e service 18 h 30 – 22 h 30, soit 7 h 30 effectives par jour et 37 h 30 par semaine ;
  - coupure de 4 h, qui n'est pas du travail : 3 jours sur 4 elle rentre chez elle (trajet aller-retour), sinon « coupure en ville » ;
  - repos dimanche + lundi.
- Repos quotidien : fin à 22 h 30, reprise à 11 h, soit 12 h 30 de repos (≥ 11 h).
- Seule exception à « pas de travail le week-end » : elle ne concerne que ce métier.
- Sur `planche-porte.png`, son retour de coupure du mardi apparaît : 14 h 50 rentre, 18 h 10 sort, 22 h 50 rentre. Ce retour est imposé pour l'exemple.

## Contrats et congés (Règle)

Chaque actif a un contrat (affiché sur sa ligne de travail). Ses congés sont tirés sur toute l'année 2026, jour par jour : congés payés (CP) et RTT.

| Contrat | Travail effectif | CP (jours ouvrés) | RTT / an | Total ≈ semaines | Habitants |
|---|---|---|---|---|---|
| 35 h | 7 h / jour | 25 | 0 | 5 | Léo |
| 39 h + 11 RTT | 7 h 48 / jour (semaines à 39 h ; ≈ 11 jours par an ramenés à « 35 h » en RTT, souvent 1 jour isolé) | 25 | 11 | ≈ 7 | Karim, Camille, Manon |
| Forfait jours (cadre) | 7 h 30 – 8 h 30 tiré, jours longs possibles | 25 | 11 | ≈ 7 | Sophie, Julie, Marc, Samir, Théo |
| Fonction publique | 7 h 30 / jour | 25 | 15 | 8 | Yasmine, Hélène |
| Restauration (HCR) | 7 h 30 en 2 services, mar. → sam. | 25 | 0 | 5 | Sarah |
| Particulier employeur (nounou) | garde périscolaire + soirées | 25 | 0 | 5 (calés sur la famille) | Fatou |

Les enseignants ou personnels scolaires (congés calés sur les vacances scolaires) ne sont pas dans l'immeuble de la maquette ; ce serait un 7e type.

Répartition :
- **parents** : 3 semaines d'été pendant les vacances scolaires, Noël, et 1 semaine de petites vacances (hiver, printemps ou Toussaint) ;
- **sans enfant** : 2 ou 3 semaines l'été, 1 semaine l'hiver (Noël, janvier, février), et le reste en jours épars ;
- **jours épars et RTT** : jours isolés, 60 % un vendredi, 20 % un lundi (ponts et longs week-ends), 20 % en milieu de semaine.

Visibles sur la semaine de novembre :
- Camille : RTT le lundi 2, imposé (pont après la Toussaint) ; lever 8 h 30 en rattrapage. Le lundi 9 est aussi tiré en RTT, d'où sa sortie du dimanche soir ;
- Yasmine : RTT tiré le vendredi 6. Elle dépose les enfants elle-même ;
- Léo : congé payé tiré le lundi 2 ;
- Hélène : en congé toute la semaine.

## Paramètres (tous « proposition »)

| Paramètre | Valeur |
|---|---|
| Début du travail, cadre | 8 h 30 – 9 h 30, fixe par personne, **± 15 min chaque jour** |
| Début du travail, non-cadre | 6 h 30 – 8 h 00, fixe par personne, sans souplesse |
| Trajet | 10 – 50 min, fixe par personne. ≤ 15 min : à pied, sinon métro (70 %) ou bus |
| Préparation | 30 – 60 min, fixe par personne, **± 5 min chaque jour** |
| Besoin de sommeil | Adulte 7 h 30 ± 30. Retraité 7 h ± 30. Étudiant 8 h ± 30. Enfant de 6 à 10 ans **10 h 30**, 5 ans et moins 11 h 30, collégien 9 h 30 |
| Coucher habituel (soir sans obligation) | Jeune 23 h 45 – 0 h 45. Adulte 22 h 45 – 23 h 45. Senior 22 h – 23 h 15. ± 25 min chaque soir |
| Respect du sommeil | 85 % des soirs avant une obligation : on se couche au plus tard à « lever du lendemain − besoin de sommeil » |
| Rattrapage | Sans obligation : lever = max(lever libre tiré, coucher + besoin − 30 / + 10 min), au plus tard 13 h |
| Lever libre, retraité | Lève-tôt (probabilité propre à chacun, 15 à 85 %) : 6 h 45 – 7 h 30. Sinon 7 h 30 – 9 h 30 |
| Lever libre, chômeur | 7 h 30 – 10 h 00 |
| Lever libre, actif (week-end, congé, RTT) | 8 h 00 – 10 h 30. Un parent de jeunes enfants se lève avec eux (0 – 10 min après) |
| Lever libre, étudiant | 9 h 00 – 11 h 30. Jours de cours : cours − trajet − préparation (emploi du temps par jour de la semaine) |
| Lever libre, enfant | Moins de 11 ans : 7 h 00 – 8 h 15. 11 ans et plus : 8 h 30 – 10 h 30 |
| Rendez-vous | Chômeur : 1 jour ouvré sur 5 (8 h 45 – 10 h). Retraité : 1 sur 10 (8 h 30 – 10 h 30) |
| École (Paris) | Lundi, mardi, jeudi, vendredi : 8 h 20 – 16 h 30. Mercredi : école le matin, puis centre de loisirs jusqu'à 16 h 30. 10 min à pied, préparation de l'enfant 40 min |
| Collège (11 ans et plus) | Autonome. Emploi du temps par jour (8 h, 9 h ou 10 h), 15 min à pied |
| Dépose | Un parent libre (congé, RTT). Sinon un cadre, qui décale son arrivée à 8 h 20 + trajet (journée recalculée dans les limites légales). Sinon un non-cadre qui commence assez tard |
| Sortie d'école | Un parent libre ou rentré avant 16 h 20. Sinon la nounou (si la famille en a une). Sinon garderie jusqu'au retour du premier parent (18 h 30 au plus tard) |
| Nounou | Arrive à pied 25 min avant 16 h 30. Rentre avec les enfants à 16 h 40. Repart 5 – 10 min après le retour d'un parent. Le samedi soir, garde pendant la sortie des parents |
| Sorties jeunes (moins de 35 ans, sans enfant) | Lendemain libre : 45 % des soirs ; 35 % de ces sorties en boîte (retour 3 h 30 – 5 h), sinon bar (retour 0 h 30 – 2 h). Lendemain travaillé : bar 12 % (retour 22 h 45 – 0 h). **Jeudi : boîte 10 % (retour 2 h 45 – 3 h 45)** |
| Sorties adultes (35-64 ans, sans enfant) | Lendemain libre : 25 % (retour 23 h – 0 h 15). Sinon 6 % (retour avant 23 h 30) |
| Sorties seniors | Samedi 30 %, vendredi 15 %, autres jours 6 %. Départ 19 h 15 – 19 h 45, retour 22 h – **23 h au plus tard** |
| Sorties familles | Samedi 15 %, seulement avec la nounou. Sans nounou : jamais le soir |
| Sorties de jour | Retraités : matin 65 % (marché, café…), après-midi 50 %. Chômeur : matin 35 %, après-midi 40 %. Week-end : matin 55 %, après-midi 50 %. Familles le week-end : parc tous ensemble, 70 % |
| Soleil (Paris, novembre 2026) | Approché : lever 7 h 27 → 7 h 37, coucher 17 h 25 → 17 h 14 |

## Exemples imposés pour les planches (le reste est tiré)

- **Chloé (étudiante)** : mardi soir en boîte, retour 4 h 00. Elle n'a pas cours le mercredi matin.
- **Camille (jeune, 39 h + 11 RTT)** :
  - RTT le lundi 2 ;
  - jeudi en boîte, retour 3 h 30. Elle se lève quand même à 6 h 53 vendredi : c'est la minorité qui dort peu ;
  - samedi en boîte, d'où un rattrapage le dimanche (lever 12 h 35) ;
  - aucun autre congé tiré la semaine 45.
- **Famille Martin** : samedi au restaurant, Fatou garde les enfants.
- **Rendez-vous** : Nicolas (chômeur), France Travail mardi 9 h 30 ; Monique (retraitée), kiné vendredi 9 h.
- **Hélène** : une de ses semaines de congé est la semaine 45.
- **Sarah** : rentre chez elle pendant sa coupure du mardi.

## Ce que ça change dans le code

- **`households.ts`** : chaque `Member` reçoit un âge, un statut, un **contrat** et ses traits fixes tirés de la graine du foyer :
  - statuts : cadre, non-cadre, chômeur, retraité, étudiant, enfant ;
  - contrats : 35 h, 39 h + 11 RTT, forfait jours, fonction publique, HCR ;
  - traits : début du travail, travail effectif, pause, trajet, préparation, sommeil, coucher, `leveTot`, plan de congés de l'année (CP + RTT, par date), horaires coupés éventuels, emploi du temps de cours ou de collège ;
  - le foyer garde son type d'aujourd'hui, avec en plus un drapeau « nounou ».
- **Une journée de travail = une liste de services** : `[[début, fin], …]`, avec une pause déjeuner ou une coupure entre eux. On garantit les limites légales dès la construction (`journee()`), puis on les vérifie (`verifierDroit()`). Ce contrôle mériterait un test vitest dans le produit.
- **`scene-day.ts` / `dayDraw`** : le lever n'est plus **un** décalage pour tout le foyer (± 25 / ± 50 min), mais un lever **par personne**.
  - Il vient d'une obligation (travail, dépose, cours, rendez-vous) ou d'un tirage libre, puis du rattrapage.
  - Le tirage reste fonction de (logement, personne, date, graine), avec un flux par usage.
  - **Difficulté** : le rattrapage et le coucher dépendent de la veille. Proposition : `dayDraw` de J calcule aussi le soir de J-1. Une profondeur de 1 jour suffit, sans état mémorisé.
- **Logistique des enfants** : nouvelle étape par foyer et par jour scolaire : qui dépose, qui va chercher, nounou ou garderie.
  - Elle tient compte des congés et RTT : un parent libre prend le relais.
  - `calendar.ts` / `school-calendar.ts` donnent déjà les vacances et les fériés. Il faut y ajouter le mercredi « matin + centre de loisirs ».
- **La nounou** : une personne qui n'habite pas l'immeuble. C'est un « visiteur » rattaché au foyer, comme les invités de `guests`, avec ses passages à la porte et sa présence dans le logement (lumières).
- **Sorties du soir** : bar, boîte, resto ou théâtre selon le profil. Les retours de nuit (3 h – 5 h) passent par la porte et allument la chambre 10 min.
- **`schedules.ts` / `buildSchedule`** :
  - les blocs `lit` par pièce viennent de la journée de chaque présent : préparation (chambre → cuisine → salon), dîner, soirée, coucher, goûter avec la nounou ;
  - le retour de coupure en horaires coupés rallume le logement l'après-midi ;
  - les départs et retours deviennent ceux de chaque personne.

## Limites de la maquette

- Seule la restauration travaille le samedi : commerces, soignants de week-end, etc., ne sont pas modélisés.
- La « nuit courte » n'a pas d'effet sur le reste de la journée (sieste, coucher plus tôt).
- Les enfants ne « rattrapent » pas leur sommeil.
- Le forfait jours est modélisé en heures (pour le contrôle 10 h / 48 h). En droit, le forfait jours n'est soumis qu'aux repos (11 h / 35 h) ; les plafonds horaires sont donc ici plus stricts que la loi.
