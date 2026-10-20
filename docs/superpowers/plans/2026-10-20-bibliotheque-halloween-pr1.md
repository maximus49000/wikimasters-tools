# Bibliothèque, Halloween PR 1 : décors des habitants et de la mairie — Plan d'implémentation

**Goal :** du 24 octobre au 8 novembre, la rue de la scène Ville se décore pour Halloween puis se dégarnit : citrouilles aux
fenêtres et sur les balcons, sorcières, squelettes, corbeaux et araignées géantes aux balcons, toiles et fantômes aux entrées,
lanternes citrouille et chauves-souris aux lampadaires. Chaque décor est posé et retiré par quelqu'un.

**Spec :** `docs/superpowers/specs/2026-10-20-bibliotheque-halloween-design.md` ; maquette `docs/superpowers/maquettes/halloween/`.

**Architecture :**
- `city/calendar.ts` : fête `halloween` (31 octobre, 17 h à 23 h) ; `DayContext.periods` (périodes de vacances connues, pour
  savoir qui est parti les autres jours de la période).
- `city/scene-day.ts` : le tirage de l'absence d'une semaine sort de `dayDraw` (`awayInWeek`) pour être relu par le plan.
- `city/halloween.ts` (pur, nouveau) : édition, plan des décors des logements (citrouilles, balcons), jours et heures de pose
  et de retrait, état d'un décor à la minute (lu sur la scène de l'emploi du temps le jour du geste), lumières de fête.
- `city/schedules.ts` : `buildSchedule(d, day, draw, decor?)` ; le jour de pose (de retrait), une scène `decorLean` (penché à
  la fenêtre) ou `decorBalcony` (sortie au balcon) par décor, posée comme les scènes courtes (premier moment libre).
- `city/home-state.ts`, `city/window-choreo.ts` : l'acteur porte le décor (`decor`) ; poses de la scène, objet tenu avant le
  geste (pose) ou après (retrait).
- `content/use-scene-life.ts` : la vie de la scène calcule le plan et le passe aux emplois du temps (jour et veille) ;
  `SceneLife.halloween`.
- `content/window-life.tsx` / `window-life-art.tsx` : objets tenus (citrouille, sorcière, squelette, corbeau, araignée).
- `content/halloween-layer.tsx` (nouveau, Ghibli, avec la vie aux fenêtres) : décors posés des fenêtres et des balcons,
  lumières de nuit.
- `city/install.ts` + `content/install-layer.tsx` + `content/install-sprites.tsx` : décors d'entrée posés par un habitant qui
  sort de l'immeuble avec une petite échelle (transport `door`, sans véhicule), décors des lampadaires au camion-nacelle
  (`lamps-halloween`) ; `decorSetsFor` balaie de −3 à +7 jours.

**Écarts assumés par rapport à la spec (décidés à l'implémentation) :**
- Le chaudron est retiré (il n'était pas dans la liste validée ; un aller-retour à la main à deux porteurs n'a pas de sens).
- Les décors d'entrée sont posés par « un habitant » de l'immeuble qui n'est pas relié à un foyer précis : sa tenue est tirée
  de la porte, son heure du plan des entrées (`install.ts`, pur, sans la vie des logements). Il sort par la porte et y rentre.
- L'échelle d'entrée est l'échelle des drapeaux en plus courte (18 unités), appuyée contre la façade.

## Contraintes

- Français, commentaires courts au registre du code voisin ; aucun `Math.random`, aucun état.
- Mouvement réduit : décors posés dessinés à leur état, aucun geste, aucune équipe.
- Tests : `npx vitest run <fichiers> --maxWorkers=4` ; typecheck `npx tsc --noEmit`.
- Échecs déjà présents sur la branche de départ (ne pas confondre) : `tests/content/shop/shop-scene.test.tsx` (4, habitants
  3D), `tests/core/library/library-scene.test.ts` (1), `tests/content/install-ghibli.test.tsx` (1, échelle).

## Tâches

1. **Calendrier** — `halloween` dans `FestivityId` et `FESTIVITIES` ; `DayContext.periods` rempli par `useCityDay`.
   Tests : actif le 31 de 17 h à 23 h seulement.
2. **Absence de la semaine** — `awayInWeek(d, seed, week, holidayWeek, weekMonth)` exporté, `dayDraw` l'utilise (mêmes
   tirages) ; `isoWeekOf(date)` exporté. Tests existants inchangés.
3. **Plan des décors (`halloween.ts`)** — styles par façade, citrouilles (fenêtre ordinaire → appui ; balconnet → rambarde ;
   porte-fenêtre de balcon filant → rambarde depuis le balcon), décor de balcon filant (sorcière, squelette, corbeau,
   araignée), jours de pose (24 → 31) et de retrait (1 → 8), glissés au premier jour de présence, heures de tendance ;
   `decorTasks(plan, dwellingId, date)` ; `decorShown(item, date, minute, schedule)` ; `decorLit(item, date, minute,
   daylight)`. Tests : déterminisme, autre année autre plan, part des fenêtres, jours, absence, état, lumières.
4. **Scènes de pose** — `Choreo` gagne `decorLean`, `decorBalcony` ; segment `act` gagne `decor` ; `buildSchedule` reçoit les
   tâches du jour ; `homeState` et `windowPose` (objet tenu, entrée et sortie, mouvement réduit). Tests.
5. **Vie de la scène** — `buildSceneLife` calcule le plan et passe les tâches (jour et veille) ; `SceneLife.halloween`.
6. **Objets tenus** — `HandProp` gagne les décors ; `HeldProp` les dessine ; `window-life` les monte (dehors).
7. **Calque des décors** (`halloween-layer.tsx`) — citrouilles (appui, rambarde), sorcière (garde-corps redessiné devant),
   squelette, corbeau, araignée ; voile de nuit, lueur des citrouilles et yeux de l'araignée allumés. Branché dans
   `city-life.tsx` après la vie aux fenêtres. Tests jsdom.
8. **Entrées et lampadaires** — `install.ts` : jeux `halloween-door-*` (transport `door`, échelle, `door-web` /
   `door-ghost`) et `lamps-halloween` (`lamp-pumpkin` / `lamp-bats`, pose −7 j, retrait +3 j), balayage −3…+7 ;
   `install-layer.tsx` : équipe `door` (sortie par la porte, fondu au seuil, petite échelle, tenue d'habitant), décors et objets
   tenus ; `install-sprites.tsx` : sprites. Tests moteur et jsdom.
9. **Vérification** — typecheck, tests touchés, suite complète, captures au banc si disponible.
