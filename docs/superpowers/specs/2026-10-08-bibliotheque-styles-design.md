# Bibliothèque — morceau 4 : styles et décor

Complète `2026-10-08-bibliotheque-design.md` (vision en 7 morceaux). Validé en discussion le 2026-10-08. Livré en **une seule PR**.

## Objectif

1. Livrer les 7 styles manquants (Moderne, Industriel, Bohème, Rétro 70s, Japandi, Néon gaming, Steampunk) en plus de Scandinave, avec un sélecteur par pièce.
2. Donner à chaque style un décor propre (tapisserie, sol, plinthe).
3. Steampunk : décor animé du mur, meubles redessinés et 3 meubles exclusifs.

## Mécanisme de style

- **Sélecteur de style** dans la barre de la pièce, visible en mode Aménager : une pastille par style (mini-palette + nom), appliquée à la pièce active. Une nouvelle pièce garde le style de la précédente (déjà le cas dans `createRoom`).
- `styles.ts` : une `Palette` complète par style (mêmes clés que Scandinave) et un descripteur de **décor** par style : motif de tapisserie, motif de sol, plinthe. `paletteOf` ne retombe plus sur Scandinave pour un style connu.
- Motifs (SVG `<pattern>`, aucune image externe) : Scandinave uni, Moderne uni + bandeau, Industriel briques / béton, Bohème motif végétal / lattes, Rétro 70s bandes verticales / damier, Japandi lattes fines / tatami, Néon gaming uni sombre / dalles, Steampunk bandeaux de laiton / plaques rivetées.
- **Néon gaming** : liseré lumineux autour de chaque meuble (contour de la couleur néon + halo SVG léger).
- Les meubles existants gardent leur forme dans les styles non-Steampunk ; seules les couleurs de la palette changent.

## Steampunk

- **Décor automatique** (pas des objets posables) : mur vert sombre à bandeaux de laiton, tuyaux de cuivre au plafond et le long du mur, vannes qui laissent échapper de la vapeur, sol en plaques rivetées, engrenages qui tournent, manomètre à aiguille, horloge à l'heure réelle. Animations en CSS/SMIL (pas de boucle JavaScript), mises en pause quand la vue est cachée ; `prefers-reduced-motion` les coupe.
- **Redessinés** en Steampunk : ordinateur (machine analytique : écran à tube dans un coffre de cuivre, cadrans, clavier à touches rondes), bureau (établi de laiton), fauteuil (club en cuir), lampe sur pied (lampe à gaz qui vacille).
- **3 meubles exclusifs** : `globe` (globe terrestre mécanique), `telescope`, `automaton` (automate de bureau). Proposés dans le catalogue seulement quand la pièce est Steampunk, dans une catégorie « Steampunk ». Points d'intérêt définis pour le morceau 6 (aucun animal ici).
- **Sortie du style** : changer une pièce Steampunk vers un autre style demande confirmation si elle contient un des 3 meubles exclusifs ; confirmer les retire.
- Hors périmètre (morceau des boosters) : tube pneumatique, coffret de laiton.

## Données

- `Room.style` existe déjà ; `setRoomStyle(state, roomId, style)` s'ajoute dans `library-book.ts`. Pas de changement de version de l'état.
- `STANDING_KINDS` gagne `globe`, `telescope`, `automaton` ; le schéma zod les accepte.
- `furniture-catalog.ts` : `stylesOf(kind)` (liste de styles où le meuble est proposé ; absent = tous) et filtrage des catégories par style ; `CATEGORIES` gagne « Steampunk ».

## Cas limites

- Pièce dont le style est inconnu ou corrompu : Scandinave (comportement existant du schéma).
- Les cartes (affiches, étagères, écrans) gardent leurs couleurs propres ; seul le cadre suit la palette.
- Thème sombre du site : la pièce garde son style, seuls les contrôles suivent.

## Tests (Vitest)

- Palettes : les 8 styles ont toutes les clés, et `paletteOf` renvoie la palette propre.
- Catalogue : les meubles exclusifs sont filtrés hors de Steampunk, présents dedans ; chaque nouveau meuble tient dans la grille.
- `setRoomStyle` ; quitter Steampunk retire les exclusifs (état pur), et le panneau demande confirmation.
- Panneau : le sélecteur change le style de la pièce active.

## Livraison

Fiche WikiHow `bibliotheque-v6` et annonce « Quoi de neuf » dans la même PR ; PR, fusion, `npm run preprod`.
