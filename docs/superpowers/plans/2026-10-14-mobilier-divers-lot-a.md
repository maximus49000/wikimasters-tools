# Mobilier divers — lot A (meubles au sol) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ajouter 19 meubles au sol (9 assises, commode, guéridon, arbre à chat, 5 plantes, lanterne, lampadaire arc) à la pièce de la Bibliothèque, en vrais modèles 3D, avec leurs règles pour les animaux et la lumière.

**Architecture:** chaque meuble est un type `StandingKind` avec un modèle 3D en cm (`furniture-models.ts`), rendu par le moteur existant (`furniture-render3d.ts`). Le moteur gagne un socle séparé (`Model.base`, cases au sol réduites au socle) et deux formes de feuille (`Leaf.form`). Les règles des animaux passent par une table de rôles (`pets/roles.ts`) au lieu de tests par type. Est une lampe tout meuble dont le modèle a un `glow`.

**Tech Stack:** TypeScript strict, React (SVG), Vitest (+ jsdom pour `tests/content`), WXT ; familles de tests `npm run test:famille -- <noms>`.

**Spec:** `docs/superpowers/specs/2026-10-14-mobilier-divers-lot-a-design.md` (maquettes validées : `docs/superpowers/maquettes/mobilier-divers/`).

## Global Constraints

- Worktree `C:\Users\maxim\Downloads\Wikimasters-mobilier`, branche `feat/mobilier-divers-a` (depuis `origin/main` 88aad4c). Toutes les commandes s'y lancent.
- Unités des modèles : cm ; x largeur depuis la gauche vue de face, y hauteur depuis le sol, z profondeur depuis l'avant. Toute pièce doit tenir dans la boîte `w × d × h` (test existant, tolérance 0,01 ; les feuilles comptent ± leur demi-largeur sur les 3 axes).
- Aucune pièce de modèle de type boîte ne doit être entièrement contenue dans une autre boîte du même modèle (test existant).
- En tête de chaque bloc de modèles ajouté : commentaire `// Dessin provisoire Opus — Fable n'est pas passé (gel jusqu'au 2026-10-17), reprise Fable prévue.`
- Pas de migration : la pièce reste en version 7.
- Commentaires et libellés en français, style du fichier voisin (densité de commentaires comparable).
- Commits : messages en français, préfixe `feat(bibliotheque):` / `test(bibliotheque):` / `docs(bibliotheque):`, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ne jouer que les familles touchées (`scene-piece`, `scene-animaux`, `scene-lumiere`) ; pas de TNR global.

## Review Focus

1. **Pièces déjà aménagées** : un chien, un chat et un robot dans une pièce avec seulement les anciens meubles doivent se comporter exactement comme avant (chien sur le canapé seulement, chat caché sous le canapé). → tâche 6, tests de non-régression existants + test « anciens meubles inchangés ».
2. **Lampadaire arc tourné** (profil, ¾) : seules les cases du socle comptent au sol, à chaque angle ; le dessin n'est pas coupé. → tâche 1 (`footprint` à 8 angles) et tâche 5 (rendu à 8 angles).
3. **Lampe éteinte rechargée** : `lit: false` d'une lanterne ou d'un lampadaire arc survit à l'enregistrement (`parseLibraryState` retire `lit` des non-lampes). → tâche 5, test `parseLibraryState`.
4. **Pièce Steampunk** : les nouvelles lampes reçoivent leurs garnitures et restent dans leur boîte ; changer de style ne retire aucun nouveau meuble. → tâche 5 (garnitures), tâche 2 (`STEAMPUNK_ONLY` inchangé, test).
5. **Coût du rendu sur Android** : le palmier (nombreuses folioles) ne doit pas exploser le nombre de formes. → tâche 4, test « palmier < 500 formes à chaque angle ».

---

### Task 1: Moteur 3D — socle séparé et formes de feuille

**Files:**
- Modify: `src/core/library/furniture-render3d.ts` (types `Leaf`, `Model` ; `leafSamples`, `drawFoliage`, `floorOf`, `floorTraceOf`, nouvelle `footOf`, nouvelle `leafHalf`)
- Test: `tests/core/library/furniture-render3d.test.ts`

**Interfaces:**
- Produces: `Model.base?: { x: number; z: number; w: number; d: number; round?: boolean }` ; `Leaf.form?: 'lance' | 'heart' | 'paddle'` ; `export function leafHalf(form: LeafForm, s: number, w: number): number` ; `export type LeafForm = 'lance' | 'heart' | 'paddle'`.

