// @vitest-environment jsdom
// tests/content/hill-wind-layer.test.tsx — colline au vent (PR 3b, tâche 3) : tranches peintes en parties (clé `|v`, couches de
// la colline publiées avec l'image affichée), groupe nu l'hiver sans couche, calque `colline-vent` (une toile dans le SVG, juste
// après la toile des tranches et avant la vie du fond), ville peinte prête seulement avec le feuillage dessiné, aucune écriture
// dans le SVG pendant la boucle, aucun redessin par vent calme. Pilote de toile factice (décodage commandé, faux contexte qui
// enregistre les dessins), comme tests/content/painted-canvas.test.tsx.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY } from '../../src/content/art-setting';
import { HillWindLayer, setHillFrameSinkForTests, type HillDraw } from '../../src/content/hill-wind-layer';
import { resetPaintedCanvasForTests, setPaintedCanvasDriverForTests, type PaintedCanvasDriver } from '../../src/content/painted-canvas';
import {
  hillGroups,
  hillWindEnabled,
  paintedTileKey,
  resetPaintedCacheForTests,
  setHillWindForTests,
  setTilePainterForTests,
  usePaintedCity,
  type HillLayer,
  type PaintedImage,
  type PaintedTile,
} from '../../src/content/painted-city';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { resetStreetTreesForTests, setRueSpritePainterForTests } from '../../src/content/street-trees';
import { resetStreetTreesSlotForTests } from '../../src/content/street-trees-slot';
import { TILE, hillCanopyBox, paintCityTile, tileCount } from '../../src/core/library/paint/city-painter';
import { cityPaintPlan, type CityPaintPlan } from '../../src/core/library/paint/city-plan';
import { fondMoment, SUNNY, type FondMoment } from '../../src/core/library/paint/fond-time';
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
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  frames = [];
  drawn = [];
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
  setRueSpritePainterForTests(null);
  setPaintedCanvasDriverForTests(null);
  setHillWindForTests(null);
  setHillFrameSinkForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); });
// Une image de la boucle (15 Hz) à l'instant `ms` de l'horloge murale.
const tick = (ms: number): void => {
  vi.spyOn(Date, 'now').mockReturnValue(ms);
  const list = frames.splice(0);
  act(() => list.forEach((cb) => cb(ms)));
};

// Pilote factice : décodage immédiat (source nommée par l'url), sauf les urls retenues (`hold`) jusqu'à `release` ; étalonnage
// immédiat (`url@grade`) ; un faux contexte par toile qui enregistre effacements, rognages, modes de fusion et dessins.
type Src = { name: string };
function fakeDriver(hold: (url: string) => boolean = () => false) {
  const waiting = new Map<string, ((s: Src) => void)[]>();
  const log: string[] = [];
  const ctxFor = new WeakMap<HTMLCanvasElement, unknown>();
  let canvases = 0;
  const makeCtx = (id: number) => {
    const c = {
      globalAlpha: 1,
      _op: 'source-over',
      get globalCompositeOperation() { return this._op; },
      set globalCompositeOperation(v: string) { this._op = v; if (v !== 'source-over') log.push(`#${id} ${v}`); },
      setTransform: (...m: number[]) => void log.push(`#${id} m ${m.map((v) => +v.toFixed(3)).join(',')}`),
      clearRect: () => void log.push(`#${id} clear`),
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      rect: (x: number, _y: number, w: number) => void log.push(`#${id} clip ${+x.toFixed(2)}..${+(x + w).toFixed(2)}`),
      clip: () => undefined,
      drawImage: (s: Src | HTMLCanvasElement) => void log.push(`#${id} draw ${(s as Src).name ?? 'travail'}`),
    };
    return c;
  };
  const drv: PaintedCanvasDriver = {
    decode: (url) =>
      new Promise((ok) => {
        if (!hold(url)) ok({ name: url } as never);
        else waiting.set(url, [...(waiting.get(url) ?? []), ok as (s: Src) => void]);
      }) as never,
    grade: (src, g) => ({ name: `${(src as unknown as Src).name}@${g[0]!.toFixed(2)}` }) as unknown as CanvasImageSource,
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
  };
}

