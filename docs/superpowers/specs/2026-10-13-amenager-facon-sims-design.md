# Aménager Ma Pièce façon Sims — design

Date : 2026-10-13 · Branche : `feat/amenager-sims` · Vise d'abord Android, puis l'extension.

## Pourquoi

En mode « Aménager », `LibraryPanel.tsx` empile 5 à 6 rangées de glyphes au-dessus de la pièce : style, ciel et heure, météo, animaux, catégories de meubles, meubles avec les actions sur la sélection et les dimensions. Sur téléphone, la pièce est repoussée sous ces rangées et il est difficile de s'y retrouver. On veut une interface de construction inspirée du mode Achat des Sims 4 : la pièce prend tout l'écran, avec un tiroir en bas organisé en onglets, catégories, sous-catégories et vignettes.

**Critères de réussite**
- En mode Aménager sur téléphone en portrait, la pièce reste visible au moins à 65 % de la hauteur quand le tiroir est ouvert.
- Tout ce qu'on pouvait faire avant reste possible, et rien n'est perdu.
- Chaque objet est présenté par son vrai dessin en vignette.

## Ce qui a été décidé (avec l'utilisateur)

1. **Tiroir en bas** (option A), visible aussi en plein écran, et réductible à une simple poignée pour contempler la scène.
2. **Le tiroir ne sert qu'à la construction.** Le ciel, la scène, l'heure, la météo, les animaux et les réglages de la pièce n'y sont pas : ils passent dans la barre du haut.
3. **Une bulle d'actions sur l'objet sélectionné**, comme dans les Sims, à la place des boutons en rangée.

## Disposition

### Barre du haut (toujours visible, en Visiter comme en Aménager)

- Onglets des pièces, comme aujourd'hui (avec ★ pour la pièce d'accueil), et ＋ pour ajouter une pièce.
- 👁 Visiter / ✏️ Aménager, puis ⛶ plein écran.
- ☁️ **Ciel et météo**, qui ouvre un menu déroulant avec :
  - la scène et le ciel (`SCENE_IDS`) ;
  - l'heure (réelle, jour, nuit, manuelle avec un curseur) et le lever et coucher du soleil ;
  - le bouton 💡 Lumière, si la scène a une météo ;
  - la zone des vacances, si la scène est Ville ;
  - la météo (aléatoire, réelle ou forcée), avec le libellé, la température et la mention « simulée ».
- 🐾 **Animaux**, qui ouvre un menu déroulant : liste des animaux (renommer, retirer) et adoption (chat, chien, robot, puis le nom et le pelage).
- ⋯ **Réglages de la pièce**, qui ouvre un menu déroulant : nom, pièce d'accueil ★, supprimer ou vider.

Les menus déroulants se ferment quand on touche à côté ou quand on appuie sur Échap. Un seul est ouvert à la fois. Leur contenu reprend exactement les contrôles actuels, avec les mêmes attributs `data-*`.

### Tiroir de construction (mode Aménager seulement)

Le tiroir est ancré en bas du `wmt-lib-stage`. Il se compose de quatre lignes :

1. **Les onglets** : 🪑 Meubles · 🖼️ Cartes · 🧱 Pièce, et ▾ pour réduire le tiroir.
2. **Les catégories**, en pastilles avec glyphe et libellé.
3. **Les sous-catégories**, en pastilles plus petites. Cette ligne n'existe que si la catégorie en a.
4. **Les vignettes**, qui défilent à l'horizontale.

Arborescence :

- 🪑 **Meubles**
  - 🗄️ Rangement : étagère, bureau, ordinateur
  - 🛋 Assises : chaise, canapé, fauteuil
  - 🌿 Déco, avec les sous-catégories Plantes (plante, petite plante) · Lumières (lampe, petite lampe) · Sol (tapis, table basse) · Murs (fenêtre)
  - 🦴 Pour animaux : panier, gamelle, niche, station de recharge
  - ⚙️ Steampunk : globe, télescope, automate. Cette catégorie n'apparaît que dans une pièce Steampunk (`categoriesFor`).
- 🖼️ **Cartes** : le bouton « Ajouter une carte » (le flux `startCard` existant, avec `CardPickerDialog`). Cet onglet n'existe que si la Collection est disponible (`collection`).
- 🧱 **Pièce**
  - Style : les pastilles de couleur (`STYLE_IDS`, `chooseStyle`, avec la confirmation Steampunk inchangée)
  - Dimensions : agrandir ou réduire à gauche et à droite, pièce horizontale ou verticale

**Réduction maximale** : ▾ réduit le tiroir à une petite poignée ▴ (environ 32 px), posée sur le bord bas de la scène, pour contempler toute la scène depuis l'intérieur de la pièce. Toucher la poignée rouvre le tiroir tel qu'il était. Le tiroir mémorise l'onglet, la catégorie, la sous-catégorie et son état ouvert ou réduit pour la session, en état React comme `shownCategory` aujourd'hui. Rien n'est enregistré dans le stockage.

