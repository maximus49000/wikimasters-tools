// @vitest-environment jsdom
// tests/content/hill-wind-layer.test.tsx — colline au vent (PR 3b) : la ville se montre d'abord avec ses tranches complètes
// ('all'), la colline est préparée ensuite en arrière-plan ; une tranche ne passe en 'base' qu'une fois toutes ses couches
// prêtes, son feuillage posé au repos juste après son dessin, puis le vent monte en 2 s ; étalonnage du feuillage synchronisé
// avec celui de la toile des tranches ; sortie du mode vent par les tranches complètes d'abord ; fondu de 3 s entre deux vents ;
// aucune écriture dans le SVG pendant la boucle, aucun redessin par vent calme ; calque à sa place dans la scène de la ville.
// Pilote de toile factice (décodage et étalonnage commandés, faux contexte qui enregistre les dessins), comme
// tests/content/painted-canvas.test.tsx ; peintre de la colline factice (`setHillPainterForTests`).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY } from '../../src/content/art-setting';
import { HILL_RAMP_MS, HillWindLayer, setHillFrameSinkForTests, useHillCity, type HillDraw } from '../../src/content/hill-wind-layer';
import { PaintedCanvas, resetPaintedCanvasForTests, setPaintedCanvasDriverForTests, type PaintedCanvasDriver } from '../../src/content/painted-canvas';
import {
  hillGroups,
  hillTileKey,
  hillWindEnabled,
  resetPaintedCacheForTests,
  setHillPainterForTests,
  setHillWindForTests,
  setTilePainterForTests,
  type HillLayer,
  type HillTilePainter,
  type PaintedTile,
} from '../../src/content/painted-city';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { resetStreetTreesForTests, setRueSpritePainterForTests } from '../../src/content/street-trees';
import { resetStreetTreesSlotForTests } from '../../src/content/street-trees-slot';
import { TILE, hillCanopyBox, paintCityTile, tileCount, tileKey } from '../../src/core/library/paint/city-painter';
import { cityPaintPlan, type CityPaintPlan } from '../../src/core/library/paint/city-plan';
import { fondMoment, SUNNY, type FondMoment } from '../../src/core/library/paint/fond-time';
import { gradeFor, type Grade } from '../../src/core/library/paint/grade';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { recordingCtx } from '../core/library/paint/recording-ctx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const H = 340;
const JULY = fondMoment({ y: 2026, m: 7, d: 7 }, 15 * 60, { ...SUNNY, wind: 0.8 });
const CALM_JULY = fondMoment({ y: 2026, m: 7, d: 7 }, 15 * 60, { ...SUNNY, wind: 0 });
const JANUARY = fondMoment({ y: 2027, m: 1, d: 15 }, 12 * 60, { cloud: 0.6, precip: 0, wind: 0.3, snow: false });

let host: HTMLDivElement;
let root: Root;
let frames: FrameRequestCallback[] = [];
let drawn: HillDraw[] = [];
let clock = 1_000_000;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  frames = [];
  drawn = [];
  clock = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestIdleCallback', (fn: () => void) => { fn(); return 1; });
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  resetPaintedCacheForTests();
  resetPaintedCanvasForTests();
  resetStreetTreesForTests();
  resetStreetTreesSlotForTests();
  setHillFrameSinkForTests((b) => drawn.push(b));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  localStorage.removeItem(ART_KEY);
  setTilePainterForTests(null);
  setHillPainterForTests(null);
  setRueSpritePainterForTests(null);
  setPaintedCanvasDriverForTests(null);
  setHillWindForTests(null);
  setHillFrameSinkForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); });
// Une image de la boucle (15 Hz) `ms` plus tard sur l'horloge murale.
const tick = (ms = 67): void => {
  clock += ms;
  const list = frames.splice(0);
  act(() => list.forEach((cb) => cb(clock)));
};

