# Bibliothèque « Aller dehors » — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** un bouton Sortir/Rentrer sur la scène de la bibliothèque (vue normale et plein écran) qui retire les murs de la pièce pour montrer tout le décor, avec caméra (glisser, pincer, molette, double appui, zoom ×1–×4) et suivi d'un personnage touché.

**Architecture :** le décor est déjà un monde unique `width × wallH` rendu dans `RoomView` (`<svg data-window-views>`). Dehors, ce même nœud s'étend à tout le monde, les couches de la pièce s'estompent puis sont démontées, et le `viewBox` du `<svg>` racine devient la caméra, écrite directement dans le DOM par un hook (aucun re-rendu par geste). Le calcul de caméra est pur et testé à part ; le choix du personnage visé aussi.

**Tech Stack :** TypeScript, React 18 (createRoot + act, pas de @testing-library), Vitest + jsdom, SVG.

**Spec :** `docs/superpowers/specs/2026-10-12-bibliotheque-dehors-design.md`

## Global Constraints

- Zoom borné à **[1, 4]** ; `zoom = 1` : la hauteur du monde (`wallH` = `WALL_ROWS * CELL_H` = 340) remplit la hauteur de la boîte.
- Molette : facteur **1,15** par cran. Double appui : **×1 ↔ ×2,5**, animé **300 ms**, seuil 300 ms entre appuis.
- Appui court = déplacement total ≤ **8 px**. Personnage visé : boîte qui contient le point, sinon le plus proche à moins de **24 px** ; parmi plusieurs, le dernier dans l'ordre du document.
- Suivi : lissage exponentiel, constante **250 ms** ; arrêt si le personnage est invisible plus de **1 s**.
- Transition Sortir/Rentrer : caméra **600 ms** `ease-in-out`, fondu des couches de la pièce **400 ms** ; mouvement réduit (`reducedMotion()` de `src/content/ghibli-sky.tsx`) → instantané.
- Bouton : pastille ronde 36 px, `position:absolute; top:8; left:8`, fond `rgba(0,0,0,0.65)`, icône blanche ; `data-action="outside"` + `aria-label="Sortir"` à l'intérieur, `data-action="inside"` + `aria-label="Rentrer"` dehors ; masqué en mode Aménager.
- Chaque ouverture et chaque changement de pièce → intérieur ; rien n'est persisté.
- Visuels faits **sans Fable** (décision de l'utilisateur).
- Commentaires en français, style des fichiers voisins. Tests : `npx vitest run <fichier>` ; typage : `npm run typecheck`.
- Vérifier `git branch --show-current` = `feat/bibliotheque-dehors` avant chaque commit. Messages de commit terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Basculer le plein écran (ou tourner le téléphone) **pendant qu'on est dehors** : la caméra se re-borne à la nouvelle boîte, jamais de vide hors décor → test Task 4 (« resize re-borne »).
2. Changer de pièce, ou passer en Aménager, **dehors** : retour à l'intérieur, pièce complète et éditable → test Task 5.
3. Pièce **sans fenêtre** : dehors montre quand même le décor → test Task 3.
4. Appuyer sur le bouton Rentrer pendant un suivi : l'appui n'est pas pris pour un personnage ni un glissé → test Task 4 (pointerdown sur un bouton ignoré).
5. Démontage du panneau en pleine transition : aucune image d'animation ne reste programmée → test Task 4 (cancelAnimationFrame à la fermeture).

---

### Task 1 : calcul de caméra (pur)

**Files :**
- Create : `src/core/library/outside-camera.ts`
- Test : `tests/core/library/outside-camera.test.ts`

**Interfaces :**
- Produces :
  - `type Size = { w: number; h: number }`, `type Rect = { x: number; y: number; w: number; h: number }`, `type Camera = { x: number; y: number; zoom: number }`, `type Point = { x: number; y: number }`
  - `ZOOM_MIN = 1`, `ZOOM_MAX = 4`, `FOLLOW_TAU_MS = 250`
  - `viewSize(box: Size, world: Size, zoom: number): Size`
  - `clampCamera(cam: Camera, box: Size, world: Size): Camera`
  - `viewRect(cam: Camera, box: Size, world: Size): Rect`
  - `viewBoxOf(r: Rect): string`
  - `clientToWorld(cam: Camera, box: Size, world: Size, px: number, py: number): Point` (px, py relatifs au coin haut-gauche de la boîte)
  - `zoomAt(cam: Camera, box: Size, world: Size, factor: number, px: number, py: number): Camera`
  - `pan(cam: Camera, box: Size, world: Size, dx: number, dy: number): Camera` (dx, dy en px écran)
  - `centerOn(cam: Camera, box: Size, world: Size, p: Point): Camera`
  - `followStep(cam: Camera, box: Size, world: Size, p: Point, dtMs: number): Camera`
  - `initialCamera(box: Size, world: Size, windows: readonly Rect[], focusX: number): Camera`
  - `lerpRect(a: Rect, b: Rect, t: number): Rect`, `easeInOut(t: number): number`

- [ ] **Step 1 : écrire les tests**

```ts
import { describe, expect, it } from 'vitest';
import { centerOn, clampCamera, clientToWorld, easeInOut, followStep, initialCamera, lerpRect, pan, viewBoxOf, viewRect, viewSize, zoomAt } from '../../../src/core/library/outside-camera';

const box = { w: 720, h: 340 };
const world = { w: 1440, h: 340 };

describe('caméra dehors', () => {
  it('zoom 1 : la hauteur du monde remplit la boîte', () => {
    expect(viewSize(box, world, 1)).toEqual({ w: 720, h: 340 });
    expect(viewSize(box, world, 2)).toEqual({ w: 360, h: 170 });
  });

  it('borne le zoom à [1, 4] et la caméra aux bords du monde', () => {
    expect(clampCamera({ x: -50, y: -10, zoom: 0.5 }, box, world)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(clampCamera({ x: 5000, y: 5000, zoom: 9 }, box, world)).toEqual({ x: 1440 - 180, y: 340 - 85, zoom: 4 });
  });

  it('centre un monde plus étroit que la boîte', () => {
    expect(clampCamera({ x: 0, y: 0, zoom: 1 }, box, { w: 600, h: 340 }).x).toBe(-60);
  });

  it('zoome autour du point touché : il reste sous le doigt', () => {
    const cam = zoomAt({ x: 0, y: 0, zoom: 1 }, box, world, 2, 360, 170);
    expect(cam).toEqual({ x: 180, y: 85, zoom: 2 });
    expect(clientToWorld(cam, box, world, 360, 170)).toEqual({ x: 360, y: 170 });
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, box, world, 10, 0, 0).zoom).toBe(4);
  });

  it('glisser déplace à l’opposé du doigt, à l’échelle du zoom', () => {
    expect(pan({ x: 400, y: 0, zoom: 1 }, box, world, 100, 0).x).toBe(300);
    expect(pan({ x: 400, y: 50, zoom: 2 }, box, world, -100, 20)).toEqual({ x: 450, y: 40, zoom: 2 });
  });

  it('centre sur un point, borné', () => {
    expect(centerOn({ x: 0, y: 0, zoom: 2 }, box, world, { x: 1000, y: 170 })).toEqual({ x: 820, y: 85, zoom: 2 });
    expect(centerOn({ x: 0, y: 0, zoom: 1 }, box, world, { x: 1430, y: 0 }).x).toBe(720);
  });

  it('le suivi converge vers le personnage sans sauter', () => {
    let cam = { x: 0, y: 0, zoom: 2 };
    const first = followStep(cam, box, world, { x: 1000, y: 170 }, 16);
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(820 * 0.1);
    for (let i = 0; i < 200; i++) cam = followStep(cam, box, world, { x: 1000, y: 170 }, 16);
    expect(cam.x).toBeCloseTo(820, 0);
    expect(cam.y).toBeCloseTo(85, 0);
  });

  it('cadre initial : zoom 1 centré sur la fenêtre la plus proche, sinon le centre du monde', () => {
    const wins = [{ x: 60, y: 30, w: 180, h: 150 }, { x: 900, y: 30, w: 240, h: 150 }];
    expect(initialCamera(box, world, wins, 1000)).toEqual({ x: 1020 - 360, y: 0, zoom: 1 });
    expect(initialCamera(box, world, wins, 100)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(initialCamera(box, world, [], 0)).toEqual({ x: 360, y: 0, zoom: 1 });
  });

  it('rectangle de vue, viewBox, interpolation', () => {
    expect(viewRect({ x: 10, y: 20, zoom: 2 }, box, world)).toEqual({ x: 10, y: 20, w: 360, h: 170 });
    expect(viewBoxOf({ x: 1, y: 2.5, w: 3, h: 4 })).toBe('1.00 2.50 3.00 4.00');
    expect(lerpRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 20, w: 30, h: 40 }, 0.5)).toEqual({ x: 5, y: 10, w: 20, h: 25 });
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2 : lancer, constater l'échec** — `npx vitest run tests/core/library/outside-camera.test.ts` → FAIL (module introuvable).

- [ ] **Step 3 : implémenter**

```ts
// Caméra de la vue « dehors » (bibliothèque) : on regarde le monde du décor (largeur de la pièce × hauteur du mur) par une
// boîte d'écran. x, y = coin haut-gauche de la vue dans le monde ; zoom 1 = la hauteur du monde remplit la hauteur de la boîte.
export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Camera = { x: number; y: number; zoom: number };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const FOLLOW_TAU_MS = 250;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

export function viewSize(box: Size, world: Size, zoom: number): Size {
  const h = world.h / zoom;
  return { w: (h * box.w) / box.h, h };
}

// Jamais de vide hors du décor ; un monde plus étroit que la vue est centré.
export function clampCamera(cam: Camera, box: Size, world: Size): Camera {
  const zoom = clamp(cam.zoom, ZOOM_MIN, ZOOM_MAX);
  const s = viewSize(box, world, zoom);
  const x = s.w >= world.w ? (world.w - s.w) / 2 : clamp(cam.x, 0, world.w - s.w);
  return { x, y: clamp(cam.y, 0, world.h - s.h), zoom };
}

export const viewRect = (cam: Camera, box: Size, world: Size): Rect => ({ x: cam.x, y: cam.y, ...viewSize(box, world, cam.zoom) });

export const viewBoxOf = (r: Rect): string => `${r.x.toFixed(2)} ${r.y.toFixed(2)} ${r.w.toFixed(2)} ${r.h.toFixed(2)}`;

export function clientToWorld(cam: Camera, box: Size, world: Size, px: number, py: number): Point {
  const s = viewSize(box, world, cam.zoom);
  return { x: cam.x + (px / box.w) * s.w, y: cam.y + (py / box.h) * s.h };
}

// Le point du monde sous (px, py) y reste après le zoom.
export function zoomAt(cam: Camera, box: Size, world: Size, factor: number, px: number, py: number): Camera {
  const p = clientToWorld(cam, box, world, px, py);
  const zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const s = viewSize(box, world, zoom);
  return clampCamera({ x: p.x - (px / box.w) * s.w, y: p.y - (py / box.h) * s.h, zoom }, box, world);
}

export function pan(cam: Camera, box: Size, world: Size, dx: number, dy: number): Camera {
  const s = viewSize(box, world, cam.zoom);
  return clampCamera({ x: cam.x - (dx / box.w) * s.w, y: cam.y - (dy / box.h) * s.h, zoom: cam.zoom }, box, world);
}

export function centerOn(cam: Camera, box: Size, world: Size, p: Point): Camera {
  const s = viewSize(box, world, cam.zoom);
  return clampCamera({ x: p.x - s.w / 2, y: p.y - s.h / 2, zoom: cam.zoom }, box, world);
}

// Rapproche la caméra du centrage sur p (lissage exponentiel, indépendant de la cadence d'images).
export function followStep(cam: Camera, box: Size, world: Size, p: Point, dtMs: number): Camera {
  const target = centerOn(cam, box, world, p);
  const k = 1 - Math.exp(-dtMs / FOLLOW_TAU_MS);
  return clampCamera({ x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k, zoom: cam.zoom }, box, world);
}

// Arrivée dehors : zoom 1, centré sur la fenêtre la plus proche de focusX (sans fenêtre : centre du monde).
export function initialCamera(box: Size, world: Size, windows: readonly Rect[], focusX: number): Camera {
  const mid = (r: Rect): number => r.x + r.w / 2;
  const near = windows.reduce<Rect | null>((best, r) => (best === null || Math.abs(mid(r) - focusX) < Math.abs(mid(best) - focusX) ? r : best), null);
  return centerOn({ x: 0, y: 0, zoom: 1 }, box, world, { x: near ? mid(near) : world.w / 2, y: world.h / 2 });
}

export const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });

export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
```

- [ ] **Step 4 : relancer** — PASS (9 tests). `npm run typecheck` propre.
- [ ] **Step 5 : commit** — `git add src/core/library/outside-camera.ts tests/core/library/outside-camera.test.ts && git commit -m "feat(bibliotheque): caméra de la vue dehors (zoom ×1-×4, bornes, suivi lissé)"`

---

### Task 2 : personnage visé par un appui

**Files :**
- Create : `src/content/outside/pick-figure.ts`
- Test : `tests/content/outside/pick-figure.test.ts`

**Interfaces :**
- Produces :
  - `FOLLOW_SELECTOR = '[data-life-id], [data-figure], [data-worker], [data-walker]'` (passants, habitants, véhicules, figures Ghibli des boutiques et des événements, employés, marcheurs ; style classique comme Ghibli)
  - `isShown(el: Element, root: Element): boolean`
  - `pickFigure(root: Element, clientX: number, clientY: number): Element | null`

Règles de visibilité (`isShown`) : boîte écran de largeur et hauteur > 0 ; pas une figure Ghibli cachée (`data-sig` présent sans `data-key`, cf. `hideFigure` dans `src/content/figure/ghibli-figure.tsx`) ; aucun ancêtre jusqu'à `root` (inclus l'élément) avec un attribut `opacity` valant 0 ni `style.display === 'none'`.

- [ ] **Step 1 : tests**

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isShown, pickFigure } from '../../../src/content/outside/pick-figure';

function rect(el: Element, x: number, y: number, w: number, h: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y }) });
}
function scene(): { root: SVGGElement; a: Element; b: Element; c: Element } {
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  root.innerHTML = '<g data-life-id="a"></g><g data-life-id="b"></g><g data-worker=""><g data-figure="" data-sig="s" data-key="k"></g></g>';
  document.body.append(root);
  const [a, b, c] = [root.children[0]!, root.children[1]!, root.querySelector('[data-figure]')!];
  rect(a, 100, 100, 20, 40);
  rect(b, 110, 100, 20, 40);
  rect(root.children[2]!, 300, 100, 20, 40);
  rect(c, 300, 100, 20, 40);
  return { root, a, b, c };
}

describe('pickFigure', () => {
  it('prend le personnage sous le doigt, le plus en avant', () => {
    const { root, b } = scene();
    expect(pickFigure(root, 115, 120)).toBe(b);
  });
  it('sinon le plus proche à moins de 24 px, rien au-delà', () => {
    const { root, a, c } = scene();
    expect(pickFigure(root, 90, 120)).toBe(a);
    expect(pickFigure(root, 330, 120)).toBe(c);
    expect(pickFigure(root, 200, 120)).toBeNull();
  });
  it('ignore les personnages cachés', () => {
    const { root, a, b, c } = scene();
    b.setAttribute('opacity', '0.00');
    expect(pickFigure(root, 115, 120)).toBe(a);
    c.removeAttribute('data-key');
    expect(isShown(c, root)).toBe(false);
    rect(a, 0, 0, 0, 0);
    expect(isShown(a, root)).toBe(false);
  });
});
```

