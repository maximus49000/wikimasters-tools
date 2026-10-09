# Bibliothèque, morceau 6c : le robot de compagnie

Suite de `2026-10-09-bibliotheque-chien-design.md`. Le robot est le troisième type d'animal ; il réutilise le moteur pur `src/core/library/pets/` (plans en horodatages absolus, scènes à deux plans jumeaux). Les réactions au contexte (6d) restent à part.

## Objectif

Une pièce accueille jusqu'à 3 animaux, mélange libre de chats, chiens et robots. Le robot roule, scanne, se met en veille ou en recharge, et joue de petites scènes avec les autres. Un chat peut faire la sieste sur un robot en veille.

## Décisions

- **Espèce** : `Species = 'cat' | 'dog' | 'robot'`. Bouton « Adopter un robot » (`data-action="adopt-robot"`), nom par défaut « Robi ». Coloris (au lieu de pelages) : blanc, bleu, jaune, rouge, graphite, menthe. L'état reste v4, sans migration (un build antérieur ne lit pas les robots).
- **Dessin** : corps arrondi sur chenilles, écran-visage à yeux LED, antenne. Poses : rouler (chenilles qui tournent), à l'arrêt (`sit`), scan (`scan` : tête qui pivote, antenne qui oscille), veille (`standby` : yeux en tirets, voyant lent), recharge (`charge` : voyant vert qui pulse), bip (`beep` : yeux en cœur), salut (`greet` : antenne levée), recul (`cower` : yeux ⚠, marche arrière). Les émotions passent par les yeux.
- **Comportements** : reste au sol (aucun saut, ni canapé ni perchoir). Rondes vers des cases libres, scan, veille sur place ou sur le tapis, recharge sur la station. Ni gamelle ni sommeil. Caresse en Visiter : bip, yeux en cœur, nom en bulle.
- **Station de recharge** : nouveau meuble debout au sol, id de catégorie Animaux, kind `charger` (2×1, point `charge`). Place réservée `<id>:charge`. Ajouter un kind rend un état non lisible par un build antérieur (z.enum), comme le globe du morceau 4.
- **Plafond** : 3 animaux par pièce, commun à toutes les espèces.

## Scènes à deux

| Scène | Couples (meneur → partenaire) | Déroulé |
|---|---|---|
| `greet` | tout couple impliquant un robot | face à face, ~3 s ; le robot lève l'antenne, le chien renifle, le chat tend le museau |
| `follow` | chien → robot | le chien suit le robot qui roule quelques cases (même mécanique que `chase`, sans accélération, sans jeu) |
| `shoo` | chat → robot | le chat souffle, le robot recule de deux cases (`cower`) |
| `ride` | chat → robot en `standby` ou `charge` | le chat saute sur le dos du robot et y dort ; ~20 à 40 s ; le robot reste en veille |

Pas de toilette ni de poursuite avec un robot. Règles communes inchangées : ≤ 8 s d'action (sauf `ride`, comme `nap`), annulation propre, aucune scène en mouvement réduit, jamais de téléportation.

### `ride` en détail

- Éligibilité du porteur : plan `standby` ou `charge`, au sol, sans scène en cours, reste ≥ 10 s.
- Le chat marche jusqu'à une case contiguë au robot, puis un segment `jump` le pose sur son dos (`RIDE_LIFT` px au-dessus des pieds du robot), puis `sleep` pendant `actMs`. Le plan du chat porte `with: { petId, role: 'lead', scene: 'ride' }`.
- Plan jumeau du robot : `standby` (même `at`, même `startedAt`, `actMs` = attente d'approche + sieste), `with` rôle `follow`. Verrouillé : il ne roule pas tant que le chat est dessus.
- Dessin : le chat est tracé juste devant le robot (`depthY` du robot + 0,1), pose de sommeil à la hauteur du dos.
- Fin : le chat saute à terre à côté du robot (un segment `jump` est ajouté au début du plan suivant) puis le robot sort de veille.
- Annulation (robot touché, robot retiré, chat touché ou retiré, meubles changés) : le chat saute à terre, le robot bipe s'il a été touché. Reprise au rechargement : si la sieste dure encore, elle continue interpolée.
- Limite acceptée : à la reprise après changement de meubles, le chat est reposé sur une case libre voisine sans saut visible.

## Architecture

- `library-types.ts` : `Species` + `robot`, `ROBOT_COATS`, `ALL_COATS`, `coatsOf`, `PET_ACTIONS` + `scan standby charge beep`, `PAIR_SCENES` + `follow ride`, `STANDING_KINDS` + `charger`.
- `library-book.ts` : schéma espèce/coloris, plafond inchangé.
- `furniture-catalog.ts`, `furniture-art-home.tsx`, `furniture-icons.ts` : la station `charger` (nom « Station de recharge »).
- `pets/brain.ts` : profil robot (poids, vitesse `ROBOT_SPEED`, jamais d'`on !== null`), `touchPlan` renvoie `beep` pour un robot.
- `pets/scenes.ts` : couples robot, scènes `follow` et `ride`, validité des plans jumeaux de `ride`.
- `pets/runner.ts` : `Pose` + poses robot, saut de descente après `ride`, ordre de dessin du chat sur le robot.
- `src/content/robot-sprite.tsx` (nouveau), `pet-sprite.tsx` (aiguillage, `paletteOf`), pose de sommeil du chat surélevée.
- `LibraryPanel.tsx` : troisième bouton d'adoption, coloris du robot, aria-labels par espèce.
- `src/core/whats-new/entries.ts` : fiche `bibliotheque-v11`.

## Tests

Schéma (robot, coloris refusé d'une autre espèce, plafond 3, plan de `ride`) ; poids du robot (aucun perchoir, jamais sur un meuble) ; station comme place réservée ; couples de scènes ; plans appariés `ride` (mêmes horodatages, robot verrouillé) ; annulation dans les cinq cas ; reprise au chargement avec sieste en cours ; dessin (poses, coloris, ordre devant/derrière) ; interface (adoption, coloris) ; vérification visuelle dans Chrome au banc d'essai.

## Hors périmètre

Réactions au contexte (6d), balle, accessoires, inversion des rôles, robot qui dort sur un meuble.
