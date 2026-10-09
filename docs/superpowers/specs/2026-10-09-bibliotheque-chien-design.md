# Bibliothèque, morceaux 6b + 6e : chien, plusieurs animaux, interactions

Suite de `2026-10-09-bibliotheque-chat-design.md`. Ce document fusionne le chien (6b) et la cohabitation avec interactions (6e). Le robot (6c) et les réactions au contexte (6d) restent à part.

## Objectif

Une pièce accueille de 1 à 3 animaux (chat ou chien, n'importe quel mélange, doublons permis). Le chien a ses propres comportements. Les animaux se remarquent et jouent des scènes à deux.

## Décisions

- **Adoption** : le bouton « Adopter » propose d'abord l'espèce (chat / chien), puis le nom et le pelage de l'espèce. Grisé à 3 animaux. Renommer et Retirer par animal.
- **Pelages du chien** : brun, noir, crème, tacheté, gris, roux.
- **Ids** : `p1`, `p2`, `p3`, le premier libre.
- **Chien** : reste au sol, aucun perchoir en hauteur (étagère, bureau). Monte sur le canapé par un petit saut. Dort dans la niche, le panier, sinon sur le tapis (pose roulée). Mange et boit à la gamelle. Court, s'assoit, se gratte, halète (queue qui remue), flaire (truffe au sol). Caresse en Visiter : queue qui remue, nom en bulle.
- **Hors périmètre** : balle (objet à rouler), robot, réactions nuit/soleil/orage, simulation en arrière-plan.

## Données (l'état reste v4, migration inutile)

`Pet.species: 'cat' | 'dog'`, `pets` plafonné à 3. Les états v4 restent valides (migration inutile : l'état reste v4). `coat` reste partagé, la palette dépend de l'espèce.

`PetPlan` gagne un champ optionnel `with?: { petId: string; role: 'lead' | 'follow'; scene: SceneKind }`. Les deux plans d'une scène ont les mêmes `startedAt` et `actMs`.

## Scènes d'interaction

| Scène | Couples | Déroulé |
|---|---|---|
| `greet` | tous | face à face, le chien renifle, le chat tend le museau, ~3 s |
| `chase` | chien→chat, chien↔chien, chat↔chat | le poursuivi file, le poursuivant le rattrape, les deux jouent (pas d'inversion des rôles) |
| `shoo` | chat→chien | le chat souffle ou donne un coup de patte, le chien recule de deux cases, oreilles basses |
| `nap` | tous | à côté d'un partenaire déjà endormi au sol |
| `groom` | chat↔chat, chien↔chien | assis l'un contre l'autre, ~5 s |

Le résultat dépend du couple : chat→chien = dédain ou `shoo` ; chien→chat = curiosité puis `chase` ; même espèce = jeu et toilette.

**Règles** : une scène démarre avec une probabilité modérée quand deux animaux sont libres (jamais en continu) ; aucune scène ne dépasse ~8 s ; pas de téléportation (le partenaire ne bouge que par ses déplacements normaux) ; annulée proprement si un meuble disparaît, si le partenaire est retiré ou si l'un des deux est caressé, chacun replanifie seul.

## Architecture

- `src/core/library/pets/` (pur, horloge injectée) : `brain.ts` choisit les actions selon l'espèce (profil de poids par espèce) ; nouveau `scenes.ts` : choix du couple et de la scène, plans appariés, annulation ; `runner.ts` calcule `occupied` à partir des plans des autres animaux et fait avancer l'ensemble ; les règles de reprise valident `with` (partenaire présent, plan jumeau cohérent) sinon le plan est abandonné.
- `src/content/` : sprite du chien (poses marche, course, assis, couché roulé, truffe au sol, halètement, saut) et poses de scène (souffle, coup de patte, recul) ; z-ordre à trois via le tri existant de `RoomView`.
- Interface : deux boutons d'adoption (chat, chien) ; bulle de nom par animal.
- Fiche WikiHow `bibliotheque-v10`.

## Tests

Migration v4→v5 et plafond de 3 ; poids d'actions du chien (aucun perchoir en hauteur) ; places réservées entre animaux ; choix du couple et de la scène ; plans appariés (mêmes horodatages) ; annulation (retrait d'un meuble ou d'un partenaire, caresse) ; reprise au chargement avec scène en cours ; vérification visuelle dans Chrome au banc d'essai existant.
