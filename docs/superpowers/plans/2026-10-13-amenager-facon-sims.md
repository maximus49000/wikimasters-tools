# Aménager façon Sims — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer les rangées empilées du mode Aménager de Ma Pièce par une barre du haut avec trois menus déroulants (☁️ ciel et météo, 🐾 animaux, ⋯ réglages), un tiroir de construction en bas (🪑 Meubles, 🖼️ Cartes, 🧱 Pièce), avec des vignettes dessinées et une poignée de réduction, et une bulle d'actions sur l'objet sélectionné.

**Architecture :** `LibraryPanel.tsx` garde tout l'état et les gestionnaires. L'affichage part dans de petits composants « bêtes » qui reçoivent des props et des callbacks. Les contrôles d'un menu fermé ou d'un onglet inactif restent **montés mais cachés** (attribut `hidden`), ce qui garde la plupart des tests jsdom existants. L'arborescence du catalogue (catégories et sous-catégories) est une fonction pure du cœur.

**Tech Stack :** React 18 (TSX), Vitest + jsdom, WXT (extension), WebView Android (APK).

**Spec :** `docs/superpowers/specs/2026-10-13-amenager-facon-sims-design.md`

## Global Constraints

- Travail dans le worktree `C:\Users\maxim\Downloads\Wikimasters-sims`, branche `feat/amenager-sims`. Ne jamais toucher au dossier principal `Wikimasters tools`, où d'autres sessions tournent.
- Aucun changement au moteur de pose (`room-grid.ts`, `furniture-drag.ts`), au rendu de la pièce (`RoomView.tsx`) ni aux données enregistrées : pas de migration.
- On conserve tous les attributs `data-*` existants : `data-kind`, `data-category`, `data-style`, `data-scene`, `data-time`, `data-weather-mode`, `data-weather-state`, `data-action`, `data-orient`, `data-pet-edit`, `data-coat`, `data-light-toggle`, `data-zone-toggle`, `data-time-slider`, `data-sun-times`, `data-weather-label`, `data-weather-note`.
- Glyphes SVG (viewBox 24, trait) et non du texte. Chaque bouton a un `aria-label` et un `title` en français.
- Textes et commentaires en français, avec la typographie existante (apostrophe ’, espaces insécables avant « : » si le fichier en met).
- Tests : ne jouer que les familles touchées, avec `npm run test:famille -- scene-piece scene-commun scene-animaux scene-lumiere scene-meteo scene-ville`. On ne lance jamais tout le TNR.
- Chaque nouveau fichier de test va dans une famille existante de `tests/familles.ts` (`scene-piece` pour l'interface de la pièce).
- Le tiroir n'est rendu qu'en Aménager et seulement à l'intérieur (`outsidePhase === 'inside'`). Il est dans `.wmt-lib-stage`, donc visible en plein écran.
- Pas de nouveau visuel : les vignettes réutilisent `HomeArt`, `SmallArt`, `ShelfArt`, `DeskArt`, `ComputerArt`, `AnalyticalEngineArt`, `SteampunkArt` et `WindowArt`.
- Commits : messages en français au format `feat(bibliotheque): …`, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Changement de style d'une pièce Steampunk vers un autre style pendant que l'onglet ⚙️ est ouvert** : on attend un retour sur la première catégorie, sans tiroir vide. C'est testé en tâche 5.
- **Collection absente (`collection` non fourni)** : l'onglet 🖼️ n'existe pas. Si c'était l'onglet actif, on revient sur 🪑. C'est testé en tâche 5.
- **Appui sur Échap pendant un glissé de meuble alors qu'un menu est ouvert** : le menu se ferme, et le glissé est annulé par son propre écouteur, sans plantage. On ne teste que la fermeture du menu (tâche 3). Le glissé garde son test existant.
- **Sélection d'un objet puis passage en Visiter ou sortie dans la rue** : la bulle disparaît. C'est testé en tâche 6.
- **Tiroir réduit, puis changement de pièce** : le tiroir reste réduit et la poignée reste visible, sans réouverture surprise. C'est testé en tâche 5.

---

## Fichiers

| Fichier | Action | Rôle |
|---|---|---|
| `src/core/library/furniture-catalog.ts` | Modifier | Sous-catégories de Déco et `catalogTree(style)` |
| `src/content/library-ui.tsx` | Créer | `Icon`, `Btn`, `ICONS` (sortis de `LibraryPanel.tsx`) et nouveaux glyphes |
| `src/content/library-popover.tsx` | Créer | `Popover` : bouton et menu déroulant (un seul ouvert, Échap, toucher extérieur) |
| `src/content/library-sky-menu.tsx` | Créer | Contenu ☁️ |
| `src/content/library-pets-menu.tsx` | Créer | Contenu 🐾 |
| `src/content/library-room-menu.tsx` | Créer | Contenu ⋯ |
| `src/content/library-topbar.tsx` | Créer | Barre du haut |
| `src/content/furniture-thumb.tsx` | Créer | Miniature SVG d'un meuble |
| `src/content/build-drawer.tsx` | Créer | Tiroir de construction et ses 3 onglets |
| `src/content/action-bubble.tsx` | Créer | Bulle d'actions |
| `src/content/LibraryPanel.tsx` | Modifier | Câblage. Les rangées disparaissent |
| `src/core/whats-new/entries.ts` | Modifier | Entrée `bibliotheque-v27` |
| `tests/core/library/furniture-catalog.test.ts` | Modifier | Tests de `catalogTree` |
| `tests/content/library-sims-ui.test.tsx` | Créer | Menus, tiroir, poignée, bulle |
| `tests/content/furniture-thumb.test.tsx` | Créer | Vignettes |
| `tests/familles.ts` | Modifier | Ajouter `library-sims-ui.*` et `furniture-thumb.*` à `scene-piece` |
| Tests `tests/content/library-*.test.tsx` | Adapter | Seulement ceux qui cassent |

---

### Task 1 : arborescence du catalogue (cœur)

**Files :**
- Modify : `src/core/library/furniture-catalog.ts` (autour de `CATEGORIES`, l. 75-90)
- Test : `tests/core/library/furniture-catalog.test.ts`

**Interfaces :**
- Produces :
  ```ts
  export type Subcategory = 'plants' | 'lights' | 'floor' | 'walls';
  export type CatalogNode = { id: Category; label: string; kinds: FurnitureKind[]; subcategories: { id: Subcategory; label: string; kinds: FurnitureKind[] }[] };
  export function catalogTree(style: StyleId): CatalogNode[];
  ```
  `CATEGORIES`, `categoriesFor`, `FURNITURE_KINDS` ne changent pas. `kinds` d'un nœud est toujours la liste à plat. Quand `subcategories` n'est pas vide, l'union de ses `kinds` est égale à `kinds`, dans le même ordre.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à la fin de `tests/core/library/furniture-catalog.test.ts` (et `catalogTree` à l'import existant de `../../../src/core/library/furniture-catalog`) :

```ts
describe('catalogTree', () => {
  it('découpe la Déco en Plantes, Lumières, Sol et Murs', () => {
    const deco = catalogTree('scandinave').find((n) => n.id === 'deco');
    expect(deco?.subcategories.map((s) => s.id)).toEqual(['plants', 'lights', 'floor', 'walls']);
    expect(deco?.subcategories.find((s) => s.id === 'plants')?.kinds).toEqual(['plant', 'small-plant']);
    expect(deco?.subcategories.find((s) => s.id === 'lights')?.kinds).toEqual(['lamp', 'small-lamp']);
    expect(deco?.subcategories.find((s) => s.id === 'floor')?.kinds).toEqual(['rug', 'coffee-table']);
    expect(deco?.subcategories.find((s) => s.id === 'walls')?.kinds).toEqual(['window']);
  });

  it('les sous-catégories couvrent exactement les meubles de leur catégorie', () => {
    for (const node of catalogTree('steampunk')) {
      if (node.subcategories.length === 0) continue;
      expect([...node.subcategories.flatMap((s) => s.kinds)].sort()).toEqual([...node.kinds].sort());
    }
  });

  it('ne propose Steampunk que dans une pièce Steampunk', () => {
    expect(catalogTree('scandinave').some((n) => n.id === 'steampunk')).toBe(false);
    expect(catalogTree('steampunk').some((n) => n.id === 'steampunk')).toBe(true);
  });

  it('les autres catégories n’ont pas de sous-catégorie', () => {
    expect(catalogTree('scandinave').filter((n) => n.id !== 'deco').every((n) => n.subcategories.length === 0)).toBe(true);
  });
});
```


