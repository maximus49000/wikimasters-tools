# Maquette — lever et journées des habitants (un immeuble parisien)

Maquette jetable (pas de code produit) : `modele.js` (modèle pur, tirages déterministes), `maquette.html` (planches en SVG,
`?planche=mardi|samedi|semaine|porte`), `capture.mjs` (rendu PNG : `node capture.mjs <dossier de playwright-core>`).

Planches à valider :

- `planche-mardi.png` — mardi 3 novembre 2026, 12 logements, 25 habitants + Fatou la nounou, frise 5 h → 5 h, fenêtres allumées sous chaque logement ;
- `planche-samedi.png` — samedi 7 novembre 2026, même immeuble ;
- `planche-semaine.png` — Yasmine (parent non-cadre), Julie (cadre, nounou le soir), Monique (retraitée), Camille (jeune célibataire qui sort), du lundi 2 au dimanche 8 ;
- `planche-porte.png` — la porte de l'immeuble le mardi : qui sort, qui rentre, quand.

## Les règles

« **Règle** » = demandé par l'utilisateur (à respecter). « **Proposition** » = valeur ou choix par défaut du contrôleur ou de la maquette, à valider.

| # | Règle | Origine |
|---|---|---|
| 1 | Habitants : familles avec ou sans enfants, personnes seules de tous âges, cadres, non-cadres, chômeurs, retraités, étudiants, colocs | Règle |
| 2 | Le lever est tiré **chaque jour, pour chaque personne** ; jamais un trait fixe (7 h un jour, 9 h le lendemain est possible) | Règle |
| 3 | Pas tous les retraités tôt ; certains debout vers 7 h même le dimanche → probabilité « lève-tôt » propre à chacun, tirée chaque matin | Règle (forme : proposition) |
| 4 | Jour travaillé : lever = début du travail − trajet − préparation, stable d'un jour à l'autre (quelques minutes de bruit) | Règle |
| 5 | Pas de travail le week-end, les jours fériés, ni pendant les congés (quelques semaines par an) | Règle |
| 6 | Jeunes enfants emmenés à l'école (8 h 20) et cherchés (16 h 30) ; **un seul parent suffit** à chaque fois ; les grands (collège) y vont seuls | Règle |
| 7 | Si les deux parents rentrent tard : une **nounou**, vraie personne (arrive à pied, prend les enfants à l'école, entre avec eux, reste jusqu'au retour d'un parent, repart) | Règle |
| 8 | Sorti la veille → lever plus tard s'il n'y a pas d'obligation (rattrapage) | Règle |
| 9 | Rendez-vous le matin → lever plus tôt ce jour-là, même chômeur ou retraité | Règle |
| 10 | Soirées : jeunes sans enfant au bar, voire en boîte, surtout avant un jour sans travail ; seniors : petites sorties (resto, théâtre), rentrés à 23 h au plus tard | Règle |
| 11 | Familles : sortent rarement, le samedi, avec la nounou | Proposition |
| 12 | Sommeil respecté par la majorité (coucher calé sur le lever du lendemain) ; une minorité sort en boîte avant un jour travaillé, dort peu et se lève quand même | Règle |
| 13 | Sans travail le lendemain, sortie tardive ⇒ lever tardif (rattrapage) | Règle |
| 14 | Lumières : on n'allume que quand il fait sombre (avant lever du soleil + 20 min, après coucher − 20 min) | Proposition (maquette) |

## Paramètres (tous « proposition »)

| Paramètre | Valeur |
|---|---|
| Début du travail, cadre | 8 h 30 – 9 h 30 (fixe par personne), **± 15 min chaque jour** (souplesse) |
| Durée sur place, cadre | 9 h 00 – 9 h 45 (pause comprise) ; 12 % des jours « tard » + 45 – 120 min |
| Début du travail, non-cadre | 6 h 30 – 8 h 00 (fixe par personne), sans souplesse |
| Durée sur place, non-cadre | 7 h 45 – 8 h 15 |
| Trajet | 10 – 50 min, fixe par personne (≤ 15 min : à pied, sinon métro 70 % / bus) |
| Préparation | 30 – 60 min fixe par personne, **± 5 min chaque jour** |
| Besoin de sommeil | adulte 7 h 30 ± 30 ; retraité 7 h ± 30 ; étudiant 8 h ± 30 ; enfant 6-10 ans **10 h 30**, ≤ 5 ans 11 h 30, collégien 9 h 30 |
| Coucher habituel (soir sans obligation) | jeune 23 h 45 – 0 h 45 ; adulte 22 h 45 – 23 h 45 ; senior 22 h – 23 h 15 ; ± 25 min chaque soir |
| Respect du sommeil | 85 % des soirs avant une obligation : coucher = lever du lendemain − besoin de sommeil (au plus tard) |
| Rattrapage | sans obligation : lever = max(lever libre tiré, coucher + besoin − 30 / + 10 min), plafonné à 13 h |
| Lever libre, retraité | lève-tôt (proba propre à chacun, 15-85 %) : 6 h 45 – 7 h 30 ; sinon 7 h 30 – 9 h 30 |
| Lever libre, chômeur | 7 h 30 – 10 h 00 |
| Lever libre, actif (week-end, congé) | 8 h 00 – 10 h 30 ; un parent de jeunes enfants se lève avec eux (0 – 10 min après) |
| Lever libre, étudiant | 9 h 00 – 11 h 30 ; jours de cours : cours − trajet − préparation (emploi du temps par jour de la semaine) |
| Lever libre, enfant | < 11 ans 7 h 00 – 8 h 15 ; ≥ 11 ans 8 h 30 – 10 h 30 |
| Rendez-vous | chômeur 1 jour ouvré sur 5 (8 h 45 – 10 h) ; retraité 1 sur 10 (8 h 30 – 10 h 30) |
| Congés | 5 semaines par an et par actif ; parents : 4 pendant les vacances scolaires + 1 ailleurs |
| École (Paris) | lun., mar., jeu., ven. 8 h 20 – 16 h 30 ; mercredi école le matin puis centre de loisirs jusqu'à 16 h 30 ; 10 min à pied ; préparation enfant 40 min |
| Collège (≥ 11 ans) | autonome, emploi du temps par jour (8 h, 9 h ou 10 h), 15 min à pied |
| Dépose | un parent libre ; sinon un cadre (il décale son arrivée : 8 h 20 + trajet) ; sinon un non-cadre qui commence assez tard |
| Sortie d'école | un parent libre ou rentré avant 16 h 20 ; sinon la nounou (si la famille en a une) ; sinon garderie jusqu'au retour du premier parent (≤ 18 h 30) |
| Nounou | arrive à pied 25 min avant 16 h 30, rentre avec les enfants à 16 h 40, repart 5 – 10 min après le retour d'un parent ; le samedi soir, garde pendant la sortie des parents |
| Sorties jeunes (< 35 ans, sans enfant) | lendemain libre : 45 % (boîte 35 % de ces soirs, retour 3 h 30 – 5 h ; sinon bar, retour 0 h 30 – 2 h) ; lendemain travaillé : bar 12 % (retour 22 h 45 – 0 h) ; **jeudi : boîte 10 % (retour 2 h 45 – 3 h 45)** |
| Sorties adultes (35-64 ans, sans enfant) | lendemain libre 25 % (retour 23 h – 0 h 15) ; sinon 6 % (retour avant 23 h 30) |
| Sorties seniors | samedi 30 %, vendredi 15 %, autres 6 % ; départ 19 h 15 – 19 h 45, retour 22 h – **23 h max** |
| Sorties familles | samedi 15 %, seulement avec la nounou ; sans nounou : jamais le soir |
| Sorties de jour | retraités : matin 65 % (marché, café…), après-midi 50 % ; chômeur 35 / 40 % ; week-end : matin 55 %, après-midi 50 % ; familles le week-end : parc 70 % tous ensemble |
| Soleil (Paris, novembre 2026) | approché : lever 7 h 27 → 7 h 37, coucher 17 h 25 → 17 h 14 |

## Exemples imposés pour les planches (le reste est tiré)

- Chloé (étudiante) : mardi soir en boîte, retour 4 h 00 (pas de cours le mercredi matin) ;
- Camille (jeune cadre) : jeudi en boîte, retour 3 h 30, se lève quand même à 7 h 12 vendredi (la minorité) ; samedi boîte → rattrapage dimanche (12 h 50) ;
- famille Martin : samedi au restaurant, Fatou garde les enfants ;
- Nicolas (chômeur) : RDV France Travail mardi 9 h 30 ; Monique (retraitée) : RDV kiné vendredi 9 h ;
- Hélène : en congé la semaine 45 ; Camille : semaine 45 retirée de ses congés tirés (pour la planche semaine).

## Ce que ça change dans le code

- **`households.ts`** : chaque `Member` reçoit `age`, `statut` (cadre / non-cadre / chômeur / retraité / étudiant / enfant),
  et les traits fixes tirés de la graine du foyer : `debut`, `duree`, `trajet`, `prep`, `sommeil`, `coucher`, `leveTot`,
  `conges` (semaines), emploi du temps de cours ou de collège. Le type de foyer reste celui d'aujourd'hui ; on ajoute
  « famille avec nounou » (drapeau du foyer) et la répartition des statuts selon l'âge.
- **`scene-day.ts` / `dayDraw`** : le lever n'est plus **un** décalage pour tout le foyer (± 25 / ± 50 min) mais un lever **par
  personne** : obligation (travail / dépose / cours / RDV) ou tirage libre, puis rattrapage. Le tirage reste fonction de
  (logement, personne, date, graine) — un flux par usage pour garder l'ordre des tirages stable.
  **Difficulté** : le rattrapage et le coucher dépendent de la veille (sortie, heure du coucher). Il faut donc relire J-1
  (et J+1 pour caler le coucher). Proposition : `dayDraw` de J calcule aussi le soir de J-1 (sorties tirées de J-1,
  obligations de J) — une profondeur de 1 jour suffit, sans état mémorisé.
- **Logistique des enfants** : nouvelle étape par foyer et par jour scolaire (qui dépose, qui va chercher, nounou ou
  garderie), lue par les emplois du temps de chaque membre. `calendar.ts` / `school-calendar.ts` donnent déjà
  `schoolOn`, les vacances et les fériés ; il faut y ajouter le mercredi « matin + centre de loisirs ».
- **La nounou** : une personne qui n'habite pas l'immeuble — une entrée de « visiteur » rattachée au foyer (comme les
  invités de `guests`), avec ses passages à la porte (`leave` / retour) et sa présence dans le logement (lumières).
- **Sorties du soir** : bar / boîte / resto / théâtre par profil (jeune, adulte, senior, famille + nounou), départ et
  retour à la porte ; retours de nuit (3 h – 5 h) à faire apparaître dans la scène (porte + chambre allumée 10 min).
- **`schedules.ts` / `buildSchedule`** : les blocs `lit` par pièce viennent de la journée de chaque présent :
  préparation (chambre 8 min → cuisine 20 min → salon), dîner en cuisine (19 h 45 – 20 h 30 ; enfants 19 h – 19 h 30),
  salon le soir, chambre 15 min avant le coucher (20 min pour un enfant), goûter en cuisine avec la nounou ; une pièce
  absente retombe sur le salon (lucarne : tout au salon). Les départs / retours (`leave`) deviennent ceux de chaque
  personne (étalés de 6 h à 10 h), plus regroupés par foyer.
- **Sommeil** : `bed` devient le coucher de chacun (le salon s'éteint au dernier couché ; la chambre s'allume au premier).

## Limites de la maquette

- Le samedi, aucun salarié ne travaille (règle 5) : les commerces, soignants ou boulangers du samedi ne sont pas modélisés.
- La « nuit courte » n'a pas d'effet sur le reste de la journée (sieste, coucher plus tôt) — à décider.
- Les enfants ne « rattrapent » pas : sur jour libre, ils se lèvent selon leur tirage, même après un samedi tardif.