// Couches factices des tranches d'un plan : une par groupe qui a une boîte, urls nommées par la tranche, le groupe et `tag`.
const layersOf = (plan: CityPaintPlan, t: number, tag = ''): HillLayer[] =>
  ([0, 1, 2] as const).flatMap((g) => {
    const box = hillCanopyBox(plan, t, g);
    return box ? [{ group: g, box, canopy: `feuillage-${t}-${g}${tag}`, screen: `ecran-${t}-${g}${tag}` }] : [];
  });
const tilesOf = (plan: CityPaintPlan, tag = ''): PaintedTile[] =>
  Array.from({ length: tileCount(plan.width) }, (_, t) => ({ x: t * TILE, w: Math.min(TILE, plan.width - t * TILE), url: `tranche-${t}${tag}`, hill: layersOf(plan, t, tag) }));

describe('colline au vent : interrupteur et clé des tranches', () => {
  const plan = cityPaintPlan(720, H, 7);
  it('avec vent : clé `|v` ; sans : la clé de toujours', () => {
    expect(paintedTileKey(plan, 0, JULY, true).endsWith('|v')).toBe(true);
    expect(paintedTileKey(plan, 0, JULY, false).endsWith('|v')).toBe(false);
    expect(paintedTileKey(plan, 0, JULY, true)).toBe(paintedTileKey(plan, 0, JULY, false) + '|v');
  });
  it('actif avec un canvas et sans mouvement réduit ; jamais en jsdom, jamais en mouvement réduit', () => {
    expect(hillWindEnabled()).toBe(false);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 16) Chrome/140');
    let reduce = false;
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce') }) as MediaQueryList);
    expect(hillWindEnabled()).toBe(true);
    reduce = true;
    expect(hillWindEnabled()).toBe(false);
  });
});

