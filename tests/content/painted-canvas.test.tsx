// @vitest-environment jsdom
// tests/content/painted-canvas.test.tsx — toile des images peintes (tranches de la ville, neige posée) étalonnée aux pixels :
// rendu sans canvas (jsdom : rien n'est dessiné), arrondi de l'étalonnage, et avec un pilote factice (décodage commandé, faux
// contexte qui enregistre les dessins) : jamais de toile à moitié vide, l'ancienne image reste jusqu'à la nouvelle, `onReady`
// seulement après le dessin.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAINTED_DECODE_TRIES, PaintedCanvas, gradeKey, resetPaintedCanvasForTests, setPaintedCanvasDriverForTests, type CanvasImage, type PaintedCanvasDriver } from '../../src/content/painted-canvas';
import { gradeFor, gradeValues, type Grade } from '../../src/core/library/paint/grade';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  resetPaintedCanvasForTests();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setPaintedCanvasDriverForTests(null);
  vi.restoreAllMocks();
});

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
const BOX = { x: 0, y: 0, w: 720, h: 340 };
const tile = (x: number, url: string): CanvasImage => ({ x, y: 0, w: 360, h: 340, url });
const render = (images: CanvasImage[], grade: Grade | null = null, onReady?: (r: boolean) => void): void =>
  act(() => root.render(<svg><PaintedCanvas box={BOX} images={images} grade={grade} onReady={onReady} tag="ville" /></svg>));
const fo = () => host.querySelector('[data-painted-canvas="ville"]')!;

// Pilote factice : chaque décodage attend qu'on le libère (`release(url)`, ou `fail(url)` pour un échec) ; la source est un
// objet nommé par l'url (étalonnée : nommée `url@grade`) ; le faux contexte enregistre effacements et dessins.
type Src = { name: string };
function fakeDriver(opts: { gradeGate?: boolean; gradeAs?: (name: string) => CanvasImageSource | null; noContext?: boolean } = {}) {
  const waiting = new Map<string, { ok: (s: Src) => void; ko: (e: Error) => void }[]>();
  const gradeWaiting: (() => void)[] = [];
  const log: string[] = [];
  const decodes: string[] = [];
  const ctx = {
    setTransform: () => undefined,
    clearRect: () => void log.push('clear'),
    drawImage: (s: Src, x: number) => void log.push(`draw ${s.name ?? (s as unknown as HTMLElement).dataset?.name} @${x}`),
    globalAlpha: 1,
  };
  const drv: PaintedCanvasDriver = {
    decode: (url) =>
      new Promise((ok, ko) => {
        decodes.push(url);
        waiting.set(url, [...(waiting.get(url) ?? []), { ok: ok as (s: Src) => void, ko }]);
      }) as never,
    grade: (src, g) => {
      const name = `${(src as unknown as Src).name}@${g[0]!.toFixed(2)}`;
      const out = opts.gradeAs ? opts.gradeAs(name) : ({ name } as unknown as CanvasImageSource);
      if (!opts.gradeGate) return out;
      return new Promise((ok) => gradeWaiting.push(() => ok(out)));
    },
    context: () => (opts.noContext ? null : (ctx as unknown as CanvasRenderingContext2D)),
  };
  const pop = (url: string) => {
    const w = waiting.get(url) ?? [];
    waiting.delete(url);
    return w;
  };
  return {
    drv,
    log,
    decodes,
    release: (url: string) => act(async () => { pop(url).forEach((w) => w.ok({ name: url })); }),
    fail: (url: string) => act(async () => { pop(url).forEach((w) => w.ko(new Error('indécodable'))); }),
    releaseGrades: () => act(async () => { gradeWaiting.splice(0).forEach((f) => f()); }),
  };
}

describe('gradeKey', () => {
  it('arrondi au vingtième, comme les arbres de la rue', () => {
    expect(gradeKey(0.512, 0.02, false).key).toBe(gradeKey(0.5, 0, false).key);
    expect(gradeKey(0.53, 0.02, false).grade).toEqual(gradeFor(0.55, 0, false));
    expect(gradeKey(0.3, 0.4, true).key).not.toBe(gradeKey(0.3, 0.4, false).key);
  });
  it('plein jour sans voile : identité (null) ; nuit, crépuscule, ciel couvert : une matrice', () => {
    expect(gradeKey(1, 0, false).grade).toBeNull();
    expect(gradeKey(0.99, 0.01, false).grade).toBeNull();
    expect(gradeKey(1, 0, true).grade).toEqual(gradeFor(1, 0, true));
    expect(gradeKey(0.1, 0, false).grade).not.toBeNull();
    expect(gradeKey(1, 0.5, false).grade).not.toBeNull();
  });
});

