# Ville : journées des habitants et passeport — design

Maquette validée par l'utilisateur le 2026-10-25 (« Je valide ») : `docs/superpowers/maquettes/lever-habitants/`
(`notes.md` = règles et paramètres, `modele.js` = modèle de référence à porter, planches mardi / samedi / semaine / porte).

## Pourquoi

Un dimanche à 7 h 50, la ville sombre n'avait aucune lumière : tous les foyers se levaient d'un bloc, à une heure par type
de foyer. L'utilisateur veut une ville où **chaque habitant a sa vie** : un lever tiré chaque jour, calé sur son travail,
ses enfants, sa soirée de la veille et ses rendez-vous, dans le respect du droit du travail ; et pouvoir **savoir qui est
qui** en ouvrant le passeport d'un habitant.

## Objectifs

1. **Identité de chaque habitant** (stable, tirée de la graine du foyer) : prénom, âge, statut (cadre, non-cadre, chômeur,
   retraité, étudiant, enfant), profession, contrat de travail, situation (célibataire / en couple avec le prénom de l'autre),
   enfants (nombre, prénoms, âges). Les prénoms sont **stockés** dans le modèle (déterministes, jamais tirés à l'affichage).
2. **Journée par personne, chaque jour** : toutes les règles de `notes.md` §« Les règles » (1-17), §« Droit du travail »,
   §« Horaires coupés », §« Contrats et congés », avec les paramètres de §« Paramètres » (propositions validées avec la
   maquette).
3. **Ce qu'on voit** : lumières par pièce selon qui est debout et où, départs / retours échelonnés par la porte de
   l'immeuble (dont les retours de nuit, la serveuse pendant sa coupure), la nounou qui arrive avec les enfants et repart.
4. **Visiteurs** : les passants qui entrent et sortent des immeubles viennent voir quelqu'un qui est **présent** à ce
   moment-là (ami, famille, livreur, vendeur, commercial, nounou…). Ils habitent ailleurs (un autre quartier, pas forcément
   visible) et ont eux aussi une identité stable et un passeport. Les habitants sortent et rentrent quand leur journée le
   dit ; aux heures de pointe, le plafond de figures pour le téléphone reste prioritaire et un départ peut être montré un
   peu décalé, jamais supprimé.
5. **Apparence** : une tenue par personne et par jour, la même partout (fenêtre, porte, rue, portrait du passeport),
   ainsi que la taille et le sexe. Le matin la personne est en pyjama (si elle en porte) jusqu'à ce qu'elle se change
   pendant sa préparation, puis garde sa tenue toute la journée ; le soir elle remet son pyjama au coucher.
6. **Passeport** : quand on touche un habitant ou un visiteur, en plus de la flèche qui le suit, un **bouton** apparaît ; il ouvre un
   **passeport** (effet d'ouverture du livret) avec sa fiche d'identité (objectif 1). Fermer le passeport rend la vue.

## Non-objectifs

- Pas de commerces / soignants / transports travaillant le week-end (seule la restauration, comme la maquette).
- Pas de sieste ni de coucher avancé après une nuit courte ; pas de rattrapage de sommeil des enfants.
- Pas encore de passeport pour les clients des boutiques, le personnel des commerces et les ouvriers d'événement : ils
  gardent la flèche seule (lot ultérieur possible). Habitants, nounou et visiteurs en ont un.
- La colline et le fond lointain gardent leurs lumières statistiques.

## Anti-objectifs (échec même si « ça marche »)

- Un habitant qui apparaît ou disparaît sur place, une lumière qui saute sans que personne ne soit là.
- Des horaires illégaux (le contrôle doit l'interdire, en test).
- Un prénom ou un âge qui change d'un jour à l'autre, ou un passeport qui contredit la scène (enfant annoncé mais
  invisible, conjoint d'un autre logement).
- Une ville qui ralentit sur le S26 : le calcul des journées se fait une fois par jour et par immeuble, jamais par image.

## Contraintes

- Android d'abord : temps de calcul des journées et rendu mesurés sur le S26 avant livraison (les deux vues).
- Déterminisme : (ville, logement, personne, date, graine) → même journée ; pas d'état mémorisé entre deux jours, la
  veille est recalculée (profondeur 1 jour, cf. notes « Difficulté »).
- Droit du travail : `verifierDroit()` porté et joué en test vitest sur une année simulée de plusieurs immeubles.
- Rien n'apparaît / disparaît sur place ; humains naturels (entrent et sortent en marchant).
- Fable seulement pour dessiner (passeport) ; logique en Opus / Sonnet.
- Commits / PR en français, tests par familles touchées (`scene-ville`, nouvelle sous-famille si besoin).

## Ce que l'utilisateur a décidé (tel quel)

Toutes les « Règle » de `notes.md`, plus :
- RTT : contrat 39 h ⇒ 11 jours de RTT par an (pris un par un, souvent vendredi / lundi).
- Nounou = une personne, c'est son travail ; elle n'habite pas l'immeuble.
- Prénom stocké ; passeport ouvert par un **bouton** (pas par le toucher seul), avec effet d'ouverture.

## Découpage proposé (une PR par lot, dans cet ordre)

1. **Identité** — `households.ts` : `Member` gagne prénom, âge, statut, profession, contrat et traits fixes (début du
   travail, trajet, préparation, sommeil, coucher, probabilité lève-tôt, plan de congés annuel, horaires coupés, emploi du
   temps scolaire) ; lien conjoint / enfants ; drapeau nounou par foyer + identité de la nounou. Listes de prénoms français
   par génération (âge) et par sexe cohérent avec `citizenSeed` / l'apparence du pantin. Tests : stabilité, cohérence
   (âges parents / enfants, couples), répartition des statuts.
2. **Journées** — port de `modele.js` : journée de travail en services + pause/coupure, congés et RTT, logistique école
   (dépose / sortie / nounou / garderie), sorties du soir, sommeil et rattrapage, rendez-vous ; lever et coucher **par
   personne** remplaçant le décalage par foyer de `dayDraw`. Test du droit du travail sur un an.
3. **Rendu** — tenue du jour par personne (pyjama → tenue à la préparation → pyjama au coucher) portée par la figure de
   fenêtre, le trajet de porte et le portrait ; visiteurs à identité stable rattachés à un hôte présent (remplacent la
   boucle anonyme des portes, plafond mobile prioritaire, départs décalés plutôt que supprimés) ; `schedules.ts` / `home-state.ts` : blocs `lit` par pièce à partir de la présence de chacun ; trajets de porte
   par personne (`doors.ts`) dont nounou et retours de nuit ; pantins des fenêtres = membres réels. Captures + S26.
4. **Passeport** — maquette Fable du passeport (fermé / ouverture / ouvert, portrait du pantin, champs) à valider d'abord ;
   puis bouton près de la flèche (`use-outside-camera.ts`, marqueur `data-follow-marker` de `RoomView.tsx`), lien du nœud
   suivi vers (logement, membre) : figures de fenêtre (`fm.key = dwelling/membre`), habitants à la porte (`Trip` →
   membre, lien à ajouter dans `doors.ts`), nounou ; ouverture animée, fermeture.

## Réponses de l'utilisateur à la relecture (2026-10-25)

- Portes : habitants + visiteurs (1/A) ; les visiteurs viennent voir quelqu'un présent, ont une fiche d'identité, habitent
  ailleurs.
- Apparence : même apparence partout (2/A), une tenue par jour, pyjama le matin jusqu'à la préparation.

## Choix du concepteur (à vérifier par l'utilisateur)

- **Lots 2 et 3 livrés ensemble** (une seule PR) : la journée par personne n'a de sens visible qu'avec son rendu ; pas
  d'adaptateur temporaire vers l'ancien décalage par foyer.
- **Les foyers peuvent être retirés** : après la mise à jour, les habitants d'une ville changent (composition, couleurs).
  Les villes sont recalculées, pas sauvegardées ; on garde la graine, on ajoute un flux de tirage « identité » séparé.
- **États du foyer** : `away` (semaine ailleurs) ne vient plus que des congés : le foyer part si tous ses adultes sont en
  congé et que le tirage « on part » le dit (familles surtout pendant les vacances scolaires, l'été) ; sinon un congé se
  passe à la maison. `sick` devient par personne. `guests` (invités) reste par foyer. `late` (retour tardif) est remplacé
  par les fins de journée et sorties de chacun. Les scènes optionnelles (fumer, fête de coloc, arrosage…) restent, posées
  dans les trous de la journée de la personne concernée.

## Laissé au constructeur

Structure exacte des types, découpage des fichiers, tables de prénoms, répartition par âge de la population (proche de
la maquette : ~12 logements / 25 habitants par immeuble type), forme de l'animation d'ouverture (après la maquette
Fable), seuils de performance précis (mesure S26 avant / après).
