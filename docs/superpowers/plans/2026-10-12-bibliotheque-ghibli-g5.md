# G5 — Mobilier de rue, lampadaires, fêtes et événements (Ghibli) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** redessiner en cellulo, quand le graphisme Ghibli est actif, tout ce qui reste au dessin classique dans la scène Ville (mobilier, lampadaires, feux, installations, fêtes, cortège, père Noël, déménagement, signes festifs, engins du ciel, chien), remplacer la lumière de nuit par la technique « deux peintures » et les mouettes figées par des volées animées.

**Architecture :** peintres purs dans `src/core/library/paint/props/` (un fichier par groupe, primitives cellulo de `paint/shop/cel.ts` + `props/kit.ts`), cuits à la demande en PNG par un registre `src/content/prop/prop-host.tsx` (même mécanique que `shop-host`/`car-host` : clé → data URL, 1/8 de jour, plafond, budget par image). Chaque sprite classique garde son repère : en Ghibli, le composant pose une `<PropImage>` au même `transform` ; tant que l'image n'est pas prête, il rend le sprite classique. Animations = poses clés cuites (`frame`), choisies par la boucle existante. Lumière de nuit = découpes « éclairées » du décor peintes en canvas + ombres d'acteurs en SVG, hors filtre.

**Tech Stack :** TypeScript, React 19 (SVG), canvas 2D, vitest (jsdom, `createRoot` + `act`, pas de @testing-library), WXT. Worktree `C:\Users\maxim\Downloads\Wikimasters-ghibli`, branche `feat/bibliotheque-ghibli-g5`.

**Spec :** `docs/superpowers/specs/2026-10-12-bibliotheque-ghibli-g5-design.md` (à lire en entier avant chaque tâche). **Source du dessin :** `docs/superpowers/maquettes/g5-fetes/index.html` (fonctions nommées dans `notes.md` §1) et `notes.md` (chorégraphies §2, chien §3, lumière §5, père Noël §6-7, concert §8, ciel §9, mouettes §10). Les captures PNG du même dossier sont la référence visuelle validée.

## Global Constraints

- Ghibli seulement : le dessin classique (`ghibli=false`) ne change pas d'un pixel ; ses tests existants restent verts sans modification.
- Géométrie et mécanique inchangées : mêmes ancrages, tailles, positions, horaires, tirages et transitions. Chaque peintre occupe le cadre de son sprite classique (tableau `notes.md` §1, colonne « Repère et dimensions conservés »).
- Langage cellulo : aplat, ombre nette teintée violet (`COOL`) du côté opposé à la lumière (venue du haut à gauche), rehaut (`SUN`), trait encré `#2A1A18`. Pas de grain, pas de dégradé « carton-pâte ».
- Jamais de miroir pour un objet qui a un sens de lumière : la direction `dir` est un paramètre du peintre (voir `facing` de la tâche 1), jamais un `scale(-1 1)` de l'image cuite.
- Nuit : couleurs teintes par `tintedCtx` (lumière au 1/8 de jour) ; éléments lumineux (lanternes, feux, lentilles, lanterne du traîneau, feux de position, fusées) peints dans `glowing()` (non teints).
- Pas d'animation SMIL nouvelle en Ghibli : les animations sont des poses clés (`frame`) choisies par la boucle existante (`useWallclockLoop` / boucle de la couche), déterministes en `t`.
- Mouvement réduit (`still`) : pose `t = 0` (frame 0), drapeau plat avec pli fixe, feux d'artifice en gerbe à 30 %.
- Plafond du registre d'accessoires : 600 images ; budget : 2 peintures par image (rAF).
- `SANTA_K` 0,7 → 0,55. Palette du père Noël : barbe/fourrure/gants `#F6F3EC`, ceinture `#231A16`, boucle `#E8B93A`, nez `#E8A090`, joues `#F0A8A0`, bottes `#1E1A18`.
- Visuels et séquences d'animation (peintres des tâches 3 à 13, pantin du père Noël) : **modèle Fable**, en reprenant le code de la maquette ; code pur et branchements : Opus. Sans jetons Fable : Opus + trace dans `docs/superpowers/notes/2026-10-11-visuels-sans-fable.md`.
- Commentaires en français, densité et idiome du code voisin ; pas d'ESLint ; tests dans `tests/core/library/` et `tests/content/` (`describe/it` en français).
- Pièges du worktree : `node_modules` est une jonction vers le dépôt principal ; `.wxt/` doit exister (copier depuis le dépôt principal, sinon `TSCONFIG_ERROR`). vitest avale `console.log` (`--silent=false --reporter=verbose`). La suite complète en parallèle a ~56 échecs de délai préexistants : lancer les fichiers touchés seuls.
- Avant chaque `git commit` : `git branch --show-current` doit afficher `feat/bibliotheque-ghibli-g5`. Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (ou `Claude Fable 5.1 <noreply@anthropic.com>` pour ses tâches).
- Pas de fiche WikiHow (fiche globale à la fin de G7). Mesures téléphone : une campagne à la fin de la migration (G7), pas ici.

## Review Focus