// Pilote factice : décodage immédiat (source nommée par l'url), sauf les urls retenues (`holdDecode`) ; étalonnage immédiat
// (`nom@valeur`) sauf les images retenues (`holdGrade`) ; un faux contexte par toile qui enregistre effacements (lignes),
// rognages, modes de fusion et dessins.
type Src = { name: string };
function fakeDriver(opts: { holdDecode?: (url: string) => boolean; holdGrade?: (name: string) => boolean } = {}) {
  const waiting = new Map<string, ((s: Src) => void)[]>();
  const grading: { name: string; ok: () => void }[] = [];
  const log: string[] = [];
  const ctxFor = new WeakMap<HTMLCanvasElement, unknown>();
  let canvases = 0;
  const makeCtx = (id: number) => ({
    globalAlpha: 1,
    _op: 'source-over',
    get globalCompositeOperation() { return this._op; },
    set globalCompositeOperation(v: string) { this._op = v; if (v !== 'source-over') log.push(`#${id} ${v}`); },
    setTransform: () => undefined,
    clearRect: (_x: number, y: number, _w: number, h: number) => void log.push(`#${id} clear ${Math.round(y)}+${Math.round(h)}`),
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    rect: (x: number, y: number, w: number, h: number) => void log.push(`#${id} clip ${+x.toFixed(2)}..${+(x + w).toFixed(2)} y ${+y.toFixed(2)}+${+h.toFixed(2)}`),
    clip: () => undefined,
    drawImage: (s: Src) => void log.push(`#${id} draw ${(s as Src).name ?? 'travail'}`),
  });
  const drv: PaintedCanvasDriver = {
    decode: (url) =>
      new Promise((ok) => {
        if (!opts.holdDecode?.(url)) ok({ name: url } as never);
        else waiting.set(url, [...(waiting.get(url) ?? []), ok as (s: Src) => void]);
      }) as never,
    grade: (src, g) => {
      const name = `${(src as unknown as Src).name}@${g[0]!.toFixed(2)}`;
      const out = { name } as unknown as CanvasImageSource;
      if (!opts.holdGrade?.(name)) return out;
      return new Promise((ok) => grading.push({ name, ok: () => ok(out) }));
    },
    context: (cv) => {
      let c = ctxFor.get(cv);
      if (!c) ctxFor.set(cv, (c = makeCtx(canvases++)));
      return c as CanvasRenderingContext2D;
    },
  };
  return {
    drv,
    log,
    release: (match: (url: string) => boolean) =>
      act(async () => {
        for (const [url, list] of [...waiting]) if (match(url)) (waiting.delete(url), list.forEach((ok) => ok({ name: url })));
      }),
    releaseGrades: (match: (name: string) => boolean) =>
      act(async () => {
        for (const g of grading.splice(0)) if (match(g.name)) g.ok(); else grading.push(g);
      }),
  };
}

// Couches factices d'une tranche : une par groupe qui a une boîte, urls nommées par la tranche, le groupe et `tag`.
const layersOf = (plan: CityPaintPlan, t: number, tag = ''): HillLayer[] =>
  ([0, 1, 2] as const).flatMap((g) => {
    const box = hillCanopyBox(plan, t, g);
    return box ? [{ group: g, box, canopy: `feuillage-${t}-${g}${tag}`, screen: `ecran-${t}-${g}${tag}` }] : [];
  });
const allTiles = (plan: CityPaintPlan, tag = ''): PaintedTile[] =>
  Array.from({ length: tileCount(plan.width) }, (_, t) => ({ x: t * TILE, w: Math.min(TILE, plan.width - t * TILE), url: `all-${t}${tag}` }));
// Peintre de la colline : 'base' et couches nommées ; `gate` retient la peinture.
function hillPainter(tag: (m?: FondMoment) => string = () => '', gate?: () => Promise<void>): { painter: HillTilePainter; calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    painter: async (p, t, m) => {
      calls.push(t);
      if (gate) await gate();
      return { url: `base-${t}${tag(m)}`, hill: layersOf(p, t, tag(m)) };
    },
  };
}

