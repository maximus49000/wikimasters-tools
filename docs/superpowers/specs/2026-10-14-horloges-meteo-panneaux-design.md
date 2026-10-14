# Horloges, météomètres et panneaux

Date : 2026-10-14. Maquette validée : `docs/superpowers/maquettes/horloges-meteo-panneau/horloges-meteo-panneau.html`. Dessin Opus : **Fable n'est pas passé** (gel Fable jusqu'au 2026-10-17), reprise Fable prévue.

## 1. Objectif et décisions de l'utilisateur

Ajouter à la pièce de la Bibliothèque des objets « vivants » qui affichent l'heure, la météo ou un texte libre :

- **Horloges**, en deux types : à aiguilles et numérique. Par défaut, elles donnent l'**heure de la scène** (menu ☁️). En touchant l'horloge, on choisit une **autre ville** (ex. Tokyo, Japon) : l'horloge affiche alors l'heure de cette ville.
- **Météomètres** : ils affichent la **météo du visuel** et la température (météo aléatoire, choisie, ou réelle par la position si elle est activée). Deux formes : station numérique et baromètre-thermomètre à l'ancienne.
- **Panneaux** : plusieurs modèles au choix (ardoise, tableau à lettres, néon, liège). On y écrit des mots et on règle soi-même leur taille.
- **Pose** : au mur, et une version de table (sur un bureau ou une étagère) pour les horloges et la station météo.

Choix par défaut annoncés à l'utilisateur après la validation (corrigeables à la relecture) :
- pas de choix de ville sur les météomètres (ils suivent toujours la météo du visuel) ;
- le néon pose un léger halo coloré sur le mur la nuit, sans ombres.

## 2. Les objets

Tailles en cases du mur (une case = 21 cm de large, comme les meubles).

### 2.1 Au mur (nouveau type d'objet `deco`)

| `DecoKind` | Nom | Taille (cases) | Contenu |
|---|---|---|---|
| `wall-clock` | Horloge à aiguilles | 2 × 2 | cadran, aiguilles des heures, minutes et secondes |
| `digital-clock` | Horloge numérique | 3 × 2 | afficheur 7 segments HH:MM, deux points qui clignotent chaque seconde |
| `weather-station` | Station météo | 3 × 2 | pictogramme de la météo, température, libellé, heure de la scène |
| `barometer` | Baromètre à l'ancienne | 2 × 3 | aiguille Tempête → Très sec, thermomètre gradué de −10 à 40 °C |
| `panel-chalk` | Ardoise | libre | cadre bois, texte à la craie, craie sur le rebord |
| `panel-letter` | Tableau à lettres | libre | feutrine rainurée, lettres blanches, toujours en capitales |
| `panel-neon` | Néon | libre | plaque de plexiglas, texte lumineux dans la couleur choisie |
| `panel-cork` | Liège | libre | liège, feuille punaisée avec le texte, post-it |

Panneaux : taille de **2 × 2 à 12 × 8 cases**, par défaut 4 × 3 (néon : 5 × 2), toujours bornée par le mur (`WALL_ROWS`) et la largeur de la pièce.

### 2.2 Sur un bureau ou une étagère (nouveaux petits objets)

| `SmallKind` | Nom | Dimensions |
|---|---|---|
| `small-alarm` | Réveil numérique | 18 × 9 × 7 cm |
| `small-clock` | Pendulette | 14 × 6 × 16 cm |
| `small-station` | Station de table | 15 × 6 × 11 cm |

Le corps est un modèle 3D (`ITEM_MODELS`), comme la petite lampe ; il se pose sur un emplacement libre (`SURFACE_SLOTS` : bureau 4, étagère 3). L'écran ou le cadran est une **face 2D en SVG** dessinée sur la face avant projetée (`placementRectPx`), puisqu'un modèle 3D ne peut pas afficher un texte qui change. Le réveil et la pendulette ont le choix de ville ; la station de table montre seulement le pictogramme et la température.

### 2.3 Aspect selon le style (comme la maquette)