describe('colline au vent : tranches en parties', () => {
  function City({ plan, moment, out }: { plan: CityPaintPlan; moment: FondMoment; out: PaintedTile[][] }): null {
    out.push(usePaintedCity(plan, moment).tiles);
    return null;
  }
  const plan = cityPaintPlan(720, H, 7);

  it('avec vent : couches reçues avec la tranche ; sans vent : `hill` vide, calque absent', async () => {
    setHillWindForTests(true);
    const painter = vi.fn(async (p: CityPaintPlan, t: number): Promise<PaintedImage> => ({ url: `data:t${t}`, profile: null, hill: layersOf(p, t) }));
    setTilePainterForTests(painter);
    const out: PaintedTile[][] = [];
    await act(async () => root.render(<City plan={plan} moment={JULY} out={out} />));
    await settle();
    const tiles = out.at(-1)!;
    expect(tiles.every((t) => t.url !== '')).toBe(true);
    expect(tiles.map((t) => t.hill)).toEqual([layersOf(plan, 0), layersOf(plan, 1)]);
    expect(tiles.some((t) => t.hill.length > 0)).toBe(true);
    // Sans vent : autre clé (repeinte), aucune couche ; le calque n'est pas rendu.
    setHillWindForTests(false);
    setTilePainterForTests(async (_p, t) => `data:plein${t}`);
    await act(async () => root.render(<City plan={plan} moment={JULY} out={out} />));
    await settle();
    expect(out.at(-1)!.map((t) => t.url)).toEqual(['data:plein0', 'data:plein1']);
    expect(out.at(-1)!.every((t) => t.hill.length === 0)).toBe(true);
    await act(async () => root.render(<svg><HillWindLayer plan={plan} tiles={tilesOf(plan)} moment={JULY} daylight={1} twilight={0} gloom={false} /></svg>));
    expect(host.querySelector('[data-colline-vent]')).toBeNull();
    expect(host.querySelector('svg')!.childNodes).toHaveLength(0);
  });

  it("tranche repeinte : les couches de l'ancienne image restent jusqu'à la nouvelle, puis changent avec elle", async () => {
    setHillWindForTests(true);
    let gate: Promise<void> | null = null;
    setTilePainterForTests(async (p, t, m) => {
      const tag = m?.date === JULY.date ? 'a' : 'b';
      if (tag === 'b' && gate) await gate;
      return { url: `data:${tag}${t}`, profile: null, hill: layersOf(p, t, tag) };
    });
    const out: PaintedTile[][] = [];
    await act(async () => root.render(<City plan={plan} moment={JULY} out={out} />));
    await settle();
    let release: () => void = () => undefined;
    gate = new Promise<void>((r) => (release = r));
    const later = fondMoment({ y: 2026, m: 7, d: 8 }, 15 * 60, JULY.meteo);
    await act(async () => root.render(<City plan={plan} moment={later} out={out} />));
    await settle();
    expect(out.at(-1)!.map((t) => t.url)).toEqual(['data:a0', 'data:a1']);
    expect(out.at(-1)!.flatMap((t) => t.hill.map((l) => l.canopy)).every((u) => u.endsWith('a'))).toBe(true);
    release();
    await settle();
    expect(out.at(-1)!.map((t) => t.url)).toEqual(['data:b0', 'data:b1']);
    expect(out.at(-1)!.flatMap((t) => t.hill.map((l) => l.canopy)).every((u) => u.endsWith('b'))).toBe(true);
  });

  it("calque : la préparation d'une nouvelle génération garde l'ancien feuillage dessiné, puis le remplace d'un coup", async () => {
    setHillWindForTests(true);
    const f = fakeDriver((u) => u.endsWith('b'));
    setPaintedCanvasDriverForTests(f.drv);
    const render = (tag: string) => act(async () => root.render(<svg><HillWindLayer plan={plan} tiles={tilesOf(plan, tag)} moment={CALM_JULY} daylight={1} twilight={0} gloom={false} /></svg>));
    await render('a');
    await settle();
    const fo = host.querySelector('[data-colline-vent]')!;
    const n = Number(fo.getAttribute('data-couches'));
    expect(n).toBe(tilesOf(plan).flatMap((t) => t.hill).length);
    f.log.length = 0;
    await render('b');
    await settle();
    // Nouvelles couches en décodage : la toile n'est pas touchée.
    expect(f.log).toEqual([]);
    await f.release(() => true);
    await settle();
    const draws = f.log.filter((l) => l.includes(' draw feuillage'));
    expect(draws.length).toBeGreaterThan(0);
    expect(draws.every((l) => l.endsWith('b'))).toBe(true);
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

describe('colline au vent : calque `colline-vent`', () => {
  const plan = cityPaintPlan(1440, H, 7);
  const render = (moment: FondMoment, onReady?: (r: boolean) => void, daylight = 1) =>
    act(async () => root.render(<svg><HillWindLayer plan={plan} tiles={tilesOf(plan)} moment={moment} daylight={daylight} twilight={0} gloom={false} onReady={onReady} /></svg>));

  it('feuillage étalonné par bandes, écrans en destination-out, une toile dans le SVG ; prêt après le dessin', async () => {
    setHillWindForTests(true);
    const f = fakeDriver((u) => u.startsWith('feuillage'));
    setPaintedCanvasDriverForTests(f.drv);
    const ready: boolean[] = [];
    await render(JULY, (r) => ready.push(r), 0.1);
    await settle();
    const fo = host.querySelector('[data-colline-vent]')!;
    expect(fo.tagName.toLowerCase()).toBe('foreignobject');
    expect(fo.querySelectorAll('canvas')).toHaveLength(1);
    expect(fo.getAttribute('width')).toBe('1440');
    expect(ready.at(-1)).toBe(false);
    expect(f.log).toEqual([]);
    await f.release(() => true);
    await settle();
    expect(ready.at(-1)).toBe(true);
    // Feuillage : copies étalonnées (`@`), écrans tels quels, en destination-out après le feuillage de leur groupe.
    const draws = f.log.filter((l) => l.includes(' draw '));
    expect(draws.filter((l) => l.includes('feuillage')).every((l) => l.includes('@'))).toBe(true);
    expect(draws.filter((l) => l.includes('ecran')).every((l) => !l.includes('@'))).toBe(true);
    const work = f.log.findIndex((l) => l.includes('destination-out'));
    expect(work).toBeGreaterThan(f.log.findIndex((l) => l.includes('draw feuillage')));
    // Bandes rognées à ± 6 px.
    expect(f.log.some((l) => l.endsWith(' clip -6..102'))).toBe(true);
    expect(drawn.length).toBeGreaterThan(0);
    expect(new Set(drawn[0]!.map((b) => b.group)).size).toBeGreaterThan(1);
  });

  it("aucune écriture dans le SVG de la scène pendant 30 images de boucle, et le vent redessine la toile", async () => {
    setHillWindForTests(true);
    const f = fakeDriver();
    setPaintedCanvasDriverForTests(f.drv);
    await render(JULY);
    await settle();
    const svg = host.querySelector('svg')!;
    const mo = new MutationObserver(() => undefined);
    mo.observe(svg, { attributes: true, childList: true, subtree: true, characterData: true });
    drawn.length = 0;
    for (let i = 1; i <= 30; i++) tick(1_000_000 + i * 67);
    const records = mo.takeRecords();
    mo.disconnect();
    expect(records).toEqual([]);
    expect(drawn.length).toBeGreaterThan(5);
    expect(drawn.some((d) => d.some((b) => b.dx !== 0))).toBe(true);
  });

  it('vent calme : aucune image redessinée après la première', async () => {
    setHillWindForTests(true);
    const f = fakeDriver();
    setPaintedCanvasDriverForTests(f.drv);
    await render(CALM_JULY);
    await settle();
    for (let i = 1; i <= 30; i++) tick(1_000_000 + i * 67);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.every((b) => b.dx === 0 && b.s === 0)).toBe(true);
  });

  it('démontage : le tampon de la toile est rendu', async () => {
    setHillWindForTests(true);
    setPaintedCanvasDriverForTests(fakeDriver().drv);
    await render(JULY);
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

  it('calque après la toile des tranches et avant la vie du fond ; la ville peinte attend son feuillage', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    setHillWindForTests(true);
    setTilePainterForTests(async (p, t) => ({ url: `data:tranche${t}`, profile: null, hill: layersOf(p, t) }));
    const f = fakeDriver((u) => u.startsWith('feuillage'));
    setPaintedCanvasDriverForTests(f.drv);
    await renderCity();
    await settle();
    const tiles = host.querySelector('[data-painted-canvas="ville"]')!;
    const hill = host.querySelector('[data-colline-vent]')!;
    const life = host.querySelector('[data-vie-fond]')!;
    expect(hill).not.toBeNull();
    expect(before(tiles, hill)).toBe(true);
    expect(before(hill, life)).toBe(true);
    const city = host.querySelector('[data-painted-city]') as HTMLElement;
    expect(tiles.getAttribute('data-images')).toBe('2');
    expect(city.getAttribute('data-ready')).toBe('false');
    await f.release(() => true);
    await settle();
    expect(city.getAttribute('data-ready')).toBe('true');
    expect(city.style.opacity).toBe('1');
  });

  it('sans vent (jsdom, mouvement réduit) : aucun calque, la ville se montre comme avant', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    setTilePainterForTests(async (_p, t) => `data:tranche${t}`);
    await renderCity();
    await settle();
    expect(host.querySelector('[data-colline-vent]')).toBeNull();
    expect(host.querySelector('[data-painted-city]')!.getAttribute('data-ready')).toBe('true');
  });
});