// Banc : la toile des tranches et le calque branchés comme dans scene-city.tsx.
type HarnessProps = { plan: CityPaintPlan; moment: FondMoment; grade?: Grade | null; enabled?: boolean; start?: boolean; tiles?: PaintedTile[] };
function Harness({ plan, moment, grade = null, enabled = true, start = true, tiles }: HarnessProps) {
  const hill = useHillCity({ plan, moment, tiles: tiles ?? allTiles(plan), height: H, grade, enabled, start });
  return (
    <svg>
      <PaintedCanvas box={{ x: 0, y: 0, w: plan.width, h: H }} images={hill.images} grade={hill.grade} onDrawn={hill.onDrawn} tag="ville" />
      {hill.layer && <HillWindLayer {...hill.layer} />}
    </svg>
  );
}
const show = (p: HarnessProps) => act(async () => root.render(<Harness {...p} />));
// Dessins des tranches, sans le numéro de toile (l'ordre de création des contextes varie).
const tileDraws = (log: readonly string[]) => log.filter((l) => / draw (all|base)-/.test(l)).map((l) => l.replace(/^#\d+ /, ''));
const at = (log: readonly string[], what: string) => log.findIndex((l) => l.endsWith(' ' + what));
const foliageDraws = (log: readonly string[]) => log.filter((l) => l.includes(' draw feuillage'));

describe('colline au vent : interrupteur et clé', () => {
  const plan = cityPaintPlan(720, H, 7);
  it("clé de la tranche 'base' : celle de la tranche complète + `|v` (deux entrées distinctes)", () => {
    expect(hillTileKey(plan, 0, JULY)).toBe(tileKey(plan, 0, JULY) + '|v');
  });
  it('actif avec un canvas et sans mouvement réduit ; jamais en jsdom ; `still=1` du banc (requête média forcée) le coupe', () => {
    expect(hillWindEnabled()).toBe(false);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 16) Chrome/140');
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }) as MediaQueryList);
    expect(hillWindEnabled()).toBe(true);
    // Comme .superpowers/harness-fond/app.tsx avec still=1.
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (query: string): MediaQueryList => (query.includes('prefers-reduced-motion') ? ({ ...mm(query), matches: true } as MediaQueryList) : mm(query));
    expect(hillWindEnabled()).toBe(false);
  });
  it("hiver : un groupe nu n'a aucune couche (boîte présente, flux du feuillage vide) ; juillet : tous les groupes à boîte", () => {
    let bare = 0;
    for (const seed of [1, 7, 42]) {
      const p = cityPaintPlan(1440, H, seed);
      for (let t = 0; t < tileCount(p.width); t++) {
        const boxed = ([0, 1, 2] as const).filter((g) => hillCanopyBox(p, t, g) !== null);
        expect(hillGroups(p, t, JULY).map((x) => x.group)).toEqual(boxed);
        const winter = hillGroups(p, t, JANUARY).map((x) => x.group);
        for (const g of boxed) {
          const ctx = recordingCtx();
          paintCityTile(ctx, p, t, JANUARY, { canopy: g });
          expect(winter.includes(g)).toBe(ctx.ops.length > 0);
          if (ctx.ops.length === 0) bare++;
        }
      }
    }
    expect(bare).toBeGreaterThan(0);
  });
});