- [ ] **Step 2 : lancer les tests et constater l'échec**

Run : `npx vitest run tests/core/library/furniture-catalog.test.ts`
Expected : FAIL, `catalogTree is not a function` (ou une erreur d'import).

- [ ] **Step 3 : implémenter**

Dans `src/core/library/furniture-catalog.ts`, juste après `categoriesFor` :

```ts
export type Subcategory = 'plants' | 'lights' | 'floor' | 'walls';
export type CatalogNode = { id: Category; label: string; kinds: FurnitureKind[]; subcategories: { id: Subcategory; label: string; kinds: FurnitureKind[] }[] };

// Sous-catégories du tiroir de construction : seulement pour une catégorie trop fournie pour une seule ligne de vignettes.
const SUBCATEGORIES: Partial<Record<Category, CatalogNode['subcategories']>> = {
  deco: [
    { id: 'plants', label: 'Plantes', kinds: ['plant', 'small-plant'] },
    { id: 'lights', label: 'Lumières', kinds: ['lamp', 'small-lamp'] },
    { id: 'floor', label: 'Sol', kinds: ['rug', 'coffee-table'] },
    { id: 'walls', label: 'Murs', kinds: ['window'] },
  ],
};

// Arbre affiché par le tiroir : catégories du style, chacune avec ses sous-catégories éventuelles.
export const catalogTree = (style: StyleId): CatalogNode[] =>
  categoriesFor(style).map((c) => ({ id: c.id, label: c.label, kinds: c.kinds, subcategories: SUBCATEGORIES[c.id] ?? [] }));
```

- [ ] **Step 4 : relancer les tests**

Run : `npx vitest run tests/core/library/furniture-catalog.test.ts`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/core/library/furniture-catalog.ts tests/core/library/furniture-catalog.test.ts
git commit -m "feat(bibliotheque): arborescence du catalogue avec sous-catégories de la Déco"
```

---

### Task 2 : sortir les briques d'interface de `LibraryPanel.tsx`

C'est un refactor pur : aucun changement visible, et les tests existants doivent rester verts.

**Files :**
- Create : `src/content/library-ui.tsx`
- Modify : `src/content/LibraryPanel.tsx` (retirer `Icon`, `ICONS`, `Btn` aux l. 158-249 et les importer)

**Interfaces :**
- Produces :
  ```ts
  export function Icon(props: { paths: readonly string[] }): ReactElement;
  export function Btn(props: { label: string; pressed?: boolean; disabled?: boolean; onClick: () => void; data?: Record<string, string>; children: ReactNode; className?: string }): ReactElement;
  export const ICONS: { …les clés actuelles…, cloud, paw, more, chevronDown, chevronUp, sofaTab, frame, bricks, plants, lights, floor, walls };
  ```

- [ ] **Step 1 : créer `src/content/library-ui.tsx`**

Y déplacer **tels quels** `Icon`, `ICONS` et `Btn` depuis `LibraryPanel.tsx`. Ajouter à `Btn` une prop optionnelle `className`, ajoutée après `wmt-lib-btn` : `className={className ? \`wmt-lib-btn ${className}\` : 'wmt-lib-btn'}`. Ajouter ces glyphes à `ICONS` :

```ts
  cloud: ['M7 18a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z'],
  paw: ['M12 13c-3 0-5 3-5 5a2 2 0 0 0 2 2c1.2 0 2-.6 3-.6s1.8.6 3 .6a2 2 0 0 0 2-2c0-2-2-5-5-5z', 'M6 9.5h.01', 'M9.5 6h.01', 'M14.5 6h.01', 'M18 9.5h.01'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronUp: ['M6 15l6-6 6 6'],
  sofaTab: ['M4 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6H4z', 'M2 12v5h2', 'M22 12v5h-2', 'M6 17v3', 'M18 17v3'],
  frame: ['M4 4h16v16H4z', 'M8 15l3-4 3 3 2-2 2 3'],
  bricks: ['M3 5h18v14H3z', 'M3 10h18', 'M3 15h18', 'M9 5v5', 'M15 10v5', 'M9 15v4'],
  plants: ['M12 21v-8', 'M12 13c-4 0-6-3-6-7 4 0 6 3 6 7z', 'M12 15c4 0 6-3 6-7-4 0-6 3-6 7z'],
  lights: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9c.4.4.5.8.5 1.1V16h6v-1c0-.3.1-.7.5-1.1A6 6 0 0 0 12 3z'],
  floor: ['M3 8h18v8H3z', 'M6 11h12'],
  walls: ['M4 3h16v18H4z', 'M12 3v18', 'M4 12h16'],
```

Imports du fichier : `import type { ReactElement, ReactNode } from 'react';`.

- [ ] **Step 2 : brancher `LibraryPanel.tsx`**

Supprimer les définitions déplacées et ajouter `import { Btn, Icon, ICONS } from './library-ui';`. `WEATHER_ICON`, `SCENE_ICON` et `SCENE_LABEL` restent pour l'instant dans `LibraryPanel.tsx` (ils déménagent en tâche 3).

- [ ] **Step 3 : vérifier le typage et les tests**

Run : `npx tsc --noEmit -p .` puis `npm run test:famille -- scene-piece`
Expected : aucune erreur de type, tout est vert.

- [ ] **Step 4 : commit**

```bash
git add src/content/library-ui.tsx src/content/LibraryPanel.tsx
git commit -m "refactor(bibliotheque): briques d'interface de Ma Pièce dans library-ui"
```

---

### Task 3 : barre du haut et menus ☁️ 🐾 ⋯

**Files :**
- Create : `src/content/library-popover.tsx`, `src/content/library-sky-menu.tsx`, `src/content/library-pets-menu.tsx`, `src/content/library-room-menu.tsx`, `src/content/library-topbar.tsx`
- Modify : `src/content/LibraryPanel.tsx` (le rendu des l. ~866-1075 est remplacé par `<LibraryTopBar …/>`)
- Test : `tests/content/library-sims-ui.test.tsx` (nouveau), `tests/familles.ts`

**Interfaces :**
- Consumes : `Btn`, `Icon`, `ICONS` (tâche 2).
- Produces :
  ```ts
  // library-popover.tsx
  export type MenuId = 'sky' | 'pets' | 'room';
  export function Popover(props: { id: MenuId; open: MenuId | null; onOpen: (id: MenuId | null) => void; label: string; icon: readonly string[]; children: ReactNode }): ReactElement;
  // library-topbar.tsx
  export function LibraryTopBar(props: TopBarProps): ReactElement; // TopBarProps : voir step 3
  ```
  DOM produit : le bouton porte `data-menu-button="sky|pets|room"` et `aria-expanded`. Le menu porte `data-menu="sky|pets|room"` et `role="dialog"`. Il est toujours monté, avec `hidden` quand il est fermé.

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `tests/content/library-sims-ui.test.tsx` en reprenant le harnais de `tests/content/library-panel.test.tsx` (lignes 1-39 : `settle`, `q`, `click`, `beforeEach` qui monte `<LibraryPanel library={repo} />`). Puis :

```tsx
const menu = (id: string) => q(`[data-menu="${id}"]`) as HTMLElement | null;

describe('barre du haut', () => {
  it('ouvre un seul menu à la fois', async () => {
    await click('[data-menu-button="sky"]');
    expect(menu('sky')?.hidden).toBe(false);
    expect(q('[data-menu-button="sky"]')?.getAttribute('aria-expanded')).toBe('true');
    await click('[data-menu-button="pets"]');
    expect(menu('sky')?.hidden).toBe(true);
    expect(menu('pets')?.hidden).toBe(false);
  });

  it('rappuyer sur le bouton ferme le menu', async () => {
    await click('[data-menu-button="room"]');
    await click('[data-menu-button="room"]');
    expect(menu('room')?.hidden).toBe(true);
  });

  it('Échap ferme le menu ouvert', async () => {
    await click('[data-menu-button="sky"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(menu('sky')?.hidden).toBe(true);
  });

  it('toucher hors du menu le ferme', async () => {
    await click('[data-menu-button="pets"]');
    await act(async () => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(menu('pets')?.hidden).toBe(true);
  });

  it('ciel, météo et animaux sont réglables en mode Visiter', async () => {
    expect(q('[data-action="edit"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(menu('sky')?.querySelector('[data-scene="city"]')).not.toBeNull();
    expect(menu('sky')?.querySelector('[data-time="night"]')).not.toBeNull();
    expect(menu('pets')?.querySelector('[data-action="adopt"]')).not.toBeNull();
    expect(menu('room')?.querySelector('[data-action="home"]')).not.toBeNull();
  });

  it('les rangées empilées ont disparu', () => {
    expect(container.querySelectorAll('.wmt-lib-row').length).toBe(1);
  });
});
```

Ajouter `'library-sims-ui.*'` à la liste `c(…)` de la famille `scene-piece` dans `tests/familles.ts`.

- [ ] **Step 2 : lancer les tests et constater l'échec**

Run : `npx vitest run tests/content/library-sims-ui.test.tsx`
Expected : FAIL, `introuvable : [data-menu-button="sky"]`.

- [ ] **Step 3 : implémenter**

`src/content/library-popover.tsx` :

```tsx
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { Icon } from './library-ui';

export type MenuId = 'sky' | 'pets' | 'room';

// Bouton de la barre du haut et son menu déroulant. Le menu reste monté (caché) pour garder ses champs en mémoire.
// Un seul menu ouvert à la fois : l'état vit dans la barre. Échap ou un toucher hors du menu le ferme.
export function Popover({ id, open, onOpen, label, icon, children }: { id: MenuId; open: MenuId | null; onOpen: (id: MenuId | null) => void; label: string; icon: readonly string[]; children: ReactNode }): ReactElement {
  const box = useRef<HTMLSpanElement | null>(null);
  const shown = open === id;
  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onOpen(null); };
    const onDown = (event: PointerEvent): void => {
      const path = event.composedPath();
      if (box.current && !path.includes(box.current)) onOpen(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [shown, onOpen]);
  return (
    <span className="wmt-lib-pop" ref={box}>
      <button type="button" className="wmt-lib-btn" aria-label={label} title={label} aria-expanded={shown} data-menu-button={id} onClick={() => onOpen(shown ? null : id)}>
        <Icon paths={icon} />
      </button>
      <div className="wmt-lib-pop-panel" role="dialog" aria-label={label} data-menu={id} hidden={!shown}>
        {children}
      </div>
    </span>
  );
}
```

`composedPath()` gère le shadow root des panneaux de la Collection. Le `pointerdown` du test est lancé sur `document.body`, il est donc hors du menu.

`src/content/library-sky-menu.tsx` : y déplacer le JSX des groupes « Ciel » (l. 943-992) et « Météo » (l. 994-1018) de `LibraryPanel.tsx`, **à l'identique**, sous forme de deux `<div className="wmt-lib-pop-group" role="group" aria-label="Ciel">` et `…"Météo"`. Le groupe Météo n'est rendu que si `WEATHER_SCENES.includes(scene)`. Y déplacer aussi `WEATHER_ICON`, `SCENE_ICON` et `SCENE_LABEL`. Props, toutes déjà calculées dans `LibraryPanel` :

```ts
type SkyMenuProps = {
  scene: SceneId; onScene: (id: SceneId) => void;
  time: TimeSetting; onTime: (mode: TimeSetting['mode']) => void; onMinutes: (minutes: number) => void;
  sunLabel: string;                       // le texte actuel de data-sun-times, calculé dans LibraryPanel
  lightOn: boolean; onLight: (on: boolean) => void;
  zoneChoice: ZoneChoice; zoneLabel: string; onZone: () => void;
  weather: WeatherSetting; onWeather: (next: WeatherSetting) => void; positionOn: boolean;
  weatherLabel: string; weatherNote: string | null; weatherNoteTitle: string;
};
export function SkyMenu(props: SkyMenuProps): ReactElement;
```

Dans `LibraryPanel`, `sunLabel` reprend exactement l'expression actuelle (`sceneTime.times.kind === 'normal' ? … : …` + `` ` · ${formatMinutes(sceneTime.minutes)}` ``). `weatherLabel` vaut `weather.label` plus la température. `weatherNote` vaut le texte `(simulée…)` ou `null` si `weather.real !== 'fallback'`. Garder `NEXT_ZONE` et `ZONE_GLYPH` dans `library-sky-menu.tsx` et exposer `onZone` sans argument : `LibraryPanel` passe `() => setZoneChoice(NEXT_ZONE[zoneChoice])`, donc exporter aussi `NEXT_ZONE`.

`src/content/library-pets-menu.tsx` : y déplacer **à l'identique** le JSX du groupe « Animaux » (l. 1020-1075), ainsi que `SPECIES_TEXT`, `COAT_LABELS_OF` et `coatLabel`. Props :

```ts
type PetsMenuProps = {
  roomId: string; pets: Pet[];
  adopting: Species | null; adoptName: string; adoptCoat: Coat;
  onRename: (pet: Pet, name: string) => void; onRemove: (pet: Pet) => void;
  onStartAdopt: (species: Species) => void; onAdoptName: (name: string) => void; onAdoptCoat: (coat: Coat) => void;
  onConfirm: () => void; onCancel: () => void;
};
export function PetsMenu(props: PetsMenuProps): ReactElement;
export const SPECIES_TEXT: …; // réexporté : startAdopt dans LibraryPanel l'utilise
```

`onRename` reçoit le nom déjà validé. Le `onBlur` actuel (nom vide → remis, nom identique → rien) reste dans `PetsMenu`, qui n'appelle `onRename` que pour un vrai changement.

`src/content/library-room-menu.tsx` : le champ du nom (`input.wmt-lib-name`, l. 913-924, `key={roomId}`), le bouton ★ `data-action="home"` (l. 899-906) et le bouton `data-action="delete-room"` (l. 926-930). Props :

```ts
type RoomMenuProps = { roomId: string; name: string; isHome: boolean; canDelete: boolean; onRename: (name: string) => void; onToggleHome: () => void; onDelete: () => void };
export function RoomMenu(props: RoomMenuProps): ReactElement;
```

`canDelete` vaut `lib.rooms.length > 1` et choisit le libellé « Supprimer la pièce » ou « Vider la pièce ».

`src/content/library-topbar.tsx` :

```tsx
type TopBarProps = {
  rooms: { id: string; name: string }[]; activeId: string; homeId: string | null;
  onRoom: (id: string) => void; onAddRoom: () => void;
  editing: boolean; onMode: (mode: 'visit' | 'edit') => void; onFullscreen: () => void; fullscreenActive: boolean;
  sky: ReactNode; pets: ReactNode; roomMenu: ReactNode;
};
export function LibraryTopBar(props: TopBarProps): ReactElement {
  const [open, setOpen] = useState<MenuId | null>(null);
  // … une seule rangée .wmt-lib-row :
  // onglets des pièces (même JSX qu'aujourd'hui, l. 867-881, avec role="tab" et data-room), + data-action="add-room",
  // Btn Visiter (data-action="visit") / Aménager (data-action="edit"), Btn plein écran (data-action="fullscreen"),
  // <span className="wmt-lib-sep" />,
  // <Popover id="sky" label="Ciel et météo" icon={ICONS.cloud}>{sky}</Popover>
  // <Popover id="pets" label="Animaux" icon={ICONS.paw}>{pets}</Popover>
  // <Popover id="room" label="Réglages de la pièce" icon={ICONS.more}>{roomMenu}</Popover>
}
```

La barre ne contient plus `data-orient` : l'orientation passe dans le tiroir en tâche 5. Jusqu'à la tâche 5, les boutons d'orientation, les styles et l'agrandissement restent dans les rangées actuelles, en mode Aménager. Le test « les rangées empilées ont disparu » ne passera donc qu'à la tâche 5. Le marquer `it.todo` ici et le réactiver en tâche 5.

`setOpen` est passé tel quel à `Popover.onOpen` : il est stable, ce qui évite de réabonner les écouteurs.

CSS à ajouter dans `LIBRARY_CSS` (`LibraryPanel.tsx`) :

```css
.wmt-lib-pop{position:relative;display:inline-flex}
.wmt-lib-pop-panel{position:absolute;top:calc(100% + 6px);right:0;z-index:20;display:flex;flex-direction:column;gap:8px;min-width:240px;max-width:min(92vw,420px);max-height:70vh;overflow:auto;padding:10px;border-radius:12px;border:1px solid var(--color-border,rgba(148,163,184,.35));background:var(--color-surface,#0d1117);box-shadow:0 8px 24px rgba(0,0,0,.4)}
.wmt-lib-pop-panel[hidden]{display:none}
.wmt-lib-pop-group{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
```

Dans `LibraryPanel.tsx`, remplacer la rangée des pièces (l. 866-885), la rangée Visiter/Aménager (l. 887-931), le groupe Ciel, le groupe Météo et le groupe Animaux par `<LibraryTopBar … sky={<SkyMenu …/>} pets={<PetsMenu …/>} roomMenu={<RoomMenu …/>} />`. Les rangées « Style », « Catégories de meubles » et « meubles et actions » restent jusqu'aux tâches 5 et 6. Garder les boutons d'orientation dans une rangée temporaire en Aménager (`{editing && <div className="wmt-lib-row">…data-orient…</div>}`), retirée en tâche 5.

- [ ] **Step 4 : lancer le nouveau test, puis les familles touchées**

Run : `npx vitest run tests/content/library-sims-ui.test.tsx`
Expected : PASS (le test des rangées est en `todo`).

Run : `npm run test:famille -- scene-piece scene-animaux scene-meteo scene-lumiere scene-commun`
Expected : quelques échecs dans les tests qui affirmaient qu'un contrôle était **absent** en Visiter (par exemple `expect(q('[data-scene]')).toBeNull()`), ou qui passaient en Aménager juste pour l'atteindre. Les adapter au nouveau comportement : le contrôle existe désormais en Visiter, dans le menu. Sinon, ne rien changer d'autre. Les clics sur des contrôles cachés fonctionnent en jsdom (`dispatchEvent`), donc la plupart des tests passent sans modification.

- [ ] **Step 5 : commit**

```bash
git add src/content/library-popover.tsx src/content/library-sky-menu.tsx src/content/library-pets-menu.tsx src/content/library-room-menu.tsx src/content/library-topbar.tsx src/content/LibraryPanel.tsx tests/content/library-sims-ui.test.tsx tests/familles.ts tests/content/
git commit -m "feat(bibliotheque): barre du haut avec menus Ciel et météo, Animaux et Réglages"
```

---

### Task 4 : vignette dessinée d'un meuble

**Files :**
- Create : `src/content/furniture-thumb.tsx`
- Test : `tests/content/furniture-thumb.test.tsx`, `tests/familles.ts` (`'furniture-thumb.*'` dans `scene-piece`)

**Interfaces :**
- Produces : `export function FurnitureThumb(props: { kind: FurnitureKind; style: StyleId }): ReactElement`, qui renvoie un `<svg data-thumb={kind} viewBox=… width="44" height="44" aria-hidden="true">`.

- [ ] **Step 1 : écrire les tests qui échouent**

```tsx
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FURNITURE_KINDS } from '../../src/core/library/furniture-catalog';
import { FurnitureThumb } from '../../src/content/furniture-thumb';

describe('FurnitureThumb', () => {
  it.each(FURNITURE_KINDS)('dessine %s', (kind) => {
    const html = renderToStaticMarkup(<FurnitureThumb kind={kind} style={kind === 'globe' || kind === 'telescope' || kind === 'automaton' ? 'steampunk' : 'scandinave'} />);
    expect(html).toContain(`data-thumb="${kind}"`);
    // Un vrai dessin, pas une boîte vide : au moins une forme.
    expect(html).toMatch(/<(path|rect|ellipse|circle|polygon)/);
  });

  it('cadre le dessin sur la taille du meuble', () => {
    const html = renderToStaticMarkup(<FurnitureThumb kind="sofa" style="scandinave" />);
    expect(html).toContain('viewBox="-6 -6 192 102"'); // 6 × 30 + 12 ; 3 × CELL_H + 12, à recalculer avec CELL_H réel
  });
});
```

La valeur du `viewBox` dépend de `CELL_H` (`HEIGHT / ROWS`, `room-grid.ts`). L'implémenteur la calcule (`6*30+12` × `3*CELL_H+12`) et écrit le nombre exact dans le test.

- [ ] **Step 2 : lancer le test et constater l'échec**

Run : `npx vitest run tests/content/furniture-thumb.test.tsx`
Expected : FAIL, module introuvable.

- [ ] **Step 3 : implémenter**

```tsx
import type { ReactElement } from 'react';
import { isSmallKind, sizeOf, SMALL_ITEM_OF, WINDOW_DEFAULT } from '../core/library/furniture-catalog';
import type { FurnitureKind, StyleId } from '../core/library/library-types';
import { CELL_H, CELL_W, type PxRect } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { ComputerArt, DeskArt, ShelfArt } from './furniture-art';
import { HomeArt, SmallArt } from './furniture-art-home';
import { AnalyticalEngineArt, SteampunkArt } from './furniture-art-steampunk';
import { WindowArt } from './window-art';

const PAD = 6;
// Taille de dessin des objets qui n'ont pas d'emprise au sol : l'ordinateur (sur un bureau) et les petits objets (sur une surface).
const COMPUTER = { w: 3, h: 2 } as const;
const SMALL = { w: 1, h: 2 } as const;

function cellsOf(kind: FurnitureKind): { w: number; h: number } {
  if (kind === 'window') return WINDOW_DEFAULT;
  if (kind === 'computer') return COMPUTER;
  if (isSmallKind(kind)) return SMALL;
  return sizeOf(kind);
}

// Vignette du tiroir : le vrai dessin du meuble, à la palette du style de la pièce, cadré sur son emprise.
export function FurnitureThumb({ kind, style }: { kind: FurnitureKind; style: StyleId }): ReactElement {
  const palette = paletteOf(style);
  const steampunk = style === 'steampunk';
  const { w, h } = cellsOf(kind);
  const rect: PxRect = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
  const art =
    kind === 'window' ? <WindowArt rect={rect} palette={palette} steampunk={steampunk} />
    : kind === 'computer' ? (steampunk ? <AnalyticalEngineArt rect={rect} /> : <ComputerArt rect={rect} />)
    : isSmallKind(kind) ? <SmallArt item={SMALL_ITEM_OF[kind]} rect={rect} palette={palette} />
    : kind === 'shelf' ? <ShelfArt rect={rect} palette={palette} showSlots={false} />
    : kind === 'globe' || kind === 'telescope' || kind === 'automaton' || (steampunk && (kind === 'desk' || kind === 'armchair' || kind === 'lamp')) ? <SteampunkArt kind={kind} rect={rect} palette={palette} lit />
    : kind === 'desk' ? <DeskArt rect={rect} palette={palette} />
    : <HomeArt kind={kind} rect={rect} palette={palette} lit />;
  return (
    <svg data-thumb={kind} viewBox={`${-PAD} ${-PAD} ${rect.w + PAD * 2} ${rect.h + PAD * 2}`} width="44" height="44" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {art}
    </svg>
  );
}
```

Si `WindowArt` sans `view` dessine un trou transparent, ajouter derrière un `<rect>` couleur ciel (`#9cc8e8`) aux dimensions de `rect`, pour que la vignette se lise comme une fenêtre. Vérifier les signatures exactes de `AnalyticalEngineArt` et `ComputerArt` (`imageUrl` optionnel) avant d'écrire.

- [ ] **Step 4 : relancer le test**

Run : `npx vitest run tests/content/furniture-thumb.test.tsx`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/content/furniture-thumb.tsx tests/content/furniture-thumb.test.tsx tests/familles.ts
git commit -m "feat(bibliotheque): vignettes dessinées des meubles"
```

---

### Task 5 : tiroir de construction

**Files :**
- Create : `src/content/build-drawer.tsx`
- Modify : `src/content/LibraryPanel.tsx` (retirer les rangées Style, Catégories, meubles, l'agrandissement et la rangée temporaire d'orientation ; rendre `<BuildDrawer/>` dans `.wmt-lib-stage`)
- Test : `tests/content/library-sims-ui.test.tsx`

**Interfaces :**
- Consumes : `catalogTree`, `CatalogNode`, `Subcategory` (tâche 1) ; `FurnitureThumb` (tâche 4) ; `Btn`, `Icon`, `ICONS` (tâche 2).
- Produces :
  ```ts
  export type DrawerTab = 'furniture' | 'cards' | 'room';
  export type DrawerState = { tab: DrawerTab; category: Category; sub: Subcategory | null; reduced: boolean };
  export const INITIAL_DRAWER: DrawerState;
  export function BuildDrawer(props: BuildDrawerProps): ReactElement;
  type BuildDrawerProps = {
    state: DrawerState; onState: (next: DrawerState) => void;
    style: StyleId; orientation: Orientation; hasCollection: boolean;
    activeKind: FurnitureKind | null; onKind: (kind: FurnitureKind) => void;
    cardActive: boolean; onCard: () => void;
    onStyle: (id: StyleId) => void; onOrientation: (o: Orientation) => void;
    onExtend: (side: 'left' | 'right') => void; onShrink: (side: 'left' | 'right') => void;
  };
  ```
  DOM produit : `<div data-drawer data-reduced="true|false">`. Onglets : `data-drawer-tab="furniture|cards|room"`, `role="tab"`, `aria-selected`. Catégories : `data-category`. Sous-catégories : `data-subcategory`. Vignettes : `button[data-kind]`, avec `aria-label="Poser : …"` et `aria-pressed`. Poignée : `data-action="drawer-reduce"`, puis `data-action="drawer-open"` une fois réduit. Les panneaux d'onglet sont toujours montés : `data-drawer-panel="…"`, avec `hidden` s'ils sont inactifs.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `tests/content/library-sims-ui.test.tsx`. Réactiver le test `todo` des rangées. Ajouter un second `describe` qui monte `<LibraryPanel library={repo} collection={…} />` pour l'onglet Cartes, en réutilisant le faux `CollectionRepo` de `tests/content/library-cards.test.tsx`.

```tsx
const drawer = () => q('[data-drawer]') as HTMLElement | null;
const panel = (id: string) => q(`[data-drawer-panel="${id}"]`) as HTMLElement | null;

describe('tiroir de construction', () => {
  it('n’existe qu’en Aménager', async () => {
    expect(drawer()).toBeNull();
    await click('[data-action="edit"]');
    expect(drawer()).not.toBeNull();
    expect(drawer()?.closest('[data-stage]')).not.toBeNull(); // dans la scène : visible en plein écran
  });

  it('montre les vignettes de la catégorie puis des sous-catégories de la Déco', async () => {
    await click('[data-action="edit"]');
    expect(q('[data-kind="shelf"] [data-thumb="shelf"]')).not.toBeNull();
    await click('[data-category="deco"]');
    expect(q('[data-subcategory="plants"]')).not.toBeNull();
    await click('[data-subcategory="lights"]');
    expect(q('[data-kind="lamp"]')).not.toBeNull();
    expect(q('[data-kind="plant"]')).toBeNull();
  });

  it('marque la vignette dont l’outil est actif', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    expect(q('[data-kind="desk"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('l’onglet Pièce porte le style, l’orientation et les dimensions', async () => {
    await click('[data-action="edit"]');
    await click('[data-drawer-tab="room"]');
    expect(panel('room')?.hidden).toBe(false);
    expect(panel('room')?.querySelector('[data-style]')).not.toBeNull();
    expect(panel('room')?.querySelector('[data-orient="portrait"]')).not.toBeNull();
    expect(panel('room')?.querySelector('[data-action="extend-right"]')).not.toBeNull();
  });

  it('se réduit en poignée et se rouvre au même endroit', async () => {
    await click('[data-action="edit"]');
    await click('[data-category="seats"]');
    await click('[data-action="drawer-reduce"]');
    expect(drawer()?.dataset.reduced).toBe('true');
    expect(q('[data-category]')).toBeNull();
    await click('[data-action="drawer-open"]');
    expect(q('[data-category="seats"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('reste réduit au changement de pièce', async () => {
    await click('[data-action="add-room"]');
    await click('[data-action="edit"]');
    await click('[data-action="drawer-reduce"]');
    await click('[data-room="r1"]');
    expect(drawer()?.dataset.reduced).toBe('true');
  });

  it('revient sur la première catégorie quand une pièce Steampunk change de style', async () => {
    await click('[data-action="edit"]');
    await click('[data-style="steampunk"]');
    await click('[data-category="steampunk"]');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('[data-style="scandinave"]');
    expect(q('[data-category="steampunk"]')).toBeNull();
    expect(q('[data-category="storage"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('sans Collection, pas d’onglet Cartes', async () => {
    await click('[data-action="edit"]');
    expect(q('[data-drawer-tab="cards"]')).toBeNull();
  });

  it('pas de tiroir dans la vue de la rue', async () => {
    // Reprendre la mise en place de tests/content/library-outside.test.tsx pour sortir (data-action="outside"), puis :
    // repasser en Aménager fait rentrer (comportement existant) : le tiroir revient.
  });
});

describe('tiroir avec la Collection', () => {
  // beforeEach : monter LibraryPanel avec le faux CollectionRepo de library-cards.test.tsx
  it('l’onglet Cartes lance la pose d’une carte', async () => {
    await click('[data-action="edit"]');
    await click('[data-drawer-tab="cards"]');
    await click('[data-action="add-card"]');
    expect(document.querySelector('.wmt-lib-dialog')).not.toBeNull();
  });
});
```

Pour « pas de tiroir dans la vue de la rue » : le bouton Sortir n'existe qu'en Visiter. Le test sort donc en Visiter, vérifie `drawer()` à `null`, puis reproduit le chemin de `library-outside.test.tsx` jusqu'à `outsidePhase === 'outside'`. Il affirme ensuite que `drawer()` reste `null` et que `q('[data-action="inside"]')` existe. Recopier dans ce test les mocks de caméra de `library-outside.test.tsx`.


- [ ] **Step 2 : lancer les tests et constater l'échec**

Run : `npx vitest run tests/content/library-sims-ui.test.tsx`
Expected : FAIL, `[data-drawer]` introuvable.

- [ ] **Step 3 : implémenter `build-drawer.tsx`**

```tsx
import type { ReactElement } from 'react';
import { catalogTree, labelOf, type Category, type Subcategory } from '../core/library/furniture-catalog';
import { STYLE_IDS, type FurnitureKind, type Orientation, type StyleId } from '../core/library/library-types';
import { STYLE_LABELS, paletteOf } from '../core/library/styles';
import { CATEGORY_ICON } from './furniture-icons';
import { FurnitureThumb } from './furniture-thumb';
import { Btn, Icon, ICONS } from './library-ui';

export type DrawerTab = 'furniture' | 'cards' | 'room';
export type DrawerState = { tab: DrawerTab; category: Category; sub: Subcategory | null; reduced: boolean };
export const INITIAL_DRAWER: DrawerState = { tab: 'furniture', category: 'storage', sub: null, reduced: false };

const SUB_ICON: Record<Subcategory, readonly string[]> = { plants: ICONS.plants, lights: ICONS.lights, floor: ICONS.floor, walls: ICONS.walls };
const TABS: { id: DrawerTab; label: string; icon: readonly string[] }[] = [
  { id: 'furniture', label: 'Meubles', icon: ICONS.sofaTab },
  { id: 'cards', label: 'Cartes', icon: ICONS.frame },
  { id: 'room', label: 'Pièce', icon: ICONS.bricks },
];

// Tiroir de construction (mode Aménager) : onglets → catégories → sous-catégories → vignettes. Réductible en une poignée.
export function BuildDrawer(props: BuildDrawerProps): ReactElement {
  const { state, onState, style, hasCollection } = props;
  if (state.reduced) {
    return (
      <div className="wmt-lib-drawer wmt-lib-drawer-reduced" data-drawer data-reduced="true">
        <Btn label="Ouvrir le tiroir de construction" data={{ action: 'drawer-open' }} onClick={() => onState({ ...state, reduced: false })}>
          <Icon paths={ICONS.chevronUp} />
        </Btn>
      </div>
    );
  }
  const tree = catalogTree(style);
  // Catégorie disparue (Steampunk quitté) ou onglet Cartes sans Collection : retour au premier choix.
  const node = tree.find((n) => n.id === state.category) ?? tree[0];
  const tab: DrawerTab = state.tab === 'cards' && !hasCollection ? 'furniture' : state.tab;
  const sub = node.subcategories.find((s) => s.id === state.sub) ?? node.subcategories[0] ?? null;
  const kinds = sub ? sub.kinds : node.kinds;
  const tabs = TABS.filter((t) => t.id !== 'cards' || hasCollection);
  return (
    <div className="wmt-lib-drawer" data-drawer data-reduced="false">
      <div className="wmt-lib-drawer-tabs" role="tablist" aria-label="Construction">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" className="wmt-lib-btn" aria-label={t.label} title={t.label} aria-selected={tab === t.id} data-drawer-tab={t.id} onClick={() => onState({ ...state, tab: t.id })}>
            <Icon paths={t.icon} />
          </button>
        ))}
        <span className="wmt-lib-sep" />
        <Btn label="Réduire le tiroir" data={{ action: 'drawer-reduce' }} onClick={() => onState({ ...state, reduced: true })}>
          <Icon paths={ICONS.chevronDown} />
        </Btn>
      </div>

      <div data-drawer-panel="furniture" hidden={tab !== 'furniture'}>
        <div className="wmt-lib-chips" role="group" aria-label="Catégories de meubles">
          {tree.map((c) => (
            <Btn key={c.id} className="wmt-lib-chip" label={c.label} pressed={node.id === c.id} data={{ category: c.id }} onClick={() => onState({ ...state, category: c.id, sub: null })}>
              <Icon paths={CATEGORY_ICON[c.id]} />
              <span>{c.label}</span>
            </Btn>
          ))}
        </div>
        {node.subcategories.length > 0 && (
          <div className="wmt-lib-chips wmt-lib-subchips" role="group" aria-label={`Sous-catégories : ${node.label}`}>
            {node.subcategories.map((s) => (
              <Btn key={s.id} className="wmt-lib-chip" label={s.label} pressed={sub?.id === s.id} data={{ subcategory: s.id }} onClick={() => onState({ ...state, sub: s.id })}>
                <Icon paths={SUB_ICON[s.id]} />
                <span>{s.label}</span>
              </Btn>
            ))}
          </div>
        )}
        <div className="wmt-lib-thumbs">
          {kinds.map((kind) => (
            <Btn key={kind} className="wmt-lib-thumb" label={`Poser : ${labelOf(kind)}`} pressed={props.activeKind === kind} data={{ kind }} onClick={() => props.onKind(kind)}>
              <FurnitureThumb kind={kind} style={style} />
              <span className="wmt-lib-thumb-name">{labelOf(kind)}</span>
            </Btn>
          ))}
        </div>
      </div>

      {hasCollection && (
        <div data-drawer-panel="cards" hidden={tab !== 'cards'} className="wmt-lib-thumbs">
          <Btn className="wmt-lib-thumb" label="Ajouter une carte" pressed={props.cardActive} data={{ action: 'add-card' }} onClick={props.onCard}>
            <Icon paths={ICONS.card} />
            <span className="wmt-lib-thumb-name">Carte</span>
          </Btn>
        </div>
      )}

      <div data-drawer-panel="room" hidden={tab !== 'room'}>
        <div className="wmt-lib-chips" role="group" aria-label="Style de la pièce">
          {STYLE_IDS.map((id) => (
            <Btn key={id} label={STYLE_LABELS[id]} pressed={style === id} data={{ style: id }} onClick={() => props.onStyle(id)}>
              <span className="wmt-lib-swatch" style={{ background: paletteOf(id).wall, borderColor: paletteOf(id).floor }} />
            </Btn>
          ))}
        </div>
        <div className="wmt-lib-chips" role="group" aria-label="Dimensions de la pièce">
          <Btn label="Pièce horizontale" pressed={props.orientation === 'landscape'} data={{ orient: 'landscape' }} onClick={() => props.onOrientation('landscape')}><Icon paths={ICONS.landscape} /></Btn>
          <Btn label="Pièce verticale" pressed={props.orientation === 'portrait'} data={{ orient: 'portrait' }} onClick={() => props.onOrientation('portrait')}><Icon paths={ICONS.portrait} /></Btn>
          <span className="wmt-lib-sep" />
          <Btn label="Agrandir la pièce à gauche" data={{ action: 'extend-left' }} onClick={() => props.onExtend('left')}><Icon paths={ICONS.extendLeft} /></Btn>
          <Btn label="Réduire la pièce à gauche" data={{ action: 'shrink-left' }} onClick={() => props.onShrink('left')}><Icon paths={ICONS.shrinkLeft} /></Btn>
          <Btn label="Réduire la pièce à droite" data={{ action: 'shrink-right' }} onClick={() => props.onShrink('right')}><Icon paths={ICONS.shrinkRight} /></Btn>
          <Btn label="Agrandir la pièce à droite" data={{ action: 'extend-right' }} onClick={() => props.onExtend('right')}><Icon paths={ICONS.extendRight} /></Btn>
        </div>
      </div>
    </div>
  );
}
```

L'onglet Cartes affiche un glyphe et non une vignette dessinée, car une carte n'est pas un meuble. Le libellé « Carte » sous le glyphe suit la règle des vignettes, qui portent toutes un nom.

CSS à ajouter dans `LIBRARY_CSS` :

```css
.wmt-lib-drawer{position:absolute;left:0;right:0;bottom:0;z-index:5;display:flex;flex-direction:column;gap:6px;padding:6px 8px 8px;background:var(--color-surface,#0d1117);border-top:1px solid var(--color-border,rgba(148,163,184,.35));box-shadow:0 -6px 18px rgba(0,0,0,.35)}
.wmt-lib-drawer-reduced{left:auto;right:auto;align-self:center;padding:0;background:transparent;border:0;box-shadow:none}
.wmt-lib-drawer-reduced .wmt-lib-btn{min-height:32px;background:rgba(0,0,0,.65);color:#fff;border-radius:16px 16px 0 0}
.wmt-lib-drawer-tabs{display:flex;gap:6px;align-items:center}
.wmt-lib-drawer [hidden]{display:none}
.wmt-lib-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.wmt-lib-chip{padding:0 10px;white-space:nowrap;font-size:13px}
.wmt-lib-subchips .wmt-lib-chip{min-height:32px;font-size:12px}
.wmt-lib-thumbs{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.wmt-lib-thumb{flex:0 0 auto;flex-direction:column;width:64px;height:72px;padding:4px;border-radius:10px;gap:2px}
.wmt-lib-thumb-name{font-size:10px;line-height:12px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wmt-lib-stage[data-editing="true"]{padding-bottom:var(--wmt-drawer-h,0px)}
```

Le tiroir est en `position:absolute` en bas de `.wmt-lib-stage`. Hors plein écran, la scène prend un `padding-bottom` de la hauteur du tiroir, pour qu'il ne masque pas le sol. On mesure cette hauteur avec un `ResizeObserver` sur `[data-drawer]` et on l'écrit dans la variable CSS `--wmt-drawer-h` du stage. En plein écran, le tiroir recouvre le bas de l'image : c'est voulu, d'où la poignée.

- [ ] **Step 4 : câbler `LibraryPanel.tsx`**

- Remplacer `const [category, setCategory] = useState<Category>('storage');` par `const [drawer, setDrawer] = useState<DrawerState>(INITIAL_DRAWER);`.
- Supprimer `cats` et `shownCategory`. Dans `chooseStyle`, remplacer `if (category === 'steampunk' && id !== 'steampunk') setCategory('storage');` par `if (drawer.category === 'steampunk' && id !== 'steampunk') setDrawer((d) => ({ ...d, category: 'storage', sub: null }));`.
- Le clic sur une catégorie appelait `reset()`. Garder ce comportement : passer à `BuildDrawer` un `onState` qui appelle `reset()` quand `next.category !== drawer.category` ou `next.tab !== drawer.tab`, puis `setDrawer(next)`.
- Supprimer les rangées « Style de la pièce », « Catégories de meubles », la rangée des meubles et actions (l. 1077-1148, **sauf** les boutons d'action sur la sélection, déplacés en tâche 6 : les garder pour l'instant dans une `<div className="wmt-lib-row">` affichée seulement si `editing && selectedId`), et la rangée temporaire d'orientation de la tâche 3.
- Dans `.wmt-lib-stage`, ajouter `data-editing={editing}` et, après le `RoomView` :

```tsx
{editing && !outside && (
  <BuildDrawer
    state={drawer} onState={onDrawer}
    style={room.style} orientation={room.orientation} hasCollection={collection !== undefined}
    activeKind={tool?.type === 'new' ? tool.kind : null} onKind={startNew}
    cardActive={tool?.type === 'card'} onCard={startCard}
    onStyle={chooseStyle} onOrientation={chooseOrientation}
    onExtend={(side) => void extend(side)} onShrink={(side) => void shrink(side)}
  />
)}
```

Une fois la rangée temporaire des actions retirée en tâche 6, il ne reste qu'une rangée : la barre du haut. Le test « les rangées empilées ont disparu » ne passera donc qu'en tâche 6. Le laisser en `todo` jusque-là.

- [ ] **Step 5 : lancer les tests**

Run : `npx vitest run tests/content/library-sims-ui.test.tsx`
Expected : PASS (sauf le `todo`).

Run : `npm run test:famille -- scene-piece scene-commun scene-ville scene-lumiere scene-animaux`
Expected : vert. Les tests qui cliquaient `[data-category=…]` ou `[data-kind=…]` passent sans changement. Ceux qui cliquaient `[data-orient]` en Visiter doivent d'abord passer en Aménager : les adapter ainsi, et rien d'autre.

- [ ] **Step 6 : commit**

```bash
git add src/content/build-drawer.tsx src/content/LibraryPanel.tsx tests/content/
git commit -m "feat(bibliotheque): tiroir de construction façon Sims (meubles, cartes, pièce)"
```

---

### Task 6 : bulle d'actions sur la sélection

**Files :**
- Create : `src/content/action-bubble.tsx`
- Modify : `src/content/LibraryPanel.tsx` (retirer la rangée temporaire des actions et rendre `<ActionBubble/>` dans le stage)
- Test : `tests/content/library-sims-ui.test.tsx`

**Interfaces :**
- Produces :
  ```ts
  export function ActionBubble(props: { stage: HTMLElement | null; scroll: HTMLElement | null; targetId: string; children: ReactNode }): ReactElement;
  ```
  DOM produit : `<div data-action-bubble role="toolbar" aria-label="Actions sur l’objet">`, positionné en `absolute` dans le stage.

- [ ] **Step 1 : écrire les tests qui échouent**

```tsx
describe('bulle d’actions', () => {
  async function selectShelf() {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-13"]');
    await click('[data-furniture="shelf"]');
  }

  it('apparaît sur la sélection avec ses actions', async () => {
    expect(q('[data-action-bubble]')).toBeNull();
    await selectShelf();
    const bubble = q('[data-action-bubble]');
    expect(bubble?.querySelector('[data-action="move"]')).not.toBeNull();
    expect(bubble?.querySelector('[data-action="remove"]')).not.toBeNull();
    expect(bubble?.querySelector('[data-action="depth-front"]')).not.toBeNull();
    expect(bubble?.querySelector('[data-action="lamp"]')).toBeNull();
  });

  it('propose la lampe pour une lampe et la taille pour une fenêtre', async () => {
    await click('[data-action="edit"]');
    await click('[data-category="deco"]');
    await click('[data-subcategory="lights"]');
    await click('[data-kind="lamp"]');
    await click('[data-cell="3-13"]');
    await click('[data-furniture="lamp"]');
    expect(q('[data-action-bubble] [data-action="lamp"]')).not.toBeNull();
  });

  it('disparaît en Visiter et après le retrait', async () => {
    await selectShelf();
    await click('[data-action="remove"]');
    expect(q('[data-action-bubble]')).toBeNull();
    await selectShelf();
    await click('[data-action="visit"]');
    expect(q('[data-action-bubble]')).toBeNull();
  });

  it('reste affichée tiroir réduit', async () => {
    await selectShelf();
    await click('[data-action="drawer-reduce"]');
    expect(q('[data-action-bubble]')).not.toBeNull();
  });
});
```

Réactiver le test « les rangées empilées ont disparu » (`it.todo` → `it`).

Pour le cas de la fenêtre : poser une fenêtre demande une case de mur valide. Reprendre la case utilisée dans `tests/content/library-window-furniture.test.tsx`, puis affirmer `[data-action-bubble] [data-action="win-w+"]`.

- [ ] **Step 2 : lancer les tests et constater l'échec**

Run : `npx vitest run tests/content/library-sims-ui.test.tsx`
Expected : FAIL, `[data-action-bubble]` est `null`.

- [ ] **Step 3 : implémenter `action-bubble.tsx`**

```tsx
import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

const GAP = 8;

// Bulle posée au-dessus de l'objet sélectionné (en dessous s'il touche le haut), bornée à la largeur de la scène.
// Recalculée au défilement de la pièce, au redimensionnement et quand la sélection change.
export function ActionBubble({ stage, scroll, targetId, children }: { stage: HTMLElement | null; scroll: HTMLElement | null; targetId: string; children: ReactNode }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const place = (): void => {
      const bubble = ref.current;
      const target = scroll?.querySelector(`[data-id="${CSS.escape(targetId)}"]`);
      if (!stage || !bubble || !target) return;
      const s = stage.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      const b = bubble.getBoundingClientRect();
      const above = t.top - s.top - b.height - GAP;
      const top = above >= 0 ? above : t.bottom - s.top + GAP;
      const left = Math.min(Math.max(0, t.left - s.left + t.width / 2 - b.width / 2), Math.max(0, s.width - b.width));
      setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    scroll?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      scroll?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  });
  return (
    <div ref={ref} className="wmt-lib-bubble" data-action-bubble role="toolbar" aria-label="Actions sur l’objet" style={{ left: pos.left, top: pos.top }}>
      {children}
    </div>
  );
}
```

`useLayoutEffect` n'a pas de tableau de dépendances : il se recale à chaque rendu (sélection, layout, taille de la fenêtre). C'est bon marché, une seule mesure. En jsdom, les rectangles valent 0, la bulle reste à (0,0) et les tests ne vérifient que sa présence.

CSS :

```css
.wmt-lib-bubble{position:absolute;z-index:6;display:flex;flex-wrap:wrap;gap:4px;max-width:min(92%,360px);padding:4px;border-radius:22px;background:var(--color-surface,#0d1117);border:1px solid var(--color-accent,#34d399);box-shadow:0 4px 14px rgba(0,0,0,.45)}
```

- [ ] **Step 4 : câbler `LibraryPanel.tsx`**

Retirer la rangée temporaire des actions de la tâche 5. Dans `.wmt-lib-stage`, après le tiroir :

```tsx
{editing && !outside && selectedId && (
  <ActionBubble stage={stage.ref.current} scroll={scrollRef.current} targetId={selectedId}>
    {/* exactement les Btn actuels : move, remove, depth-front, depth-back (si selectedStanding),
        lamp (si selectedLamp), win-w-, win-w+, win-h-, win-h+, win-w-full, win-h-full (si selectedWindow) */}
  </ActionBubble>
)}
```

Garder les mêmes `label`, `data` et `onClick` qu'aux l. 1102-1128 actuelles.

- [ ] **Step 5 : lancer les tests**

Run : `npx vitest run tests/content/library-sims-ui.test.tsx`
Expected : PASS, y compris « les rangées empilées ont disparu ».

Run : `npm run test:famille -- scene-piece scene-commun scene-ville scene-lumiere scene-animaux scene-meteo`
Expected : vert.

- [ ] **Step 6 : commit**

```bash
git add src/content/action-bubble.tsx src/content/LibraryPanel.tsx tests/content/library-sims-ui.test.tsx
git commit -m "feat(bibliotheque): bulle d'actions sur l'objet sélectionné"
```

---

### Task 7 : fiche WikiHow et vérifications finales

**Files :**
- Modify : `src/core/whats-new/entries.ts` (nouvelle entrée après `bibliotheque-v26`)

- [ ] **Step 1 : ajouter l'entrée `bibliotheque-v27`**

Suivre la forme de `bibliotheque-v26` (theme `collection`, `steps` avec `details` « À quoi ça sert / Comment faire / Comment ça marche / Limites », `scene: { page: '/collection', closeWindows: true }`) :

```ts
  {
    id: 'bibliotheque-v27',
    theme: 'collection',
    glyph: '🛋️',
    title: 'Aménager sa pièce comme dans les Sims',
    summary: 'Un tiroir de construction en bas, les réglages en haut, une bulle sur l’objet choisi',
    steps: [
      {
        target: '[data-wmt-library-entry]',
        gesture: 'tap',
        title: 'Le tiroir de construction',
        text: 'En mode Aménager, un tiroir s’ouvre en bas de la pièce avec trois onglets : Meubles, Cartes et Pièce. Dans Meubles, choisissez une catégorie (Rangement, Assises, Déco, Pour animaux), puis une sous-catégorie pour la Déco (Plantes, Lumières, Sol, Murs) : chaque meuble est montré par son dessin.',
        details: [
          { label: 'À quoi ça sert', text: 'À garder la pièce visible pendant qu’on la meuble, au lieu de l’empiler sous des rangées de boutons.' },
          { label: 'Comment faire', text: 'Touchez une vignette, puis une case de la pièce (ou faites-la glisser). Le tiroir reste ouvert pour poser plusieurs objets d’affilée. La flèche ▾ le réduit à une petite poignée pour contempler la scène, même en plein écran.' },
          { label: 'Limites', text: 'Le tiroir n’apparaît ni en mode Visiter ni dans la vue de la rue : on ne meuble pas la rue.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'La bulle d’actions',
        text: 'Touchez un objet posé : une bulle apparaît au-dessus de lui avec Déplacer, Retirer, Avancer, Reculer, et selon l’objet, allumer la lampe ou changer la taille de la fenêtre.',
        details: [
          { label: 'À quoi ça sert', text: 'À agir sur l’objet là où il est, comme dans les Sims.' },
          { label: 'Comment ça marche', text: 'La bulle suit l’objet quand la pièce défile ; près du haut de l’écran, elle passe en dessous.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]'] },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'Les réglages en haut',
        text: 'Le ciel, l’heure et la météo (☁️), les animaux (🐾) et les réglages de la pièce (⋯ : nom, pièce d’accueil, suppression) sont maintenant dans la barre du haut, aussi en mode Visiter. Le style, l’orientation et la taille de la pièce sont dans l’onglet Pièce du tiroir.',
        details: [
          { label: 'À quoi ça sert', text: 'À séparer ce qu’on construit (le tiroir) de l’ambiance de la scène (la barre du haut).' },
          { label: 'Limites', text: 'L’orientation de la pièce ne se change plus en mode Visiter : passez en Aménager, onglet Pièce.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]'] },
      },
    ],
  },
```

Vérifier l'ordre et la forme exacte attendus (tableau trié ? `gesture` obligatoire sur la 1ʳᵉ étape ?) en lisant `tests/core/whats-new/*.test.ts`.

- [ ] **Step 2 : tests des nouveautés et des familles de la scène**

Run : `npm run test:famille -- socle scene-piece scene-commun scene-ville scene-lumiere scene-animaux scene-meteo`
La famille `socle` contient les tests `whats-new`.
Expected : tout est vert.

- [ ] **Step 3 : typage, lint et build**

Run : `npx tsc --noEmit -p .`, puis `npm run build`.
Expected : aucune erreur.

- [ ] **Step 4 : commit**

```bash
git add src/core/whats-new/entries.ts
git commit -m "feat(bibliotheque): fiche WikiHow Aménager façon Sims"
```

- [ ] **Step 5 : vérification visuelle**

D'abord le banc de bureau, en émulation tactile 412×915, sur la pièce avec le tiroir ouvert, la Déco › Lumières, un objet sélectionné avec sa bulle, le tiroir réduit en plein écran et un menu ☁️ ouvert. Ensuite l'APK pré-prod sur le S26 Ultra (voir la mémoire « Mesure sur téléphone »). Montrer les captures à l'utilisateur avant la PR.

---

## Après le plan

Il reste à ouvrir la PR vers `main`, puis à la fusionner sans demander. On livre ensuite en pré-prod (`npm run preprod`) sans demander. On ne fait **pas** de mise en production.