- **Horloge à aiguilles** : bois clair (Scandinave, Japandi), métal noir (Moderne), métal à rivets (Industriel), soleil doré (Rétro 70s), chiffres romains (Bohème, Steampunk), anneau lumineux cyan (Néon).
- **Afficheurs** (horloge numérique, réveil) : rouge par défaut ; blanc (Moderne, Japandi), ambre (Rétro 70s), cyan (Néon), **tubes Nixie** orangés (Steampunk).
- **Écran de la station** : « e-ink » doux (styles clairs), sombre (Moderne, Industriel), cyan sur noir (Néon), ambre sur laiton (Steampunk).
- **Panneaux** : leur aspect ne dépend pas du style, sauf le bois du cadre (couleur `wood` de la palette).

## 3. Données

### 3.1 Nouveau type d'objet placé

```ts
export type DecoKind = 'wall-clock' | 'digital-clock' | 'weather-station' | 'barometer' | 'panel-chalk' | 'panel-letter' | 'panel-neon' | 'panel-cork';
export type NeonColor = 'pink' | 'cyan' | 'yellow' | 'green' | 'white';
export type CityTime = { name: string; tz: string }; // ex. { name: 'Tokyo', tz: 'Asia/Tokyo' }

| { id: string; kind: 'deco'; deco: DecoKind; col: number; row: number; w?: number; h?: number; city?: CityTime; text?: string; neon?: NeonColor }
```

- `w`/`h` seulement pour les panneaux (les autres ont une taille fixe, `decoSizeOf`).
- `city` seulement pour les horloges ; absent = heure de la scène.
- `text` (140 caractères au plus) et `neon` seulement pour les panneaux.
- Petits objets : `SMALL_ITEMS` reçoit `alarm`, `clock`, `station` ; le `Placed` `small` reçoit `city?: CityTime`.

On n'utilise pas `WallShape`, parce qu'un objet `wall` porte toujours une carte (`slug` obligatoire, dédoublonnage, `unplaceCard`, `cardOf`).

### 3.2 Sauvegarde

- Schéma zod (`library-book.ts`) : nouvelle branche `deco` (taille bornée, `text` ≤ 140, `tz` dans la liste des villes) et `small` étendu.
- **Pas de changement de version** (on reste en v7), comme le lot A : on ajoute seulement des types. Un objet `deco` invalide est retiré sans perdre la pièce, comme le fait `dropBadWindows`.
- `shiftLayout`, `fitRoomWidth`, `rectOf`, `depthOf` (niveau 0), la couche du fond (`depth-order.ts`) et `pet-context` connaissent le nouveau type.

### 3.3 Liste des villes

Un fichier statique `src/core/library/clock-cities.ts` contient environ 150 grandes villes (`name`, `country`, `tz` IANA), couvrant tous les fuseaux habités. La recherche ignore les accents et les majuscules. L'heure d'une ville se calcule avec `Intl.DateTimeFormat(…, { timeZone })`, sans réseau.

## 4. Fonctionnement

### 4.1 Heure

- **Heure de la scène** : `minutesFor(time, now)` (`time-setting.ts`) ; les secondes viennent toujours de l'horloge de l'appareil.
- **Autre ville** : heure de la scène + (décalage de la ville − décalage de l'appareil). En heure réelle, c'est donc l'heure réelle de la ville. En heure choisie, jour ou nuit, l'écart est gardé (22 h choisie → 5 h à Tokyo).
- Le nom de la ville s'écrit en petites capitales sur le cadran ou au-dessus des chiffres. Pas de nom pour l'heure de la scène : aucune donnée ne donne le nom de la ville de l'utilisateur (la position n'est jamais traduite en adresse).
- Un seul minuteur (1 seconde) pour toutes les horloges visibles, arrêté quand la pièce n'est pas affichée ou que l'onglet est caché. Seules les aiguilles et les chiffres sont redessinés.

### 4.2 Météo et température