describe('colline au vent : démarrage et passage en base', () => {
  const plan = cityPaintPlan(720, H, 7);

  it("tranches complètes d'abord, aucune peinture de la colline avant `start`", async () => {
    setHillWindForTests(true);
    const f = fakeDriver();
    setPaintedCanvasDriverForTests(f.drv);
    const hp = hillPainter();
    setHillPainterForTests(hp.painter);
    await show({ plan, moment: JULY, start: false });
    await settle();
    expect(tileDraws(f.log)).toEqual(['draw all-0', 'draw all-1']);
    expect(hp.calls).toEqual([]);
    expect(host.querySelector('[data-colline-vent]')).toBeNull();
  });

  it("passage en 'base' seulement quand toutes les couches de la tranche sont prêtes ; feuillage posé au repos juste après", async () => {
    setHillWindForTests(true);
    const f = fakeDriver({ holdDecode: (u) => u.startsWith('feuillage-1') });
    setPaintedCanvasDriverForTests(f.drv);
    setHillPainterForTests(hillPainter().painter);
    await show({ plan, moment: JULY });
    await settle();
    // Couches de la tranche 1 en décodage : aucune tranche ne passe (une préparation à la fois, toutes ses tranches prêtes).
    expect(tileDraws(f.log).every((l) => l.includes('all-'))).toBe(true);
    expect(foliageDraws(f.log)).toEqual([]);
    f.log.length = 0;
    drawn.length = 0;
    await f.release(() => true);
    await settle();
    const tiles = tileDraws(f.log);
    expect(tiles).toContain('draw base-0');
    expect(tiles).toContain('draw base-1');
    // Feuillage dessiné APRÈS la tranche 'base' (jamais une 'base' sans feuillage visible ensuite), et d'abord au repos.
    const firstBase = at(f.log, 'draw base-0');
    const firstLeaf = f.log.findIndex((l) => l.includes('draw feuillage-0'));
    expect(firstLeaf).toBeGreaterThan(firstBase);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn[0]!.every((d) => d.dx === 0 && d.s === 0)).toBe(true);
  });

  it("peinture de la colline ratée : la tranche reste complète", async () => {
    setHillWindForTests(true);
    const f = fakeDriver();
    setPaintedCanvasDriverForTests(f.drv);
    setHillPainterForTests(async (p, t) => (t === 0 ? null : { url: `base-${t}`, hill: layersOf(p, t) }));
    await show({ plan, moment: JULY });
    await settle();
    const tiles = tileDraws(f.log);
    expect(tiles.at(-2)).toBe('draw all-0');
    expect(tiles.at(-1)).toBe('draw base-1');
    expect(foliageDraws(f.log).every((l) => l.includes('feuillage-1'))).toBe(true);
  });

  it('le vent monte de 0 à 1 en 2 s, sans saut', async () => {
    setHillWindForTests(true);
    setPaintedCanvasDriverForTests(fakeDriver().drv);
    setHillPainterForTests(hillPainter().painter);
    await show({ plan, moment: JULY });
    await settle();
    drawn.length = 0;
    const peak = (d: HillDraw) => Math.max(...d.map((x) => Math.abs(x.dx)));
    for (let i = 0; i < 60; i++) tick();
    expect(drawn.length).toBeGreaterThan(20);
    const early = drawn.slice(0, 3).map(peak);
    const late = drawn.slice(-5).map(peak);
    expect(Math.max(...early)).toBeLessThan(0.2);
    expect(Math.max(...late)).toBeGreaterThan(0.3);
    for (let i = 1; i < drawn.length; i++) expect(Math.abs(peak(drawn[i]!) - peak(drawn[i - 1]!))).toBeLessThan(0.35);
    expect(60 * 67).toBeGreaterThan(HILL_RAMP_MS);
  });

  it('tranche repeinte : la nouvelle base et son feuillage remplacent les anciens ensemble', async () => {
    setHillWindForTests(true);
    const f = fakeDriver({ holdDecode: (u) => u === 'base-1b' });
    setPaintedCanvasDriverForTests(f.drv);
    const later = fondMoment({ y: 2026, m: 7, d: 8 }, 15 * 60, JULY.meteo);
    setHillPainterForTests(hillPainter((m) => (m?.date === later.date ? 'b' : '')).painter);
    await show({ plan, moment: JULY });
    await settle();
    await show({ plan, moment: later, tiles: allTiles(plan, 'b') });
    await settle();
    f.log.length = 0;
    tick();
    // La nouvelle tranche 1 est annoncée mais pas encore décodée : l'ancienne base et l'ancien feuillage restent.
    expect(foliageDraws(f.log).some((l) => l.includes('feuillage-1-') && !l.includes('b'))).toBe(true);
    expect(foliageDraws(f.log).some((l) => /feuillage-1-\db/.test(l))).toBe(false);
    f.log.length = 0;
    await f.release(() => true);
    await settle();
    const iBase = at(f.log, 'draw base-1b');
    expect(iBase).toBeGreaterThanOrEqual(0);
    const newLeaf = f.log.findIndex((l) => /feuillage-1-\db/.test(l));
    expect(newLeaf).toBeGreaterThan(iBase);
    expect(f.log.slice(iBase).some((l) => /feuillage-1-\d$/.test(l))).toBe(false);
  });

  it("changement de plan : l'ancien feuillage suit les anciennes tranches tant qu'elles sont dessinées, plus jamais ensuite", async () => {
    setHillWindForTests(true);
    const f = fakeDriver({ holdDecode: (u) => u.endsWith('B') });
    setPaintedCanvasDriverForTests(f.drv);
    setHillPainterForTests(async (p, t) => ({ url: `base-${t}${p.seed === 42 ? 'B' : ''}`, hill: layersOf(p, t, p.seed === 42 ? 'B' : '') }));
    await show({ plan, moment: JULY });
    await settle();
    expect(foliageDraws(f.log).length).toBeGreaterThan(0);
    const other = cityPaintPlan(720, H, 42);
    await show({ plan: other, moment: JULY, tiles: allTiles(other, 'B') });
    for (let i = 0; i < 5; i++) tick();
    await settle();
    f.log.length = 0;
    await f.release(() => true);
    await settle();
    for (let i = 0; i < 5; i++) tick();
    const iNew = f.log.findIndex((l) => / draw (all|base)-\dB$/.test(l));
    expect(iNew).toBeGreaterThanOrEqual(0);
    expect(f.log.slice(iNew).some((l) => /draw feuillage-\d-\d$/.test(l))).toBe(false);
  });
});

