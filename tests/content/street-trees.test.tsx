// @vitest-environment jsdom
// tests/content/street-trees.test.tsx — calque `arbres-rue` (PR 3) : une toile 2D dans le SVG, un groupe d'état par fosse
// plantée, nœuds constants à toute heure et d'une image à l'autre (le vent n'écrit rien dans le SVG), mouvement réduit sans
// aucune pose qui change, pose au vent (couches de feuillage translatées ; couche fixe jamais transformée). Les images de la boucle sont lues
// en ordres de dessin (`setRueFrameSinkForTests`).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUE_BAKE_TRIES, StreetTrees, opaqueBounds, resetStreetTreesForTests, setRueFrameSinkForTests, setRueSpritePainterForTests, type RueBakeJob, type RueDraw, type RueSprites } from '../../src/content/street-trees';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
import { fondMoment } from '../../src/core/library/paint/fond-time';
import { windOf } from '../../src/core/library/paint/fond-vent';
import { IDENTITY, NIGHT } from '../../src/core/library/paint/grade';
import type { RuePit } from '../../src/core/library/paint/rue-verte-plan';
import { RUE_WIND_MAX, gradePixels, rueLayers, rueSpriteBox, rueTreeOf, rueTreePose, type RueTree } from '../../src/core/library/paint/rue-sprites';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const W = 1400;
const H = 340;
const plan = cityPaintPlan(W, H, 7);
const pits = plan.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty);
const windy = fondMoment({ y: 2026, m: 7, d: 7 }, 15 * 60, { cloud: 0.2, precip: 0, wind: 0.8, snow: false });

