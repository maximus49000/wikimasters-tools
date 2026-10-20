# Bibliothèque, Halloween PR 2 : la nuit du 31 — Plan d'implémentation (fait)

**Goal :** le soir du 31 octobre, la rue de la scène Ville se remplit de déguisés : familles qui vont d'entrée en entrée avec
un seau à bonbons, habitants qui ouvrent, jeunes qui sonnent et s'enfuient ou font peur à un passant, adultes déguisés qui
vont à une soirée ; sous la pluie, moins de monde et des parapluies. Dans la pièce, le chien aboie à la fenêtre et le chat
sursaute quand un groupe déguisé (ou le promeneur de chien) passe dans l'axe.

**Spec :** `docs/superpowers/specs/2026-10-20-bibliotheque-halloween-design.md` §5 ; maquette `docs/superpowers/maquettes/halloween/`
(`capture.mjs nuit=1`, notes « Nuit du 31 ») ; captures du banc `banc-n31-*.png`.

## Tâches

1. **Affluence et passants déguisés** — `intensity.ts` : `FESTIVE_SHARE.halloween = 0,45`, `FESTIVE_CROWD.halloween =
   { 1,5 ; 0,45 }`, veille et lendemain soir (19 h → minuit) : part de 0,06 sans hausse d'affluence. `people.ts` : `Costume`,
   `Touch`, `Guise`, `guiseOf(p, i)` (hachage de l'id, indépendant de `u`). Tests : `city-intensity`, `city-people`.
2. **Déguisements du pantin** — `dress.ts` (`shapeOf(…, guise)`, signature `.g:<id>`, `guiseOutfit`, `GUISE_COLORS`),
   `bake.ts` (pièces : chapeau, drap du fantôme, os, capes, bandelettes, cornes, oreilles et queues, citrouille, masque,
   insigne), `ghibli-figure.tsx` (`guise`, pantin 2D, palette). Passants : `data-guise`, zombie bras tendus. Test :
   `figure/halloween-guise`.
3. **Plan de la soirée** — `city/halloween-night.ts` (pur) : groupes tirés par minute, trajets `walk | stop | run`, arrêts
   (entrées décorées, immeubles à citrouille), une scène à la fois par porte, sonnette (une bande sur six), faire peur ;
   lecture à la seconde (`groupFigures`, `doorStateAt`, `residentAt`, `scareAt`). `install.ts` : `halloweenDoorIds`. Test :
   `city/halloween-night`.
4. **Couche de la nuit** — `content/halloween-night-layer.tsx` (groupes, embrasure ouverte sur le hall, habitant, jeune tapi,
   passant qui sursaute ; mouvement réduit : groupes debout seulement) ; `city-life.tsx` : plan, minuterie du hall
   (`nightHalls`). Test : `halloween-night-layer`.
5. **Animaux (vague 1c)** — `pets/outside.ts` (`barkPlan`, `startlePlan`, `createOutsideWatch`), `runner.ts` (réaction une
   fois par passage, pas pendant l'orage ni en mouvement réduit), `context.ts` (`outside`), actions `bark` et `startle`
   (sprites du chien et du chat), `content/street-passes.ts` + `pet-context.ts` (pont rue → pièce). Test : `pets-outside`.
6. **Vérification** — `npx tsc --noEmit`, suite complète, banc `.superpowers/harness-ville` (vite, `?s=<seconde>&vb=…&k=…`,
   `cap.mjs`, `batch.sh`), captures `banc-n31-*`.

## Échecs déjà présents sur `main` (ne pas confondre)

Suite complète sur la branche : 34 échecs sur 6 888, tous présents à l'identique sur `main` (1ae04cb) dans ce conteneur :
`library-drag` (11), `library-cards` (7), `shop/shop-scene` (4), `city-life-ghibli` (2 à 3, habitants 3D, ombres),
`window-life` (2), `moving-ghibli`, `vehicle/ghibli-car`, `city-shops-life`, `install-ghibli`, `install-layer`,
`citizens/interrupteur-scene`, `item-case`, `library-scene` (1 chacun).