- [ ] **Step 1: Write the failing tests** (ajouter à la fin de `tests/core/library/furniture-render3d.test.ts` ; ajouter `leafHalf` à l'import existant du module et `type Model` si absent)

```ts
describe('socle séparé (base)', () => {
  // Meuble large de 160 cm dont seul un socle de 32 × 32 cm, à droite, touche le sol.
  const arc: Model = {
    w: 160, d: 32, h: 100,
    pieces: [{ shape: 'box', x: 128, y: 0, z: 0, w: 32, h: 10, d: 32, fill: 'metal' }, { shape: 'box', x: 0, y: 90, z: 0, w: 160, h: 10, d: 32, fill: 'metal' }],
    base: { x: 128, z: 0, w: 32, d: 32 },
  };
  it('le rectangle de dessin garde toute la largeur du meuble', () => {
    expect(renderModel(arc, 0).cols).toBe(8);
  });
  it('de face, seules les cases du socle sont au sol', () => {
    const floor = renderModel(arc, 0).floor;
    expect(floor.map((c) => c.col).sort()).toEqual([6, 7]);
  });
  it('à chaque angle, pas plus de 4 cases au sol', () => {
    for (const a of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const n = renderModel(arc, a).floor.length;
      expect(n, 'angle ' + a).toBeGreaterThan(0);
      expect(n, 'angle ' + a).toBeLessThanOrEqual(4);
    }
  });
  it('sans socle, rien ne change (trace = boîte entière)', () => {
    const { base: _b, ...plain } = arc;
    expect(renderModel(plain, 0).floor.length).toBe(8);
  });
});

describe('formes de feuille', () => {
  it('pointue aux deux bouts quelle que soit la forme', () => {
    for (const f of ['lance', 'heart', 'paddle'] as const) {
      expect(leafHalf(f, 0, 10)).toBeCloseTo(0, 5);
      expect(leafHalf(f, 1, 10)).toBeLessThan(1);
    }
  });
  it('le cœur est le plus large avant le milieu, la palette reste large jusqu’au bout', () => {
    const at = (f: 'lance' | 'heart' | 'paddle') => Array.from({ length: 11 }, (_, i) => leafHalf(f, i / 10, 10));
    const heart = at('heart');
    expect(heart.indexOf(Math.max(...heart))).toBeLessThan(5);
    expect(leafHalf('paddle', 0.85, 10)).toBeGreaterThan(leafHalf('lance', 0.85, 10));
  });
  it('une feuille en cœur a des fentes : son contour a plus de points qu’une feuille pointue', () => {
    const leaf = (form: 'lance' | 'heart'): Model => ({ w: 40, d: 40, h: 40, pieces: [{ shape: 'foliage', fill: 'leaf', leaves: [{ base: [20, 5, 20], ctrl: [20, 20, 15], tip: [20, 32, 12], w: 16, form }] }] });
    const pts = (m: Model) => renderModel(m, 0).shapes.filter((s) => s.kind === 'poly').map((s) => (s.kind === 'poly' ? s.points.length : 0))[0]!;
    expect(pts(leaf('heart'))).toBeGreaterThan(pts(leaf('lance')));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/furniture-render3d.test.ts`
Expected: FAIL (`leafHalf` non exporté ; `base` non pris en compte : 8 cases au sol au lieu de 2).

- [ ] **Step 3: Implement**

Dans `furniture-render3d.ts` :

1. Types (remplacer les définitions de `Leaf` et `Model`) :

```ts
// Feuille : nervure en courbe de Bézier (base → contrôle → pointe), largeur maximale `w` (cm). `form` : 'lance' pointue (défaut),
// 'heart' large en cœur avec trois paires de fentes (monstera), 'paddle' en palette à bout arrondi (oiseau de paradis).
export type LeafForm = 'lance' | 'heart' | 'paddle';
export type Leaf = { base: V3t; ctrl: V3t; tip: V3t; w: number; fill?: Fill; form?: LeafForm };
```

et, dans le commentaire de `Model`, ajouter la ligne puis le champ :

```ts
// `base` : socle (cm, repère du modèle) quand seul lui touche le sol (lampadaire arc) : il donne les cases au sol et l'ombre au sol ;
// le rectangle de dessin reste celui de la boîte entière.
export type Model = { w: number; d: number; h: number; pieces: Piece[]; pois?: Poi3d[]; face?: { x: number; y: number; w: number; h: number }; round?: boolean; perch?: Perch; glow?: V3t; base?: { x: number; z: number; w: number; d: number; round?: boolean } };
```

2. Après `baseOf`, ajouter :

```ts
// Ce qui touche le sol : le socle s'il est déclaré (rectangle ou ellipse inscrite à 16 côtés), sinon la base entière.
function footOf(model: Model): [number, number][] {
  const b = model.base;
  if (!b) return baseOf(model);
  if (!b.round) return [[b.x, b.z], [b.x + b.w, b.z], [b.x + b.w, b.z + b.d], [b.x, b.z + b.d]];
  return Array.from({ length: 16 }, (_, i): [number, number] => {
    const a = ((i + 0.5) * Math.PI) / 8;
    return [b.x + b.w / 2 + (b.w / 2) * Math.cos(a) / Math.cos(Math.PI / 16), b.z + b.d / 2 + (b.d / 2) * Math.sin(a) / Math.cos(Math.PI / 16)];
  });
}
```

3. `footprint` prend le polygone en paramètre :

```ts
// Trace tournée d'un polygone de base (cm, repère local) : la base entière par défaut.
function footprint(model: Model, f: Frame, poly: [number, number][] = baseOf(model)): [number, number][] {
  return poly.map(([x, z]) => {
    const p = local(f, { x, y: 0, z });
    return [p.x, p.z];
  });
}
```

4. `floorOf` : la largeur (décalage) vient de la base entière, l'aire du socle :

```ts
function floorOf(model: Model, L: Layout3d): { col: number; row: number }[] {
  const traceW = Math.max(...footprint(model, L.f).map((p) => p[0]));
  const trace = footprint(model, L.f, footOf(model));
  const shiftX = (L.cols * 21 - traceW) / 2;
```
(le reste de la fonction est inchangé).

5. `floorTraceOf` : `return footOf(model).map(([x, z]) => L.toPx({ x, y: 0, z }));`

6. Demi-largeur par forme, puis `leafSamples` l'utilise :

```ts
// Demi-largeur (cm) d'une feuille au point s ∈ [0, 1] de sa nervure, pour une largeur maximale w.
export function leafHalf(form: LeafForm, s: number, w: number): number {
  if (s <= 0 || s >= 1) return 0;
  if (form === 'heart') return (w / 2) * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.65)), 0.7);
  if (form === 'paddle') return (w / 2) * Math.min(1, s / 0.12) * Math.sqrt(Math.sin(Math.PI * (0.06 + 0.94 * s)));
  return (w / 2) * Math.sin(Math.PI * Math.pow(s, 0.8));
}
```

et dans `leafSamples`, remplacer `(l.w / 2) * Math.sin(Math.PI * Math.pow(s, 0.8))` par `leafHalf(l.form ?? 'lance', s, l.w)`.
(Vérifier : pour `lance`, s = 0 donnait 0 et s = 1 donnait sin(π) ≈ 1e-16 : comportement identique.)

7. Fentes du cœur, dans `drawFoliage`, juste avant `right.reverse();` :

```ts
    // Monstera : trois paires de fentes, le bord ramené vers la nervure aux points 3, 5 et 7.
    if (l.form === 'heart') {
      for (const i of [3, 5, 7]) {
        const [cx, cy] = line[i]!;
        const pull = (p: [number, number]): [number, number] => [cx + (p[0] - cx) * 0.4, cy + (p[1] - cy) * 0.4];
        left.splice(i, 0, pull(left[i]!));
        right.splice(i, 0, pull(right[i]!));
      }
    }
```
(chaque fente insère un point rentrant avant le point d'origine : le contour a 6 points de plus.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/furniture-render3d.test.ts tests/core/library/footprint.test.ts tests/core/library/furniture-models.test.ts`
Expected: PASS (les anciens meubles n'ont ni `base` ni `form` : rien ne change pour eux).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/furniture-render3d.ts tests/core/library/furniture-render3d.test.ts
git commit -m "feat(bibliotheque): socle séparé et feuilles en cœur ou en palette dans le moteur 3D"
```

---

### Task 2: Les 9 assises

**Files:**
- Modify: `src/core/library/library-types.ts:10` (`STANDING_KINDS`)
- Modify: `src/core/library/furniture-models.ts` (helpers `box`/`cyl` avec `extra`, `cone`, `rocker`, 9 modèles)
- Modify: `src/core/library/furniture-catalog.ts` (`FOOTPRINTS`, `LABELS`, `CATEGORIES`, `Subcategory`, `SUBCATEGORIES`)
- Modify: `src/core/library/library-book.ts:224-246` (`V5_SIZES`, `V5_FOOT` partiels)
- Modify: `src/content/furniture-icons.ts` (glyphes)
- Modify: `src/content/build-drawer.tsx:13` (`SUB_ICON`)
- Test: `tests/core/library/furniture-models.test.ts`, `tests/core/library/furniture-catalog.test.ts`

**Interfaces:**
- Consumes: rien de la tâche 1 (indépendante), sauf le moteur.
- Produces: types `'rocking-chair' | 'club-chair' | 'loveseat' | 'daybed' | 'egg-chair' | 'peacock-chair' | 'pouf' | 'beanbag' | 'bench'` ; `Subcategory` gagne `'chairs' | 'couches' | 'poufs'` ; helpers `cone(cx, cz, y, r, r2, h, fill, extra?)`, `type Extra = { tone?: number; layer?: number; color?: string }` (les tâches 3 à 5 s'en servent).

- [ ] **Step 1: Write the failing tests**

Dans `tests/core/library/furniture-models.test.ts`, compléter `DIMS` :

```ts
  'rocking-chair': [65, 95, 104], 'club-chair': [90, 85, 80], loveseat: [150, 88, 82], daybed: [165, 70, 85], 'egg-chair': [100, 100, 195],
  'peacock-chair': [90, 65, 140], pouf: [55, 55, 40], beanbag: [80, 80, 70], bench: [120, 40, 48],
```

et ajouter :

```ts
describe('assises du mobilier divers', () => {
  const places = (k: keyof typeof FURNITURE_MODELS, t: string) => (FURNITURE_MODELS[k].pois ?? []).filter((p) => p.type === t).length;
  it('places assises et couchages', () => {
    expect([places('rocking-chair', 'seat'), places('club-chair', 'seat'), places('loveseat', 'seat'), places('daybed', 'seat')]).toEqual([1, 1, 2, 1]);
    expect([places('egg-chair', 'seat'), places('peacock-chair', 'seat'), places('pouf', 'seat'), places('bench', 'seat')]).toEqual([1, 1, 1, 2]);
    expect([places('loveseat', 'sleep'), places('daybed', 'sleep'), places('beanbag', 'sleep')]).toEqual([1, 1, 1]);
    expect(places('loveseat', 'hide')).toBe(1);
  });
  it('hauteurs de perchoir de la maquette', () => {
    const y = (k: keyof typeof FURNITURE_MODELS) => FURNITURE_MODELS[k].perch?.y;
    expect([y('rocking-chair'), y('club-chair'), y('loveseat'), y('daybed'), y('egg-chair'), y('peacock-chair'), y('pouf'), y('beanbag'), y('bench')]).toEqual([52, 49, 49, 49, 70, 50, 40, 35, 48]);
  });
  it('perchoirs et places dans la boîte du meuble', () => {
    for (const k of ['rocking-chair', 'club-chair', 'loveseat', 'daybed', 'egg-chair', 'peacock-chair', 'pouf', 'beanbag', 'bench'] as const) {
      const m = FURNITURE_MODELS[k];
      const p = m.perch!;
      expect(p.x >= 0 && p.x + p.w <= m.w && p.z >= 0 && p.z + p.d <= m.d && p.y <= m.h, k).toBe(true);
      for (const q of m.pois ?? []) expect(q.x >= 0 && q.x <= m.w && q.z >= 0 && q.z <= m.d, k).toBe(true);
    }
  });
  it('se dessinent à chaque angle', () => {
    for (const k of ['rocking-chair', 'club-chair', 'loveseat', 'daybed', 'egg-chair', 'peacock-chair', 'pouf', 'beanbag', 'bench'] as const)
      for (const a of [0, 1, 2, 3, 4, 5, 6, 7] as const) expect(renderModel(FURNITURE_MODELS[k], a).shapes.length, k + ' ' + a).toBeGreaterThan(3);
  });
});
```

Dans `tests/core/library/furniture-catalog.test.ts` :
- test « les catégories couvrent chaque type une seule fois » : inchangé (il lit `STANDING_KINDS`).
- remplacer le test « les autres catégories n’ont pas de sous-catégorie » par :

```ts
  it('seules la Déco et les Assises ont des sous-catégories', () => {
    expect(catalogTree('scandinave').filter((n) => n.subcategories.length > 0).map((n) => n.id)).toEqual(['seats', 'deco']);
  });

  it('découpe les Assises en Chaises et fauteuils, Canapés, Poufs et bancs', () => {
    const seats = catalogTree('scandinave').find((n) => n.id === 'seats');
    expect(seats?.subcategories.map((s) => [s.id, s.label])).toEqual([['chairs', 'Chaises et fauteuils'], ['couches', 'Canapés'], ['poufs', 'Poufs et bancs']]);
    expect(seats?.subcategories.find((s) => s.id === 'chairs')?.kinds).toEqual(['chair', 'armchair', 'rocking-chair', 'egg-chair', 'peacock-chair']);
    expect(seats?.subcategories.find((s) => s.id === 'couches')?.kinds).toEqual(['sofa', 'club-chair', 'loveseat', 'daybed']);
    expect(seats?.subcategories.find((s) => s.id === 'poufs')?.kinds).toEqual(['pouf', 'beanbag', 'bench']);
  });

  it('les nouveaux meubles restent dans toutes les pièces (aucun réservé au Steampunk)', () => {
    expect(STEAMPUNK_ONLY).toEqual(['globe', 'telescope', 'automaton']);
  });
```
(ajouter `STEAMPUNK_ONLY` à l'import de `furniture-catalog`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/furniture-models.test.ts tests/core/library/furniture-catalog.test.ts`
Expected: FAIL (types inconnus).

- [ ] **Step 3: Implement**

`library-types.ts` — fin de `STANDING_KINDS` :

```ts
export const STANDING_KINDS = ['shelf', 'desk', 'chair', 'sofa', 'armchair', 'basket', 'bowl', 'kennel', 'plant', 'lamp', 'coffee-table', 'rug', 'globe', 'telescope', 'automaton', 'charger',
  // Mobilier divers (lot A).
  'rocking-chair', 'club-chair', 'loveseat', 'daybed', 'egg-chair', 'peacock-chair', 'pouf', 'beanbag', 'bench'] as const;
```

`library-book.ts` — les tailles d'avant la v6 ne concernent que les anciens meubles :

```ts
const V5_SIZES: Partial<Record<StandingKind, { w: number; h: number }>> = {
```
```ts
const V5_FOOT: Partial<Record<StandingKind, number>> = {
```
et au début de `v5DrawSize` :

```ts
  const size = V5_SIZES[kind];
  // Meuble arrivé après la v6 : aucune pièce d'avant ne peut le contenir, sa taille est déjà la bonne.
  if (!size) return drawSize(kind, angle);
  const { w, h } = size;
```
et remplacer `V5_FOOT[kind]` par `V5_FOOT[kind] ?? 1`. Importer `drawSize` depuis `./footprint` s'il ne l'est pas déjà.

`furniture-models.ts` — helpers (remplacer `Extra`, `box`, `cyl` ; ajouter `cone` et `rocker` sous `legs`) :

```ts
type Extra = { tone?: number; layer?: number; color?: string };
const box = (x: number, y: number, z: number, w: number, h: number, d: number, fill: Piece['fill'], extra: Extra = {}): Piece => ({ shape: 'box', x, y, z, w, h, d, fill, ...extra });
const cyl = (cx: number, cz: number, y: number, r: number, h: number, fill: Piece['fill'], extra: Extra = {}): Piece => ({ shape: 'cyl', cx, cz, y, r, h, fill, ...extra });
// Tronc de cône : rayon `r` en bas, `r2` en haut.
const cone = (cx: number, cz: number, y: number, r: number, r2: number, h: number, fill: Piece['fill'], extra: Extra = {}): Piece => ({ shape: 'cyl', cx, cz, y, r, r2, h, fill, ...extra });
```
```ts
// Patin de rocking chair : arc de 95 cm (le long de z), 4 cm d'épaisseur, posé au sol en son milieu, relevé de 5 cm aux bouts.
const rocker = (x0: number, x1: number): Piece => {
  const zs = Array.from({ length: 9 }, (_, i) => (i * 95) / 8);
  const low = (z: number): number => 5 * ((z - 47.5) / 47.5) ** 2;
  return prism('x', [...zs.map((z): [number, number] => [z, low(z)]), ...[...zs].reverse().map((z): [number, number] => [z, low(z) + 4])], x0, x1, 'woodDark');
};
```

Modèles, ajoutés à la fin de `FURNITURE_MODELS` (avant `};`) :

```ts
  // Dessin provisoire Opus — Fable n'est pas passé (gel jusqu'au 2026-10-17), reprise Fable prévue.
  // Rocking chair : patins courbes, pieds tournés, assise et coussin, dossier incliné à barreaux, accoudoirs.
  'rocking-chair': {
    w: 65, d: 95, h: 104,
    pieces: [
      rocker(3, 9), rocker(56, 62),
      rod([6, 5, 22], [6, 42, 22], 1.8, 'wood'), rod([59, 5, 22], [59, 42, 22], 1.8, 'wood'),
      rod([6, 5, 72], [6, 42, 72], 1.8, 'wood'), rod([59, 5, 72], [59, 42, 72], 1.8, 'wood'),
      box(1, 40, 15, 63, 5, 62, 'wood'),
      box(6, 45, 18, 53, 7, 56, 'fabric'),
      rod([12, 45, 74], [12, 100, 90], 2.2, 'wood'), rod([53, 45, 74], [53, 100, 90], 2.2, 'wood'),
      ...[19, 25.5, 32, 38.5, 45].map((x) => rod([x, 49, 76], [x, 96, 89], 1.1, 'woodDark')),
      rod([9, 99, 90], [56, 99, 90], 2.5, 'wood'),
      rod([3.5, 45, 22], [3, 64, 22], 1.6, 'wood'), rod([61.5, 45, 22], [62, 64, 22], 1.6, 'wood'),
      rod([3, 64, 20], [3, 66, 76], 2, 'woodDark', { layer: 1 }), rod([62, 64, 20], [62, 66, 76], 2, 'woodDark', { layer: 1 }),
    ],
    pois: [{ type: 'seat', x: 32.5, y: 52, z: 45 }],
    perch: { x: 6, z: 18, w: 53, d: 50, y: 52 },
  },
  // Chauffeuse : canapé une place, accoudoirs pleins arrondis, coussins d'assise et de dos.
  'club-chair': {
    w: 90, d: 85, h: 80,
    pieces: [
      ...legs(90, 85, 8, 5, 6, 'leg'),
      box(0, 8, 0, 90, 30, 85, 'fabric'),
      box(8, 38, 62, 74, 42, 23, 'fabricDark'),
      box(17, 38, 4, 56, 11, 56, 'fabricLight'),
      box(17, 49, 50, 56, 28, 12, 'fabric'),
      box(0, 8, 0, 17, 46, 85, 'fabric'), box(73, 8, 0, 17, 46, 85, 'fabric'),
      rod([8.5, 54, 4], [8.5, 54, 85], 8.5, 'fabric'), rod([81.5, 54, 4], [81.5, 54, 85], 8.5, 'fabric'),
    ],
    pois: [{ type: 'seat', x: 45, y: 49, z: 30 }],
    perch: { x: 17, z: 4, w: 56, d: 46, y: 49 },
  },
  // Canapé deux places : deux coussins d'assise et deux de dos ; cachette du chat au sol, sous l'avant de l'assise.
  loveseat: {
    w: 150, d: 88, h: 82,
    pieces: [
      ...legs(150, 88, 8, 5, 7, 'leg'),
      box(0, 8, 0, 150, 30, 88, 'warm'),
      box(8, 38, 64, 134, 44, 24, 'warmDark'),
      box(17, 38, 4, 57.5, 11, 58, 'warmLight'), box(75.5, 38, 4, 57.5, 11, 58, 'warmLight'),
      box(17, 49, 54, 57.5, 29, 10, 'warm'), box(75.5, 49, 54, 57.5, 29, 10, 'warm'),
      box(0, 8, 0, 17, 46, 88, 'warm'), box(133, 8, 0, 17, 46, 88, 'warm'),
      rod([8.5, 54, 4], [8.5, 54, 88], 8.5, 'warm'), rod([141.5, 54, 4], [141.5, 54, 88], 8.5, 'warm'),
    ],
    pois: [{ type: 'seat', x: 46, y: 49, z: 30 }, { type: 'seat', x: 104, y: 49, z: 30 }, { type: 'sleep', x: 75, y: 49, z: 30 }, { type: 'hide', x: 40, y: 0, z: 10 }],
    perch: { x: 17, z: 4, w: 116, d: 50, y: 49 },
  },
  // Méridienne : haut accoudoir à volute à gauche, dossier qui descend vers la droite, long coussin, petit coussin rond.
  daybed: {
    w: 165, d: 70, h: 85,
    pieces: [
      ...legs(165, 70, 8, 5, 6, 'leg'),
      box(0, 8, 0, 165, 30, 70, 'warm'),
      prism('z', [[24, 38], [110, 38], [110, 46], [70, 62], [24, 74]], 56, 70, 'warmDark'),
      box(24, 38, 4, 139, 11, 52, 'warmLight'),
      box(0, 8, 0, 24, 62, 70, 'warm'),
      rod([12, 70, 2], [12, 70, 68], 12, 'warmLight'),
      ball(36, 57, 48, 6, 8, 7, 'fabric'),
    ],
    pois: [{ type: 'seat', x: 60, y: 49, z: 28 }, { type: 'sleep', x: 110, y: 49, z: 28 }],
    perch: { x: 24, z: 4, w: 139, d: 52, y: 49 },
  },
  // Fauteuil œuf suspendu : socle rond, pied en arc terminé par un crochet, chaîne, œuf en rotin ouvert vers l'avant, coussins.
  'egg-chair': {
    w: 100, d: 100, h: 195, round: true,
    pieces: [
      cyl(45, 50, 0, 30, 4, 'metal'),
      ...Array.from({ length: 10 }, (_, i) => {
        const q = (t: number): V3t => [(1 - t) ** 2 * 72 + 2 * (1 - t) * t * 98 + t * t * 72, (1 - t) ** 2 * 4 + 2 * (1 - t) * t * 95 + t * t * 186, 50];
        return rod(q(i / 10), q((i + 1) / 10), 1.8, 'metal');
      }),
      ...Array.from({ length: 4 }, (_, i) => {
        const q = (t: number): V3t => [(1 - t) ** 2 * 72 + 2 * (1 - t) * t * 60 + t * t * 46, (1 - t) ** 2 * 186 + 2 * (1 - t) * t * 196 + t * t * 190, 50];
        return rod(q(i / 4), q((i + 1) / 4), 1.8, 'metal');
      }),
      rod([46, 190, 50], [45, 151, 50], 0.5, 'metal'),
      ball(45, 96, 50, 32, 55, 32, 'wood'),
      ball(45, 92, 32, 25, 42, 14, 'woodDark', { tone: 0.8, layer: 1 }),
      ball(45, 62, 36, 21, 8, 14, 'fabricLight', { layer: 2 }),
      ball(45, 92, 40, 19, 22, 6, 'fabric', { layer: 2 }),
    ],
    pois: [{ type: 'seat', x: 45, y: 70, z: 36 }],
    perch: { x: 30, z: 26, w: 30, d: 20, y: 70 },
  },
  // Fauteuil paon : dossier en éventail tressé, pied en sablier, coussin rond.
  'peacock-chair': {
    w: 90, d: 65, h: 140,
    pieces: [
      cone(45, 30, 0, 22, 10, 20, 'woodDark'), cone(45, 30, 20, 10, 24, 20, 'woodDark'),
      cyl(45, 30, 40, 27, 6, 'wood'),
      cyl(45, 30, 46, 24, 4, 'fabric'),
      prism('z', [[24, 40], [66, 40], [80, 55], [87, 80], [85, 105], [75, 125], [60, 137], [45, 140], [30, 137], [15, 125], [5, 105], [3, 80], [10, 55]], 50, 56, 'wood'),
      ...[-60, -40, -20, 0, 20, 40, 60].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return rod([45, 44, 49.6], [45 + Math.sin(a) * 36, 44 + Math.cos(a) * 88, 49.6], 0.6, 'woodDark', { layer: 1 });
      }),
    ],
    pois: [{ type: 'seat', x: 45, y: 50, z: 28 }],
    perch: { x: 25, z: 10, w: 40, d: 38, y: 50 },
  },
  // Pouf marocain : rond, bombé, couvercle cousu.
  pouf: {
    w: 55, d: 55, h: 40, round: true,
    pieces: [cone(27.5, 27.5, 0, 24, 27.5, 20, 'warm'), cone(27.5, 27.5, 20, 27.5, 24, 18, 'warm'), cyl(27.5, 27.5, 38, 22, 2, 'warmDark')],
    pois: [{ type: 'seat', x: 27.5, y: 40, z: 27.5 }],
    perch: { x: 8, z: 8, w: 39, d: 39, y: 40 },
  },
  // Pouf poire : grosse poire molle, dos relevé, creux d'assise un peu plus sombre.
  beanbag: {
    w: 80, d: 80, h: 70, round: true,
    pieces: [
      ball(40, 30, 42, 40, 30, 38, 'fabricLight'),
      ball(40, 48, 60, 34, 22, 20, 'fabricLight'),
      ball(40, 36, 34, 22, 4, 18, 'fabricLight', { tone: 0.85, layer: 1 }),
    ],
    pois: [{ type: 'sleep', x: 40, y: 35, z: 34 }],
    perch: { x: 22, z: 18, w: 36, d: 32, y: 35 },
  },
  // Banc à coussin : deux pieds pleins, tablette basse, assise et coussin ; on passe dessous.
  bench: {
    w: 120, d: 40, h: 48,
    pieces: [
      box(3, 0, 4, 6, 36, 32, 'wood'), box(111, 0, 4, 6, 36, 32, 'wood'),
      box(9, 10, 8, 102, 3, 24, 'woodDark'),
      box(0, 36, 0, 120, 6, 40, 'wood'),
      box(4, 42, 3, 112, 6, 34, 'fabric'),
    ],
    pois: [{ type: 'seat', x: 35, y: 48, z: 20 }, { type: 'seat', x: 85, y: 48, z: 20 }],
    perch: { x: 4, z: 3, w: 112, d: 34, y: 48 },
  },
```

Note : la spec donne 49 cm pour le perchoir du fauteuil paon ; le coussin du modèle finit à 50 cm, le test utilise 50.

`furniture-catalog.ts` :

```ts
  // Mobilier divers (lot A) : assises.
  'rocking-chair': { layer: 'floor', depth: 2, under: false },
  'club-chair': { layer: 'floor', depth: 2, under: false },
  loveseat: { layer: 'floor', depth: 2, under: false },
  daybed: { layer: 'floor', depth: 2, under: false },
  'egg-chair': { layer: 'floor', depth: 2, under: false },
  'peacock-chair': { layer: 'floor', depth: 2, under: false },
  pouf: { layer: 'floor', depth: 3, under: false },
  beanbag: { layer: 'floor', depth: 3, under: false },
  bench: { layer: 'floor', depth: 2, under: true },
```
```ts
  'rocking-chair': 'Rocking chair',
  'club-chair': 'Chauffeuse',
  loveseat: 'Canapé deux places',
  daybed: 'Méridienne',
  'egg-chair': 'Fauteuil œuf',
  'peacock-chair': 'Fauteuil paon',
  pouf: 'Pouf marocain',
  beanbag: 'Pouf poire',
  bench: 'Banc',
```
```ts
  { id: 'seats', label: 'Assises', kinds: ['chair', 'armchair', 'rocking-chair', 'egg-chair', 'peacock-chair', 'sofa', 'club-chair', 'loveseat', 'daybed', 'pouf', 'beanbag', 'bench'] },
```
```ts
export type Subcategory = 'chairs' | 'couches' | 'poufs' | 'plants' | 'lights' | 'floor' | 'walls';
```
```ts
const SUBCATEGORIES: Partial<Record<Category, CatalogNode['subcategories']>> = {
  seats: [
    { id: 'chairs', label: 'Chaises et fauteuils', kinds: ['chair', 'armchair', 'rocking-chair', 'egg-chair', 'peacock-chair'] },
    { id: 'couches', label: 'Canapés', kinds: ['sofa', 'club-chair', 'loveseat', 'daybed'] },
    { id: 'poufs', label: 'Poufs et bancs', kinds: ['pouf', 'beanbag', 'bench'] },
  ],
  deco: [
```

`furniture-icons.ts` — dans `KIND_ICON` :

```ts
  'rocking-chair': ['M7 4v11', 'M7 6h7', 'M6 13h10', 'M15 13v4', 'M3 19c4 2 14 2 18 0'],
  'club-chair': ['M5 11a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6H5z', 'M3 12v5h3', 'M21 12v5h-3', 'M7 17v2', 'M17 17v2'],
  loveseat: ['M4 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6H4z', 'M12 9v8', 'M2 12v5h2', 'M22 12v5h-2'],
  daybed: ['M3 7v10', 'M3 12h18v5H3', 'M3 9c3 0 6 1 9 3', 'M5 17v2', 'M19 17v2'],
  'egg-chair': ['M12 4a6 7 0 1 0 .01 0', 'M18 21c2-6 1-14-6-19', 'M8 21h8'],
  'peacock-chair': ['M12 14c-6 0-8-4-8-7a8 6 0 0 1 16 0c0 3-2 7-8 7', 'M9 14l3 4 3-4', 'M9 21h6', 'M12 18v3'],
  pouf: ['M5 10v6a7 3 0 0 0 14 0v-6', 'M5 10a7 3 0 0 1 14 0a7 3 0 0 1-14 0'],
  beanbag: ['M6 20c-3-4-2-12 6-14 8 2 9 10 6 14z', 'M8 14c2 1 6 1 8 0'],
  bench: ['M3 10h18', 'M3 12h18', 'M5 12v8', 'M19 12v8', 'M5 16h14'],
```

`build-drawer.tsx` — `SUB_ICON` (importer `KIND_ICON` depuis `./furniture-icons`) :

```ts
const SUB_ICON: Record<Subcategory, readonly string[]> = { chairs: KIND_ICON.armchair, couches: KIND_ICON.sofa, poufs: KIND_ICON.pouf, plants: ICONS.plants, lights: ICONS.lights, floor: ICONS.floor, walls: ICONS.walls };
```

- [ ] **Step 4: Run tests**

Run: `npx tsc --noEmit && npx vitest run tests/core/library/furniture-models.test.ts tests/core/library/furniture-catalog.test.ts tests/core/library/library-migration-v6.test.ts`
Expected: PASS. Si « toutes les pièces tiennent dans la boîte » échoue, raccourcir la pièce fautive (le message donne le type) sans changer `w`, `d`, `h`.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(bibliotheque): neuf assises (rocking chair, chauffeuse, canapé deux places, méridienne, fauteuils œuf et paon, poufs, banc)"
```

---

### Task 3: Commode, guéridon, arbre à chat

**Files:**
- Modify: `src/core/library/library-types.ts`, `src/core/library/furniture-models.ts`, `src/core/library/furniture-catalog.ts`, `src/content/furniture-icons.ts`
- Test: `tests/core/library/furniture-models.test.ts`, `tests/core/library/furniture-catalog.test.ts`

**Interfaces:**
- Consumes: `box`/`cyl`/`Extra` avec `color` (tâche 2).
- Produces: types `'dresser' | 'side-table' | 'cat-tree'` ; `perch` de la commode (y 82), du guéridon (y 60), de l'arbre à chat (y 150) — la tâche 6 s'en sert.

- [ ] **Step 1: Write the failing tests**

`DIMS` : `dresser: [100, 45, 82], 'side-table': [50, 50, 60], 'cat-tree': [62, 50, 150],`

```ts
describe('commode, guéridon, arbre à chat', () => {
  it('perchoirs : plateau de la commode, du guéridon, haut de l’arbre à chat', () => {
    expect(FURNITURE_MODELS.dresser.perch?.y).toBe(82);
    expect(FURNITURE_MODELS['side-table'].perch?.y).toBe(60);
    expect(FURNITURE_MODELS['cat-tree'].perch?.y).toBe(150);
  });
  it('l’arbre à chat a deux poteaux en sisal et une balle rouge', () => {
    const t = FURNITURE_MODELS['cat-tree'];
    expect(t.pieces.filter((p) => p.color === '#D8BE86')).toHaveLength(2);
    expect(t.pieces.some((p) => p.color === '#E0664A')).toBe(true);
  });
  it('la commode a trois tiroirs à deux boutons', () => {
    expect(FURNITURE_MODELS.dresser.pieces.filter((p) => p.shape === 'box' && p.fill === 'desk')).toHaveLength(3);
    expect(FURNITURE_MODELS.dresser.pieces.filter((p) => p.shape === 'rod' && p.fill === 'metal')).toHaveLength(6);
  });
});
```

Catalogue :

```ts
  it('commode en Rangement, arbre à chat dans Pour animaux, guéridon dans Déco > Sol', () => {
    const tree = catalogTree('scandinave');
    expect(tree.find((n) => n.id === 'storage')?.kinds).toEqual(['shelf', 'desk', 'computer', 'dresser']);
    expect(tree.find((n) => n.id === 'pets')?.kinds).toEqual(['basket', 'bowl', 'kennel', 'charger', 'cat-tree']);
    expect(tree.find((n) => n.id === 'deco')?.subcategories.find((s) => s.id === 'floor')?.kinds).toEqual(['rug', 'coffee-table', 'side-table']);
    expect(underOf('side-table')).toBe(true);
  });
```
(ajouter `underOf` à l'import) ; et dans le test existant « découpe la Déco… », remplacer l'attente de `floor` par `['rug', 'coffee-table', 'side-table']`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/furniture-models.test.ts tests/core/library/furniture-catalog.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`STANDING_KINDS` : ajouter `'dresser', 'side-table', 'cat-tree'` après `'bench'`.

Modèles :

```ts
  // Commode basse : pieds fuselés, caisson, trois tiroirs à deux boutons, plateau qui couvre tout.
  dresser: {
    w: 100, d: 45, h: 82,
    pieces: [
      ...[[7, 7], [93, 7], [7, 38], [93, 38]].map(([x, z]) => rod([x!, 0, z!], [x!, 8, z!], 2, 'leg')),
      box(2, 8, 1.6, 96, 70, 42.4, 'wood'),
      ...[12, 34, 56].flatMap((y) => [box(6, y, 0.6, 88, 19, 1, 'desk'), rod([35, y + 9.5, 0.6], [35, y + 9.5, 0], 2.2, 'metal'), rod([65, y + 9.5, 0.6], [65, y + 9.5, 0], 2.2, 'metal')]),
      box(0, 78, 0, 100, 4, 45, 'woodDark'),
    ],
    perch: { x: 0, z: 0, w: 100, d: 45, y: 82 },
  },
  // Guéridon : plateau rond, fût, trépied ; on passe dessous.
  'side-table': {
    w: 50, d: 50, h: 60, round: true,
    pieces: [
      ...[90, 210, 330].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return rod([25, 8, 25], [25 + 19 * Math.cos(a), 1.5, 25 + 19 * Math.sin(a)], 1.5, 'wood');
      }),
      ball(25, 9, 25, 4, 3, 4, 'woodDark'),
      cyl(25, 25, 8, 2, 48, 'wood'),
      cyl(25, 25, 56, 25, 4, 'desk'),
    ],
    perch: { x: 7, z: 7, w: 36, d: 36, y: 60 },
  },
  // Arbre à chat : socle moquette, deux poteaux en sisal, niche ronde, plateforme à 1 m, panier en haut, balle pendue.
  // Lot A : seul le panier du haut est un perchoir (plateformes basses et niche au lot D).
  'cat-tree': {
    w: 62, d: 50, h: 150,
    pieces: [
      box(0, 0, 0, 62, 6, 50, 'rug'),
      cyl(12, 25, 6, 4, 89, 'warmLight', { color: '#D8BE86' }),
      box(28, 6, 8, 32, 34, 34, 'fabric'),
      rod([44, 22, 8], [44, 22, 7.4], 8.5, 'door', { tone: 0.6 }),
      box(26, 40, 6, 36, 4, 38, 'fabricDark'),
      cyl(42, 25, 44, 4, 99, 'warmLight', { color: '#D8BE86' }),
      box(0, 95, 6, 36, 5, 38, 'fabricDark'),
      rod([4, 95, 25], [4, 79, 25], 0.3, 'edge'),
      ball(4, 76.5, 25, 3, 3, 3, 'warm', { color: '#E0664A' }),
      cyl(42, 25, 143, 19, 7, 'fabric'),
    ],
    perch: { x: 27, z: 10, w: 30, d: 30, y: 150 },
  },
```

`ball` doit accepter `color` : son paramètre `extra: Extra` en hérite déjà (même type `Extra`). Idem `rod`.

Catalogue :

```ts
  dresser: { layer: 'floor', depth: 1, under: false },
  'side-table': { layer: 'floor', depth: 2, under: true },
  'cat-tree': { layer: 'floor', depth: 1, under: false },
```
```ts
  dresser: 'Commode',
  'side-table': 'Guéridon',
  'cat-tree': 'Arbre à chat',
```
`CATEGORIES` : storage `['shelf', 'desk', 'computer', 'dresser']` ; pets `['basket', 'bowl', 'kennel', 'charger', 'cat-tree']` ; deco : insérer `'side-table'` après `'coffee-table'`. `SUBCATEGORIES.deco` floor : `['rug', 'coffee-table', 'side-table']`.

Icônes :

```ts
  dresser: ['M4 4h16v15H4z', 'M4 9h16', 'M4 14h16', 'M11 6.5h2', 'M11 11.5h2', 'M11 16.5h2', 'M6 19v2', 'M18 19v2'],
  'side-table': ['M5 7h14', 'M12 7v10', 'M12 17l-4 4', 'M12 17l4 4'],
  'cat-tree': ['M4 21h16', 'M8 21V8', 'M15 21V5', 'M5 8h6', 'M12 5h7', 'M13 13h7v6h-7z'],
```

- [ ] **Step 4: Run tests**

Run: `npx tsc --noEmit && npx vitest run tests/core/library/furniture-models.test.ts tests/core/library/furniture-catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(bibliotheque): commode, guéridon et arbre à chat"
```

---

### Task 4: Les 5 plantes

**Files:**
- Modify: `src/core/library/library-types.ts`, `src/core/library/furniture-models.ts` (helpers `qAt`, `stemLeaf`, `frond`, 5 modèles), `src/core/library/furniture-catalog.ts`, `src/content/furniture-icons.ts`
- Test: `tests/core/library/furniture-models.test.ts`, `tests/core/library/furniture-catalog.test.ts`

**Interfaces:**
- Consumes: `Leaf.form` (tâche 1), `cone`/`Extra` (tâche 2).
- Produces: types `'monstera' | 'strelitzia' | 'palm' | 'cactus' | 'pampas'`.

- [ ] **Step 1: Write the failing tests**

`DIMS` : `monstera: [85, 70, 120], strelitzia: [60, 60, 170], palm: [100, 100, 190], cactus: [35, 35, 132], pampas: [42, 30, 122],`

```ts
describe('plantes du mobilier divers', () => {
  const leaves = (k: keyof typeof FURNITURE_MODELS) => FURNITURE_MODELS[k].pieces.flatMap((p) => (p.shape === 'foliage' ? p.leaves : []));
  it('monstera en feuilles en cœur, oiseau de paradis en palettes avec une fleur orange', () => {
    expect(leaves('monstera').length).toBeGreaterThanOrEqual(6);
    expect(leaves('monstera').every((l) => l.form === 'heart')).toBe(true);
    expect(leaves('strelitzia').every((l) => l.form === 'paddle')).toBe(true);
    expect(FURNITURE_MODELS.strelitzia.pieces.some((p) => p.color === '#F08A24')).toBe(true);
  });
  it('palmier : au moins 7 palmes de folioles, moins de 500 formes à chaque angle (Android)', () => {
    expect(leaves('palm').length).toBeGreaterThanOrEqual(7 * 10);
    for (const a of [0, 1, 2, 3, 4, 5, 6, 7] as const) expect(renderModel(FURNITURE_MODELS.palm, a).shapes.length).toBeLessThan(500);
  });
  it('cactus fleuri, pampas en 5 plumets', () => {
    expect(FURNITURE_MODELS.cactus.pieces.some((p) => p.color === '#EF6F9C')).toBe(true);
    expect(leaves('pampas')).toHaveLength(5);
  });
});
```

Catalogue — dans « découpe la Déco… », l'attente de `plants` devient `['plant', 'small-plant', 'monstera', 'strelitzia', 'palm', 'cactus', 'pampas']`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/furniture-models.test.ts tests/core/library/furniture-catalog.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Helpers (sous `rocker`) :

```ts
// Point d'une courbe de Bézier quadratique (a → c → b) en t ∈ [0, 1].
const qAt = (a: V3t, c: V3t, b: V3t, t: number): V3t => [0, 1, 2].map((k) => (1 - t) ** 2 * a[k]! + 2 * (1 - t) * t * c[k]! + t * t * b[k]!) as V3t;
// Feuille sur sa tige : départ à `r0` cm du centre (cx, cz) et à `h0` cm du sol dans l'azimut `az` (degrés ; 270 = vers l'avant),
// longueur `L` relevée de `elev` degrés, largeur `w` ; la tige part de `from`.
function stemLeaf(cx: number, cz: number, from: V3t, [az, h0, r0, L, elev, w]: [number, number, number, number, number, number], form: Leaf['form'], fill: Piece['fill']): { stem: Piece; leaf: Leaf } {
  const [a, e] = [(az * Math.PI) / 180, (elev * Math.PI) / 180];
  const [dx, dz] = [Math.cos(a), Math.sin(a)];
  const base: V3t = [cx + dx * r0, h0, cz + dz * r0];
  const tip: V3t = [base[0] + dx * L * Math.cos(e), h0 + L * Math.sin(e), base[2] + dz * L * Math.cos(e)];
  const ctrl: V3t = [base[0] + dx * L * 0.5 * Math.cos(e), h0 + L * 0.5 * Math.sin(e) + L * 0.15, base[2] + dz * L * 0.5 * Math.cos(e)];
  return { stem: rod(from, base, 0.9, 'leafDark'), leaf: { base, ctrl, tip, w, fill, form } };
}
// Palme : 7 paires de folioles fines le long d'une nervure courbe (a → c → b), plus courtes vers la pointe, retombantes.
function frond(a: V3t, c: V3t, b: V3t): Leaf[] {
  const out: Leaf[] = [];
  for (let i = 0; i < 7; i++) {
    const t = 0.16 + i * 0.13;
    const p = qAt(a, c, b, t);
    const tan = [0, 1, 2].map((k) => 2 * (1 - t) * (c[k]! - a[k]!) + 2 * t * (b[k]! - c[k]!));
    const tl = Math.hypot(tan[0]!, tan[1]!, tan[2]!) || 1;
    const T = tan.map((v) => v / tl);
    const hl = Math.hypot(T[0]!, T[2]!) || 1;
    const N = [-T[2]! / hl, 0, T[0]! / hl];
    const len = 16 * (1 - 0.5 * t) + 3;
    for (const side of [-1, 1]) {
      const d = [side * N[0]! * 0.75 + T[0]! * 0.35, T[1]! * 0.35 - 0.4, side * N[2]! * 0.75 + T[2]! * 0.35];
      const tip: V3t = [p[0] + d[0]! * len, p[1] + d[1]! * len, p[2] + d[2]! * len];
      out.push({ base: p, ctrl: [(p[0] + tip[0]) / 2, (p[1] + tip[1]) / 2 + len * 0.12, (p[2] + tip[2]) / 2], tip, w: 2.4, fill: (i + (side > 0 ? 1 : 0)) % 2 ? 'leaf' : 'leafDark' });
    }
  }
  return out;
}
// Plante en feuilles sur tiges : tiges puis feuillage.
const stemmed = (cx: number, cz: number, from: V3t, specs: [number, number, number, number, number, number][], form: Leaf['form'], fills: Piece['fill'][]): Piece[] => {
  const all = specs.map((s, i) => stemLeaf(cx, cz, from, s, form, fills[i % fills.length]!));
  return [...all.map((x) => x.stem), { shape: 'foliage', fill: 'leaf', leaves: all.map((x) => x.leaf) }];
};
```

(importer `Leaf` reste fait en tête du fichier ; vérifier `import type { Leaf, Model, Piece, V3t }`.)

Modèles :

```ts
  // Monstera : pot évasé, six grandes feuilles en cœur découpées sur leurs tiges.
  monstera: {
    w: 85, d: 70, h: 120,
    pieces: [
      cone(42.5, 35, 0, 12, 16, 32, 'warm'), cyl(42.5, 35, 31, 17, 5, 'warmDark'), cyl(42.5, 35, 35.5, 14.5, 1.5, 'door'),
      ...stemmed(42.5, 35, [42.5, 37, 35], [
        [180, 64, 14, 19, 10, 18], [0, 66, 14, 19, 8, 18], [215, 82, 12, 28, 30, 25], [325, 85, 12, 28, 32, 25], [270, 74, 8, 18, 25, 18], [90, 88, 6, 24, 50, 23],
      ], 'heart', ['leaf', 'leafDark']),
    ],
  },
  // Oiseau de paradis : pot droit, grandes feuilles en palette dressées, une fleur orange et bleue.
  strelitzia: {
    w: 60, d: 60, h: 170,
    pieces: [
      cyl(30, 30, 0, 13, 32, 'warmLight'), cyl(30, 30, 30, 15, 5, 'warm'),
      ...stemmed(30, 30, [30, 35, 30], [
        [180, 88, 6, 40, 66, 11], [0, 90, 6, 40, 64, 11], [200, 105, 4, 58, 76, 13], [340, 110, 4, 54, 78, 13], [270, 98, 4, 58, 74, 14], [90, 96, 4, 52, 72, 13],
      ], 'paddle', ['leaf', 'leafDark']),
      rod([32, 35, 32], [36, 126, 28], 1, 'leafDark'),
      rod([36, 126, 28], [52, 131, 28], 1.6, 'leafDark'),
      rod([42, 129, 28], [48, 143, 27], 1.4, 'warm', { color: '#F08A24' }),
      rod([46, 130, 28], [55, 140, 28], 1.2, 'warm', { color: '#F2A63A' }),
      rod([48, 131, 28], [53, 136, 28], 0.9, 'fabric', { color: '#3E6FD8' }),
    ],
  },
  // Palmier areca : panier tressé, trois cannes, huit palmes arquées en folioles.
  palm: {
    w: 100, d: 100, h: 190,
    pieces: [
      cone(50, 50, 0, 15, 17, 34, 'woodDark'), cyl(50, 50, 32, 18, 4, 'wood'),
      rod([50, 36, 50], [46, 140, 48], 1.4, 'leafDark'), rod([50, 36, 50], [54, 150, 52], 1.4, 'leafDark'), rod([50, 36, 50], [50, 128, 50], 1.4, 'leafDark'),
      {
        shape: 'foliage', fill: 'leaf', leaves: ([
          // [canne, azimut, portée, montée de la pointe, montée du contrôle]
          [0, 180, 32, -15, 40], [0, 240, 30, -5, 42], [1, 0, 32, -10, 38], [1, 60, 30, 0, 40], [1, 120, 28, -20, 36], [2, 300, 30, -25, 30], [2, 90, 24, 30, 40], [1, 270, 10, 32, 30],
        ] as const).flatMap(([cane, az, reach, rise, ctrlRise]) => {
          const base: V3t = ([[46, 140, 48], [54, 150, 52], [50, 128, 50]] as const)[cane] as unknown as V3t;
          const a = (az * Math.PI) / 180;
          const [dx, dz] = [Math.cos(a), Math.sin(a)];
          return frond(base, [base[0] + dx * reach * 0.45, base[1] + ctrlRise, base[2] + dz * reach * 0.45], [base[0] + dx * reach, base[1] + rise, base[2] + dz * reach]);
        }),
      },
    ],
  },
  // Cactus cierge : pot en terre, colonne et deux bras coudés arrondis, fleur rose au sommet.
  cactus: {
    w: 35, d: 35, h: 132, round: true,
    pieces: [
      cone(17.5, 17.5, 0, 10, 13, 20, 'warm'), cyl(17.5, 17.5, 19, 14, 4, 'warmDark'),
      rod([14, 60, 17.5], [6.5, 62, 17.5], 3.5, 'leaf'), cyl(6.5, 17.5, 62, 3.5, 26, 'leaf'), ball(6.5, 88, 17.5, 3.5, 3.5, 3.5, 'leaf'),
      rod([21, 74, 17.5], [28.5, 76, 17.5], 3.5, 'leaf'), cyl(28.5, 17.5, 76, 3.5, 22, 'leaf'), ball(28.5, 98, 17.5, 3.5, 3.5, 3.5, 'leaf'),
      cyl(17.5, 17.5, 23, 5.5, 100, 'leaf'), ball(17.5, 123, 17.5, 5.5, 5.5, 5.5, 'leaf'),
      ball(17.5, 129.5, 17.5, 3.5, 2, 3.5, 'leaf', { color: '#EF6F9C', layer: 1 }),
    ],
  },
  // Grand vase et pampas : vase haut en céramique, cinq tiges, plumets crème.
  pampas: {
    w: 42, d: 30, h: 122,
    pieces: [
      cone(21, 15, 0, 9, 12, 30, 'warmLight'), cone(21, 15, 30, 12, 5, 24, 'warmLight'), cyl(21, 15, 54, 5, 8, 'warmLight'),
      ...(() => {
        const ends: V3t[] = [[-8, 32, 0], [-6, 24, -4], [0, 33, 0], [7, 24, 4], [9, 30, -3]].map(([x, y, z]) => [21 + x!, 60 + y!, 15 + z!] as V3t);
        const plumes: Leaf[] = ends.map((e) => {
          const d = [e[0] - 21, e[1] - 60, e[2] - 15];
          const n = Math.hypot(d[0]!, d[1]!, d[2]!);
          const tip: V3t = [e[0] + (d[0]! / n) * 24, e[1] + (d[1]! / n) * 24, e[2] + (d[2]! / n) * 24];
          return { base: e, ctrl: [(e[0] + tip[0]) / 2, (e[1] + tip[1]) / 2, (e[2] + tip[2]) / 2], tip, w: 8, fill: 'shade' };
        });
        return [...ends.map((e) => rod([21, 60, 15], e, 0.5, 'warm', { color: '#B8A47A' })), { shape: 'foliage', fill: 'shade', leaves: plumes } as Piece];
      })(),
    ],
  },
```

Catalogue :

```ts
  monstera: { layer: 'floor', depth: 1, under: false },
  strelitzia: { layer: 'floor', depth: 1, under: false },
  palm: { layer: 'floor', depth: 1, under: false },
  cactus: { layer: 'floor', depth: 1, under: false },
  pampas: { layer: 'floor', depth: 1, under: false },
```
```ts
  monstera: 'Monstera',
  strelitzia: 'Oiseau de paradis',
  palm: 'Palmier',
  cactus: 'Cactus',
  pampas: 'Pampas',
```
`STANDING_KINDS` : ajouter `'monstera', 'strelitzia', 'palm', 'cactus', 'pampas'`. `CATEGORIES.deco` : insérer les cinq après `'small-plant'`. `SUBCATEGORIES.deco` plants : `['plant', 'small-plant', 'monstera', 'strelitzia', 'palm', 'cactus', 'pampas']`.

Icônes :

```ts
  monstera: ['M12 21v-7', 'M12 14c-6 0-8-4-7-9 4 0 7 3 7 9z', 'M12 14c5 0 7-3 6-8-4 0-6 3-6 8z', 'M8 21h8'],
  strelitzia: ['M12 21V8', 'M12 12c-3-2-4-6-3-10 3 2 4 6 3 10z', 'M12 10c3-2 4-5 3-8-3 2-4 5-3 8z', 'M12 8l5-1-4 3', 'M9 21h6'],
  palm: ['M12 21V10', 'M12 10c-3-3-7-3-9-1', 'M12 10c3-3 7-3 9-1', 'M12 10c-1-3-4-5-7-5', 'M12 10c1-3 4-5 7-5', 'M9 21h6'],
  cactus: ['M10 21V5a2 2 0 0 1 4 0v16', 'M10 13H7a1 1 0 0 1-1-1V8', 'M14 15h3a1 1 0 0 0 1-1v-3', 'M7 21h10'],
  pampas: ['M10 21c-2-3-2-6 0-8h4c2 2 2 5 0 8z', 'M12 13V5', 'M11 13L7 4', 'M13 13l4-8'],
```

- [ ] **Step 4: Run tests**

Run: `npx tsc --noEmit && npx vitest run tests/core/library/furniture-models.test.ts tests/core/library/furniture-catalog.test.ts`
Expected: PASS. Si « dans la boîte » échoue pour une plante : réduire la longueur `L` (ou la portée) de la feuille/palme fautive de 2 cm à la fois, jamais `w`, `d`, `h`.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(bibliotheque): monstera, oiseau de paradis, palmier, cactus et pampas"
```

---

### Task 5: Lanterne, lampadaire arc et lampes généralisées

**Files:**
- Modify: `src/core/library/library-types.ts`, `src/core/library/furniture-models.ts` (2 modèles, garnitures Steampunk), `src/core/library/furniture-catalog.ts`, `src/content/furniture-icons.ts`
- Modify: `src/core/library/room-grid.ts:355` (`isLamp`)
- Modify: `src/content/model3d-art.tsx:109,248` (abat-jour allumé et halo pour tout meuble qui a un `glow`)
- Test: `tests/core/library/furniture-models.test.ts`, `tests/core/library/lamp-state.test.ts`, `tests/core/library/light-occluders.test.ts`, `tests/core/library/footprint.test.ts`, `tests/core/library/room-grid.test.ts`, `tests/content/model3d-art.test.tsx`

**Interfaces:**
- Consumes: `Model.base` (tâche 1), `cone`/`Extra` (tâche 2).
- Produces: types `'paper-lantern' | 'arc-lamp'` ; `isLamp(p)` vrai pour tout meuble debout dont le modèle a `glow`.

- [ ] **Step 1: Write the failing tests**

`furniture-models.test.ts` — `DIMS` : `'paper-lantern': [45, 45, 61], 'arc-lamp': [165, 32, 205],` et :

```ts
describe('lanterne et lampadaire arc', () => {
  it('ont un point de lumière, un abat-jour à allumer et un socle seul au sol pour l’arc', () => {
    for (const k of ['paper-lantern', 'arc-lamp'] as const) {
      expect(FURNITURE_MODELS[k].glow, k).toBeDefined();
      expect(FURNITURE_MODELS[k].pieces.some((p) => p.fill === 'shade'), k).toBe(true);
    }
    expect(FURNITURE_MODELS['arc-lamp'].base).toEqual({ x: 133, z: 0, w: 32, d: 32, round: true });
  });
  it('garnitures Steampunk dans la boîte', () => {
    for (const k of ['paper-lantern', 'arc-lamp'] as const) {
      const m = FURNITURE_MODELS[k];
      const trim = STEAMPUNK_TRIM[k] ?? [];
      expect(trim.length, k).toBeGreaterThanOrEqual(6);
      for (const p of trim) {
        const [x0, x1, y0, y1, z0, z1] = pieceBounds(p);
        expect(x0 >= -0.01 && x1 <= m.w + 0.01 && y0 >= -0.01 && y1 <= m.h + 0.01 && z0 >= -0.01 && z1 <= m.d + 0.01, k).toBe(true);
      }
    }
  });
});
```

`footprint.test.ts` :

```ts
describe('lampadaire arc', () => {
  it('de face : 8 colonnes dessinées, 2 cases au sol (le socle, à droite)', () => {
    expect(drawSize('arc-lamp', 0).w).toBe(8);
    expect(floorOffsets('arc-lamp', 0).map((c) => c.col).sort()).toEqual([6, 7]);
  });
  it('à chaque angle : au plus 4 cases au sol', () => {
    for (const a of ANGLES) expect(floorOffsets('arc-lamp', a).length).toBeLessThanOrEqual(4);
  });
});
```

`room-grid.test.ts` (importer `drawSize` de `footprint` si besoin) :

```ts
describe('lampadaire arc au-dessus d’un fauteuil', () => {
  const rowFor = (k: 'armchair' | 'arc-lamp' | 'chair') => 18 - drawSize(k, 0).h;
  it('le globe passe au-dessus du fauteuil : la pose est acceptée', () => {
    const layout: Layout = [{ id: 'a', kind: 'armchair', col: 10, row: rowFor('armchair') }];
    expect(canPlace(layout, 36, 'arc-lamp', 10, rowFor('arc-lamp')).ok).toBe(true);
  });
  it('mais pas sur le socle : une chaise ne se pose pas sur ses cases', () => {
    const layout: Layout = [{ id: 'l', kind: 'arc-lamp', col: 10, row: rowFor('arc-lamp') }];
    expect(canPlace(layout, 36, 'chair', 16, rowFor('chair')).ok).toBe(false);
  });
});
```

`lamp-state.test.ts` :

```ts
describe('lanterne et lampadaire arc', () => {
  const more: Layout = [{ id: 'l1', kind: 'paper-lantern', col: 2, row: 14 }, { id: 'l2', kind: 'arc-lamp', col: 6, row: 7 }, { id: 'p', kind: 'pampas', col: 16, row: 12 }];
  it('sont des lampes ; le pampas n’en est pas une', () => {
    expect(more.map(isLamp)).toEqual([true, true, false]);
  });
  it('s’éteignent et le restent après enregistrement', () => {
    const off = toggleLamp(toggleLamp(more, 'l1'), 'l2');
    const state = parseLibraryState({ version: 7, rooms: [{ id: 'r', name: 'Pièce', style: 'scandinave', cols: 36, layout: off }] } as never);
    const layout = state.rooms[0]!.layout;
    expect(layout.filter((p) => p.kind === 'paper-lantern' || p.kind === 'arc-lamp').map(isLit)).toEqual([false, false]);
  });
});
```
(Adapter l'objet passé à `parseLibraryState` à la forme minimale qu'acceptent les tests existants du même fichier : lire le test qui l'utilise déjà dans `lamp-state.test.ts` et reprendre exactement sa structure d'état.)

`light-occluders.test.ts` :

```ts
it('la lanterne et le lampadaire arc allumés sont des sources ; éteints, non', () => {
  const geom = /* reprendre la géométrie de pièce utilisée par les autres tests de ce fichier */ GEOM;
  const on: Layout = [{ id: 'l1', kind: 'paper-lantern', col: 2, row: 14 }, { id: 'l2', kind: 'arc-lamp', col: 6, row: 7 }];
  expect(lampsOf(on, geom).map((l) => l.id).sort()).toEqual(['l1', 'l2']);
  expect(lampsOf(on.map((p) => ({ ...p, lit: false }) as Placed), geom)).toEqual([]);
});
```
(Remplacer `GEOM` par la constante de géométrie déjà déclarée en tête de `light-occluders.test.ts`.)

`model3d-art.test.tsx` :

```ts
  it.each(['paper-lantern', 'arc-lamp'] as const)('%s : l’abat-jour s’allume comme celui du lampadaire', (kind) => {
    const on = draw(<Model3DArt kind={kind} angle={0} rect={rect} palette={paletteOf('scandinave')} lit />).innerHTML;
    const off = draw(<Model3DArt kind={kind} angle={0} rect={rect} palette={paletteOf('scandinave')} lit={false} />).innerHTML;
    expect(on).toContain('#FFE9A8');
    expect(off).not.toContain('#FFE9A8');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/furniture-models.test.ts tests/core/library/footprint.test.ts tests/core/library/room-grid.test.ts tests/core/library/lamp-state.test.ts tests/core/library/light-occluders.test.ts tests/content/model3d-art.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`STANDING_KINDS` : ajouter `'paper-lantern', 'arc-lamp'`.

Modèles :

```ts
  // Lanterne en papier : socle bas, globe de papier à nervures, chapeau ; tout le globe s'allume.
  'paper-lantern': {
    w: 45, d: 45, h: 61, round: true, glow: [22.5, 32, 22.5],
    pieces: [
      cyl(22.5, 22.5, 0, 13.5, 5, 'woodDark'),
      { shape: 'ball', cx: 22.5, cy: 32, cz: 22.5, rx: 22.5, ry: 27, rz: 22.5, fill: 'shade', lines: [{ lat: -45 }, { lat: -22 }, { lat: 0 }, { lat: 22 }, { lat: 45 }], lineFill: 'edge' },
      cyl(22.5, 22.5, 57, 6.5, 4, 'woodDark'),
    ],
  },
  // Lampadaire arc : socle de marbre rond (seul au sol), tige droite puis grand arc, dôme métal ouvert vers le bas, ampoule.
  'arc-lamp': {
    w: 165, d: 32, h: 205, glow: [19, 156, 16],
    base: { x: 133, z: 0, w: 32, d: 32, round: true },
    pieces: [
      cyl(149, 16, 0, 16, 7, 'desk', { color: '#E7E2D8' }),
      cyl(149, 16, 7, 3, 4, 'metal'),
      rod([149, 11, 16], [149, 118, 16], 1.2, 'metal'),
      ...Array.from({ length: 12 }, (_, i) => {
        const P: V3t[] = [[149, 118, 16], [149, 222, 16], [40, 222, 16], [19, 176, 16]];
        const at = (t: number): V3t => [0, 1, 2].map((k) => (1 - t) ** 3 * P[0]![k]! + 3 * (1 - t) ** 2 * t * P[1]![k]! + 3 * (1 - t) * t * t * P[2]![k]! + t ** 3 * P[3]![k]!) as V3t;
        return rod(at(i / 12), at((i + 1) / 12), 1.2, 'metal');
      }),
      cone(19, 16, 152, 16, 5, 22, 'metal'),
      cyl(19, 16, 151.5, 15, 0.5, 'shade'),
      ball(19, 150, 16, 4, 3, 4, 'shade'),
      cyl(19, 16, 174, 2, 2, 'metal'),
    ],
  },
```

Garnitures (dans `STEAMPUNK_TRIM`) :

```ts
  // Lanterne : cerclages de laiton, bague au socle, trois pieds boule.
  'paper-lantern': [
    cyl(22.5, 22.5, 14, 17.5, 1.2, 'text'), cyl(22.5, 22.5, 49.2, 17.5, 1.2, 'text'), cyl(22.5, 22.5, 4, 14, 1, 'text'),
    ...[90, 210, 330].map((deg) => ball(22.5 + 12 * Math.cos((deg * Math.PI) / 180), 1.5, 22.5 + 12 * Math.sin((deg * Math.PI) / 180), 2.2, 1.5, 2.2, 'text')),
  ],
  // Lampadaire arc : bandeau de laiton au socle, trois pieds boule, bagues de bois sombre sur la tige, cerclage du dôme.
  'arc-lamp': [
    cyl(149, 16, 6.4, 15, 1.2, 'text'),
    ...[90, 210, 330].map((deg) => ball(149 + 13 * Math.cos((deg * Math.PI) / 180), 1.5, 16 + 13 * Math.sin((deg * Math.PI) / 180), 2.2, 1.5, 2.2, 'text')),
    cyl(149, 16, 40, 2.6, 2.5, 'woodDark'), cyl(149, 16, 80, 2.6, 2.5, 'woodDark'),
    cyl(19, 16, 151, 16, 1.5, 'text'),
  ],
```

Catalogue :

```ts
  'paper-lantern': { layer: 'floor', depth: 2, under: false },
  'arc-lamp': { layer: 'floor', depth: 1, under: false },
```
```ts
  'paper-lantern': 'Lanterne',
  'arc-lamp': 'Lampadaire arc',
```
`CATEGORIES.deco` : insérer `'paper-lantern', 'arc-lamp'` après `'small-lamp'` ; `SUBCATEGORIES.deco` lights : `['lamp', 'small-lamp', 'paper-lantern', 'arc-lamp']`. Mettre à jour l'attente `lights` du test « découpe la Déco… » en conséquence.

Icônes :

```ts
  'paper-lantern': ['M12 3v2', 'M12 5a6 7 0 1 0 .01 0', 'M6 12h12', 'M7 9h10', 'M7 15h10', 'M9 21h6'],
  'arc-lamp': ['M17 21V10c0-5-4-7-9-7', 'M5 6a3 2 0 0 0 6 0z', 'M14 21h6'],
```

`room-grid.ts` :

```ts
// Lampe : tout meuble debout dont le modèle a un point de lumière (lampadaire, lanterne, lampadaire arc), ou une petite lampe posée.
export const isLamp = (p: Placed): boolean => (isStanding(p) && FURNITURE_MODELS[p.kind].glow !== undefined) || (p.kind === 'small' && p.item === 'lamp');
```

`model3d-art.tsx` : ligne 109, remplacer `kind === 'lamp'` par `FURNITURE_MODELS[kind].glow !== undefined` ; ligne 248, `lampShade={FURNITURE_MODELS[kind].glow !== undefined}`.

- [ ] **Step 4: Run tests**

Run: `npx tsc --noEmit && npm run test:famille -- scene-piece scene-lumiere`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(bibliotheque): lanterne en papier et lampadaire arc, toute lampe qui a un point de lumière s'allume"
```

---

### Task 6: Animaux — table des rôles

**Files:**
- Create: `src/core/library/pets/roles.ts`
- Modify: `src/core/library/pets/brain.ts:127-173` (chien et chat)
- Modify: `src/core/library/pets/storm.ts:41-55`
- Modify: `src/core/library/pets/runner.ts:15-16`
- Test: Create `tests/core/library/pets-roles.test.ts` ; Modify `tests/core/library/pets-brain.test.ts`, `tests/core/library/pets-storm.test.ts`

**Interfaces:**
- Consumes: les types et modèles des tâches 2 à 5 (places `seat`/`sleep`/`hide`, `perch`).
- Produces: `export type PetRole = 'catSeat' | 'dogCouch' | 'catTop' | 'catHide' | 'catScratch'` ; `export function hasRole(kind: StandingKind, role: PetRole): boolean`.

- [ ] **Step 1: Write the failing tests**

`tests/core/library/pets-roles.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { hasRole } from '../../../src/core/library/pets/roles';

describe('rôles des meubles pour les animaux', () => {
  it('le chien monte sur les canapés et les poufs, pas sur les fauteuils', () => {
    for (const k of ['sofa', 'club-chair', 'loveseat', 'daybed', 'pouf', 'beanbag'] as const) expect(hasRole(k, 'dogCouch'), k).toBe(true);
    for (const k of ['armchair', 'chair', 'rocking-chair', 'egg-chair', 'peacock-chair', 'bench'] as const) expect(hasRole(k, 'dogCouch'), k).toBe(false);
  });
  it('le chat a ses assises, ses dessus, ses cachettes et son griffoir', () => {
    for (const k of ['chair', 'armchair', 'sofa', 'rocking-chair', 'club-chair', 'loveseat', 'daybed', 'egg-chair', 'peacock-chair', 'pouf', 'beanbag', 'bench'] as const) expect(hasRole(k, 'catSeat'), k).toBe(true);
    for (const k of ['shelf', 'desk', 'dresser', 'side-table', 'cat-tree'] as const) expect(hasRole(k, 'catTop'), k).toBe(true);
    expect((['sofa', 'loveseat'] as const).every((k) => hasRole(k, 'catHide'))).toBe(true);
    expect(hasRole('armchair', 'catScratch')).toBe(true);
    expect(hasRole('monstera', 'catSeat') || hasRole('monstera', 'catTop')).toBe(false);
  });
});
```

`pets-brain.test.ts` — dans le `describe` du chien (là où est défini `dog(...)`), ajouter :

```ts
  const lounge: Layout = [
    { id: 'l', kind: 'loveseat', col: 2, row: 12 },
    { id: 'p', kind: 'peacock-chair', col: 12, row: 10 },
    { id: 'b', kind: 'beanbag', col: 18, row: 14 },
    { id: 'a', kind: 'armchair', col: 24, row: 13 },
  ];
  it('monte sur le canapé deux places et dort sur le pouf poire, jamais sur le fauteuil paon ni le fauteuil', () => {
    const plans = seeds.map((s) => nextPlan(dog(lounge, s), from, 0));
    expect(plans.some((p) => p.on === 'l')).toBe(true);
    expect(plans.some((p) => p.on === 'b' && p.action === 'sleep')).toBe(true);
    for (const p of plans) {
      expect(['p', 'a']).not.toContain(p.on);
      for (const seg of p.route) expect([null, 'l', 'b']).toContain(seg.on);
    }
  });
```

et dans `describe('nextPlan', …)` (chat) :

```ts
  it('se cache sous le canapé deux places, se perche sur la commode et en haut de l’arbre à chat', () => {
    const layout: Layout = [
      { id: 'l', kind: 'loveseat', col: 2, row: 12 },
      { id: 'c', kind: 'dresser', col: 12, row: 11 },
      { id: 't', kind: 'cat-tree', col: 20, row: 4 },
    ];
    const plans = seeds.map((s) => nextPlan(env(layout, s), from, 0));
    expect(plans.some((p) => p.action === 'hide' && p.hostId === 'l')).toBe(true);
    expect(plans.some((p) => p.action === 'perch' && p.on === 'c')).toBe(true);
    expect(plans.some((p) => p.on === 't')).toBe(true);
  });
```

et dans le `describe('robot', …)` :

```ts
  it('ne monte sur aucun nouveau meuble', () => {
    const layout: Layout = [{ id: 'l', kind: 'loveseat', col: 2, row: 12 }, { id: 'b', kind: 'beanbag', col: 18, row: 14 }, { id: 'c', kind: 'dresser', col: 26, row: 11 }];
    for (const s of seeds) expect(nextPlan(robot(layout, s), from, 0).on).toBeNull();
  });
```

Les lignes `row` des meubles : vérifier que la dernière rangée dessinée tombe au sol (`row + drawSize(kind, 0).h - 1` entre 12 et 17, `cols` 36) ; ajuster `row` si `canPlace` les refuse (le test ne passe pas par `canPlace`, mais un meuble hors sol fausse la carte de marche).

`pets-storm.test.ts` :

```ts
describe('orage avec les nouveaux meubles', () => {
  it('le chat se cache sous le canapé deux places', () => {
    const layout = [{ id: 'l', kind: 'loveseat', col: 8, row: 12 }] as never;
    const plan = stormPlan({ ...envOf(layout), species: 'cat' } as never, from, 0);
    expect(plan.action).toBe('hide');
    expect(plan.hostId).toBe('l');
  });
  it('le chien se blottit au pied de la chauffeuse', () => {
    const layout = [{ id: 'c', kind: 'club-chair', col: 8, row: 12 }] as never;
    const plan = stormPlan({ ...envOf(layout), species: 'dog' } as never, from, 0);
    expect(plan.action).toBe('cower');
    expect(plan.hostId).toBe('c');
  });
});
```
(Reprendre la signature exacte de `stormPlan` utilisée par les tests existants du fichier : si l'espèce est passée autrement que par `env.species`, faire pareil.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/pets-roles.test.ts tests/core/library/pets-brain.test.ts tests/core/library/pets-storm.test.ts`
Expected: FAIL (`roles.ts` absent ; chien jamais sur le canapé deux places).

- [ ] **Step 3: Implement**

`src/core/library/pets/roles.ts` :

```ts
import type { StandingKind } from '../library-types';

// Ce que chaque meuble offre aux animaux : le cerveau (brain.ts), l'orage (storm.ts) et le rendu (runner.ts) lisent cette table
// au lieu de tester les types un par un. `catSeat` : le chat dort sur les places `sleep` et se perche sur les `seat` ; `dogCouch` :
// le chien y monte (dort sur `sleep`, sinon sur `seat`) ; `catTop` : dessus où le chat se perche ; `catHide` : cachette dessous
// (point `hide`) ; `catScratch` : griffoir contre un flanc.
export type PetRole = 'catSeat' | 'dogCouch' | 'catTop' | 'catHide' | 'catScratch';

const ROLES: Record<PetRole, ReadonlySet<StandingKind>> = {
  catSeat: new Set(['chair', 'armchair', 'sofa', 'rocking-chair', 'club-chair', 'loveseat', 'daybed', 'egg-chair', 'peacock-chair', 'pouf', 'beanbag', 'bench']),
  dogCouch: new Set(['sofa', 'club-chair', 'loveseat', 'daybed', 'pouf', 'beanbag']),
  catTop: new Set(['shelf', 'desk', 'dresser', 'side-table', 'cat-tree']),
  catHide: new Set(['sofa', 'loveseat']),
  catScratch: new Set(['armchair']),
};

export const hasRole = (kind: StandingKind, role: PetRole): boolean => ROLES[role].has(kind);
```

`brain.ts` (importer `hasRole` depuis `./roles`) — bloc du chien, remplacer `if (plat && p.kind === 'sofa') { … }` par :

```ts
      if (plat && hasRole(p.kind, 'dogCouch')) {
        const beds = poi('sleep');
        const seats = poi('seat');
        // Dort sur la place `sleep` ; à défaut (chauffeuse, pouf), sur une place assise, réservée comme telle.
        if (beds.length > 0) for (const q of beds) go('sleep', 1.2, { pt: onPlat(plat, (p.col + q.dx + 0.5) * CELL_W), on: p.id, hostId: p.id }, [25000, 60000], `${p.id}:sleep`);
        else seats.forEach((q, i) => go('sleep', 1.2, { pt: onPlat(plat, (p.col + q.dx + 0.5) * CELL_W), on: p.id, hostId: p.id }, [25000, 60000], `${p.id}:seat${i}`));
        seats.forEach((q, i) => go('perch', 0.6, { pt: onPlat(plat, (p.col + q.dx + 0.5) * CELL_W), on: p.id, hostId: p.id }, [10000, 25000], `${p.id}:seat${i}`));
      }
```

et mettre à jour le commentaire au-dessus de `if (dog && raw.some(...))` : « Un chien ne grimpe que sur un canapé ou un pouf (rôle `dogCouch`) : aucun segment ne le pose sur un autre meuble. »

Bloc du chat, remplacer les quatre `if` (`sofa || armchair || chair`, `sofa` hide, `armchair` scratch, `shelf || desk`) par :

```ts
      if (plat && hasRole(p.kind, 'catSeat')) {
        for (const q of poi('sleep')) go('sleep', 1.8, { pt: onPlat(plat, (p.col + q.dx + 0.5) * CELL_W), on: p.id, hostId: p.id }, [25000, 60000], `${p.id}:sleep`);
        poi('seat').forEach((q, i) => go('perch', p.kind === 'sofa' ? 0.5 : 1, { pt: onPlat(plat, (p.col + q.dx + 0.5) * CELL_W), on: p.id, hostId: p.id }, [10000, 25000], `${p.id}:seat${i}`));
      }
      if (hasRole(p.kind, 'catHide')) go('hide', 0.7, { pt: hideSpot(p), on: null, hostId: p.id }, [8000, 16000], `${p.id}:hide`);
      if (hasRole(p.kind, 'catScratch')) {
```
(le corps du griffoir est inchangé)
```ts
      if (plat && hasRole(p.kind, 'catTop')) {
```
(le corps du perchoir sur le dessus est inchangé).

`storm.ts` (importer `hasRole` depuis `./roles`) :

```ts
  const standing = env.layout.filter(isStanding);
  // Le chat se glisse sous la première cachette libre (place réservée `:hide`) ; le chien se blottit devant son premier canapé ou pouf.
  const sofa = species === 'cat' ? standing.filter((p) => hasRole(p.kind, 'catHide')).find((p) => !env.occupied.has(`${p.id}:hide`)) : standing.find((p) => hasRole(p.kind, 'dogCouch'));
```
(supprimer la ligne `const sofas = …` et l'ancien commentaire ; le reste de la fonction est inchangé.)

`runner.ts` (importer `hasRole` depuis `./roles` et `isStanding` depuis `../room-grid`) :

```ts
// Un animal posé sur un dessus (étagère, bureau, commode, guéridon, arbre à chat) est dessiné « en haut ».
const isTop = (room: Room, on: string | null): boolean => {
  const host = on === null ? undefined : room.layout.find((p) => p.id === on);
  return host !== undefined && isStanding(host) && hasRole(host.kind, 'catTop');
};
```
(supprimer `PERCH_KINDS`.)

- [ ] **Step 4: Run tests**

Run: `npx tsc --noEmit && npm run test:famille -- scene-animaux`
Expected: PASS, y compris les tests historiques (chien jamais sur l'étagère, le bureau ou le fauteuil ; chat caché sous le canapé).

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(bibliotheque): table des rôles des meubles pour les animaux (le chien monte sur tous les canapés et les poufs)"
```

---

### Task 7: (retirée — pas de fiche WikiHow pour ce lot, décision de l’utilisateur du 2026-10-14)

---

### Task 8: Captures et validation visuelle

**Files:**
- Create: `.superpowers/harness-mobilier/` (banc de captures, non versionné ; `.superpowers` est ignoré par git)

- [ ] **Step 1: Banc de captures**

Copier le banc du lot précédent s'il existe (`git show origin/main --stat` ne le contient pas : il vit dans l'ancien worktree `C:\Users\maxim\Downloads\Wikimasters-modeles\.superpowers\harness-modeles`). Sinon, créer `.superpowers/harness-mobilier/index.html` + `main.tsx` + `vite.config.ts` sur le modèle de `.superpowers/harness/` du dépôt principal, qui rend :
1. une planche : chaque nouveau meuble (19) aux angles 0, 1 et 2, en `scandinave` puis en `neon`, via `Model3DArt` ;
2. une pièce meublée (`RoomView` ou le panneau complet) avec rocking chair + lampadaire arc au-dessus, canapé deux places, arbre à chat, plantes, chat et chien, lumières allumées.

Lancer avec Vite (`npx vite --config .superpowers/harness-mobilier/vite.config.ts --port 5270`), capturer avec Chrome sans fenêtre :

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1400,2400 --screenshot="C:/Users/maxim/Downloads/Wikimasters-mobilier/.superpowers/captures-mobilier/planche.png" "http://localhost:5270/"
```

- [ ] **Step 2: Relire les captures soi-même**, corriger ce qui jure avec les maquettes validées (proportions, couleur, pièce manquante, ordre de dessin), relancer les tests de la tâche concernée, commit `fix(bibliotheque): …`.

- [ ] **Step 3: Montrer les captures à l'utilisateur** (SendUserFile) et attendre sa validation avant la tâche 9.

---

### Task 9: Familles de tests, construction, PR, pré-prod

- [ ] **Step 1: Familles touchées**

Run: `npx tsc --noEmit && npm run test:famille -- scene-piece scene-lumiere scene-animaux`.
Expected: PASS.

- [ ] **Step 2: Construction**

Run: `npm run build`
Expected: succès.

- [ ] **Step 3: PR et fusion**

```bash
git push -u origin feat/mobilier-divers-a
gh pr create --base main --title "Mobilier divers, lot A : 19 meubles au sol" --body "<résumé : meubles, socle séparé, feuilles, rôles des animaux, lampes ; captures ; Fable n'est pas passé ; lots B à D à suivre>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --merge
```

- [ ] **Step 4: Pré-prod**

Depuis le dépôt principal à jour de `main` : `npm run preprod` (APK compris). Noter le numéro de pré-prod dans la mémoire du projet.