let host: HTMLDivElement;
let root: Root;
let frames: FrameRequestCallback[] = [];
let jobs: RueBakeJob[] = [];
let drawn: (readonly RueDraw[])[] = [];
beforeEach(() => {
  drawn = [];
  setRueFrameSinkForTests((ops) => drawn.push(ops));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  frames = [];
  jobs = [];
  vi.stubGlobal('requestIdleCallback', (fn: () => void) => { fn(); return 1; });
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  resetStreetTreesForTests();
  setRueSpritePainterForTests(async (job) => {
    jobs.push(job);
    return Object.fromEntries(job.layers.map((l) => [l, `data:${job.key}|${l}`]));
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setRueSpritePainterForTests(null);
  setRueFrameSinkForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const settle = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); });
const render = (minutes: number, opts: { still?: boolean; daylight?: number; onReady?: (r: boolean) => void; hourly?: boolean } = {}): void =>
  act(() =>
    root.render(
      <svg>
        <StreetTrees
          plan={plan}
          moment={opts.hourly ? fondMoment({ y: 2026, m: 7, d: 7 }, minutes, windy.meteo) : windy}
          daylight={opts.daylight ?? 1}
          twilight={0}
          gloom={false}
          dim={0}
          minutes={minutes}
          still={opts.still}
          onReady={opts.onReady}
        />
      </svg>,
    ),
  );
// Une image de la boucle (15 Hz) à l'instant `ms` de l'horloge murale.
const tick = (ms: number): void => {
  vi.spyOn(Date, 'now').mockReturnValue(ms);
  const list = frames.splice(0);
  act(() => list.forEach((cb) => cb(ms)));
};
type LayerDraw = Extract<RueDraw, { op: 'layer' }>;
const lastFrame = (): readonly RueDraw[] => drawn.at(-1) ?? [];
const layersOf = (ops: readonly RueDraw[]): LayerDraw[] => ops.filter((o): o is LayerDraw => o.op === 'layer');
// Matrices des couches de la dernière image, par arbre et couche.
const poses = (): string[] => layersOf(lastFrame()).map((o) => `${o.tree}:${o.layer}:${o.m.join(' ')}`);
const ID = '1 0 0 1 0 0';

describe('calque arbres-rue', () => {
  it('la ville de test a des fosses plantées', () => {
    expect(pits.length).toBeGreaterThan(2);
  });
  it('un groupe par fosse plantée, couches dans l\'ordre, même nombre de nœuds à 0 h, 8 h, 15 h, 23 h', async () => {
    const counts: number[] = [];
    for (const h of [0, 8, 15, 23]) {
      render(h * 60, { daylight: h === 0 || h === 23 ? 0.1 : 1, hourly: true });
      await settle();
      counts.push(host.querySelectorAll('*').length);
    }
    const groups = host.querySelectorAll('[data-rue-arbre]');
    expect(groups).toHaveLength(pits.length);
    expect([...groups].every((g) => g.children.length === 0 && g.hasAttribute('data-rue-pret'))).toBe(true);
    expect(host.querySelectorAll('[data-arbres-rue-toile] canvas')).toHaveLength(1);
    expect(new Set(counts).size).toBe(1);
    // Couches dessinées dans l'ordre, fosse après fosse ; images cuites ; nuit : cuisson étalonnée.
    tick(1_800_000_000_000);
    const layers = layersOf(lastFrame());
    pits.forEach((v, i) => {
      const got = layers.filter((o) => o.tree === i).map((o) => o.layer);
      expect(got, `fosse ${i}`).toEqual(rueLayers(rueTreeOf(v)));
    });
    expect(layers.map((o) => o.tree)).toEqual(layers.map((o) => o.tree).sort((a, b) => a - b));
    expect(layers.find((o) => o.tree === 0 && o.layer === 'trunk')!.href).toMatch(/^data:.*\|trunk$/);
    expect(rueSpriteBox(pits[0]!).w).toBeGreaterThan(0);
    expect(jobs.some((j) => j.grade !== null)).toBe(true);
    expect(jobs.some((j) => j.grade === null)).toBe(true);
  });
  it('au vent : les grappes bougent d\'une image à l\'autre, le fût jamais', async () => {
    render(15 * 60, { still: false });
    await settle();
    const nodes = host.querySelectorAll('*').length;
    const svg = host.innerHTML;
    tick(1_800_000_000_000);
    const a = poses();
    tick(1_800_000_000_700);
    const b = poses();
    expect(a).not.toEqual(b);
    const trunk = layersOf(lastFrame()).filter((o) => o.layer === 'trunk' || o.layer === 'shadow');
    expect(trunk.length).toBe(2 * pits.length);
    expect(trunk.every((o) => o.m.join(' ') === ID)).toBe(true);
    // Le vent ne touche pas au SVG de la scène : mêmes nœuds, mêmes attributs.
    expect(host.querySelectorAll('*').length).toBe(nodes);
    expect(host.innerHTML).toBe(svg);
  });
  it('mouvement réduit : aucune transformation ne change entre deux images de la boucle', async () => {
    render(15 * 60, { still: true });
    await settle();
    expect(drawn.length).toBeGreaterThan(0);
    const a = poses();
    tick(1_800_000_000_000);
    tick(1_800_000_000_700);
    expect(poses()).toEqual(a);
    expect(a.length).toBeGreaterThan(pits.length);
    expect(a.every((v) => v.endsWith(ID))).toBe(true);
    // Arbres entiers dès la première image (pas de fondu en mouvement réduit).
    expect(layersOf(lastFrame()).every((o) => o.alpha === 1)).toBe(true);
  });
});

describe('cuisson et apparition des arbres', () => {
  const sprite = (job: RueBakeJob): RueSprites => Object.fromEntries(job.layers.map((l) => [l, `data:${job.key}|${l}`]));
  const prets = (): boolean[] => [...host.querySelectorAll('[data-rue-arbre]')].map((g) => g.hasAttribute('data-rue-pret'));
  const alphaOf = (tree: number): number[] => layersOf(lastFrame()).filter((o) => o.tree === tree && o.layer === 'trunk').map((o) => o.alpha);
  it("onReady attend que toutes les fosses aient leur image ; avant, l'arbre n'est pas dessiné, puis il entre en fondu", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    setRueSpritePainterForTests(async (job) => {
      if (job.pit === pits.at(-1)) await gate;
      return sprite(job);
    });
    const ready = vi.fn();
    render(15 * 60, { onReady: ready });
    await settle();
    expect(ready).toHaveBeenLastCalledWith(false);
    expect(prets().slice(0, -1).every(Boolean)).toBe(true);
    expect(prets().at(-1)).toBe(false);
    const lastTree = pits.length - 1;
    // Première image après la cuisson : les arbres cuits commencent leur fondu (rien sur place), une seconde plus tard ils
    // sont entiers ; le dernier, pas encore cuit, n'est pas dessiné.
    tick(1_800_000_000_000);
    expect(alphaOf(0)).toEqual([]);
    tick(1_800_000_001_100);
    expect(alphaOf(0)).toEqual([1]);
    expect(alphaOf(lastTree)).toEqual([]);
    release();
    await settle();
    expect(ready).toHaveBeenLastCalledWith(true);
    expect(prets().every(Boolean)).toBe(true);
    // Cuit après coup : fondu d'entrée d'une seconde.
    tick(1_800_000_002_000);
    expect(alphaOf(lastTree)).toEqual([]);
    tick(1_800_000_002_500);
    const mid = alphaOf(lastTree)[0]!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    tick(1_800_000_003_100);
    expect(alphaOf(lastTree)).toEqual([1]);
  });
  it('une cuisson ratée est retentée ; épuisée, la fosse est marquée et ne bloque pas la ville', async () => {
    const tries = new Map<string, number>();
    setRueSpritePainterForTests(async (job) => {
      const n = (tries.get(job.key) ?? 0) + 1;
      tries.set(job.key, n);
      if (job.pit === pits[0]) return n < 3 ? null : sprite(job);
      if (job.pit === pits[1]) throw new Error('boom');
      return sprite(job);
    });
    const ready = vi.fn();
    render(15 * 60, { onReady: ready });
    await settle();
    const keyOf = (v: RuePit): string => [...tries.keys()].find((k) => k.includes(`|${Math.round(v.x * 10)}|`))!;
    expect(tries.get(keyOf(pits[0]!))).toBe(3);
    expect(tries.get(keyOf(pits[1]!))).toBe(RUE_BAKE_TRIES);
    const g = host.querySelectorAll('[data-rue-arbre]');
    expect(g[0]!.hasAttribute('data-rue-pret')).toBe(true);
    expect(g[0]!.hasAttribute('data-rue-echec')).toBe(false);
    expect(g[1]!.hasAttribute('data-rue-echec')).toBe(true);
    expect(ready).toHaveBeenLastCalledWith(true);
  });
  it("mouvement réduit : aucune boucle de l'horloge murale", async () => {
    render(15 * 60, { still: true });
    await settle();
    expect(frames).toHaveLength(0);
  });
});