describe("colline au vent : étalonnage synchronisé avec la toile des tranches", () => {
  const plan = cityPaintPlan(720, H, 7);
  it("nouvel arrondi : le feuillage garde l'ancienne teinte tant que la toile des tranches n'a pas dessiné la nouvelle", async () => {
    setHillWindForTests(true);
    const night = gradeFor(0.3, 0, false);
    const dusk = gradeFor(0.5, 0, false);
    const tag = (g: Grade) => `@${g[0]!.toFixed(2)}`;
    const f = fakeDriver({ holdGrade: (n) => n.startsWith('base-') && n.endsWith(tag(night)) });
    setPaintedCanvasDriverForTests(f.drv);
    setHillPainterForTests(hillPainter().painter);
    await show({ plan, moment: CALM_JULY, grade: dusk });
    await settle();
    expect(foliageDraws(f.log).every((l) => l.endsWith(tag(dusk)))).toBe(true);
    f.log.length = 0;
    await show({ plan, moment: CALM_JULY, grade: night });
    await settle();
    tick();
    // Copies du feuillage à la nouvelle teinte prêtes, tranches pas encore : rien de neuf à l'écran.
    expect(foliageDraws(f.log).some((l) => l.endsWith(tag(night)))).toBe(false);
    await f.releaseGrades(() => true);
    await settle();
    const iTile = f.log.findIndex((l) => l.includes('draw base-') && l.endsWith(tag(night)));
    const iLeaf = f.log.findIndex((l) => l.includes('draw feuillage') && l.endsWith(tag(night)));
    expect(iTile).toBeGreaterThanOrEqual(0);
    expect(iLeaf).toBeGreaterThan(iTile);
    expect(f.log.slice(iLeaf).some((l) => l.includes('draw feuillage') && l.endsWith(tag(dusk)))).toBe(false);
  });
});

