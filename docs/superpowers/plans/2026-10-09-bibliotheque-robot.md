# Robot de compagnie : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ajouter le robot (3e espèce), la station de recharge, les scènes `greet`/`follow`/`shoo` avec un robot et la sieste du chat sur un robot en veille (`ride`).

**Architecture:** On étend le moteur pur `src/core/library/pets/` (profil robot dans `brain.ts`, nouveaux couples et scènes dans `scenes.ts`, poses dans `runner.ts`) ; le dessin vit dans `src/content/robot-sprite.tsx` ; l'interface ajoute un 3e bouton d'adoption. L'état reste v4.

**Spec:** `docs/superpowers/specs/2026-10-09-bibliotheque-robot-design.md` (lire en entier avant chaque tâche). S'inspirer du plan et du code du chien : `docs/superpowers/plans/2026-10-09-bibliotheque-chien.md`.

## Global Constraints

- Worktree `C:\Users\maxim\Downloads\Wikimasters-bibliotheque`, branche `feat/bibliotheque-robot` (déjà créée depuis main).
- Jamais de téléportation ; aucune simulation en arrière-plan ; plans en horodatages absolus, écrits seulement à chaque NOUVEAU plan (`onPlan`) ; aucune scène en mode `still`.
- Textes en français, glyphes plutôt que texte, tout visible à l'écran (extension ET mobile).
- Tests : `npx vitest run --maxWorkers=4 <fichier>` ; types : `npm run typecheck`. Ne pas lancer tout vitest en parallèle total (`library-drag` instable).
- TDD : écrire le test qui échoue, voir l'échec, implémenter, voir le succès, commiter.
- Commits en français, terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Ne pas casser les tests existants du chat et du chien.

## File Structure

- Modifier : `src/core/library/library-types.ts`, `library-book.ts`, `furniture-catalog.ts`, `pets/brain.ts`, `pets/scenes.ts`, `pets/runner.ts`, `src/content/pet-sprite.tsx`, `pet-sim.ts`, `RoomView.tsx`, `LibraryPanel.tsx`, `furniture-art-home.tsx`, `furniture-icons.ts`, `src/core/whats-new/entries.ts`.
- Créer : `src/content/robot-sprite.tsx`.
- Tests : `tests/core/library/library-pets.test.ts`, `furniture-catalog.test.ts`, `pets-brain.test.ts`, `pets-scenes.test.ts`, `pets-runner.test.ts`, `tests/content/pet-sprite.test.tsx`, `library-pets-ui.test.tsx`, `library-furniture-view.test.tsx`.

---