- `SceneView` reçoit `weather.state` (état le plus proche, `nearestState`), `weather.label` et `weather.tempC`.
- **Température** : la mesure réelle (`tempC`) en météo réelle ; sinon `plausibleTempC(lat, date)` (`weather-plan.ts`) à la position courante, avec −2 °C la nuit, et 0 °C au plus quand il neige.
- **Pictogrammes** : soleil (lune la nuit, `sky.phase === 'night'`), nuageux, bruine, pluie, orage, neige, brume.
- **Baromètre** : la position de l'aiguille dépend de l'état (orage −118°, pluie −70°, neige −55°, bruine −45°, brume −20°, nuageux 0°, soleil +70°). Elle glisse en 0,6 s quand la météo change.

### 4.3 Panneaux

- **Écrire** : le glyphe ✏️ de la bulle ouvre une fenêtre avec une zone de texte (140 caractères, retours à la ligne libres), les 5 pastilles de couleur pour le néon et un bouton ✓. Échap ou ✕ ferme la fenêtre sans enregistrer. Échap ne doit pas annuler aussi le mode placement.
- **Ajustement du texte** : il passe à la ligne aux espaces et prend la plus grande taille qui tient dans le panneau (mesure par un canevas caché, mise en cache par texte et taille).
- **Taille** : mêmes commandes que la fenêtre (boutons ± largeur et hauteur dans la bulle et en mode placement, vérification par `canHangRect`), avec les bornes du § 2.1. Note : la maquette montrait une poignée à tirer ; on reprend les boutons de la fenêtre pour rester cohérent. Une poignée pourra venir plus tard pour la fenêtre et les panneaux ensemble.
- **Polices** : Caveat (ardoise), Oswald (lettres), Pacifico (néon), Patrick Hand (liège), sous licence libre OFL, réduites aux caractères latins et intégrées au paquet (extension et application Android). Elles sont déclarées dans le document de la page. Si la page les refuse, le panneau prend une police du système (cursive ou sans-serif) et reste lisible.
- **Halo du néon** : un dégradé radial SVG dans sa couleur, d'intensité `1 − daylight`, dessiné derrière la plaque. Il ne passe pas par la carte de lumière : il ne projette aucune ombre.
- Un panneau vide affiche, en grisé, « ✏️ Touchez pour écrire » en mode Aménager seulement.

### 4.4 Choisir une ville (horloges)

Le glyphe 🌐 de la bulle (horloges murales, réveil, pendulette) ouvre la fenêtre « Heure de quelle ville ? » :
- champ de recherche ;
- première ligne « 📍 Heure de la scène » (retire la ville) ;
- une ligne par ville : « Ville, Pays », avec son heure actuelle à droite ;
- toucher une ligne enregistre et ferme.

### 4.5 Bulle d'actions et tiroir

- La bulle garde ses actions habituelles (✥ déplacer, 🗑 ranger) et ajoute, selon l'objet, 🌐 (horloges), ✏️ (panneaux) et ± (taille des panneaux).
- Tiroir de construction, catégorie **Déco** :
  - nouvelle sous-catégorie **« Horloges et météo »** : horloge à aiguilles, horloge numérique, station météo, baromètre, réveil, pendulette, station de table ;
  - **« Murs »** : fenêtre, ardoise, tableau à lettres, néon, liège.
- Vignettes : les mêmes dessins à 44 × 44 px (`furniture-thumb.tsx`), avec 10:10 sur les horloges, soleil et 18° sur les météomètres, et « Abc » sur les panneaux.
- Pose et déplacement : comme une affiche (glisser sur le mur, fantôme vert ou rouge) ; les objets de table, comme la petite lampe (glisser sur un bureau ou une étagère).