describe('colline au vent : sortie du mode vent, météo, boucle', () => {
  const plan = cityPaintPlan(720, H, 7);
  it('vent coupé en cours de route : tranches complètes redessinées d’abord, puis plus de feuillage ni de calque', async () => {
    setHillWindForTests(true);
    const f = fakeDriver();
    setPaintedCanvasDriverForTests(f.drv);
    setHillPainterForTests(hillPainter().painter);
    await show({ plan, moment: JULY });
    await settle();
    expect(host.querySelector('[data-colline-vent]')).not.toBeNull();
    f.log.length = 0;
    await show({ plan, moment: JULY, enabled: false });
    await settle();
    const iAll = f.log.findIndex((l) => l.includes('draw all-'));
    expect(iAll).toBeGreaterThanOrEqual(0);
    expect(f.log.slice(iAll).some((l) => l.includes('draw feuillage'))).toBe(false);
    expect(host.querySelector('[data-colline-vent]')).toBeNull();
  });

  it('changement de météo : fondu de 3 s entre les deux vents, jamais de saut', async () => {
    setHillWindForTests(true);
    setPaintedCanvasDriverForTests(fakeDriver().drv);
    setHillPainterForTests(hillPainter().painter);
    await show({ plan, moment: CALM_JULY });
    await settle();
    for (let i = 0; i < 40; i++) tick();
    drawn.length = 0;
    const storm = fondMoment({ y: 2026, m: 7, d: 7 }, 15 * 60, { ...SUNNY, wind: 1 });
    await show({ plan, moment: storm });
    for (let i = 0; i < 60; i++) tick();
    const peak = (d: HillDraw) => Math.max(0, ...d.map((x) => Math.abs(x.dx)));
    expect(drawn.length).toBeGreaterThan(10);
    expect(peak(drawn[0]!)).toBeLessThan(0.3);
    for (let i = 1; i < drawn.length; i++) expect(Math.abs(peak(drawn[i]!) - peak(drawn[i - 1]!))).toBeLessThan(0.35);
    expect(Math.max(...drawn.map(peak))).toBeGreaterThan(0.5);
  });

  it("aucune écriture dans le SVG pendant 30 images au vent ; lignes du groupe seules effacées et rognées", async () => {
    setHillWindForTests(true);
    const f = fakeDriver();
    setPaintedCanvasDriverForTests(f.drv);
    setHillPainterForTests(hillPainter().painter);
    await show({ plan, moment: JULY });
    await settle();
    for (let i = 0; i < 40; i++) tick();
    const svg = host.querySelector('svg')!;
    const mo = new MutationObserver(() => undefined);
    mo.observe(svg, { attributes: true, childList: true, subtree: true, characterData: true });
    drawn.length = 0;
    f.log.length = 0;
    for (let i = 0; i < 30; i++) tick();
    expect(mo.takeRecords()).toEqual([]);
    mo.disconnect();
    expect(drawn.length).toBeGreaterThan(5);
    // Rognage des bandes à ± 2 px, aux lignes du groupe (pas toute la hauteur).
    expect(f.log.some((l) => / clip -2\.\.98 y /.test(l))).toBe(true);
    // Toile de travail : effacée sur les lignes du groupe seulement (jamais depuis le haut de la toile).
    expect(f.log.some((l) => / clear [1-9]\d*\+\d+$/.test(l))).toBe(true);
  });

  it('vent calme : plus aucune image redessinée une fois le vent monté', async () => {
    setHillWindForTests(true);
    setPaintedCanvasDriverForTests(fakeDriver().drv);
    setHillPainterForTests(hillPainter().painter);
    await show({ plan, moment: CALM_JULY });
    await settle();
    for (let i = 0; i < 40; i++) tick();
    drawn.length = 0;
    for (let i = 0; i < 30; i++) tick();
    expect(drawn).toHaveLength(0);
  });

  it('démontage : le tampon de la toile est rendu', async () => {
    setHillWindForTests(true);
    setPaintedCanvasDriverForTests(fakeDriver().drv);
    setHillPainterForTests(hillPainter().painter);
    await show({ plan, moment: JULY });
    await settle();
    const cv = host.querySelector('[data-colline-vent] canvas') as HTMLCanvasElement;
    act(() => root.render(<svg />));
    expect(cv.width).toBe(0);
    expect(cv.height).toBe(0);
  });
});

describe('colline au vent : dans la scène de la ville', () => {
  const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
  const renderCity = () =>
    act(async () =>
      root.render(
        <svg>
          <ScenePanorama scene="city" width={720} height={H} sky={skyAt(12 * 60, times)} minutes={12 * 60} seed={5} />
        </svg>,
      ),
    );
  const before = (a: Element, b: Element): boolean => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("la ville se montre sans attendre la colline ; calque après la toile des tranches et avant la vie du fond", async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    setHillWindForTests(true);
    setTilePainterForTests(async (_p, t) => `data:tranche${t}`);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    setHillPainterForTests(hillPainter(() => '', () => gate).painter);
    setPaintedCanvasDriverForTests(fakeDriver().drv);
    await renderCity();
    await settle();
    const city = host.querySelector('[data-painted-city]') as HTMLElement;
    expect(city.getAttribute('data-ready')).toBe('true');
    expect(city.style.opacity).toBe('1');
    const tiles = host.querySelector('[data-painted-canvas="ville"]')!;
    const hill = host.querySelector('[data-colline-vent]')!;
    const life = host.querySelector('[data-vie-fond]')!;
    expect(hill).not.toBeNull();
    expect(before(tiles, hill)).toBe(true);
    expect(before(hill, life)).toBe(true);
    release();
    await settle();
    expect(city.getAttribute('data-ready')).toBe('true');
  });

  it('sans vent (jsdom, mouvement réduit) : aucun calque, la ville se montre comme avant', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    setTilePainterForTests(async (_p, t) => `data:tranche${t}`);
    const hp = hillPainter();
    setHillPainterForTests(hp.painter);
    await renderCity();
    await settle();
    expect(host.querySelector('[data-colline-vent]')).toBeNull();
    expect(hp.calls).toEqual([]);
    expect(host.querySelector('[data-painted-city]')!.getAttribute('data-ready')).toBe('true');
  });
});