### Task 1: Types, schéma et adoption du robot
**Files:** `library-types.ts`, `library-book.ts`, test `library-pets.test.ts`.
- [ ] Tests d'abord : un robot de coloris `blue` est relu ; `{species:'robot', coat:'orange'}` et `{species:'cat', coat:'mint'}` sont écartés ; mélange chat+chien+robot permis, plafond 3 ; un plan `ride` (`with.scene === 'ride'`) survit à un aller-retour JSON ; `adoptPet(state,'r1','Robi','blue','robot')` prend l'id libre.
- [ ] Types : `Species` + `'robot'` ; `ROBOT_COATS = ['white','blue','yellow','red','graphite','mint']` ; `ALL_COATS` = union SANS doublon (`white` et `red` existent déjà chez le chat ou le chien, ne les répéter qu'une fois) ; `coatsOf('robot')` ; `PET_ACTIONS` + `'scan','standby','charge','beep'` ; `PAIR_SCENES` + `'follow','ride'` ; `STANDING_KINDS` + `'charger'`.
- [ ] Schéma de `library-book.ts` : coloris valable selon l'espèce via `coatsOf`.
- [ ] `npm run typecheck` (tout `switch` ou table exhaustive sur `Species`/`PetAction`/`Pose`/`StandingKind` doit être complété, libellés compris).
- [ ] Commit.

### Task 2: Station de recharge (meuble `charger`)
**Files:** `furniture-catalog.ts`, `furniture-art-home.tsx`, `furniture-icons.ts`, tests `furniture-catalog.test.ts`, `library-furniture-view.test.tsx`.
- [ ] Tests : `charger` est dans la catégorie `pets`, `poisOf('charger')` = un point `charge` (dx 0, dy 0), taille 2×1 couche `floor`, libellé « Station de recharge », rendu sans erreur dans la vue (ajouter un `charger` au layout du test existant).
- [ ] Implémenter en copiant le traitement de `kennel`/`bowl` (catalogue, libellé, catégorie, icône, dessin SVG : socle plat avec contacts et voyant). Si les meubles d'animaux ont une version Steampunk (`furniture-art-steampunk.tsx`), suivre la même règle, sinon dessin commun.
- [ ] Commit.

### Task 3: Cerveau du robot
**Files:** `pets/brain.ts`, test `pets-brain.test.ts`.
- [ ] Tests : avec `species:'robot'` aucun plan n'est `perch`, `sleep`, `eat`, `drink`, `groom`, `scratch`, `hide`, `pant`, `sniff` et aucun segment n'a `on !== null` ; sur un layout avec `charger` il peut choisir `charge` avec `key` `<id>:charge`, jamais si cette clé est dans `occupied` ; sans station il peut choisir `standby` sur place ; mode `still` : `sit` et `standby` seulement ; `touchPlan` d'un robot renvoie l'action `beep` (3 s) au lieu de `purr`.
- [ ] Implémenter : branche `robot` dans `nextPlan` — `stay('sit',1,[3000,6000])`, `stay('scan',1.4,[3000,5000])`, `stay('standby',0.8,[15000,30000])`, rondes vers des cases libres (`go('scan',0.8,…)` comme les `sniff` du chien), `go('charge',2,…,[25000,60000], '<id>:charge')` pour chaque `charger`, `go('standby',0.6,…)` vers un `rug` s'il existe. `ROBOT_SPEED = 0.9` via `scaleRoute` ; garde « aucun segment sur un meuble » comme pour le chien, SANS l'exception du canapé.
- [ ] Commit.

### Task 4: Scènes avec un robot (`greet`, `follow`, `shoo`)
**Files:** `pets/scenes.ts`, test `pets-scenes.test.ts`.
- [ ] Tests (rng déterministe) : `greet` entre robot et chat/chien/robot, plans au même `startedAt` et `with` croisés ; `follow` seulement chien→robot, aucun `play`, partenaire qui roule (`lag` = attente d'approche) ; `shoo` chat→robot : le robot reçoit `cower` et recule ; aucune `groom`/`chase`/`nap` avec un robot ; `SOCIABLE` accepte `scan` ; un robot en `standby`/`charge` n'est PAS abordé par `greet/follow/shoo` (réservé à `ride`).
- [ ] Implémenter : `scenesFor` gère les couples robot ; `follow` réutilise la branche `chase` sans le facteur `RUN` et avec les actions `greet`/`scan` ; `speedOf` gère le robot ; `sceneIsValid` inchangé pour ces scènes.
- [ ] Commit.

### Task 5: Scène `ride` (sieste du chat sur le robot)
**Files:** `pets/scenes.ts`, `pets/runner.ts`, `pets/depth.ts` si besoin, tests `pets-scenes.test.ts`, `pets-runner.test.ts`.
- [ ] Tests : éligibilité (robot `standby`/`charge` au sol, ≥ 10 s restantes, sans `with`) ; plan du chat = approche à pied + segment `jump` vers `at` décalé de `RIDE_LIFT` + `sleep`, `actMs` entre 18 et 30 s plafonné par la veille restante ; plan du robot = `standby` même `at`/`startedAt`, `actMs` = attente + sieste, rôle `follow`, route vide ; `sceneIsValid` : valide si le robot est là en `standby` avec `with.scene === 'ride'` croisé ; annulation si le robot est retiré, touché (son plan change), ou si le chat est touché/retiré : le chat reprend depuis le SOL à côté du robot (jamais en l'air) ; à la fin normale, le plan suivant du chat commence par un segment `jump` de descente ; reprise au rechargement en pleine sieste = plan conservé ; trame du chat pendant `ride` : `behind` identique à celui du robot et `depthY` = celui du robot + 0,1.
- [ ] Implémenter `RIDE_LIFT` (px, constante exportée, à régler avec le dessin : hauteur du dos du robot), la proposition `ride` (poids 2 quand un robot éligible existe), les annulations dans `runner.ts` (réutiliser le chemin d'abandon des scènes ; point d'atterrissage = case au sol voisine du robot), l'ordre de dessin.
- [ ] Commit.

### Task 6: Poses du runner et dessin du robot
**Files:** `pets/runner.ts` (`Pose`, `poseOf`), créer `src/content/robot-sprite.tsx`, modifier `pet-sprite.tsx`, `pet-sim.ts`, `RoomView.tsx`, test `tests/content/pet-sprite.test.tsx`.
- [ ] Tests : chaque `Pose` rend un SVG pour `species:'robot'` sans erreur, pour les 6 coloris ; `paletteOf('robot', c)` renvoie `{body, belly}` ; `poseOf` : `scan`, `standby`, `charge`, `beep`, `greet`, `cower`, `sit`, `walk` ; le chat en `sleep` pendant `ride` est rendu surélevé, sans régression des autres poses.
- [ ] Dessin (style de `dog-sprite.tsx`, `still` coupe les animations) : corps arrondi sur chenilles qui tournent en `walk`, écran-visage, antenne. Yeux : normaux, cœur (`beep`), ⚠ (`cower`), tirets (`standby`, `charge`), pupilles qui balaient (`scan`). Voyant orange qui pulse en `standby`, vert en `charge`. `ROBOT_COAT_COLORS` / `ROBOT_COAT_LABELS` (Blanc, Bleu, Jaune, Rouge, Graphite, Menthe).
- [ ] Aiguillage par espèce dans `pet-sprite.tsx`.
- [ ] Commit.

### Task 7: Interface d'adoption
**Files:** `LibraryPanel.tsx`, test `library-pets-ui.test.tsx`.
- [ ] Tests : bouton `[data-action="adopt-robot"]` visible, ouvre le formulaire (nom « Robi », 6 coloris, `aria-label` « Nom du robot à adopter »), confirmer adopte un robot du coloris choisi, grisé à 3 animaux (comme chat/chien), renommer et retirer fonctionnent, bulle de nom au toucher.
- [ ] Implémenter : `startAdopt('robot')`, `coatsOf`, libellés par espèce, glyphe du bouton, même panneau sur mobile.
- [ ] Commit.

### Task 8: Fiche WikiHow `bibliotheque-v11`
**Files:** `src/core/whats-new/entries.ts`, test existant des entrées.
- [ ] Nouvel id `bibliotheque-v11` (étapes : text + how + tip ; didactique) : à quoi sert le robot, comment l'adopter, la station de recharge, les scènes (salut, suite, chat qui souffle, chat qui dort sur le robot), limites (3 animaux max, pas de scènes en mouvement réduit, un build antérieur ne lit pas les robots).
- [ ] Les tests des entrées passent (id jamais annoncé, ordre).
- [ ] Commit.

### Task 9: Vérification et livraison
- [ ] `npm run typecheck`, `npx vitest run --maxWorkers=4` (suite entière), `npm run build`.
- [ ] Vérification visuelle dans Chrome au banc d'essai existant (`.superpowers/harness`) : adopter un robot, station, scènes, sieste du chat dessus, mouvement réduit.
- [ ] Ouvrir ET fusionner la PR vers main, puis `npm run preprod` (consignes de la mémoire projet).