Note : dans `scene()`, le `[data-worker]` et sa figure partagent la même boîte ; pour (330, 120) la figure (dernière dans l'ordre du document) l'emporte à distance égale.

- [ ] **Step 2 : échec attendu** — `npx vitest run tests/content/outside/pick-figure.test.ts`.

- [ ] **Step 3 : implémenter**

```ts
// Personnage visé par un appui dans la vue dehors : toutes les couches de la ville posent leurs acteurs dans des nœuds marqués.
export const FOLLOW_SELECTOR = '[data-life-id], [data-figure], [data-worker], [data-walker]';
const NEAR_PX = 24;

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

export function isShown(el: Element, root: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  // Figure Ghibli rendue invisible par hideFigure : image sans source, clé retirée.
  if (el.hasAttribute('data-sig') && !el.hasAttribute('data-key')) return false;
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
    const op = n.getAttribute('opacity');
    if (op !== null && Number(op) === 0) return false;
    if ((n as SVGElement).style?.display === 'none') return false;
  }
  return true;
}

const distance = (r: Box, x: number, y: number): number => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));

// Dans l'ordre inverse du document : le dernier dessiné (le plus en avant) gagne à égalité.
export function pickFigure(root: Element, clientX: number, clientY: number): Element | null {
  const all = [...root.querySelectorAll(FOLLOW_SELECTOR)];
  let best: Element | null = null;
  let bestD = NEAR_PX;
  for (let i = all.length - 1; i >= 0; i--) {
    const el = all[i]!;
    if (!isShown(el, root)) continue;
    const d = distance(el.getBoundingClientRect(), clientX, clientY);
    if (d === 0) return el;
    if (d < bestD) { bestD = d; best = el; }
  }
  return best;
}
```

- [ ] **Step 4 : PASS** + `npm run typecheck`.
- [ ] **Step 5 : commit** — `feat(bibliotheque): choix du personnage à suivre dans la vue dehors`.

---

### Task 3 : RoomView sait se montrer « dehors »

**Files :**
- Modify : `src/content/RoomView.tsx` (props, rendu du monde l. ~417-470, `<svg>` racine l. ~421)
- Test : `tests/content/room-outside.test.tsx` (nouveau, même harnais que `tests/content/room-window.test.tsx` : `show()` avec `setRoomScene`/`updateLayout`, rAF neutralisé par `vi.stubGlobal`)

**Interfaces :**
- Consumes : rien des tâches précédentes.
- Produces (props de `RoomView`) :
  - `outside?: boolean` — mise en page « dehors » : `<svg>` racine `width:100%; height:100%`, `preserveAspectRatio="xMidYMid slice"`, `viewBox` initial **constant** `0 0 ${width} ${wallH}` (le hook de caméra l'écrit ensuite directement ; la valeur passée à React ne doit pas changer pendant qu'on est dehors, sinon React l'écraserait) ; le `<svg data-window-views>` couvre `0 0 width wallH` même sans fenêtre ; un repère `<g data-follow-marker opacity="0">` (triangle blanc cerné de sombre : `path d="M-7 -10 L7 -10 L0 0 Z" fill="#fff" stroke="#222" strokeWidth=2 strokeLinejoin="round"`) est rendu en dernier dans `<svg data-window-views>`.
  - `roomLayers?: 'shown' | 'hidden'` (défaut `'shown'`) — couches de la pièce : le `<g data-window-wall>` et un **nouveau** groupe `<g data-room-layers>` qui enveloppe, dans l'ordre actuel, les `data-window-gap`, `backLayer`, `wallLayer`, `middle`, `computers`, `smalls`, `topPets`, `cardLayer`, `LightLayer`, `bubbles`, `cells`, les fantômes de glissé. Les `<g data-window-glass>` (fond de vitre) font aussi partie de la pièce : rendus seulement si `roomLayers === 'shown'` ou pendant le fondu.
  - Fondu : style `{ opacity: roomLayers === 'shown' ? 1 : 0, transition: still ? 'none' : 'opacity 400ms ease' }` sur ces deux groupes ; 400 ms après le passage à `'hidden'` (0 ms si `reducedMotion()`), ils ne sont plus rendus (état `gone`, `setTimeout`, nettoyé au démontage). Au retour à `'shown'` après démontage, fondu d'entrée par `el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease' })` (absent sous jsdom : appel optionnel) dans un `useLayoutEffect`.
  - **Le nœud du monde n'est jamais démonté par la bascule** : garder chaque enfant du `<svg>` racine à la même position (expressions conditionnelles `{cond && …}` à leur place, pas de nouveau parent autour du monde).

Changements concrets :
1. Ajouter `outside = false, roomLayers = 'shown'` à la déstructuration des props ; documenter les deux props dans `Props` (commentaires en français).
2. `const worldRect = outside ? { x: 0, y: 0, w: width, h: wallH } : viewBox;` et remplacer `{viewBox && (` par `{worldRect && (` et les attributs du `<svg data-window-views>` par ceux de `worldRect`.
3. `<svg>` racine : `viewBox={outside ? \`0 0 ${width} ${wallH}\` : \`0 0 ${width} ${HEIGHT}\`}`, `preserveAspectRatio={outside ? 'xMidYMid slice' : undefined}`, `data-outside={outside ? '' : undefined}`, style dehors `{ width: '100%', height: '100%', display: 'block' }` (pas d'`aspectRatio`).
4. Gouttes sur les vitres (`GlassDrops`) : seulement si `!outside`.

- [ ] **Step 1 : tests**

```tsx
// (en-tête et harnais copiés de tests/content/room-window.test.tsx ; show() reçoit en plus { outside, roomLayers })
describe('RoomView — dehors', () => {
  it('dehors, le décor couvre tout le monde même sans fenêtre, et la pièce disparaît', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true })); // mouvement réduit : pas de fondu
    show(0, 'city', undefined, null, { outside: true, roomLayers: 'hidden' });
    const views = container.querySelector('svg[data-window-views]')!;
    expect(views.getAttribute('viewBox')).toBe(`0 0 ${24 * 30} 340`);
    expect(container.querySelector('[data-panorama]')).not.toBeNull();
    expect(container.querySelector('[data-window-wall]')).toBeNull();
    expect(container.querySelector('[data-room-layers]')).toBeNull();
    expect(container.querySelector('[data-follow-marker]')).not.toBeNull();
    const svg = container.querySelector('svg[role="img"]')!;
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${24 * 30} 340`);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
  });

  it('la bascule garde le même nœud du monde (les acteurs continuent)', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    show(1);
    const before = container.querySelector('[data-window-actors]');
    show(1, 'city', undefined, null, { outside: true, roomLayers: 'hidden' });
    expect(container.querySelector('[data-window-actors]')).toBe(before);
    show(1);
    expect(container.querySelector('[data-window-actors]')).toBe(before);
    expect(container.querySelector('[data-furniture="window"]')).not.toBeNull();
  });

  it('sans mouvement réduit, la pièce s’estompe 400 ms avant d’être retirée', () => {
    vi.useFakeTimers();
    show(1);
    show(1, 'city', undefined, null, { outside: true, roomLayers: 'hidden' });
    const layers = container.querySelector<SVGGElement>('[data-room-layers]')!;
    expect(layers.style.opacity).toBe('0');
    act(() => { vi.advanceTimersByTime(400); });
    expect(container.querySelector('[data-room-layers]')).toBeNull();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2 : échec attendu** — `npx vitest run tests/content/room-outside.test.tsx`.
- [ ] **Step 3 : implémenter** les changements 1–4 ci-dessus.
- [ ] **Step 4 : PASS** ; relancer aussi `npx vitest run tests/content/room-window.test.tsx tests/content/room-window-memo.test.tsx tests/content/library-furniture-view.test.tsx tests/content/library-light.test.tsx tests/content/library-pets-view.test.tsx tests/content/room-pet-shadows.test.tsx` (aucune régression ; ajouter `--testTimeout=30000` si la machine est chargée) + `npm run typecheck`.
- [ ] **Step 5 : commit** — `feat(bibliotheque): RoomView sans les murs (vue dehors, monde entier, fondu de la pièce)`.

---

### Task 4 : hook de caméra (gestes, transitions, suivi)

**Files :**
- Create : `src/content/outside/use-outside-camera.ts`
- Test : `tests/content/outside/use-outside-camera.test.tsx`

**Interfaces :**
- Consumes : Task 1 (toutes les fonctions de `outside-camera.ts`), Task 2 (`pickFigure`, `isShown`), Task 3 (`[data-follow-marker]` dans le `<svg>`, `viewBox` piloté).
- Produces :
  - `type OutsidePhase = 'inside' | 'leaving' | 'outside' | 'returning'`
  - `TRANSITION_MS = 600`
  - `useOutsideCamera(o: { svg: () => SVGSVGElement | null; box: () => HTMLElement | null; world: Size; phase: OutsidePhase; from: Rect | null; windows: readonly Rect[]; onSettled: (phase: 'outside' | 'inside') => void }): void`

Comportement :
- `leaving` : caméra = `initialCamera(boîte, world, windows, from ? from.x + from.w / 2 : world.w / 2)` ; anime le `viewBox` de `from` (s'il existe) vers `viewRect(caméra)` en `TRANSITION_MS`, `easeInOut` ; puis `onSettled('outside')`. Mouvement réduit ou `from === null` : écrit directement la cible et appelle `onSettled('outside')` (dans un `queueMicrotask` pour ne pas appeler setState pendant l'effet).
- `outside` : écouteurs sur `box()` — `pointerdown/move/up/cancel` (un pointeur : glisser ; deux : pincer autour du point médian ; un appui ≤ 8 px : double appui < 300 ms → zoom animé 300 ms vers 2,5 si zoom < 1,75 sinon 1, autour du point ; sinon `pickFigure(svg, x, y)` → suivi ou arrêt), `wheel` (`passive: false`, `preventDefault`, facteur 1,15 / 1/1,15 selon `deltaY`, arrête le suivi). `pointerdown` dont la cible est dans un `button` : ignoré. `resize` (window) et `fullscreenchange` (document) : re-borne et réécrit.
- Suivi : boucle rAF tant qu'un personnage est suivi : lit sa boîte écran, convertit le centre en monde avec la caméra courante (`clientToWorld`), `followStep(dt)`, écrit le `viewBox`, pose le repère au-dessus de la tête (`translate(x, yHaut - 4)`, `opacity="1"`). Invisible (`!isShown`) > 1 s → arrêt (repère `opacity="0"`). Glisser > 8 px, pincer, appui dans le vide → arrêt.
- `returning` : anime de la vue courante vers `from` (si non nul), puis `onSettled('inside')` ; mouvement réduit ou `from` nul : immédiat.
- Nettoyage de chaque phase : `cancelAnimationFrame` de toute image programmée, retrait des écouteurs.

- [ ] **Step 1 : tests** (harnais : composant de test qui rend `<div data-box><svg role="img"><svg data-window-views><g data-life-id="p"/><g data-follow-marker opacity="0"/></svg></svg></div>` et appelle le hook ; `getBoundingClientRect` de la boîte et du `<svg>` stubbés à `{left:0, top:0, width:720, height:340}` ; `requestAnimationFrame` remplacé par une file manuelle `frames` avec `flush(ms)` qui avance `performance.now` via `vi.spyOn(performance, 'now')` ; `matchMedia` stubbé selon le test ; `world = { w: 1440, h: 340 }`.)

```tsx
it('sortir sans animation : cadre initial sur la fenêtre la plus proche, puis onSettled("outside")', async () => {
  reduced(true);
  const settled = vi.fn();
  render({ phase: 'leaving', from: { x: 800, y: 0, w: 720, h: 510 }, windows: [{ x: 900, y: 30, w: 240, h: 150 }], onSettled: settled });
  await flushMicrotasks();
  expect(svg().getAttribute('viewBox')).toBe('660.00 0.00 720.00 340.00');
  expect(settled).toHaveBeenCalledWith('outside');
});

it('sortir avec animation : le viewBox glisse en 600 ms', () => {
  reduced(false);
  const settled = vi.fn();
  render({ phase: 'leaving', from: { x: 0, y: 0, w: 720, h: 510 }, windows: [], onSettled: settled });
  flush(300);
  const mid = svg().getAttribute('viewBox')!.split(' ').map(Number);
  expect(mid[0]).toBeGreaterThan(0);
  expect(mid[0]).toBeLessThan(360);
  flush(400);
  expect(svg().getAttribute('viewBox')).toBe('360.00 0.00 720.00 340.00');
  expect(settled).toHaveBeenCalledWith('outside');
});

it('dehors : glisser déplace, la molette zoome autour du curseur, bornée à ×4', () => { /* phase outside après leaving réduit ; pointerdown(400,170) → pointermove(300,170) → pointerup : x augmente de 100 ; 20 × wheel deltaY<0 en (360,170) : hauteur du viewBox = 85 */ });

it('appui sur un personnage : suivi + repère ; glisser l’arrête', () => { /* rect du [data-life-id] = (600,150,20,40) ; tap (610,170) ; flush(16) ×N : viewBox x se rapproche ; marker opacity "1" ; pointerdown/move 20 px : marker opacity "0" */ });

it('personnage caché plus d’1 s : le suivi s’arrête', () => { /* après suivi, rect à 0×0 ; flush(1100) : marker opacity "0" et plus aucune image programmée */ });

it('double appui : zoom ×2,5 autour du point, puis retour ×1', () => { /* deux taps < 300 ms au même endroit dans le vide ; flush(300) : hauteur viewBox = 136 ; recommencer : 340 */ });

it('pointerdown sur un bouton ignoré', () => { /* bouton dans la boîte ; pointerdown/up dessus : viewBox inchangé, pas de suivi */ });

it('resize re-borne la caméra', () => { /* zoom 1 à x=720 ; la boîte passe à 1440×340 ; dispatch resize : viewBox = "0.00 0.00 1440.00 340.00" */ });

it('rentrer : anime vers from puis onSettled("inside") ; démontage = plus aucune image programmée', () => { /* phase returning, flush(700) → viewBox = from, settled('inside') ; nouveau rendu en leaving animé puis unmount à mi-chemin : file frames vide (cancelAnimationFrame appelé) */ });
```

Les tests en commentaire doivent être écrits en entier par l'implémenteur, avec les valeurs exactes indiquées (hauteur de viewBox à ×4 = 340/4 = 85 ; à ×2,5 = 136).

- [ ] **Step 2 : échec attendu.**
- [ ] **Step 3 : implémenter**

```ts
import { useEffect, useRef } from 'react';
import { clampCamera, clientToWorld, easeInOut, followStep, initialCamera, lerpRect, pan, viewBoxOf, viewRect, zoomAt, type Camera, type Rect, type Size } from '../../core/library/outside-camera';
import { reducedMotion } from '../ghibli-sky';
import { isShown, pickFigure } from './pick-figure';

// Vue « dehors » de la bibliothèque : la caméra écrit directement le viewBox du <svg> de la pièce (aucun re-rendu React par geste).
export type OutsidePhase = 'inside' | 'leaving' | 'outside' | 'returning';
export const TRANSITION_MS = 600;
const TAP_PX = 8;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_ZOOM_MS = 300;
const LOST_MS = 1000;
const WHEEL_STEP = 1.15;

type Options = { svg: () => SVGSVGElement | null; box: () => HTMLElement | null; world: Size; phase: OutsidePhase; from: Rect | null; windows: readonly Rect[]; onSettled: (phase: 'outside' | 'inside') => void };

export function useOutsideCamera(o: Options): void {
  const opts = useRef(o);
  opts.current = o;
  const cam = useRef<Camera | null>(null);
  useEffect(() => {
    const { phase, world } = opts.current;
    const svg = opts.current.svg();
    const el = opts.current.box();
    if (phase === 'inside' || !svg || !el) return;
    let raf = 0;
    const frames = new Set<number>();
    const later = (f: FrameRequestCallback): void => { const id = requestAnimationFrame((t) => { frames.delete(id); f(t); }); frames.add(id); };
    const size = (): { w: number; h: number; left: number; top: number } => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, left: r.left, top: r.top }; };
    const write = (r: Rect): void => svg.setAttribute('viewBox', viewBoxOf(r));
    const show = (): void => { const b = size(); if (!b.w || !b.h || !cam.current) return; cam.current = clampCamera(cam.current, b, world); write(viewRect(cam.current, b, world)); };
    const tween = (from: Rect, to: Rect, ms: number, done: () => void): void => {
      const t0 = performance.now();
      const step = (now: number): void => {
        const k = easeInOut(Math.min(1, (now - t0) / ms));
        write(lerpRect(from, to, k));
        if (k < 1) later(step); else done();
      };
      later(step);
    };
    const settle = (p: 'outside' | 'inside'): void => queueMicrotask(() => opts.current.onSettled(p));
    const still = reducedMotion();

    if (phase === 'leaving') {
      const b = size();
      const { from, windows } = opts.current;
      if (b.w && b.h) {
        cam.current = initialCamera(b, world, windows, from ? from.x + from.w / 2 : world.w / 2);
        const target = viewRect(cam.current, b, world);
        if (still || !from) { write(target); settle('outside'); } else tween(from, target, TRANSITION_MS, () => settle('outside'));
      } else settle('outside');
    }

    if (phase === 'returning') {
      const b = size();
      const from = opts.current.from;
      const now = cam.current && b.w && b.h ? viewRect(cam.current, b, world) : null;
      if (still || !from || !now) { if (from) write(from); settle('inside'); } else tween(now, from, TRANSITION_MS, () => settle('inside'));
    }

    const cleanup: Array<() => void> = [() => { for (const id of frames) cancelAnimationFrame(id); frames.clear(); }];
    if (phase === 'outside') {
      const marker = (): SVGGElement | null => svg.querySelector<SVGGElement>('[data-follow-marker]');
      let following: Element | null = null;
      let lostAt = 0;
      let last = 0;
      const stop = (): void => { following = null; marker()?.setAttribute('opacity', '0'); if (raf) { cancelAnimationFrame(raf); frames.delete(raf); raf = 0; } };
      const tick = (now: number): void => {
        raf = 0;
        const b = size();
        if (!following || !cam.current || !b.w || !b.h) return;
        const dt = last ? Math.min(100, now - last) : 16;
        last = now;
        if (!isShown(following, svg)) {
          lostAt ||= now;
          if (now - lostAt > LOST_MS) return stop();
        } else {
          lostAt = 0;
          const r = following.getBoundingClientRect();
          const cx = r.left + r.width / 2 - b.left;
          const centre = clientToWorld(cam.current, b, world, cx, r.top + r.height / 2 - b.top);
          const head = clientToWorld(cam.current, b, world, cx, r.top - b.top);
          cam.current = followStep(cam.current, b, world, centre, dt);
          write(viewRect(cam.current, b, world));
          const m = marker();
          m?.setAttribute('transform', `translate(${head.x.toFixed(1)} ${(head.y - 4).toFixed(1)})`);
          m?.setAttribute('opacity', '1');
        }
        raf = requestAnimationFrame((t) => { frames.delete(raf); tick(t); });
        frames.add(raf);
      };
      const startFollow = (target: Element): void => { stop(); following = target; lostAt = 0; last = 0; tick(performance.now()); };

      const zoomTo = (target: number, px: number, py: number): void => {
        if (!cam.current) return;
        const c0 = cam.current;
        if (still) { cam.current = zoomAt(c0, size(), world, target / c0.zoom, px, py); show(); return; }
        const t0 = performance.now();
        const step = (now: number): void => {
          const k = easeInOut(Math.min(1, (now - t0) / DOUBLE_TAP_ZOOM_MS));
          const z = c0.zoom + (target - c0.zoom) * k;
          cam.current = zoomAt(c0, size(), world, z / c0.zoom, px, py);
          show();
          if (k < 1) later(step);
        };
        later(step);
      };

      const ptrs = new Map<number, { x: number; y: number }>();
      let moved = 0;
      let pinch = 0;
      let lastTap = { t: -Infinity, x: 0, y: 0 };
      const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => { const b = size(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
      const spread = (): number => { const [a, b] = [...ptrs.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
      const down = (e: PointerEvent): void => {
        if ((e.target as Element | null)?.closest?.('button')) return;
        el.setPointerCapture?.(e.pointerId);
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = 0;
        if (ptrs.size === 2) { stop(); pinch = spread(); }
      };
      const move = (e: PointerEvent): void => {
        const p = ptrs.get(e.pointerId);
        if (!p || !cam.current) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        if (ptrs.size >= 2) {
          const d = spread();
          const [a, b] = [...ptrs.values()];
          const mid = local({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 });
          if (pinch > 0 && d > 0) { cam.current = zoomAt(cam.current, size(), world, d / pinch, mid.x, mid.y); show(); }
          pinch = d;
          moved = Infinity;
          return;
        }
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > TAP_PX) { if (following) stop(); cam.current = pan(cam.current, size(), world, dx, dy); show(); }
      };
      const up = (e: PointerEvent): void => {
        if (!ptrs.delete(e.pointerId)) return;
        if (ptrs.size < 2) pinch = 0;
        if (moved > TAP_PX || ptrs.size > 0 || !cam.current) return;
        const now = performance.now();
        const at = local(e);
        if (now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(at.x - lastTap.x, at.y - lastTap.y) < 30) {
          lastTap = { t: -Infinity, x: 0, y: 0 };
          zoomTo(cam.current.zoom < 1.75 ? 2.5 : 1, at.x, at.y);
          return;
        }
        lastTap = { t: now, x: at.x, y: at.y };
        const target = pickFigure(svg, e.clientX, e.clientY);
        if (target) startFollow(target); else stop();
      };
      const cancel = (e: PointerEvent): void => { ptrs.delete(e.pointerId); pinch = 0; };
      const wheel = (e: WheelEvent): void => {
        if (!cam.current) return;
        e.preventDefault();
        stop();
        const at = local(e);
        cam.current = zoomAt(cam.current, size(), world, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, at.x, at.y);
        show();
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('wheel', wheel, { passive: false });
      window.addEventListener('resize', show);
      document.addEventListener('fullscreenchange', show);
      show();
      cleanup.push(() => {
        stop();
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', cancel);
        el.removeEventListener('wheel', wheel);
        window.removeEventListener('resize', show);
        document.removeEventListener('fullscreenchange', show);
      });
    }
    return () => { for (const f of cleanup) f(); };
  }, [o.phase, o.world.w, o.world.h]);
}
```

- [ ] **Step 4 : PASS** + `npm run typecheck`.
- [ ] **Step 5 : commit** — `feat(bibliotheque): caméra de la vue dehors (glisser, pincer, molette, double appui, suivi d'un personnage)`.

---

### Task 5 : bouton Sortir/Rentrer dans le panneau

**Files :**
- Modify : `src/content/LibraryPanel.tsx` (état, icônes `ICONS`, effet d'élargissement l. ~405-409, conteneur `.wmt-lib-scroll` l. ~1088-1096, `RoomView` l. ~1097-1123, superpositions de la scène l. ~1138-1144, constantes de style en bas de fichier)
- Test : `tests/content/library-outside.test.tsx` (nouveau ; harnais copié de `tests/content/library-panel.test.tsx` : `createMemoryStore`, `createLibraryRepo`, `click`, `settle`, stub plein écran de son `describe('LibraryPanel : plein écran')`)

**Interfaces :**
- Consumes : Task 3 (`outside`, `roomLayers` de `RoomView`), Task 4 (`useOutsideCamera`, `OutsidePhase`), Task 1 (`Rect`).

Changements :
1. État : `const [outsidePhase, setOutsidePhase] = useState<OutsidePhase>('inside');` et `const outsideFrom = useRef<{ rect: Rect | null; left: number; top: number } | null>(null);`.
2. `const outside = outsidePhase !== 'inside';`
3. Retour à l'intérieur au changement de pièce et en Aménager : `useEffect(() => { setOutsidePhase('inside'); }, [roomIdNow]);` et `if (editing && outside) setOutsidePhase('inside')` dans le même style d'effet (dépendance `[editing]`). Le bouton « Aménager » reste cliquable : passer en Aménager ramène simplement à l'intérieur.
4. Élargissement automatique plein écran : ajouter `|| outside` à la condition de sortie anticipée de l'effet (on n'élargit pas la pièce pendant qu'on est dehors).
5. Sortir :
```ts
const goOutside = (): void => {
  const sc = scrollRef.current;
  const svg = sc?.querySelector('svg[role="img"]');
  const s = svg?.getBoundingClientRect();
  const rect = sc && s && s.width > 0 && s.height > 0
    ? { x: (sc.scrollLeft / s.width) * room.cols * CELL_W, y: (sc.scrollTop / s.height) * HEIGHT, w: (sc.clientWidth / s.width) * room.cols * CELL_W, h: (sc.clientHeight / s.height) * HEIGHT }
    : null;
  outsideFrom.current = { rect, left: sc?.scrollLeft ?? 0, top: sc?.scrollTop ?? 0 };
  setOutsidePhase('leaving');
};
const goInside = (): void => setOutsidePhase('returning');
```
6. Caméra :
```ts
useOutsideCamera({
  svg: () => scrollRef.current?.querySelector<SVGSVGElement>('svg[role="img"]') ?? null,
  box: () => scrollRef.current,
  world: { w: room.cols * CELL_W, h: WALL_ROWS * CELL_H },
  phase: outsidePhase,
  from: outsideFrom.current?.rect ?? null,
  windows: layout.filter((p) => p.kind === 'window').map((p) => pxRect(rectOf(p)!)),
  onSettled: (p) => setOutsidePhase(p),
});
```
   (le hook doit être appelé **avant** le `return` anticipé du composant, comme les autres hooks : déplacer le calcul de `world`/`windows` sur `lib ? activeRoom(lib) : null` avec des valeurs par défaut `{ w: 0, h: 0 }` / `[]` quand il n'y a pas de bibliothèque.)
7. Retour fini : `useLayoutEffect(() => { if (outsidePhase === 'inside' && outsideFrom.current) { const sc = scrollRef.current; if (sc) { sc.scrollLeft = outsideFrom.current.left; sc.scrollTop = outsideFrom.current.top; } outsideFrom.current = null; } }, [outsidePhase]);`
8. Conteneur `.wmt-lib-scroll` dehors : `...(outside ? (stage.active ? { width: '100vw', height: '100vh', maxWidth: 'none' } : { width: '100%', aspectRatio: \`${visibleWidth} / ${HEIGHT}\` }) : {})`, `overflow: 'hidden'`, `touchAction: 'none'`, `position: 'relative'`.
9. `RoomView` : `outside={outside}` et `roomLayers={outsidePhase === 'leaving' || outsidePhase === 'outside' ? 'hidden' : 'shown'}` ; `fill={fill && !outside}`.
10. Bouton dans `.wmt-lib-stage`, avant `FullscreenButton`, si `!editing` :
```tsx
<button type="button" data-action={outside ? 'inside' : 'outside'} aria-label={outside ? 'Rentrer' : 'Sortir'} title={outside ? 'Rentrer' : 'Sortir'} onClick={outside ? goInside : goOutside} disabled={outsidePhase === 'leaving' || outsidePhase === 'returning'} style={DOOR_BUTTON}>
  <Icon paths={outside ? ICONS.house : ICONS.door} />
</button>
```
   `const DOOR_BUTTON = { position: 'absolute', top: 8, left: 8, width: 36, height: 36, padding: 0, border: 0, borderRadius: 18, cursor: 'pointer', background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'grid', placeItems: 'center', zIndex: 2 } as const;`
   Icônes (dans `ICONS`) : `door: ['M5 21V3h10v18', 'M15 4l5 2v15h-5', 'M3 21h18', 'M12 12.5h.01']`, `house: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-6h4v6']`.
   S'assurer que `.wmt-lib-stage` est `position: relative` (sinon l'ajouter en style en ligne) pour que le bouton se pose sur la scène en vue normale.

- [ ] **Step 1 : tests**

```tsx
describe('LibraryPanel : aller dehors', () => {
  beforeEach(() => { vi.stubGlobal('matchMedia', () => ({ matches: true })); }); // mouvement réduit : bascules immédiates
  afterEach(() => vi.unstubAllGlobals());

  it('montre un bouton Sortir sur la scène, qui devient Rentrer', async () => {
    const btn = q('.wmt-lib-stage [data-action="outside"]');
    expect(btn?.getAttribute('aria-label')).toBe('Sortir');
    await click('[data-action="outside"]');
    expect(q('[data-action="inside"]')?.getAttribute('aria-label')).toBe('Rentrer');
    expect(q('svg[role="img"]')?.hasAttribute('data-outside')).toBe(true);
    expect(q('[data-room-layers]')).toBeNull();
    await click('[data-action="inside"]');
    expect(q('[data-action="outside"]')).not.toBeNull();
    expect(q('[data-room-layers]')).not.toBeNull();
    expect(q('svg[role="img"]')?.hasAttribute('data-outside')).toBe(false);
  });

  it('le bouton est aussi présent en plein écran', async () => {
    stubFullscreen();
    await click('[data-action="fullscreen"]');
    expect(q('.wmt-lib-stage [data-action="outside"]')).not.toBeNull();
  });

  it('pas de bouton en Aménager ; passer en Aménager depuis dehors ramène à l’intérieur', async () => {
    await click('[data-action="outside"]');
    await click('[data-action="edit"]');
    expect(q('[data-action="outside"]')).toBeNull();
    expect(q('[data-action="inside"]')).toBeNull();
    expect(q('svg[role="img"]')?.hasAttribute('data-outside')).toBe(false);
  });

  it('changer de pièce ramène à l’intérieur', async () => {
    // Créer une 2e pièce via le repo (voir tests existants « pièces » de library-panel.test.tsx), sortir, changer de pièce par son onglet.
  });

  it('à la réouverture, on est à l’intérieur', async () => {
    await click('[data-action="outside"]');
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => { root.render(<LibraryPanel library={repo} />); });
    await settle();
    expect(q('[data-action="outside"]')).not.toBeNull();
  });
});
```

   Le test « changer de pièce » s'écrit avec le même mécanisme que les tests de pièces de `tests/content/library-panel.test.tsx` (ajout de pièce par son bouton, puis clic sur l'onglet de l'autre pièce) ; vérifier ensuite `[data-action="outside"]` présent et pas de `data-outside`.

- [ ] **Step 2 : échec attendu.**
- [ ] **Step 3 : implémenter** les changements 1–10.
- [ ] **Step 4 : PASS** ; relancer `npx vitest run tests/content` (ajouter `--no-file-parallelism --testTimeout=30000` si la machine est chargée) et `npm run typecheck`.
- [ ] **Step 5 : vérification visuelle** dans le banc de captures existant (`g4cap.mjs` / navigateur intégré) : vue normale et plein écran, sortir, zoomer, suivre un passant, rentrer ; captures dans `.superpowers/captures-dehors/`.
- [ ] **Step 6 : commit** — `feat(bibliotheque): bouton Sortir/Rentrer (vue de la rue sans les murs)`.

---

## Après les tâches

PR vers `main` (description : contenu, limites, visuels sans Fable), **attendre la validation explicite de l'utilisateur pour fusionner**, puis `npm run preprod` et `npm run build` depuis `main` à jour dans le dépôt principal.
