# Bibliothèque, morceau 6a : socle animal et chat

Suite de `2026-10-08-bibliotheque-design.md` (section « Morceau 6 »). Le morceau 6 est coupé en 6a (ce document : moteur d'animal + chat), 6b (chien), 6c (robot), 6d (réactions au contexte : nuit, soleil, fenêtre, orage — l'orage dépend du 5b), 6e (cohabitation et interactions à deux).

## Objectif

Un chat vit dans une pièce : il marche, saute, dort, mange, se toilette. Il se range selon les meubles posés. Le joueur l'adopte (nom + pelage), le caresse en mode Visiter, le renomme ou le retire en mode Aménager.

## Décisions

- **Adoption** : bouton dédié « Adopter » (pas dans le catalogue de meubles). Choix du nom et du pelage (roux, noir, gris, blanc, tigré, bicolore). Un seul chat par pièce.
- **Toucher** (Visiter) : le chat s'étire, ronronne (petits cœurs), son nom s'affiche dans une bulle. Pas de jauge.
- **Comportements 6a** : marcher, s'asseoir, toilette, s'étirer, bâiller ; dormir (panier, niche, canapé, sinon sol/tapis) ; manger/boire (gamelle) ; monter sur canapé/fauteuil/chaise par un saut en arc, griffer le fauteuil ; grimper sur l'étagère ou le bureau ; se cacher sous le canapé. Choix par tirage pondéré selon les meubles présents (les points d'intérêt `poisOf` existent déjà).
- **Déplacements** : continus (marche à vitesse constante, saut en arc de parabole), jamais de téléportation. Un meuble retiré ou déplacé replanifie le chat.
- **Places réservées** dès 6a : un point d'intérêt n'a qu'un occupant (prépare 6e).

## Mémorisation (état v3 → v4)

`Room.pets: Pet[]`. Un `Pet` mémorise : `id`, `species: 'cat'`, `name`, `coat`, et un `snapshot` :

- l'action en cours (type + éventuel point d'intérêt visé) ;
- sa fin : `endsAt` (horodatage) ;
- le trajet en cours s'il y en a un : point de départ, destination, `startedAt`, durée (la **position théorique** se déduit de ces champs).

**Règle au chargement** (aucune simulation en arrière-plan, un seul calcul instantané) :

1. `now < endsAt` : le chat reprend l'action là où elle en est (trajet : position interpolée entre départ et destination selon le temps écoulé ; action sur place : à sa place, avec le temps restant).
2. `now ≥ endsAt` : l'action est finie ; le chat est à sa destination et une **nouvelle action** est tirée.
3. Snapshot absent, invalide ou visant un meuble disparu : le chat repart d'un point libre du sol.

**Écritures** : à chaque NOUVEAU plan (changement d'action, caresse, replanification), via `updateQuiet` (aucun abonné prévenu, donc aucun rendu superflu). Le plan contient des horodatages absolus : sa position à tout instant se déduit sans rien réécrire, donc rien à écrire quand la page se cache ou se ferme. Jamais à chaque image. Migration v3 → v4 : `pets: []` partout.

## Architecture

- `src/core/library/pets/` (pur, horloge injectée, testable sans interface) : carte de marche (sol libre + plateformes avec hauteur), planification de trajet (marche, saut), choix pondéré d'action, réservation des places, (dé)sérialisation du snapshot, reprise à l'instant `now`.
- `src/content/` : `PetSprite` SVG (chat de profil, poses marche/assis/couché/étiré/saut/toilette, 6 palettes), boucle `requestAnimationFrame` (pause onglet caché, coupée en mouvement réduit : le chat reste assis ou endormi), z-ordre selon la ligne du sol.
- Interface : bouton « Adopter » + réglages Renommer/Retirer en Aménager ; toucher en Visiter.
- Fiche WikiHow `bibliotheque-v9`.

## Tests

vitest : carte de marche, trajet et saut, réservation des places, replanification après retrait d'un meuble, reprise au chargement (action en cours / action finie / snapshot invalide), migration v3→v4. Vérification visuelle dans Chrome au banc d'essai existant.

## Hors périmètre

Chien, robot, interactions entre compagnons, réactions à la nuit/soleil/orage, comportements aux meubles exclusifs du Steampunk, simulation en arrière-plan.