describe('particules et oiseau des arbres', () => {
  const november = fondMoment({ y: 2026, m: 11, d: 10 }, 14 * 60, { cloud: 0.2, precip: 0.3, wind: 1, snow: false });
  const mountAt = (still: boolean): void =>
    act(() =>
      root.render(
        <svg>
          <StreetTrees plan={plan} moment={november} daylight={1} twilight={0} gloom={false} dim={0} minutes={14 * 60} still={still} />
        </svg>,
      ),
    );
  type PartDraw = Extract<RueDraw, { op: 'part' }>;
  const active = (): PartDraw[] => lastFrame().filter((o): o is PartDraw => o.op === 'part');
  it('au vent de novembre, feuilles et gouttes dessinées par-dessus les houppiers, plafonds par genre, SVG inchangé', async () => {
    mountAt(false);
    await settle();
    const nodes = host.querySelectorAll('*').length;
    let most = 0;
    for (let s = 0; s < 40; s++) {
      tick(1_800_000_000_000 + s * 1500);
      const on = active();
      most = Math.max(most, on.length);
      for (const o of on) expect(Number.isFinite(o.x) && Number.isFinite(o.y) && o.alpha > 0).toBe(true);
      expect(on.filter((o) => o.kind === 'feuille').length).toBeLessThanOrEqual(40);
      expect(on.length).toBeLessThanOrEqual(130);
      // Particules et oiseau après tous les arbres.
      const ops = lastFrame();
      const firstPart = ops.findIndex((o) => o.op !== 'layer');
      if (firstPart >= 0) expect(ops.slice(firstPart).every((o) => o.op !== 'layer')).toBe(true);
    }
    expect(most).toBeGreaterThan(0);
    expect(host.querySelectorAll('*').length).toBe(nodes);
  });
  it('mouvement réduit : aucune particule, aucun oiseau', async () => {
    mountAt(true);
    await settle();
    expect(drawn.length).toBeGreaterThan(0);
    expect(lastFrame().every((o) => o.op === 'layer')).toBe(true);
  });
});