**Plein écran** : le tiroir (et la bulle d'actions) restent visibles en plein écran (`stage.active`), ancrés en bas de la scène plein écran, avec la même réduction à une poignée.

**Vignette** : un bouton carré d'environ 56 px, avec le dessin réel du meuble en miniature et son nom en petit dessous. Le dessin vient de `HomeArt`, `SmallArt`, `ShelfArt`, `DeskArt`, `SteampunkArt` ou `WindowArt` (sans la vue extérieure), rendu dans un `<svg>` avec un `viewBox` à la taille de l'objet (`sizeOf` ou `WINDOW_DEFAULT`) et la palette du style de la pièce. La vignette est marquée `aria-pressed` quand l'outil « poser » de ce meuble est actif. Elle porte les mêmes `data-kind` et `aria-label` « Poser : … » qu'aujourd'hui.

**Poser un objet** : le comportement actuel ne change pas (`startNew`, toucher une case ou glisser avec `furniture-drag`). Le tiroir reste ouvert pour qu'on puisse enchaîner les poses.

### Bulle d'actions (objet sélectionné, en Aménager)

C'est une pastille flottante, positionnée au-dessus du rectangle de l'objet sélectionné, dans le repère de `wmt-lib-scroll`, pour qu'elle suive le défilement. S'il n'y a pas la place au-dessus, elle passe en dessous. Elle est bornée horizontalement à la zone visible.

Elle contient les actions actuelles : Déplacer, Retirer, Avancer et Reculer (meubles debout sauf le tapis), Allumer ou éteindre (lampe), et les 6 boutons de taille de la fenêtre (sur deux lignes si nécessaire). Elle disparaît quand il n'y a plus de sélection ou quand on repasse en Visiter.

### Extension (bureau)

On garde la même structure. Le panneau étant plus large, la ligne de vignettes en montre davantage et les menus déroulants s'ouvrent sous leur bouton.

## Découpage du code

`LibraryPanel.tsx` (1 246 lignes) garde l'état, les gestionnaires et la scène. Il délègue l'affichage à :

| Fichier (src/content/) | Rôle |
|---|---|
| `library-topbar.tsx` | Barre du haut : pièces, Visiter/Aménager, plein écran, boutons des trois menus |
| `library-popover.tsx` | Menu déroulant générique (ouverture, fermeture au toucher extérieur et à Échap, un seul ouvert) |
| `library-sky-menu.tsx` | Contenu ☁️ : scène, heure, lumière, zone, météo |
| `library-pets-menu.tsx` | Contenu 🐾 : animaux et adoption |
| `library-room-menu.tsx` | Contenu ⋯ : nom, accueil, supprimer |
| `build-drawer.tsx` | Tiroir : onglets, repli, lignes de catégories et sous-catégories |
| `build-furniture-tab.tsx` | Vignettes des meubles |
| `build-room-tab.tsx` | Style et dimensions |
| `furniture-thumb.tsx` | Miniature SVG d'un meuble |
| `action-bubble.tsx` | Bulle d'actions sur la sélection |

Dans le cœur (`src/core/library/furniture-catalog.ts`), on ajoute la notion de sous-catégorie : `subcategories?: { id; label; kinds }[]` sur la catégorie Déco. Une fonction pure `catalogTree(style)` renvoie l'arbre affiché. `FURNITURE_KINDS` et `categoriesFor` gardent le même résultat à plat. Les glyphes manquants (onglets, sous-catégories, ☁️, 🐾, ⋯, ▾) sont ajoutés aux icônes SVG existantes (`ICONS`). Comme demandé, ce sont des glyphes et non du texte.

Pas de nouvelle donnée enregistrée, pas de migration, et aucun changement au moteur de pose ni au rendu de la pièce.

## Cas limites

- **Pièce non Steampunk** : pas de catégorie ⚙️. Si l'onglet était sur ⚙️ et que le style change, on revient sur la première catégorie.
- **Collection indisponible** : l'onglet 🖼️ est masqué. Si c'était l'onglet actif, on revient sur 🪑.
- **Sélection d'un objet pendant que le tiroir est réduit** : la bulle s'affiche normalement.
- **Vue de la rue (« Sortir », `outsidePhase` différent de `inside`)** : le tiroir et la bulle ne s'affichent pas, puisqu'on ne pose pas de mobilier dans la rue. Ils réapparaissent, dans le même état, dès qu'on est rentré dans la pièce. Aujourd'hui, passer en Aménager fait déjà rentrer dans la pièce, et cela reste vrai.
- **Passage en Visiter** : le tiroir et la bulle disparaissent, mais les menus ☁️ 🐾 ⋯ restent disponibles.
- **Plein écran (`stage.active`)** : le tiroir reste visible et ancré en bas de la scène plein écran. Il est réductible à une poignée.

## Tests

On ne joue que les familles de tests touchées (famille bibliothèque, `npm run test:famille -- …`).

- **Cœur** : `catalogTree` (Déco a 4 sous-catégories, Steampunk seulement dans une pièce Steampunk, l'union à plat est égale à `FURNITURE_KINDS`).
- **Interface** : on adapte `library-panel`, `library-furniture`, `library-pets-ui`, `library-light-ui`, `library-cards` et `library-drag`. Les sélecteurs `data-*` sont conservés. Les tests qui cherchaient un contrôle dans une rangée ouvrent d'abord le bon menu ou le bon onglet.
- **Nouveaux tests** : ouverture et fermeture des menus déroulants (un seul à la fois, Échap) ; réduction du tiroir en poignée et réouverture dans le même état ; tiroir présent en plein écran ; tiroir absent dans la vue de la rue ; bulle visible seulement s'il y a une sélection, avec les bonnes actions selon le type d'objet ; vignette pressée quand l'outil est actif.
- **Capture de validation** : capture d'écran sur le vrai téléphone (S26 Ultra, APK pré-prod) montrée à l'utilisateur, puis capture de l'extension.

## Guide WikiHow

On ajoute une nouvelle entrée `bibliotheque-v27` dans `src/core/whats-new/entries.ts`, « Aménager sa pièce comme dans les Sims ». Elle explique, sous forme d'étapes (text, how, tip) : à quoi sert le tiroir, les 3 onglets, la bulle d'actions, et où sont maintenant le ciel, la météo, les animaux et les réglages.

## Hors périmètre

- Nouveaux meubles ou nouveaux visuels (Fable est gelé jusqu'au 17/10).
- Rotation des objets, achat ou prix, recherche dans le catalogue.
- Changement du moteur de pose ou de la grille.