describe('toile des images peintes', () => {
  it('sans canvas (jsdom) : la toile est rendue, rien n\'est dessiné, les images sont comptées et la toile est prête', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const ready: boolean[] = [];
    render([tile(0, 'data:a'), tile(360, 'data:b')], gradeFor(0.2, 0, false), (r) => ready.push(r));
    await settle();
    expect(fo().tagName.toLowerCase()).toBe('foreignobject');
    expect(fo().querySelectorAll('canvas')).toHaveLength(1);
    expect(fo().getAttribute('width')).toBe('720');
    expect(fo().getAttribute('data-images')).toBe('2');
    expect(fo().getAttribute('data-grade')).toBe(gradeValues(gradeFor(0.2, 0, false)));
    expect(getContext).not.toHaveBeenCalled();
    expect(ready.at(-1)).toBe(true);
    expect(host.querySelector('image, feColorMatrix, filter')).toBeNull();
  });

  it('onReady ne passe à vrai qu\'après le dessin de TOUTES les images, d\'un coup', async () => {
    const f = fakeDriver();
    setPaintedCanvasDriverForTests(f.drv);
    const ready: boolean[] = [];
    render([tile(0, 'a'), tile(360, 'b')], null, (r) => ready.push(r));
    await settle();
    expect(ready).toEqual([false]);
    await f.release('a');
    await settle();
    // Une seule image décodée : rien n'est dessiné (jamais une toile à moitié vide).
    expect(f.log).toEqual([]);
    expect(ready.at(-1)).toBe(false);
    await f.release('b');
    await settle();
    expect(f.log).toEqual(['clear', 'draw a @0', 'draw b @360']);
    expect(ready.at(-1)).toBe(true);
    expect(fo().getAttribute('data-images')).toBe('2');
    expect(fo().getAttribute('data-grade')).toBe('identite');
  });

  it('onDrawn : urls posées, annoncées seulement après le dessin', async () => {
    const f = fakeDriver();
    setPaintedCanvasDriverForTests(f.drv);
    const seen: (readonly string[])[] = [];
    const show = (images: CanvasImage[]) => act(() => root.render(<svg><PaintedCanvas box={BOX} images={images} grade={null} onDrawn={(u) => seen.push(u)} tag="ville" /></svg>));
    show([tile(0, 'a'), tile(360, 'b')]);
    await f.release('a');
    await f.release('b');
    await settle();
    expect(seen).toEqual([['a', 'b']]);
    show([tile(0, 'a'), tile(360, 'c')]);
    await settle();
    expect(seen).toHaveLength(1);
    await f.release('c');
    await settle();
    expect(seen.at(-1)).toEqual(['a', 'c']);
  });

  it('tranche remplacée : l\'ancienne image reste dessinée jusqu\'au décodage de la nouvelle, la toile reste prête', async () => {
    const f = fakeDriver();
    setPaintedCanvasDriverForTests(f.drv);
    const ready: boolean[] = [];
    render([tile(0, 'a'), tile(360, 'b')], null, (r) => ready.push(r));
    await f.release('a');
    await f.release('b');
    await settle();
    f.log.length = 0;
    render([tile(0, 'a'), tile(360, 'c')], null, (r) => ready.push(r));
    await settle();
    // Pendant le décodage de la nouvelle tranche : la toile n'est pas touchée (ni effacée ni redessinée), toujours prête.
    expect(f.log).toEqual([]);
    expect(ready.at(-1)).toBe(true);
    expect(fo().getAttribute('data-images')).toBe('2');
    await f.release('c');
    await settle();
    expect(f.log).toEqual(['clear', 'draw a @0', 'draw c @360']);
    // L'image déjà décodée n'est pas redécodée.
    expect(f.decodes.filter((u) => u === 'a')).toHaveLength(1);
  });

  it('nouvel arrondi d\'étalonnage : l\'ancienne teinte reste jusqu\'aux copies étalonnées, puis tout est redessiné d\'un coup', async () => {
    const f = fakeDriver({ gradeGate: true });
    setPaintedCanvasDriverForTests(f.drv);
    const ready: boolean[] = [];
    render([tile(0, 'a'), tile(360, 'b')], null, (r) => ready.push(r));
    await f.release('a');
    await f.release('b');
    await settle();
    f.log.length = 0;
    const night = gradeFor(0.1, 0, false);
    render([tile(0, 'a'), tile(360, 'b')], night, (r) => ready.push(r));
    await settle();
    expect(f.log).toEqual([]);
    expect(ready.at(-1)).toBe(true);
    expect(fo().getAttribute('data-grade')).toBe('identite');
    await f.releaseGrades();
    await settle();
    const tag = night[0]!.toFixed(2);
    expect(f.log).toEqual(['clear', `draw a@${tag} @0`, `draw b@${tag} @360`]);
    expect(fo().getAttribute('data-grade')).toBe(gradeValues(night));
  });

  it(`décodage raté ${PAINTED_DECODE_TRIES} fois : l'ancienne image de la même place reste`, async () => {
    const f = fakeDriver();
    setPaintedCanvasDriverForTests(f.drv);
    render([tile(0, 'a'), tile(360, 'b')]);
    await f.release('a');
    await f.release('b');
    await settle();
    f.log.length = 0;
    render([tile(0, 'a'), tile(360, 'x')]);
    for (let i = 0; i < PAINTED_DECODE_TRIES; i++) {
      await settle();
      await f.fail('x');
    }
    await settle();
    expect(f.decodes.filter((u) => u === 'x')).toHaveLength(PAINTED_DECODE_TRIES);
    expect(f.log).toEqual(['clear', 'draw a @0', 'draw b @360']);
  });

  it('démontage : le tampon de la toile est rendu (largeur et hauteur 0)', async () => {
    const f = fakeDriver();
    setPaintedCanvasDriverForTests(f.drv);
    render([tile(0, 'a'), tile(360, 'b')]);
    await f.release('a');
    await f.release('b');
    await settle();
    const cv = fo().querySelector('canvas')!;
    expect(cv.width).toBe(720);
    act(() => root.render(<svg />));
    expect(cv.width).toBe(0);
    expect(cv.height).toBe(0);
  });

  it('copie étalonnée sortie du cache et montrée nulle part : son tampon est rendu ; la copie montrée est gardée', async () => {
    const made = new Map<string, HTMLCanvasElement>();
    const f = fakeDriver({
      gradeAs: (name) => {
        const c = document.createElement('canvas');
        c.width = 5;
        c.height = 5;
        c.dataset.name = name;
        made.set(name, c);
        return c;
      },
    });
    setPaintedCanvasDriverForTests(f.drv);
    const steps = [0.1, 0.3, 0.6].map((d) => gradeFor(d, 0, false));
    render([tile(0, 'a')], steps[0]!);
    await f.release('a');
    await settle();
    render([tile(0, 'a')], steps[1]!);
    await settle();
    render([tile(0, 'a')], steps[2]!);
    await settle();
    const of = (g: Grade) => made.get(`a@${g[0]!.toFixed(2)}`)!;
    // Au plus 2 copies par image : la première est sortie du cache et n'est plus montrée.
    expect(of(steps[0]!).width).toBe(0);
    expect(of(steps[1]!).width).toBe(5);
    expect(of(steps[2]!).width).toBe(5);
  });

  it("étalonnage raté : l'image non étalonnée est dessinée, la place compte comme réglée", async () => {
    const f = fakeDriver({ gradeAs: () => null });
    setPaintedCanvasDriverForTests(f.drv);
    const ready: boolean[] = [];
    render([tile(0, 'a')], gradeFor(0.1, 0, false), (r) => ready.push(r));
    await f.release('a');
    await settle();
    expect(f.log).toEqual(['clear', 'draw a @0']);
    expect(ready.at(-1)).toBe(true);
  });

  it("vraie toile sans contexte 2D : rien n'est noté comme dessiné, la toile n'est pas prête", async () => {
    const f = fakeDriver({ noContext: true });
    setPaintedCanvasDriverForTests(f.drv);
    const ready: boolean[] = [];
    render([tile(0, 'a')], null, (r) => ready.push(r));
    await f.release('a');
    await settle();
    expect(ready.at(-1)).toBe(false);
    expect(fo().getAttribute('data-images')).toBe('0');
  });
});