describe('rueTreePose', () => {
  const v = pits.find((p) => !p.young)!;
  const tr = rueTreeOf(v);
  it('calme : toutes les translations nulles', () => {
    const p = rueTreePose(v, tr, 1234.5, windOf({ cloud: 0, precip: 0, wind: 0, snow: false }, false), W);
    expect(p.masses.every((g) => g.dx === 0 && g.dy === 0)).toBe(true);
  });
  it('vent 0,8 : à écart au tronc égal, la charpentière haute bouge plus que la basse ; une pose par couche de feuillage', () => {
    if (tr.young) throw new Error('adulte attendu');
    const w = windOf({ cloud: 0, precip: 0, wind: 0.8, snow: false }, false);
    // Modèle réel, nuages regroupés en deux charpentières au même écart horizontal : 0 en haut du houppier, 1 en bas.
    const cl = (mass: number, y: number) => ({ ...tr.m.clouds[0]!, x: tr.m.foot.x + 10, y, mass });
    const mm: RueTree = { young: false, m: { ...tr.m, masses: 2, clouds: [cl(0, tr.m.cy - tr.m.ry * 0.8), cl(1, tr.m.cy + tr.m.ry * 0.8)] } };
    let sHi = 0;
    let sLo = 0;
    for (let t = 0; t < 120; t += 0.37) {
      const p = rueTreePose(v, mm, 1000 + t, w, W);
      expect(p.masses).toHaveLength(2);
      expect(Object.keys(p)).toEqual(['masses']);
      sHi += Math.abs(p.masses[0]!.dx);
      sLo += Math.abs(p.masses[1]!.dx);
    }
    expect(sLo).toBeGreaterThan(0);
    expect(sHi).toBeGreaterThan(sLo);
  });
  it('vent 0,8 sur les vrais arbres : chaque couche de feuillage bouge, jamais de plus de RUE_WIND_MAX px', () => {
    const w = windOf({ cloud: 0, precip: 0, wind: 0.8, snow: false }, false);
    for (const pit of pits) {
      const t3 = rueTreeOf(pit);
      const p = rueTreePose(pit, t3, 1000, w, W);
      expect(p.masses).toHaveLength(rueLayers(t3).filter((l) => l[0] === 'c').length);
      // Sur 10 s (le vent local peut passer par zéro à un instant donné : ondes progressives).
      const poses = Array.from({ length: 10 }, (_, i) => rueTreePose(pit, t3, 1000 + i, w, W));
      expect(poses.some((q) => q.masses.some((g) => Math.abs(g.dx) > 0.1)), `fosse ${pit.x}`).toBe(true);
      for (const q of poses) for (const g of q.masses) expect(Math.hypot(g.dx, g.dy)).toBeLessThanOrEqual(RUE_WIND_MAX);
    }
  });
});

describe('opaqueBounds (rognage des couches cuites)', () => {
  const img = (w: number, h: number, opaque: [number, number][]): Uint8ClampedArray => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of opaque) d[(y * w + x) * 4 + 3] = 1;
    return d;
  };
  it('emprise des pixels non transparents ± 1 px, bornée au canvas ; couche vide : null', () => {
    expect(opaqueBounds(img(10, 8, []), 10, 8)).toBeNull();
    expect(opaqueBounds(img(10, 8, [[4, 3], [6, 5]]), 10, 8)).toEqual({ x: 3, y: 2, w: 5, h: 5 });
    expect(opaqueBounds(img(10, 8, [[0, 0], [9, 7]]), 10, 8)).toEqual({ x: 0, y: 0, w: 10, h: 8 });
  });
});

describe('gradePixels', () => {
  it('identité : pixels inchangés ; nuit : plus sombre, alpha et transparents intacts', () => {
    const d = new Uint8ClampedArray([200, 150, 100, 255, 9, 9, 9, 0]);
    gradePixels(d, IDENTITY);
    expect([...d]).toEqual([200, 150, 100, 255, 9, 9, 9, 0]);
    gradePixels(d, NIGHT);
    expect(d[0]).toBeLessThan(200);
    expect(d[3]).toBe(255);
    expect([...d.slice(4)]).toEqual([9, 9, 9, 0]);
  });
});