1. **Image pas encore cuite** (premier affichage, cache évincé, changement de lumière au 1/8) : le sprite classique (ou l'image précédente de la même clé sans la lumière) reste affiché, jamais un trou ni un clignotement. → tests tâche 1 et tâche 4.
2. **Changement d'heure jour/nuit pendant qu'une installation est en place** (drapeaux, scène, stands) : la clé change de lumière, l'ancienne image reste jusqu'à la nouvelle ; aucune image de jour plein soleil en pleine nuit. → test tâche 1 (`useProp` garde la dernière image).
3. **Rue très large (MAX_COLS) un soir de 14 juillet** : nombre d'images distinctes borné (drapeaux = 8 frames partagées par tous les lampadaires, pas une image par lampadaire). → test tâche 6 (nombre de clés pour 30 lampadaires = 8).
4. **Père Noël sans maison de colline avec cheminée dans la vue** (vue étroite, colline sans cheminée) : repli rang 1, puis passage simple sans pose ; jamais d'atterrissage dans le vide. → test tâche 10.
5. **Pluie la nuit / ciel couvert le jour** (`dim` < 1, `daylight` ≥ 0,45 mais pluie) : la lumière des lampadaires suit `lampLit` et la transition d'opacité 4 s comme aujourd'hui ; aucune découpe éclairée de jour. → test tâche 4.

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/content/paint-registry.ts` (nouveau) | classe `PaintRegistry` extraite de `ShopRegistry` (clé → data URL, LRU, file, budget) |
| `src/content/shop/shop-host.tsx` (mod.) | `ShopRegistry extends PaintRegistry` (comportement inchangé) |
| `src/core/library/paint/props/kit.ts` | primitives cellulo complémentaires de la maquette : `disc`, `ball`, `tube`, `halo`, `groundShadow`, `wheel`, `flagArt`, orientation `facing` |
| `src/core/library/paint/props/index.ts` | `PropId`, `PropPainter`, table `PROPS` (id → peintre), `propBox` |
| `src/core/library/paint/props/street.ts` | lampadaire, feu tricolore, arrêt de bus, passage piéton |
| `src/core/library/paint/props/terrace.ts` | guéridon, chaise, parasol, tablier, cordon, enseigne/écriteau portés, échelle, accessoires tenus |
| `src/core/library/paint/props/install.ts` | barrière, drapeaux (lampadaire, porte, caisse), scène, pièces tenues, bras + nacelle, triporteur, plateau, échelle couchée |
| `src/core/library/paint/props/music.ts` | fût, comptoir, gobelet, auvent (+ guirlande), comptoir porté, instruments de scène, extras de concert |
| `src/core/library/paint/props/parade.ts` | cheval (frames), drapeau de parade, instruments de fanfare, fusil, coiffes, accessoires des spectateurs |
| `src/core/library/paint/props/santa.ts` | renne (frames), attelage, traîneau, lanterne, traînée, hotte |
| `src/core/library/paint/props/moving.ts` | hayon, meubles et carton, signes festifs |
| `src/core/library/paint/props/sky.ts` | avion, banderole, hélicoptère, drone, montgolfière, cerf-volant, grue, appartement, ballons, cloches, camion-poubelle, vélo de livraison |
| `src/core/library/paint/props/dog.ts` | chien : 6 races × 3 robes, frames |
| `src/core/library/paint/props/gull.ts` | mouette (battement, plané, virage, posé) |
| `src/content/prop/prop-host.tsx` | `PropRegistry`, `PropContext`, `useProp`, `<PropImage>` |
| `src/core/library/city/night-light.ts` | géométrie pure de la lumière de nuit : masques (`FALL`), découpes par lampe/vitrine, ombre d'acteur |
| `src/content/ghibli-night.tsx` (réécrit) | découpes éclairées, bloom, colonnes de pluie, ombres d'acteurs |
| `src/content/concert-light.tsx` | éclairage de concert (§8) |
| `src/core/library/city/concert.ts` | `concertState(t)` pur (palette, lyres, hit, strobe) |
| `src/core/library/figure/{dress,bake}.ts` (mod.) | tenue du père Noël (`Shape.santa`, nouvelles cases) |
| `src/core/library/city/santa.ts` (mod.) | pose sur une maison de la colline, pente, cheminée |
| `src/core/library/city/gulls.ts` | horaire et trajectoires des volées |
| `src/content/gulls-layer.tsx` | calque des mouettes |
| `src/core/library/paint/city-plan.ts` (mod.) | `plan.hill.gulls = []` ; `PAINT_VERSION` 6 |

Fichiers de branchement modifiés (Ghibli seulement) : `city-life.tsx`, `traffic-layer.tsx`, `shop-terrace.tsx`, `shop-queue.tsx`, `shop-sprites.tsx`, `shop-gesture-sprites.tsx`, `install-layer.tsx`, `music-street.tsx`, `stage-band.tsx`, `parade-sprites.tsx`, `parade-crowd.tsx`, `santa-layer.tsx`, `moving-truck.tsx`, `festive-marks.tsx`, `city-event-sprites.tsx`, `flypast-sprite.tsx`, `scene-city.tsx`, `RoomView.tsx`, `scene-panorama.tsx`.

**Décision de portage (écart à la spec §3, motivé) :** la spec envisageait de peindre lampadaires, feux, arrêt et passage piéton dans les tranches du décor. On les cuit plutôt par le registre d'accessoires : une même image sert à tous les lampadaires (2 à 3 clés : jour, nuit éteint, nuit allumé), la position des feux dépend du moteur de circulation et le nom de l'arrêt arrive après coup (relais `/buslines`) : les peindre dans les tranches imposerait de repeindre des tranches entières. `PAINT_VERSION` passe quand même à 6 (retrait des mouettes, tâche 14).

---

### Task 1 : socle — registre d'accessoires et primitives (Opus)

**Files :**
- Create : `src/content/paint-registry.ts`, `src/core/library/paint/props/kit.ts`, `src/core/library/paint/props/index.ts`, `src/content/prop/prop-host.tsx`
- Modify : `src/content/shop/shop-host.tsx` (classe extraite), `src/content/RoomView.tsx`, `src/content/scene-panorama.tsx` (fournir `PropContext` à côté de `ShopContext`/`CarContext`)
- Test : `tests/core/library/paint/props/kit.test.ts`, `tests/content/prop-host.test.tsx`

**Interfaces :**
- Produces :
  ```ts
  // paint-registry.ts — reprise mot pour mot de ShopRegistry (get/want/size/pump), paramètres max, perFrame, schedule
  export class PaintRegistry { constructor(label: string, opts?: { max?: number; perFrame?: number; schedule?: (cb: () => void) => void }); size(): number; get(k: string): string | null; want(k: string, paint: () => string, done: () => void): () => void }
  // props/kit.ts
  export function facing(dir: 1 | -1): void;            // orientation du peintre en cours : -1 → ombre à gauche du repère local (le peintre dessine en miroir géométrique)
  export function celD(x: ShopPaintCtx, path: () => void, c: string, o?: CelOpts): void; // cel() qui respecte facing
  export const RD, RRD, ED, PD;                         // R, RR, E, P de shop/cel.ts qui respectent facing
  export function disc(x, cx, cy, r, c, a?): void;
  export function ball(x, cx, cy, r, c): void;          // disque modelé : croissant d'ombre + point de lumière
  export function tube(x, x1, y1, x2, y2, w, c): void;  // trait épais cerné d'encre, ombre et rehaut
  export function halo(x, cx, cy, r, c, a?): void;      // deux disques à bord net (à appeler dans glowing())
  export function groundShadow(x, cx, cy, rx, ry): void;
  export function wheel(x, cx, cy, r, spokes?: number): void;
  export function flagArt(x, o: { w: number; h: number; t: number; wave: boolean; phase: number; colors?: readonly [string, string, string] }): void; // notes §2 « Drapeaux »
  // props/index.ts
  export type PropArgs = Readonly<Record<string, string | number | boolean>>;
  export type PropPaint = { day: number; lit: boolean; dir: 1 | -1; frame: number };
  export type PropPainter = { box(a: PropArgs): readonly [number, number, number, number]; frames?: number; paint(x: TintedCtx, a: PropArgs, p: PropPaint): void };
  export const PROPS: Record<string, PropPainter>;     // rempli par les tâches suivantes (un import par fichier de groupe)
  export function registerProps(group: Record<string, PropPainter>): void;
  // prop-host.tsx
  export const PROP_PX = 4;
  export type PropSpec = { id: string; args?: PropArgs; dir?: 1 | -1; day: number; lit?: boolean; frame?: number };
  export function propKey(s: PropSpec): string;         // id|args triés|dir|L ou jour quantifié|frame
  export class PropRegistry extends PaintRegistry {}    // max 600, perFrame 2
  export const PropContext: React.Context<PropRegistry | null>;
  export function useProp(spec: PropSpec | null): { url: string; box: readonly [number, number, number, number] } | null; // garde la dernière image montrée tant que la nouvelle clé n'est pas cuite
  export function PropImage(props: { spec: PropSpec; fallback?: ReactNode }): ReactElement; // <image> au cadre du peintre, sinon `fallback`
  ```
  `frame` est réduit modulo `frames` du peintre. Lumière : `day = quantDay(sky.daylight)` (de shop-host) ; `lit` = élément allumé (couleurs de jour, `glowing`).

- [ ] **Step 1 : tests du kit** (`tests/core/library/paint/props/kit.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { ball, facing, flagArt, RD, tube } from '../../../../../src/core/library/paint/props/kit';
import { recordingCtx } from '../recording-ctx';

describe('kit cellulo des accessoires', () => {
  it('déterministe', () => {
    const a = recordingCtx();
    const b = recordingCtx();
    for (const c of [a, b]) {
      tube(c, 0, 0, 0, -72, 3, '#3E5452');
      ball(c, 9, -77, 2, '#FFF3C4');
      flagArt(c, { w: 10, h: 7, t: 0.4, wave: true, phase: 1 });
    }
    expect(a.ops).toEqual(b.ops);
  });
  it('facing(-1) met l’ombre à gauche du repère local', () => {
    const right = recordingCtx();
    facing(1);
    RD(right, 0, 0, 10, 10, '#C0302B');
    const left = recordingCtx();
    facing(-1);
    RD(left, 0, 0, 10, 10, '#C0302B');
    facing(1);
    const shadowX = (c: typeof right) => c.ops.filter((o) => o.op === 'fillRect')[0]!.args[0]!;
    expect(shadowX(right)).toBeGreaterThan(5);
    expect(shadowX(left)).toBeLessThan(0);
  });
  it('drapeau plat quand wave = false (mouvement réduit) : même tracé à tout instant', () => {
    const a = recordingCtx();
    const b = recordingCtx();
    flagArt(a, { w: 10, h: 7, t: 0, wave: false, phase: 0 });
    flagArt(b, { w: 10, h: 7, t: 3.3, wave: false, phase: 2 });
    expect(a.ops).toEqual(b.ops);
  });
});
```

- [ ] **Step 2 : lancer, constater l'échec** — `npx vitest run tests/core/library/paint/props/kit.test.ts` → FAIL (module absent).
- [ ] **Step 3 : implémenter `kit.ts`** en portant `disc`, `ball`, `tube`, `halo`, `groundShadow`, `wheel`, `flagArt` de `index.html` (lignes 119-140, 208-222, 472) sur `ShopPaintCtx` ; `facing` = variable de module lue par `celD` : pour `-1`, l'ombre est peinte sur `[box.x - 1, box.x + box.w·(1 − sx)]` et le rehaut sur la droite. `RD/RRD/ED/PD` = `R/RR/E/P` de `shop/cel.ts` réécrits sur `celD`.
- [ ] **Step 4 : relancer** → PASS.
- [ ] **Step 5 : tests du registre** (`tests/content/prop-host.test.tsx`)

```tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { registerProps } from '../../src/core/library/paint/props/index';
import { PropContext, PropImage, PropRegistry, propKey } from '../../src/content/prop/prop-host';

registerProps({ test: { box: () => [-2, -4, 4, 4], frames: 4, paint: (x) => { x.fillStyle = '#ff0000'; x.fillRect(-2, -4, 4, 4); } } });

describe('registre des accessoires', () => {
  it('clé : lumière quantifiée, frame modulo frames, args triés', () => {
    expect(propKey({ id: 'test', args: { b: 1, a: 2 }, day: 0.53, frame: 5 })).toBe(propKey({ id: 'test', args: { a: 2, b: 1 }, day: 0.5, frame: 1 }));
    expect(propKey({ id: 'test', day: 0.1, lit: true })).not.toBe(propKey({ id: 'test', day: 0.1 }));
  });
  it('rend le repli tant que l’image n’est pas cuite, puis l’image ; garde l’ancienne image au changement de lumière', async () => {
    const jobs: (() => void)[] = [];
    const reg = new PropRegistry('t', { schedule: (cb) => jobs.push(cb) });
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const root = createRoot(host);
    const show = (day: number) => root.render(<PropContext.Provider value={reg}><PropImage spec={{ id: 'test', day }} fallback={<rect data-classic="" />} /></PropContext.Provider>);
    await act(async () => show(1));
    expect(host.querySelector('[data-classic]')).not.toBeNull();
    await act(async () => jobs.shift()!());
    expect(host.querySelector('image')).not.toBeNull();
    await act(async () => show(0));
    expect(host.querySelector('image')).not.toBeNull(); // pas de retour au repli ni de trou
    expect(host.querySelector('[data-classic]')).toBeNull();
  });
});
```

- [ ] **Step 6 : lancer** → FAIL ; **Step 7 : implémenter** `paint-registry.ts` (déplacer le corps de `ShopRegistry`, `ShopRegistry extends PaintRegistry` avec ses valeurs par défaut), `props/index.ts`, `prop-host.tsx` (surface canvas partagée comme `getSurface` de shop-host ; `paintProp(spec)` : cadre `box(args)`, `canvas` à `PROP_PX`, `facing(dir)`, `tintedCtx(raw, lit ? identité : tone(·, {daylight: day}))`, `peintre.paint`, `facing(1)`, `toDataURL`) ; ajouter `PropContext.Provider` dans `RoomView.tsx` et `scene-panorama.tsx` à côté de `CarContext` (une instance `useMemo(() => new PropRegistry('props'), [])`).
- [ ] **Step 8 : relancer** les deux fichiers + `tests/content/shop` → PASS.
- [ ] **Step 9 : commit** `feat(bibliotheque): G5 — registre d'accessoires peints et primitives cellulo`.

---

### Task 2 : lampadaire, feu tricolore, arrêt de bus, passage piéton (peintres : Fable ; branchement : Opus)

**Files :**
- Create : `src/core/library/paint/props/street.ts`
- Modify : `src/content/city-life.tsx` (l. ~89, `LampSprite`), `src/content/traffic-layer.tsx` (`pole` l. ~289, `busStop` l. ~304, `Crosswalk` l. ~336)
- Test : `tests/core/library/paint/props/street.test.ts`, `tests/content/traffic-layer.test.tsx` (ajouts)

**Interfaces :**
- Consumes : tâche 1 (`registerProps`, `PropImage`, kit).
- Produces : ids `lamp` (args `{}`; `lit` = lanterne allumée ; cadre −4..14 × −84..1), `traffic-pole` (args `{ color: 'red'|'amber'|'green', pressed: boolean }`, `lit` la nuit), `bus-stop` (args `{ name: string, lines: string /* "12,3" */, served: 'near'|'far' }`), `crosswalk-band` (une bande, args `{ h: number }` en u entiers). Le passage piéton pose une `PropImage` par bande au même pas que le classique.

- [ ] **Step 1 : test** — pour chaque id : `box` contient tous les points tracés (`ctx.points`) avec 1 u de marge, déterminisme, et la lanterne allumée tracée sous `glowing` (compter les appels via `tintedCtx` + remplacement de `glowing`, comme `tests/core/library/paint/shop/ctx.test.ts`) :

```ts
import { describe, expect, it } from 'vitest';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import '../../../../../src/core/library/paint/props/street';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { recordingCtx } from '../recording-ctx';

const ARGS: Record<string, Record<string, string | number | boolean>> = {
  lamp: {}, 'traffic-pole': { color: 'green', pressed: true }, 'bus-stop': { name: 'Place du Ralliement', lines: '1,12', served: 'near' }, 'crosswalk-band': { h: 30 },
};

describe('mobilier de rue cellulo', () => {
  for (const [id, a] of Object.entries(ARGS)) {
    it(`${id} : dans son cadre et déterministe`, () => {
      const p = PROPS[id]!;
      const [x, y, w, h] = p.box(a);
      const c1 = recordingCtx();
      const c2 = recordingCtx();
      p.paint(tintedCtx(c1, (c) => c), a, { day: 1, lit: false, dir: 1, frame: 0 });
      p.paint(tintedCtx(c2, (c) => c), a, { day: 1, lit: false, dir: 1, frame: 0 });
      expect(c1.ops).toEqual(c2.ops);
      for (const [px, py] of c1.points) {
        expect(px).toBeGreaterThanOrEqual(x - 1); expect(px).toBeLessThanOrEqual(x + w + 1);
        expect(py).toBeGreaterThanOrEqual(y - 1); expect(py).toBeLessThanOrEqual(y + h + 1);
      }
    });
  }
  it('lampadaire allumé : la lanterne passe par glowing, pas éteint', () => {
    const count = (lit: boolean) => {
      const t = tintedCtx(recordingCtx(), (c) => c);
      let n = 0;
      const g = t.glowing;
      t.glowing = (fn) => { n++; g(fn); };
      PROPS.lamp!.paint(t, {}, { day: 0, lit, dir: 1, frame: 0 });
      return n;
    };
    expect(count(true)).toBeGreaterThan(0);
    expect(count(false)).toBe(0);
  });
});
```

- [ ] **Step 2 : lancer** → FAIL.
- [ ] **Step 3 : porter** `lamp` (index.html l. 171-203, sans `flag` : le drapeau est l'id `lamp-flag` de la tâche 6), `trafficPole` (223-239), `busStop` (240-252), `crosswalk` (253-260, une bande) dans `street.ts`, enregistrés par `registerProps`. Repères de `notes.md` §1.
- [ ] **Step 4 : relancer** → PASS.
- [ ] **Step 5 : brancher** : dans `city-life.tsx`, en Ghibli, `<PropImage spec={{ id: 'lamp', day, lit }} fallback={<LampSprite lit={lit} />} />` au même `transform` ; dans `traffic-layer.tsx`, `pole`/`busStop`/`Crosswalk` en Ghibli → `PropImage` aux mêmes `transform` en gardant les attributs `data-light-lamp`, `data-call` sur un `<g>` porteur (les tests existants lisent ces attributs : la couleur active et l'appui restent lisibles sur le `<g>`).
- [ ] **Step 6 : test d'intégration** dans `tests/content/traffic-layer.test.tsx` : en Ghibli avec un `PropRegistry` à `schedule` manuel, le poteau rend le sprite classique avant cuisson puis une `<image>` ; `data-light-lamp` reste présent. Lancer `npx vitest run tests/content/traffic-layer.test.tsx tests/core/library/paint/props` → PASS.
- [ ] **Step 7 : commit** `feat(bibliotheque): G5 — lampadaire, feux, arrêt de bus et passage piéton en cellulo`.

---

### Task 3 : mobilier des commerces (peintres : Fable ; branchement : Opus)

**Files :**
- Create : `src/core/library/paint/props/terrace.ts`
- Modify : `src/content/shop-terrace.tsx` (`TableSprite` :446, `ChairSprite` :457, `ParasolSprite` :467, `Apron` :479), `src/content/shop-queue.tsx` (`CordonSprite` :143), `src/content/shop-sprites.tsx` (`CarriedSign` :67, `CarriedPlacard` :77, `ForSalePlacard`, `LadderSprite` :52), `src/content/shop-gesture-sprites.tsx` (`AccessorySprite` :51)
- Test : `tests/core/library/paint/props/terrace.test.ts`

**Interfaces :**
- Produces : ids `table`, `chair` (le côté passe par `dir`), `parasol` (args `{ hue: string }`), `apron`, `cordon-post` (le poteau ; la corde reste un `<path>` SVG cellulo : trait encré 1,1k + rehaut rose, voir `cordon` l. 291), `carried-sign` (args `{ w, sign, ink, name }`), `carried-placard` (args `{ w }`), `for-sale` (args `{ w }`), `ladder` (args `{ h }`), `accessory` (args `{ kind }` — les 32 ids de `AccessorySprite`).

- [ ] **Step 1 : test** — même gabarit que la tâche 2 (cadre + déterminisme) sur la table `ARGS` : `table: {}`, `chair: {}`, `parasol: { hue: '#C0302B' }`, `apron: {}`, `'cordon-post': {}`, `'carried-sign': { w: 24, sign: '#2F7D64', ink: '#F6F3EC', name: 'Boulangerie' }`, `'carried-placard': { w: 14 }`, `'for-sale': { w: 20 }`, `ladder: { h: 30 }`, plus une boucle sur toutes les clés de `ACCESSORY_KINDS` (exporté par `shop-gesture-sprites.tsx` : à exporter s'il ne l'est pas) avec `accessory: { kind }`. Et : `chair` en `dir: -1` donne des points miroirs en x (|x| identiques, à 0,01 près) mais pas les mêmes `fills` dans le même ordre (ombre du bon côté).
- [ ] **Step 2 : FAIL** ; **Step 3 : porter** `table`, `chair`, `parasol`, `apron`, `cordon`, `carriedSign`, `forSalePlacard`, `carriedPlacard`, `ladder`, `accessory` + `ACCESSORIES` (index.html l. 261-337) ; **Step 4 : PASS**.
- [ ] **Step 5 : brancher** chaque sprite en Ghibli par `PropImage` (repli = sprite classique) ; `CordonSprite` Ghibli = deux `PropImage` `cordon-post` + `<path>` de corde cellulo. Lancer `npx vitest run tests/content/shop-terrace* tests/content/shop-queue* tests/content/shop-sprites* tests/core/library/paint/props` → PASS (les tests classiques ne changent pas).
- [ ] **Step 6 : commit** `feat(bibliotheque): G5 — terrasses, cordon, enseignes portées, échelles et accessoires en cellulo`.

---

### Task 4 : lumière de nuit « deux peintures » (Opus ; réglages visuels revus par Fable à la tâche 15)

**Files :**
- Create : `src/core/library/city/night-light.ts`
- Rewrite : `src/content/ghibli-night.tsx`
- Modify : `src/content/scene-city.tsx` (l. ~212 : nouvelles props), `src/content/city-life.tsx` (ombres d'acteurs), `src/content/painted-city.ts` (export d'un peintre de découpe)
- Test : `tests/core/library/city/night-light.test.ts`, `tests/content/ghibli-night.test.tsx`

**Interfaces :**
- Consumes : `lampsFor`, `lampLit` (lamps.ts), `cityMetrics`, `STREET_SCALE`, plan peint (`CityPaintPlan`) et `paintCityTile` (city-painter.ts), emplacements des vitrines allumées (`useStreetShops` déjà lu par scene-city).
- Produces :
  ```ts
  // night-light.ts (pur)
  export const FALL: readonly (readonly [number, number])[]; // [[0,1],[0.15,0.9],[0.35,0.6],[0.6,0.25],[0.85,0.06],[1,0]]
  export type LightBlob = { cx: number; cy: number; rx: number; ry: number; peak: number };
  export function lampBlobs(x: number, curb: number, u: number, k: number): LightBlob[]; // air autour de la lanterne, flaque du trottoir, chaussée (notes §5)
  export function shopBlobs(x: number, w: number, ground: number, glassTop: number, u: number): LightBlob[];
  export function patchBox(blobs: readonly LightBlob[]): { x: number; y: number; w: number; h: number };
  export type ActorShade = { points: string; opacity: number } | null;
  export function actorShadow(footX: number, footY: number, w: number, h: number, lampX: number, u: number): ActorShade; // null au-delà de 75u ; L = min(1,2h, 0,4h + 0,55|dx|) à l'opposé de la lampe
  export function nearestLamp(x: number, lamps: readonly { x: number }[]): number | null;
  // painted-city.ts
  export function paintLitPatch(plan: CityPaintPlan, box: { x: number; y: number; w: number; h: number }, blobs: readonly LightBlob[]): string; // data URL : tranches de jour × #FFD4A0 (multiply) + screen rgb(255,196,112) α 0,2, masquées (destination-in) par les blobs en dégradé FALL
  ```
  `GhibliNightLight` reçoit en plus `plan: CityPaintPlan | null`, `shops: readonly { x: number; w: number; lit: boolean }[]`, `rainy: boolean`. Rendu par lampadaire allumé : `<image>` de la découpe (cache module par `seed|lampe|k|rainy`, au plus 1 peinture par image via `requestAnimationFrame`), bloom `<circle>` `screen` r 6k (dégradé partagé), sous la pluie halo r 22u + `<image>` de colonne de traits (90 traits, notes §5) ; même `opacity`/transition 4 s que l'actuel selon `lampLit` et `dim`. Vitrines allumées : découpe `shopBlobs`. Pas de reflet inversé flou (hors premier portage, notes §5 (d)).

- [ ] **Step 1 : tests purs** (`night-light.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { actorShadow, lampBlobs, nearestLamp, patchBox } from '../../../../src/core/library/city/night-light';

describe('lumière de nuit', () => {
  it('trois zones par lampadaire, flaque la plus forte au pied', () => {
    const b = lampBlobs(100, 300, 1, 0.85);
    expect(b).toHaveLength(3);
    expect(b[1]!.cy).toBeCloseTo(298);
    expect(b[1]!.rx).toBeCloseTo(56);
    expect(b[2]!.peak).toBeCloseTo(0.6);
  });
  it('la découpe englobe toutes les zones', () => {
    const box = patchBox(lampBlobs(100, 300, 1, 0.85));
    expect(box.x).toBeLessThanOrEqual(100 + 3 - 56);
    expect(box.x + box.w).toBeGreaterThanOrEqual(100 + 3 + 56);
  });
  it('ombre à l’opposé de la lampe, rien au-delà de 75u', () => {
    const left = actorShadow(120, 300, 6, 18, 100, 1)!;
    const xs = left.points.split(' ').map((p) => Number(p.split(',')[0]));
    expect(Math.max(...xs)).toBeGreaterThan(123);
    expect(actorShadow(200, 300, 6, 18, 100, 1)).toBeNull();
  });
  it('lampe la plus proche', () => {
    expect(nearestLamp(250, [{ x: 100 }, { x: 270 }])).toBe(270);
    expect(nearestLamp(10, [])).toBeNull();
  });
});
```

- [ ] **Step 2 : FAIL** ; **Step 3 : implémenter** `night-light.ts` (notes §5, valeurs exactes) ; **Step 4 : PASS**.
- [ ] **Step 5 : test du calque** (`ghibli-night.test.tsx`, jsdom, `paintLitPatch` remplacé par un double via `setLitPatchPainterForTests`) : (a) lampe allumée la nuit → `<image data-lit-patch>` + bloom, opacité `dim` ; (b) `daylight` 0,6 → opacité 0 et aucune peinture demandée (Review Focus 5) ; (c) pluie → `data-rain-column` présent ; (d) les `data-night-lamp`/`data-lit` existants sont conservés (les tests actuels de `ghibli-night` doivent rester verts).
- [ ] **Step 6 : FAIL → implémenter** `ghibli-night.tsx` + `paintLitPatch` (canvas hors écran, repère monde → px avec la même échelle que les tranches) + `setLitPatchPainterForTests` ; passer `plan`, `shops`, `rainy` depuis `scene-city.tsx`.
- [ ] **Step 7 : ombres d'acteurs** : dans `city-life.tsx`, la nuit en Ghibli, chaque passant à moins de 75u d'une lampe allumée reçoit sous ses pieds `<polygon points=… fill="url(#wmt-actor-shade)" style="mix-blend-mode:multiply">` (dégradé partagé déclaré une fois dans le calque ; **id unique par instance de scène** via `useId`, règle « pas d'id fixe » des contenus recopiés). Le liseré chaud (`actorRim`) n'est PAS porté ici (coût de cache des pantins) : noté en limite dans la PR.
- [ ] **Step 8 : lancer** `npx vitest run tests/core/library/city/night-light.test.ts tests/content/ghibli-night.test.tsx tests/content/city-life*` → PASS.
- [ ] **Step 9 : commit** `feat(bibliotheque): G5 — lumière de nuit naturelle (découpes éclairées, bloom, pluie, ombres)`.

---

### Task 5 : installations (peintres : Fable ; branchement : Opus)

**Files :**
- Create : `src/core/library/paint/props/install.ts`
- Modify : `src/content/install-layer.tsx` (appels de `Barrier`, `StageFloor`, `StageFrame`, `StageSpots`, `HeldTruss`, `HeldSpot`, `FlagCrate`, bras de `LiftTruck`, `CargoBike`, chargement de `Flatbed`, `StowedLadder`), `src/content/install-sprites.tsx` (variantes Ghibli à côté des classiques, mêmes exports)
- Test : `tests/core/library/paint/props/install.test.ts`, `tests/content/install-layer.test.tsx` (ajouts)

**Interfaces :**
- Produces : ids `barrier`, `stage-floor`, `stage-frame`, `stage-spots` (`lit`), `held-truss`, `held-spot`, `flag-crate` (args `{ n, w }`), `lift-bucket` (nacelle + rambarde ; les flèches restent des `tube` SVG cellulo tracés par la couche car leur longueur varie à chaque image : `<line>` encrée 2 tons, articulations `<circle>` modelés), `cargo-bike` (args `{ flags: number, ladder: boolean }`, le cycliste reste `GhibliRider`), `flatbed-load` (args `{ floor, frame, spots, counters, rolls }` en nombres), `stowed-ladder` (args `{ len }`).
- Faisceaux de scène : `StageBeams` Ghibli = deux `<polygon>` par projecteur (large α 0,3 ± 0,06 sur 2,4/2,9/3,4 s, cœur étroit) — remplacés la nuit d'un soir de concert par la tâche 7.

- [ ] **Step 1 : test** cadre + déterminisme (gabarit de la tâche 2) sur ces ids ; `stage-spots` allumé passe par `glowing`.
- [ ] **Step 2 : FAIL** ; **Step 3 : porter** `barrier`, `stageFloor`, `truss`, `stageFrame`, `stageSpots`, `stageBeams`, `heldTruss`, `heldSpot`, `liftArm`, `flagCrate`, `stowedLadder`, `cargoBike`, `flatbedLoad` (index.html l. 338-390, 421-422, 457-488) ; **Step 4 : PASS**.
- [ ] **Step 5 : brancher** dans `install-layer.tsx` (Ghibli uniquement) ; test d'intégration : une installation de scène en cours en Ghibli rend des `<image>` après cuisson et garde les attributs `data-*` lus par les tests existants. Lancer `npx vitest run tests/content/install-layer.test.tsx tests/core/library/paint/props` (le test de nacelle a un délai connu sous charge : le lancer seul s'il échoue en parallèle).
- [ ] **Step 6 : commit** `feat(bibliotheque): G5 — barrières, scène, nacelle, triporteur et chargements en cellulo`.

---

### Task 6 : drapeaux animés (peintres : Fable ; branchement : Opus)

**Files :**
- Modify : `src/core/library/paint/props/install.ts` (ids `lamp-flag`, `door-flag`), `src/content/install-layer.tsx` (l. ~398 `LampFlag`, ~401 `DoorFlag`)
- Test : `tests/core/library/paint/props/flags.test.ts`

**Interfaces :**
- Produces : `lamp-flag` et `door-flag` avec `frames: 8` (une frame = `t = frame/8 × 1,6 s`, phase par lampadaire = `frame` décalé de `(x / 37) | 0`), donc au plus 8 images pour tous les lampadaires. Mouvement réduit : frame 0 sans vague (args `{ still: true }`).

- [ ] **Step 1 : test**

```ts
import { describe, expect, it } from 'vitest';
import { propKey } from '../../../../../src/content/prop/prop-host';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import '../../../../../src/core/library/paint/props/install';
import { recordingCtx } from '../recording-ctx';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';

describe('drapeaux animés', () => {
  it('8 frames partagées par 30 lampadaires', () => {
    const keys = new Set(Array.from({ length: 30 }, (_, i) => propKey({ id: 'lamp-flag', day: 1, frame: (i * 3 + 7) % 8 })));
    expect(keys.size).toBeLessThanOrEqual(8);
  });
  it('les frames diffèrent (le tissu ondule)', () => {
    const at = (frame: number) => { const c = recordingCtx(); PROPS['lamp-flag']!.paint(tintedCtx(c, (x) => x), {}, { day: 1, lit: false, dir: 1, frame }); return c.points; };
    expect(at(0)).not.toEqual(at(3));
  });
});
```

- [ ] **Step 2 : FAIL** ; **Step 3 : porter** `lampFlag`, `doorFlag` (index.html l. 204-207) sur `flagArt` ; **Step 4 : PASS** ; **Step 5 : brancher** (frame calculée par la boucle de la couche d'installations à partir de `t`, `still` → args `{ still: true }`) ; lancer les tests de la tâche 5 + celui-ci.
- [ ] **Step 6 : commit** `feat(bibliotheque): G5 — drapeaux de lampadaire et de porte qui ondulent`.

---

### Task 7 : Fête de la musique — stands, instruments, éclairage de concert (peintres : Fable ; `concertState` et branchement : Opus)

**Files :**
- Create : `src/core/library/paint/props/music.ts`, `src/core/library/city/concert.ts`, `src/content/concert-light.tsx`
- Modify : `src/content/music-street.tsx`, `src/content/install-layer.tsx` (`StandCounter`, `StandAwning`, `CarriedCounter`, `HeldRoll`), `src/content/stage-band.tsx` (`GhibliProp` : dessin des instruments ; `StageBeams` → `ConcertLight` le soir en Ghibli)
- Test : `tests/core/library/paint/props/music.test.ts`, `tests/core/library/city/concert.test.ts`

**Interfaces :**
- Produces :
  ```ts
  // concert.ts
  export type ConcertState = { pal: readonly [string, string]; lyres: readonly { pan: number; color: string; target: 'floor' | 'crowd' }[]; hit: number; strobe: number; led: number };
  export function concertState(t: number): ConcertState; // 120 bpm, palette par 8 s (4 palettes de notes §8), hit 0,14 s au 1er temps de la mesure (α 0,35), strobe 0,6 s toutes les 32 s à 12 Hz (α 0,5)
  ```
  ids `keg`, `beer-cup`, `stand-counter` (dir = side), `stand-awning` (args `{ garland: boolean }` ; ampoules dans `glowing`), `carried-counter`, `held-roll`, `stage-prop` (args `{ kind: 'guitar'|'mic'|'drum' }`), `stage-extras` (enceintes, retours, rampe LED, lyres et contre-jours éteints ; `lit` = allumés).
  `<ConcertLight stageX base unit t lit still />` : faisceaux `<polygon>` à `<linearGradient>` (`mix-blend-mode: screen`), points et couleurs réécrits à chaque image ; contre-jours et lyres en `<circle>` à `<radialGradient>` ; hit et strobe = `<rect>` à opacité ; voile de brume α 0,07 borné au volume de la scène ; révélation colorée du public et du plancher = 4 `<image>` (une par palette) peintes par `paintLitPatch` teintée c1/c0 (tâche 4), opacité pilotée. Rien le jour (`lit=false` → aucun élément).

- [ ] **Step 1 : tests**

```ts
import { describe, expect, it } from 'vitest';
import { concertState } from '../../../../src/core/library/city/concert';

describe('concert', () => {
  it('palette changée toutes les 8 s, 4 palettes en boucle', () => {
    expect(concertState(1).pal).toEqual(['#FF2FB0', '#FFB020']);
    expect(concertState(9).pal).toEqual(['#20D8FF', '#8A40FF']);
    expect(concertState(33).pal).toEqual(concertState(1).pal);
  });
  it('hit au premier temps de chaque mesure seulement', () => {
    expect(concertState(2.05).hit).toBeCloseTo(0.35);
    expect(concertState(2.6).hit).toBe(0);
  });
  it('déterministe et 4 lyres', () => {
    expect(concertState(5.5)).toEqual(concertState(5.5));
    expect(concertState(0).lyres).toHaveLength(4);
  });
});
```

  et, dans `music.test.ts`, le gabarit cadre + déterminisme sur les ids ci-dessus, plus « `stand-awning` avec guirlande passe par `glowing` la nuit ».
- [ ] **Step 2 : FAIL** ; **Step 3 : implémenter** `concert.ts` ; porter `keg`, `beerCup`, `standCounter`, `standAwning`, `carriedCounter`, `heldRoll`, `stageProp`, `stageExtras`, `beam`, `concertLights` (index.html l. 388-456) ; **Step 4 : PASS**.
- [ ] **Step 5 : brancher** : stands et pièces portées par `PropImage` ; `GhibliProp` dessine `stage-prop` à ses accroches actuelles ; la scène le soir de la Fête de la musique en Ghibli rend `<ConcertLight>` à la place de `StageBeams`. Test d'intégration jsdom : `music-street` Ghibli à 22 h le 21/6 → `[data-concert-light]` présent ; à 15 h → absent. Lancer `npx vitest run tests/content/music-street* tests/content/stage-band* tests/core/library/city/concert.test.ts tests/core/library/paint/props`.
- [ ] **Step 6 : commit** `feat(bibliotheque): G5 — stands de bière, instruments et vrai éclairage de concert`.

---

### Task 8 : 14 juillet — cheval, drapeaux, fanfare, coiffes, spectateurs (peintres : Fable ; branchement : Opus)

**Files :**
- Create : `src/core/library/paint/props/parade.ts`
- Modify : `src/content/parade-sprites.tsx` (branches Ghibli de `Horseman`, `Tricolore`, `InstrumentArt`, `Rifle`, `Headgear`), `src/content/parade-crowd.tsx` (l. 53-61)
- Test : `tests/core/library/paint/props/parade.test.ts`

**Interfaces :**
- Produces : `horse` (args `{ coat }`, `frames: 8` sur le cycle de 1,2 s ; pivots et genou de notes §2 « Cheval » ; le cavalier reste le pantin `mount` posé à (−1, −24,5)), `parade-flag` (`frames: 8`, args `{ w, h }`), `instrument` (args `{ kind, tunic }`, `frames: 8` pour grosse caisse/caisse claire/canne), `rifle` (args `{ tunic }`), `headgear` (args `{ kind, cap, capTop }`), `crowd-prop` (args `{ kind: 'flag'|'phone' }`, `frames: 8`).

- [ ] **Step 1 : test** cadre + déterminisme ; `horse` : frames 0 et 4 donnent des sabots à des x différents ; tous les points du cheval à y ≤ 0,5 (sabots au sol).
- [ ] **Step 2 : FAIL** ; **Step 3 : porter** `horse`, `tricolore`, `headgear`, `instrument`, `rifle`, `crowdProp` (index.html l. 492-559) ; **Step 4 : PASS**.
- [ ] **Step 5 : brancher** : frame = `floor(frac(t / période) × 8)` dans `ParadeUnitSprite` Ghibli ; supprimer la branche morte `GRider` de `Motorbike` signalée en V5 seulement si elle est touchée. Lancer `npx vitest run tests/content/parade* tests/core/library/paint/props`.
- [ ] **Step 6 : commit** `feat(bibliotheque): G5 — cavalerie, drapeaux, fanfare et spectateurs du 14 juillet en cellulo`.

---

### Task 9 : pantin du père Noël (Fable)

**Files :**
- Modify : `src/core/library/figure/dress.ts`, `src/core/library/figure/bake.ts`, `src/core/library/figure/head.ts` (champs de barbe, moustache, sourcils, bonnet sur la sphère), `src/content/figure/figure-host.tsx` (`FIGURE_SLOTS` + `beard`, `fur`, `belt`, `buckle`, `glove`, `nose`, `cheek`), `src/content/figure/ghibli-figure.tsx` (`figurePalette` : couleurs de la tenue)
- Test : `tests/core/library/figure/santa-dress.test.ts`

**Interfaces :**
- Produces : `Shape.santa?: boolean` ; `shapeOf(o, umbrella, work, santa = false)` ; signature à 7e champ `.s` relue par `shapeFromSignature` ; aucune autre signature ne change (les clés des sprites existants restent identiques).

- [ ] **Step 1 : test**

```ts
import { describe, expect, it } from 'vitest';
import { shapeFromSignature, shapeOf, signatureOf } from '../../../../src/core/library/figure/dress';
import { bakeFigure } from '../../../../src/core/library/figure/bake';
import { DEFAULT_RIDER } from '../../../../src/content/city-sprites';

describe('tenue du père Noël', () => {
  it('signature inchangée hors père Noël, relue avec santa', () => {
    const plain = shapeOf(DEFAULT_RIDER, false, null);
    expect(signatureOf(plain)).not.toMatch(/\.s$/);
    const s = shapeOf(DEFAULT_RIDER, false, null, true);
    expect(shapeFromSignature(signatureOf(s)).santa).toBe(true);
  });
  it('barbe, ceinture, boucle et gants cuits de face', () => {
    const svg = bakeFigure({ sig: signatureOf(shapeOf(DEFAULT_RIDER, false, null, true)), yaw: 0, gait: 'stand', phase: 0, arms: 'swing', lean: 0 });
    for (const slot of ['beard', 'belt', 'buckle', 'glove', 'fur']) expect(svg).toContain(`data-slot="${slot}"`);
  });
  it('de dos : pas de nez ni de joues', () => {
    const svg = bakeFigure({ sig: signatureOf(shapeOf(DEFAULT_RIDER, false, null, true)), yaw: 8, gait: 'stand', phase: 0, arms: 'swing', lean: 0 });
    expect(svg).not.toContain('data-slot="nose"');
  });
});
```

  (Adapter les noms `signatureOf`/`bakeFigure`/forme de la clé à ceux réellement exportés par `dress.ts`/`bake.ts` — les lire d'abord ; la règle testée reste la même.)
- [ ] **Step 2 : FAIL** ; **Step 3 : porter** notes §6 (corpulence, bottes, gants, fourrure, ceinture + boucle, barbe en champ + masse pendante, moustache, sourcils, nez, joues, bonnet `el − 0,5` avec bord de fourrure, pompon) ; **Step 4 : PASS** ; lancer aussi `npx vitest run tests/core/library/figure tests/content/figure*` (aucune régression des pantins).
- [ ] **Step 5 : commit** `feat(bibliotheque): G5 — vrai pantin du père Noël (barbe, fourrure, ceinture, bottes)`.

---

### Task 10 : traîneau, rennes et pose sur une maison de la colline (peintres : Fable ; santa.ts et branchement : Opus)

**Files :**
- Create : `src/core/library/paint/props/santa.ts`
- Modify : `src/core/library/city/santa.ts` (choix du toit, pente, cheminée, `SANTA_K`), `src/content/santa-layer.tsx`, `src/content/santa-sprite.tsx` (branches Ghibli)
- Test : `tests/core/library/paint/props/santa.test.ts`, `tests/core/library/city/santa.test.ts` (ajouts)

**Interfaces :**
- Consumes : `HillHouse` (city-plan.ts : `row`, `x`, `w`, `top`, `s`, `haze`, `kind`, `chimney`), pantin `santa` (tâche 9).
- Produces :
  ```ts
  // santa.ts
  export type SantaHillRoof = { cx: number; y: number; w: number; kind: HillHouse['kind']; chimney: number; s: number; haze: number };
  export function santaHillRoof(pass: SantaPass, houses: readonly HillHouse[], x0: number, x1: number): SantaHillRoof | null; // rang 2 avec cheminée dans [x0,x1], sinon rang 1, sinon null
  export function roofSurface(r: SantaHillRoof, x: number): number; export function roofSlope(r: SantaHillRoof, x: number): number;
  export function landDx(r: SantaHillRoof): number;   // −0,45 demi-largeur (gable/hip), −0,4 mansard
  // santaStepAt rend en plus `slope: number`
  ```
  ids `reindeer` (args `{ lead: boolean, landed: boolean }`, `frames: 8` sur 0,55 s ; posé : 4 frames de vie), `sleigh` (`lit` = lanterne), `santa-trail` (`frames: 8`), `santa-sack`. Le groupe posé est dessiné dans la couche du décor fixe après la colline et avant les immeubles, à l'échelle `0,55·s`, teinté `mix(c, #9CC0E4, 0,28)` ; fenêtre de la maison allumée pendant la visite ; la maison reçoit la teinte de nuit (correction de la maquette). Sous-durées de notes §7 (approche 0-25 %, glissade 23,5-25 %, 30-40 % marche 1,2 + 4,5 + 0,9 + 0,9 s, etc.).

- [ ] **Step 1 : tests** (`santa.test.ts`, ajouts)

```ts
it('choisit une maison de rang 2 avec cheminée dans la vue, sinon rang 1, sinon rien (Review Focus 4)', () => {
  const h = (row: 0 | 1 | 2, x: number, chimney: number | null) => ({ row, x, w: 40, h: 30, base: 200, top: 170, s: 0.76, haze: 0.14, wall: [0, 0, 0], roof: [0, 0, 0], kind: 'gable', dormers: false, chimney, trees: null }) as const;
  const pass = santaPassFor(3, 42);
  expect(santaHillRoof(pass, [h(2, 100, 0.6), h(1, 300, 0.5)], 0, 500)!.cx).toBe(120);
  expect(santaHillRoof(pass, [h(2, 100, null), h(1, 300, 0.5)], 0, 500)!.cx).toBe(320);
  expect(santaHillRoof(pass, [h(2, 100, null)], 0, 500)).toBeNull();
  expect(santaHillRoof(pass, [h(2, 900, 0.6)], 0, 500)).toBeNull();
});
it('posé à mi-pente du versant gauche, la cheminée sur l’autre versant', () => {
  const r = { cx: 100, y: 170, w: 40, kind: 'gable', chimney: 0.7, s: 0.76, haze: 0.14 } as const;
  expect(landDx(r)).toBeCloseTo(-9);
  expect(roofSlope(r, 90)).toBeLessThan(0);
  expect(roofSurface(r, 100)).toBeCloseTo(170);
});
```

  et, dans `props/santa.test.ts`, cadre + déterminisme de `reindeer`/`sleigh`/`santa-trail`/`santa-sack` ; la lanterne du traîneau allumé passe par `glowing`.
- [ ] **Step 2 : FAIL** ; **Step 3 : implémenter** santa.ts (les tests existants de santa.ts qui portent sur les immeubles sont adaptés UNIQUEMENT pour la branche Ghibli : le classique garde `santaRoof` sur les façades) et porter `reindeer`, `santa`, `team`, `trail`, `santaSack`, `drawSleigh`, `santaDelivery` (index.html l. 560-638, 1098-1167) ; `SANTA_K` = 0,55 en Ghibli seulement ; **Step 4 : PASS**.
- [ ] **Step 5 : brancher** `santa-layer.tsx` Ghibli (pantin `santa` aux poses de notes §6, hotte à l'accroche `nape`, ordre de dessin derrière/devant selon yaw). Lancer `npx vitest run tests/core/library/city/santa.test.ts tests/content/santa* tests/core/library/paint/props`.
- [ ] **Step 6 : commit** `feat(bibliotheque): G5 — traîneau et rennes au galop, pose sur une maison de la colline`.

---

### Task 11 : déménagement et signes festifs (peintres : Fable ; branchement : Opus)

**Files :**
- Create : `src/core/library/paint/props/moving.ts`
- Modify : `src/content/moving-truck.tsx` (`Tailgate` :115, `PieceSprite` :437, `BoxSprite`), `src/content/festive-marks.tsx` (`MarkArt` Ghibli dans `MarkHeld`)
- Test : `tests/core/library/paint/props/moving.test.ts`

**Interfaces :**
- Produces : `tailgate` (args `{ open: number }` quantifié au 1/8), `piece` (args `{ kind, len }`), `box` (« FRAGILE »), `mark` (args `{ kind: FestiveMark }`, `frames: 8` pour ballon, note, serpentin).

- [ ] **Step 1 : test** cadre + déterminisme sur chaque `PieceKind` et chaque `FestiveMark` (listes exportées par les fichiers source) ; **Step 2 : FAIL** ; **Step 3 : porter** `tailgate`, `piece`, `mark` (index.html l. 639-664) ; **Step 4 : PASS** ; **Step 5 : brancher** ; lancer `npx vitest run tests/content/moving-truck* tests/content/festive* tests/core/library/paint/props`.
- [ ] **Step 6 : commit** `feat(bibliotheque): G5 — déménagement et signes festifs en cellulo`.

---

### Task 12 : engins du ciel, feux d'artifice et événements de rue (peintres : Fable ; branchement : Opus)

**Files :**
- Create : `src/core/library/paint/props/sky.ts`
- Modify : `src/content/city-event-sprites.tsx` (cas `plane`, `helicopter`, `drone`, `balloon`, `banner-plane`, `kite`, `crane`, `apartment`, `fest-balloons`, `bells`, `fireworks`, caisse de `garbage-truck`, `delivery-bike`), `src/content/flypast-sprite.tsx` (`Jet`, `Helicopter`)
- Test : `tests/core/library/paint/props/sky.test.ts`, `tests/content/city-event-sprites.test.tsx` (ajouts)

**Interfaces :**
- Produces : ids `plane` (args `{ far: boolean }` ; `lit` = feux), `helicopter` (`frames: 8` : rotor stroboscopique, `lit` = balise + projecteur), `drone` (`frames: 4`), `balloon` (args `{ a, b }` couleurs, `frames: 8` : brûleur et lueur interne la nuit), `banner-plane` (`frames: 8`), `kite` (args `{ c }`, `frames: 8`), `crane` (args `{ side: 1|-1 }`), `apartment-glow`, `fest-balloons` (args `{ bunny: boolean }`, `frames: 8`), `bells` (`frames: 8`), `garbage-truck`, `delivery-bike` (vélo + caisse ; le livreur devient `GhibliRider` à la selle (−4, −16)), `jet` (Patrouille). Traînées de condensation et fumées tricolores : particules SVG (`<circle>`) calculées en `t` par la couche (notes §9), pas d'image. Feux d'artifice : restent vectoriels, redessinés en cellulo (gerbes à bord net, brins qui retombent, pointe blanche, étincelle secondaire, halo r 13·s) ; masque derrière la silhouette des immeubles inchangé ; `still` → gerbe à 30 %.

- [ ] **Step 1 : test** cadre + déterminisme pour chaque id ; plus, dans `city-event-sprites.test.tsx`, `fireworks` en Ghibli : à `u = 0,3` de la période d'une fusée, 12 brins présents (`[data-spark]`), à `u = 0,8` aucun ; `still` → 12 brins.
- [ ] **Step 2 : FAIL** ; **Step 3 : porter** `plane`, `helicopter`, `helicopterLit`, `drone`, `balloonEvt`, `bannerPlane`, `kite`, `crane`, `apartmentGlow`, `festBalloons`, `bells`, `fireworks`, `garbageTruck`, `deliveryBike` (index.html l. 665-819) ; **Step 4 : PASS** ; **Step 5 : brancher** (frames depuis le `t` de l'événement, comme les pantins d'événement) ; lancer `npx vitest run tests/content/city-event* tests/content/flypast* tests/core/library/paint/props` (les 4 tests `city-events-layer` cassés depuis V1 le sont aussi sur main : ne pas les compter).
- [ ] **Step 6 : commit** `feat(bibliotheque): G5 — engins du ciel d'époque, feux d'artifice et événements de rue en cellulo`.

---

### Task 13 : chien du promeneur (peintre : Fable ; branchement : Opus)

**Files :**
- Create : `src/core/library/paint/props/dog.ts`
- Modify : `src/content/city-event-sprites.tsx` (cas `dog-walker`, l. ~251-288 : chien en `translate(26 0)`, laisse `leashFrom`)
- Test : `tests/core/library/paint/props/dog.test.ts`

**Interfaces :**
- Produces : `export const BREEDS: readonly { id: string; L: number; H: number }[]` (labrador 1/1, teckel 1,35/0,72, terrier 0,85/0,85, caniche 0,9/1, berger 1,1/1,08, bouledogue 0,85/0,82) ; `export function dogOf(seed: number): { breed: number; coat: number }` (mulberry32 : race puis robe, 3 robes) ; `export const collarOf = (breed: number): [number, number]` = `(4,6·L, −9,2·H)` ; id `dog` (args `{ breed, coat }`, `frames: 8` sur 0,5 s ; marche continue).

- [ ] **Step 1 : test** : `dogOf` déterministe et couvre les 6 races sur 200 graines ; `collarOf` du labrador = (4,6, −9,2) ; cadre + déterminisme de `dog` pour 6 × 3 ; frames 0 et 4 diffèrent.
- [ ] **Step 2 : FAIL** ; **Step 3 : porter** `BREEDS`, `dog` (index.html l. 820-869) ; **Step 4 : PASS** ; **Step 5 : brancher** : en Ghibli, la laisse du pantin va au collier `collarOf` dans le repère du chien posé à `translate(26 0)` ; lancer `npx vitest run tests/content/city-event* tests/core/library/paint/props/dog.test.ts`.
- [ ] **Step 6 : commit** `feat(bibliotheque): G5 — chien du promeneur, six races`.

---

### Task 14 : mouettes animées (peintre : Fable ; horaire et calque : Opus)

**Files :**
- Create : `src/core/library/paint/props/gull.ts`, `src/core/library/city/gulls.ts`, `src/content/gulls-layer.tsx`
- Modify : `src/core/library/paint/city-plan.ts` (l. 177-203 : `gulls: []` en sortie, code de tirage supprimé), `src/core/library/paint/city-painter.ts` (`PAINT_VERSION` 5 → 6), `src/core/library/paint/snow-painter.ts` (`SNOW_VERSION` 3 → 4 si la neige lisait les mouettes), `src/content/scene-city.tsx` (calque sous les engins du ciel)
- Test : `tests/core/library/city/gulls.test.ts`, `tests/core/library/paint/paint-city-plan.test.ts` (ajout)

**Interfaces :**
- Produces :
  ```ts
  // gulls.ts
  export type GullPose = { x: number; y: number; s: number; far: number; wing: 'flap' | 'glide' | 'turn' | 'perched'; flap: number; dir: 1 | -1 };
  export function flocksAt(t: number, seed: number, width: number, height: number, ctx: { minutes: number; daylight: number; rain: number }): GullPose[];
  ```
  Volées de 2 à 5 ; 3 à 5 par heure de jour, plus de 7 h à 10 h ; aucune la nuit (`daylight` < 0,3) ni par pluie forte (`rain` ≥ 0,6) ; bande de hauteur 0,05-0,3 × `height` ; un oiseau sur quatre lointain ; salves de 1,6 s à 3,3 battements/s puis plané 1,5-3,5 s ; pose sur une cheminée de la colline 42 s sur 120 (notes §10). id `gull` (args `{ wing }`, `frames: 8` pour `flap`).

- [ ] **Step 1 : tests**

```ts
import { describe, expect, it } from 'vitest';
import { flocksAt } from '../../../../src/core/library/city/gulls';

const day = { minutes: 8 * 60, daylight: 1, rain: 0 };
describe('mouettes', () => {
  it('aucune la nuit ni sous la pluie forte', () => {
    for (let t = 0; t < 3600; t += 7) {
      expect(flocksAt(t, 1, 1000, 400, { ...day, daylight: 0.1 })).toEqual([]);
      expect(flocksAt(t, 1, 1000, 400, { ...day, rain: 0.8 })).toEqual([]);
    }
  });
  it('3 à 5 volées par heure de jour, dans la bande de la crête', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 3600; t += 2) for (const g of flocksAt(t, 1, 1000, 400, day)) { expect(g.y).toBeGreaterThanOrEqual(20); expect(g.y).toBeLessThanOrEqual(120); seen.add(Math.floor(t / 600)); }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
  it('déterministe', () => { expect(flocksAt(1234, 5, 800, 400, day)).toEqual(flocksAt(1234, 5, 800, 400, day)); });
});
```

  et dans `paint-city-plan.test.ts` : `plan.hill.gulls` est vide.
- [ ] **Step 2 : FAIL** ; **Step 3 : implémenter** `gulls.ts`, porter `gull`, `flock` (index.html l. 757-767), écrire `gulls-layer.tsx` (Ghibli seulement ; `PropImage` par oiseau, échelle `s`, pâleur `far` par `opacity` + `day` du registre) ; retirer les mouettes du plan, versions +1 ; **Step 4 : PASS** ; lancer aussi `npx vitest run tests/core/library/paint` (les clés de tranches changent avec la version : tests de cache à mettre à jour s'ils figent la version).
- [ ] **Step 5 : commit** `feat(bibliotheque): G5 — mouettes en volées animées au lieu des mouettes figées`.

---

### Task 15 : banc, captures, comparaison avec la maquette, mesures (Opus ; Fable pour les retouches visuelles)

**Files :**
- Modify : `.superpowers/harness-ville/*` (copie de travail du worktree, non commitée sauf script de captures)
- Create : `.superpowers/captures-ghibli-g5/` (PNG + `journal.md`)

- [ ] **Step 1** : lancer le banc (`art=ghibli`, port libre ≥ 5226), script de captures dérivé de `celcap.mjs`/`g4cap.mjs` (attendre `[data-painted-city][data-ready=true]` ET l'absence de repli classique : `document.querySelectorAll('[data-prop-fallback]').length === 0`, attribut posé par `PropImage` sur son repli).
- [ ] **Step 2** : captures (jour 10 h et nuit 22 h, et 22 h sous la pluie) : rue ordinaire, terrasse, installation en cours (nacelle au lampadaire), 14 juillet (défilé + défilé aérien + feux d'artifice), Fête de la musique (15 h et 22 h30), réveillon (traîneau posé sur la colline, séquence), Pâques (cloches), Saint-Valentin (ballons cœur), Nouvel An, déménagement, événements du ciel (un par engin), chien (6 races), mouettes.
- [ ] **Step 3** : comparer chaque capture à la planche correspondante de `docs/superpowers/maquettes/g5-fetes/*.png` ; noter les écarts dans `journal.md` ; corriger (retouches de dessin par Fable) jusqu'à ce que chaque écart restant soit une limite assumée.
- [ ] **Step 4 : mesures** au banc (CPU ×4) : temps de peinture par accessoire (moyenne, max), nombre d'images en cache après 2 min de 14 juillet à 22 h, ms par image à 8 h et 21 h le 14/7 sur main et sur la branche ; noter dans `journal.md`. Régression > 15 % → profiler et corriger avant la PR.
- [ ] **Step 5** : suite ciblée `npx vitest run tests/core/library/paint tests/core/library/city tests/core/library/figure tests/content` (comparer les échecs à main : seuls les délais préexistants sont admis) ; `npx tsc --noEmit`.
- [ ] **Step 6 : commit** des corrections `fix(bibliotheque): G5 — retouches après comparaison avec la maquette`.

---

### Task 16 : revue finale, PR, fusion, pré-prod (Opus)

- [ ] **Step 1** : revue de toute la branche (`git diff main...HEAD`) par un relecteur neuf ; corriger critiques et importants, noter les mineurs dans la PR.
- [ ] **Step 2** : `git push -u origin feat/bibliotheque-ghibli-g5` ; PR vers `main` (`gh pr create --body-file`) : résumé didactique (à quoi ça sert, d'où viennent les données, comment, limites : pas de liseré chaud des pantins, pas de reflet inversé flou, mesures téléphone reportées), captures, mesures, mineurs reportés ; pied « 🤖 Generated with [Claude Code](https://claude.com/claude-code) ».
- [ ] **Step 3** : fusionner la PR (consigne : fusion sans demander), puis dans le dépôt principal à jour : `npm run preprod` et `npm run build`.
- [ ] **Step 4** : montrer les captures à l'utilisateur pour validation ; mettre à jour la mémoire `project_ghibli.md`.