## 5. Découpage en fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/deco.ts` (nouveau) | `DecoKind`, tailles fixes, bornes des panneaux, `decoSizeOf`, `isPanel`, `isClock` |
| `src/core/library/clock-cities.ts` (nouveau) | liste des villes, recherche, `cityMinutes(sceneMinutes, tz, now)` |
| `src/core/library/deco-weather.ts` (nouveau) | température affichée, angle du baromètre, choix du pictogramme |
| `src/core/library/text-fit.ts` (nouveau) | retour à la ligne et taille maximale (mesure injectée, testable sans DOM) |
| `src/content/deco-art.tsx` (nouveau) | dessin SVG de chaque objet mural et des faces de table (fonctions pures, palette en entrée) |
| `src/content/use-clock-tick.ts` (nouveau) | minuteur partagé de 1 s, en pause hors de l'écran |
| `src/content/DecoTextDialog.tsx`, `src/content/CityPickerDialog.tsx` (nouveaux) | les deux fenêtres |
| `src/content/deco-fonts.ts` (nouveau) | déclaration des 4 polices intégrées |
| `library-types.ts`, `library-book.ts`, `room-grid.ts`, `placement.ts`, `furniture-drag.ts`, `furniture-catalog.ts`, `furniture-thumb.tsx`, `item-models.ts`, `carried-items.ts`, `RoomView.tsx`, `LibraryPanel.tsx`, `depth-order.ts`, `pet-context.ts` | branchements |

## 6. Tests

Seulement les familles touchées : `scene-piece`, `scene-meteo`, `scene-lumiere` (halo du néon). Les nouveaux fichiers sont rattachés à ces familles (`tests/familles.ts`).

- **Données** (`library-book-deco.test.ts`) : un `deco` valide est relu à l'identique ; un texte de plus de 140 caractères, une taille hors bornes ou un fuseau inconnu retirent seulement cet objet ; les anciennes pièces se relisent sans changement.
- **Grille** (`room-grid-deco.test.ts`) : pose libre au mur, collision avec une fenêtre ou une affiche, redimensionnement d'un panneau bloqué par le bord du mur ou un voisin, `shiftLayout` déplace les objets `deco`.
- **Villes et heure** (`clock-cities.test.ts`) : recherche sans accents (« seoul » → Séoul) ; Tokyo = Paris + 7 h en octobre et + 8 h en janvier ; l'écart est gardé en heure choisie ; passage de minuit.
- **Météo** (`deco-weather.test.ts`) : la mesure réelle passe avant la température plausible ; neige ≤ 0 °C ; angle du baromètre par état ; lune la nuit.
- **Texte** (`text-fit.test.ts`) : retour à la ligne, la taille diminue quand le texte s'allonge et augmente quand le panneau grandit, mot trop long seul sur sa ligne.
- **Dessin** (`deco-art.test.tsx`) : chaque objet se dessine dans ses 8 styles sans erreur ; nom de la ville affiché seulement si elle est choisie ; tubes Nixie en Steampunk.
- **Interface** (`library-deco.test.tsx`) : 🌐 enregistre puis retire une ville ; ✏️ enregistre le texte et la couleur du néon ; Échap ferme la fenêtre sans quitter le mode placement ; ± change la taille du panneau ; tiroir conforme au § 4.5 ; un réveil se pose sur un bureau.

## 7. Guide, vérification et livraison

- Fiche WikiHow « Horloges, météo et panneaux » (`entries.ts`, nouvel id) : à quoi ça sert, d'où viennent l'heure et la météo, comment choisir une ville et écrire sur un panneau, limites (pas de nom pour la ville de la scène ; police du système si la page refuse les polices intégrées).
- Captures avant la PR (banc de captures) : chaque objet dans un style clair et un style sombre, de jour et de nuit, plus une pièce avec bureau. Elles sont montrées à l'utilisateur.
- Worktree `../Wikimasters-horloges`, branche `feat/horloges-meteo-panneau`. PR ouverte et fusionnée, `npm run build`, pré-prod (`npm run preprod`) avec APK, puis vérification sur le vrai téléphone.

## 8. Hors de cette spec

- Choix de ville pour les météomètres ; alarme du réveil ; tic-tac sonore.
- Poignée à tirer pour redimensionner (fenêtre et panneaux).
- Station et horloges posées sur la commode et le guéridon : elles viendront avec le lot B du mobilier (meubles porteurs).
- Reprise Fable des dessins après le 17/10.
