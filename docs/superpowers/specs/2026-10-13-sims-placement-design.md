# Ma Pièce : interrupteur en plein écran, habillage Sims et mode placement — design

Date : 2026-10-13 · Branche : `feat/sims-placement` · Vise d'abord Android, puis l'extension.
Maquette validée : `docs/superpowers/maquettes/sims-plein-ecran/tiroir-sims.html` (écrans ① à ⑦). Suite de la spec `2026-10-13-amenager-facon-sims-design.md` (PR #293).

## Pourquoi

1. En plein écran, on ne peut pas passer de Visiter à Aménager : les boutons sont dans la barre du haut, qui n'est pas dans la scène plein écran. Il n'y a que la porte et le bouton pour quitter le plein écran.
2. Le tiroir de construction reprend l'organisation du mode Achat des Sims 4, mais pas son allure : il a l'habillage sombre générique du panneau.
3. Toucher une vignette puis une case pose le meuble aussitôt, sans aperçu. On veut un vrai mode placement, comme dans les Sims : on voit l'objet en transparence, on l'ajuste, puis on valide ou on annule.

**Critères de réussite**
- En plein écran, un seul appui fait passer de Visiter à Aménager, et inversement.
- Le tiroir, la poignée, la bulle et la barre de placement ressemblent à la maquette.
- Rien n'est enregistré avant ✓. ✗ remet tout comme avant.
- Tout ce qu'on pouvait poser ou déplacer avant reste possible : meubles, fenêtres, ordinateur, petits objets et cartes (mur, étagère, écran).

## Ce qui a été décidé (avec l'utilisateur)

- **Interrupteur 👁 | ✏️** en forme de pilule, en plein écran seulement, en haut à droite à côté du bouton pour quitter le plein écran. La moitié active est bleue.
- **Habillage Sims partout**, en plein écran comme hors plein écran.
- **Mode placement.** Toucher une vignette fait disparaître le tiroir. L'objet apparaît en fantôme, que l'on glisse ou que l'on place en touchant une case. Une barre rattachée à l'objet porte ses boutons propres, puis ✗ rouge (annuler) et ✓ vert (valider).
- **« Déplacer »** sur un objet déjà posé ouvre le même mode placement. ✗ remet l'objet à sa place.

## 1. Interrupteur Visiter / Aménager en plein écran

- Il se trouve dans `wmt-lib-stage`, en `position:absolute`, en haut à droite (`right: 56px`), à côté de `FullscreenButton` (`right: 8`). Il n'est rendu que si `stage.active`.
- Il contient deux moitiés, chacune avec `data-action="visit"` ou `data-action="edit"`, `aria-pressed` et une icône (`ICONS.eye`, `ICONS.pencil`). Elles appellent le même `setMode2` que la barre du haut.
- Les `data-action` sont déjà portés par les boutons de la barre du haut. Pour distinguer les deux, l'interrupteur est enveloppé dans `[data-mode-switch]`, et les tests le visent par ce sélecteur.
- En Aménager, la porte reste masquée, comme aujourd'hui (`!editing`).
- Si un placement est en cours, passer en 👁 l'annule (voir le ✗ de la partie 3).
- Hors plein écran, rien ne change : la barre du haut garde ses deux boutons.

## 2. Habillage Sims

Ce sont uniquement des changements de CSS (le bloc `CSS` de `LibraryPanel.tsx` et les classes déjà posées), plus de nouvelles variables :

- `--sims-panel: rgba(250,252,255,.94)`, `--sims-line: #a9c6e8`, `--sims-blue: #2f7fd6`, `--sims-blue-dark: #1d5aa3`, `--sims-tile-top: #fff`, `--sims-tile-bot: #dce8f6`, `--sims-green: #4cc23a`, `--sims-red: #d23b2f`, `--sims-text: #2b3f5c`.
- **Onglets du tiroir** : une pilule blanche cerclée de bleu clair. L'onglet actif est rempli en dégradé bleu, avec un libellé visible (Meubles, Cartes, Pièce) à côté du glyphe.
- **Corps du tiroir** : un panneau blanc-bleu arrondi. Les catégories sont en **colonne à gauche** (carrés de 40 px, l'active en bleu plein) et le libellé de la catégorie est affiché au-dessus des vignettes.
- **Sous-catégories** : de petites pastilles bleu pâle, la choisie en blanc cerclée de bleu.
- **Vignettes** : une grille de 2 rangées qui défile à l'horizontale (`grid-auto-flow: column`), en dégradé blanc vers bleu pâle, avec un liseré bleu clair.
- **Poignée réduite** : une languette blanche cerclée de bleu clair, avec un chevron bleu.
- **Bulle d'actions** : une carte blanche avec une pointe vers l'objet (pseudo-élément, sa position est calculée par `action-bubble`).
- **Boutons ronds du plein écran** (porte, quitter, interrupteur) : fond `--sims-panel`, liseré bleu clair, icône bleue. `DOOR_BUTTON` et `FullscreenButton` reçoivent cet habillage uniquement dans Ma Pièce : `FullscreenButton` prend une prop optionnelle `variant`, et ses autres usages ne changent pas.
- **En paysage** (`stage.active` et largeur plus grande que la hauteur) : le tiroir est calé en bas à droite (`width: min(470px, 70%)`), sur une seule rangée de vignettes, et les catégories forment un carré 2×2.
- **Police** : `ui-rounded, 'Nunito', 'Varela Round', system-ui, sans-serif`, en graisse 700 à 800. On n'embarque aucune police : sur Android, c'est la police système qui s'affiche en gras. Embarquer Nunito demanderait une déclaration `@font-face` hors du shadow DOM et des ressources accessibles ; ce n'est pas fait ici.

Les panneaux restent clairs aussi en thème sombre, comme dans les Sims.

## 3. Mode placement

### Ce que voit l'utilisateur

1. **Entrée dans le mode** : on peut y entrer de plusieurs façons.
   - En touchant une vignette du tiroir (meuble, fenêtre, ordinateur, petit objet).
   - En choisissant une carte dans `CardPickerDialog` (onglet 🖼️).
   - Avec « Déplacer » dans la bulle d'un objet posé.
   - Par un appui long sur un objet posé : on glisse aussitôt l'objet, et quand on le lâche il reste en placement au lieu d'être posé.
2. **Pendant le placement** :
   - Le tiroir et la bulle sont masqués.
   - L'objet est dessiné à sa position candidate, à 80 % d'opacité, avec un halo et son empreinte en vert si l'emplacement est valide, en rouge sinon.
   - Le texte d'aide est affiché en haut, en pastille : « Glissez … ou touchez une case », ou la raison du refus.
   - Les autres objets ne réagissent pas au toucher, sauf pour viser un porteur.
3. **Ajuster la position** :
   - Glisser l'objet ou sa poignée ✥ le fait suivre le doigt, avec le défilement automatique aux bords qui existe déjà.
   - Toucher une case, un bureau, une étagère ou un ordinateur y amène l'objet, selon son type.
4. **Barre de placement**, au-dessus de l'objet (elle passe en dessous si la place manque, et elle est bornée à la zone visible, comme `ActionBubble`) :
   - Meuble debout, sauf le tapis : Avancer et Reculer.
   - Lampe ou petite lampe : 💡 Allumer ou Éteindre.
   - Fenêtre : les 6 boutons de taille.
   - Puis, après un séparateur : **✗** (`data-action="place-cancel"`) et **✓** (`data-action="place-confirm"`, désactivé si l'emplacement est refusé).
5. **✓** enregistre l'objet en une seule écriture, puis on revient en Aménager avec le tiroir tel qu'il était. Après un « Déplacer », l'objet reste sélectionné.
6. **✗**, Échap, l'interrupteur 👁, un changement de pièce ou la sortie dans la rue abandonnent le placement sans rien enregistrer.

**Première position** : c'est la place valide la plus proche du centre de la partie visible de la pièce. On parcourt les cases en partant du centre (ou les porteurs, du plus proche au plus loin). S'il n'y a aucune place, le fantôme apparaît au centre en rouge, avec le message de refus.

### Comment c'est construit

**Module pur : `src/content/placement.ts` (nouveau), testé seul.** Il se place à côté de `furniture-drag.ts`, dont il réutilise `dropTargetFor`, et de `CardPickerDialog` (`CardChoice`). Les deux sont dans `src/content`, et le cœur ne doit pas en dépendre.

```ts
export const DRAFT_ID = '__draft__';
export type Subject =
  | { type: 'new'; kind: FurnitureKind }          // vignette du tiroir
  | { type: 'card'; choice: CardChoice }          // carte choisie : mur, étagère ou écran
  | { type: 'move'; id: string };                 // objet déjà posé
export type Placement = { subject: Subject; draft: Layout; id: string; target: DropTarget };

// Brouillon de départ : la disposition + l'objet (virtuel pour new/card) à la première place, ou au centre en refus.
export function startPlacement(layout: Layout, cols: number, subject: Subject, center: { col: number; row: number }): Placement;
// Déplace l'objet du brouillon vers (col, row, x, y) — la même visée que `dropTargetFor`.
export function movePlacement(p: Placement, layout: Layout, cols: number, col: number, row: number, x?: number, y?: number): Placement;
// Applique une retouche au brouillon (profondeur, lampe, taille de fenêtre) ; null si elle est impossible.
export function editPlacement(p: Placement, cols: number, edit: (draft: Layout, id: string) => Layout | null): Placement | null;
// Disposition finale à enregistrer (l'id virtuel remplacé par `nextFurnitureId`), ou null si la cible est refusée.
export function commitPlacement(p: Placement): Layout | null;
```

- Le **brouillon** est la disposition dans laquelle l'objet est posé de force à la position candidate. Pour cela, on ajoute une fonction pure `withItemAt(layout, id, target)` qui écrit `col`/`row`, `deskId`, `hostId` ou `shelfId`/`slot` sans faire de vérification.
- La **validité** de la position est toujours calculée par `dropTargetFor` (déjà existant), sur la disposition sans l'objet. Les raisons de refus et les messages (`REASONS`) restent donc les mêmes.
- **Le commit** passe par les fonctions de pose existantes, appliquées à la disposition sans l'objet :
  - pour `new` : `placeStanding`, `placeWindow`, `placeComputer`, `placeSmall` ;
  - pour `card` : `hang`, `storeCard`, `setScreenCard` ;
  - pour `move` : celles de `dropLifted`.
  
  On y ajoute ensuite les retouches faites pendant le placement (profondeur, lampe, taille). Le moteur de pose reste donc la seule autorité.
- **Le contenu d'une carte** (slug, forme, couleur) vient de `CardChoice`, comme dans `placeWall` et `placeOnFurniture` aujourd'hui.

**Interface**
- `LibraryPanel` remplace l'état `tool` et `pending` par `placement: Placement | null`. Il garde `selectedId` pour la bulle.
  - `startNew`, `chooseCard` et `startMove` appellent `startPlacement`.
  - `onCell` et `onPick` appellent `movePlacement` pendant un placement.
  - Le glissé (`drag`) réutilise `locate`, mais le lâcher appelle `movePlacement` au lieu de `dropLifted`.
- `RoomView` reçoit `room` avec `layout = placement.draft` et une nouvelle prop `placing: { id; ok; ghost; ghostPx } | null`. L'objet `placing.id` est dessiné à 80 % d'opacité, avec un halo, et son empreinte (`ghost` / `ghostPx`) est tracée en vert ou en rouge. On réutilise le tracé du contour fantôme existant (`DragView`).
- **Nouveau `src/content/placement-bar.tsx`** : la barre, positionnée comme `ActionBubble` (on extrait de `action-bubble.tsx` le calcul de position, partagé par les deux).
- Le tiroir n'est pas démonté pendant un placement, il est seulement caché (`hidden`). Son état (`DrawerState`) est conservé.

### Cas limites
- **Pièce agrandie ou réduite pendant un placement** : impossible, puisque le tiroir (onglet Pièce) est caché.
- **Style changé** : impossible pendant un placement, pour la même raison.
- **Petit objet ou ordinateur sans porteur libre** : on ne refuse plus dès le départ (« Il faut d'abord un bureau… »). Le fantôme apparaît au centre en rouge, avec ce même message. ✓ reste grisé.
- **Objet Steampunk dans une pièce qui n'est pas Steampunk** : c'est impossible, la catégorie n'est pas proposée (la garde de `onCell` est conservée dans `commitPlacement`).
- **Animaux** : la simulation lit la disposition enregistrée et non le brouillon. Ils ne réagissent donc pas au fantôme.
- **Extension (bureau)** : le comportement est le même. La souris glisse l'objet comme le doigt.

## Ce qui disparaît

- La pose immédiate au toucher d'une case.
- La sélection d'une vignette « pressée » (`aria-pressed`) : toucher une vignette lance désormais le placement.
- Le lâcher qui pose aussitôt après un appui long : il mène désormais au placement.
- Les messages « Touchez une case… » de `startNew` et `chooseCard` sont remplacés par la pastille d'aide.

## Tests

On ne joue que les familles touchées (famille bibliothèque, `npm run test:famille -- …`).

- **Module pur, `tests/content/placement.test.ts`** :
  - première place au plus près du centre, et au centre en refus quand il n'y a aucune place ;
  - `movePlacement` donne les mêmes raisons que `dropTargetFor` ;
  - `commitPlacement` donne exactement la même disposition que les anciennes fonctions de pose, pour chaque type (meuble, fenêtre, ordinateur, petit objet, carte au mur, carte sur une étagère, carte à l'écran, déplacement) ;
  - les retouches du brouillon (profondeur, lampe, taille de fenêtre) sont conservées au commit ;
  - un brouillon refusé donne `null` au commit.
- **Interface** :
  - l'interrupteur `[data-mode-switch]` n'existe qu'en plein écran et fait basculer le mode ;
  - une vignette ouvre le placement (tiroir caché, barre visible, rien d'enregistré) ;
  - ✓ enregistre puis le tiroir revient ;
  - ✗ et Échap n'enregistrent rien ;
  - ✓ est désactivé sur un refus ;
  - « Déplacer » suivi de ✗ laisse l'objet en place ;
  - l'appui long suivi du lâcher laisse en placement.
- **Tests existants à adapter** : `library-furniture`, `library-drag`, `library-cards`, `library-light-ui`, `library-panel`. Ceux qui posaient un objet par « vignette puis case » ajoutent un clic sur ✓.
- **Capture de validation** sur le vrai téléphone (S26 Ultra, APK pré-prod), puis sur l'extension.

## Guide WikiHow

On ajoute une nouvelle entrée `bibliotheque-v28`, « Placer un meuble comme dans les Sims ». Elle explique, en étapes (texte, comment faire, astuce) :
- l'interrupteur en plein écran ;
- le mode placement (fantôme, vert ou rouge, glisser ou toucher) ;
- les boutons propres à chaque objet ;
- ✓ et ✗ ;
- le fait que « Déplacer » et l'appui long passent par le même mode.

## Hors périmètre

- La rotation des objets : le moteur ne la gère pas.
- Une police embarquée.
- Une recherche dans le tiroir.
- Le prix des objets.
