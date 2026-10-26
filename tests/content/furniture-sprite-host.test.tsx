// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CelPart } from '../../src/core/library/cel/mesh';
import type { CelView } from '../../src/core/library/cel/raster';
import { storedPlacementsOf } from '../../src/core/library/carried-items';
import { FURNITURE_MODELS } from '../../src/core/library/furniture-models';
import { CELL_H, CELL_W, spriteFrameOf } from '../../src/core/library/furniture-render3d';
import type { Layout } from '../../src/core/library/library-types';
import { pxRect, rectOf } from '../../src/core/library/room-grid';
import { paletteOf } from '../../src/core/library/styles';

// Peintre réel, appels relevés : ce que reçoit le moteur (pièces cellulo) et ce qu'il rend.
const painter = vi.hoisted(() => ({ calls: [] as { parts: CelPart[]; view: CelView }[] }));
vi.mock('../../src/content/furniture/sprite-paint', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/content/furniture/sprite-paint')>();
  return {
    ...real,
    spriteJob: (parts: CelPart[], view: CelView, anchor?: readonly [number, number]) => {
      painter.calls.push({ parts, view });
      return real.spriteJob(parts, view, anchor);
    },
  };
});

import { spriteJob } from '../../src/content/furniture/sprite-paint';
import { CarriedSprite, FurnitureSprite, SpriteContext, SpriteRegistry } from '../../src/content/furniture/sprite-host';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const palette = paletteOf('scandinave');
let root: Root | null = null;
let container: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  painter.calls = [];
});

// Registre à images manuelles : `flush` mène toutes les tranches en attente.
function manual(opts: { max?: number; maxBytes?: number } = {}) {
  const queue: (() => void)[] = [];
  const reg = new SpriteRegistry('test', { ...opts, schedule: (cb) => void queue.push(cb) });
  const flush = () => act(() => { while (queue.length) queue.shift()!(); });
  return { reg, queue, flush };
}
function render(reg: SpriteRegistry, el: ReactElement): HTMLElement {
  if (!root) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  act(() => root!.render(<SpriteContext.Provider value={reg}><svg>{el}</svg></SpriteContext.Provider>));
  return container;
}
const num = (el: Element, a: string) => Number(el.getAttribute(a));
// Cadre des polygones du repli (px de pièce, transformation translate + scale du groupe Model3DArt).
function fallbackBox(c: HTMLElement): { x0: number; y0: number; x1: number; y1: number } {
  const g = c.querySelector('[data-sprite-fallback] [data-model3d]')!;
  const [tx, ty, sx, sy] = g.getAttribute('transform')!.match(/-?[\d.]+/g)!.map(Number) as [number, number, number, number];
  const pts = [...g.querySelectorAll('polygon')].flatMap((p) => p.getAttribute('points')!.trim().split(/\s+/).map((q) => q.split(',').map(Number) as [number, number]));
  const xs = pts.map((p) => tx + p[0] * sx), ys = pts.map((p) => ty + p[1] * sy);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

describe('hôte des sprites de meubles', () => {
  it('repli Model3DArt à la même place, puis l’image ; l’ancienne reste au changement de clé', () => {
    const { reg, flush } = manual();
    const rect = pxRect(rectOf({ id: 'l', kind: 'sofa', col: 3, row: 10 })!);
    const c = render(reg, <FurnitureSprite kind="sofa" angle={0} rect={rect} palette={palette} style="scandinave" side="left" />);
    expect(c.querySelector('[data-furniture-sprite] [data-sprite-fallback] [data-model3d]')).not.toBeNull();
    expect(c.querySelector('[data-furniture-sprite] image')).toBeNull();
    const before = fallbackBox(c);
    flush();
    const img = c.querySelector('[data-furniture-sprite] image')!;
    expect(img).not.toBeNull();
    expect(c.querySelector('[data-sprite-fallback]')).toBeNull();
    // Cadre attendu : celui que rend le peintre, posé au point d'ancrage (milieu du bas du rectangle), à l'échelle du rectangle.
    const frame = spriteFrameOf(FURNITURE_MODELS.sofa, 0);
    const { box } = spriteJob(painter.calls[0]!.parts, painter.calls[0]!.view, frame.anchor).finish();
    const [sx, sy] = [rect.w / (frame.cols * CELL_W), rect.h / (frame.rows * CELL_H)];
    expect(num(img, 'x')).toBeCloseTo(rect.x + sx * ((frame.cols * CELL_W) / 2 + box.x), 1);
    expect(num(img, 'y')).toBeCloseTo(rect.y + sy * (frame.rows * CELL_H + box.y), 1);
    expect(num(img, 'width')).toBeCloseTo(box.w * sx, 1);
    expect(num(img, 'height')).toBeCloseTo(box.h * sy, 1);
    // Même place que le repli : le haut et la gauche du dessin à 2,5 px près (l'ombre portée déborde à droite et en bas).
    expect(Math.abs(num(img, 'x') - before.x0)).toBeLessThan(2.5);
    expect(Math.abs(num(img, 'y') - before.y0)).toBeLessThan(2.5);
    expect(num(img, 'x') + num(img, 'width')).toBeGreaterThan(before.x1 - 1);
    expect(num(img, 'y') + num(img, 'height')).toBeGreaterThan(before.y1 - 1);
  });

  it('lampe : l’image reste au changement de clé (allumée → éteinte), même évincée du cache', () => {
    const { reg, flush } = manual({ max: 1 });
    const rect = pxRect(rectOf({ id: 'l', kind: 'lamp', col: 3, row: 10 })!);
    const lamp = (lit: boolean) => <FurnitureSprite kind="lamp" angle={0} rect={rect} palette={palette} style="scandinave" side="left" lit={lit} />;
    const c = render(reg, lamp(true));
    flush();
    expect(c.querySelector('[data-furniture-sprite] image')).not.toBeNull();
    render(reg, lamp(false));
    // Nouvelle clé pas encore peinte : la dernière image reste, pas de repli.
    expect(c.querySelector('[data-furniture-sprite] image')).not.toBeNull();
    expect(c.querySelector('[data-sprite-fallback]')).toBeNull();
    flush();
    // La nouvelle image a évincé l'ancienne (max 1) : retour à l'ancienne clé, l'image éteinte reste en attendant.
    expect(reg.size()).toBe(1);
    render(reg, lamp(true));
    expect(c.querySelector('[data-furniture-sprite] image')).not.toBeNull();
    expect(c.querySelector('[data-sprite-fallback]')).toBeNull();
    flush();
    expect(reg.size()).toBe(1);
  });

  it('une tâche longue est menée sur plusieurs images sans dépasser le budget', () => {
    let clock = 0;
    const queue: (() => void)[] = [];
    const reg = new SpriteRegistry('test', { budgetMs: 6, schedule: (cb) => void queue.push(cb), now: () => clock });
    const budgets: number[] = [];
    let slices = 0;
    const job = () => ({
      step(budget: number) {
        budgets.push(budget);
        clock += 4;
        return ++slices === 3;
      },
      finish: () => ({ url: 'data:image/png;base64,AAAA', box: { x: 0, y: 0, w: 1, h: 1 } }),
    });
    let done = 0;
    reg.want('k', job, () => done++);
    let frames = 0;
    while (queue.length) {
      queue.shift()!();
      frames++;
    }
    expect(done).toBe(1);
    // 3 tranches, puis l'encodage (finish) au début de l'image suivante (tâche 4b).
    expect(frames).toBe(4);
    expect(budgets.every((b) => b <= 6)).toBe(true);
    expect(reg.get('k')!.url).toBe('data:image/png;base64,AAAA');
  });

  it('LRU : au-delà de max ou de maxBytes, la moins récemment lue part', () => {
    const paint = (url: string) => () => ({ step: () => true, finish: () => ({ url, box: { x: 0, y: 0, w: 1, h: 1 } }) });
    const run = (reg: SpriteRegistry, queue: (() => void)[]) => { while (queue.length) queue.shift()!(); };
    const q1: (() => void)[] = [];
    const byCount = new SpriteRegistry('n', { max: 2, maxBytes: 100, schedule: (cb) => void q1.push(cb) });
    byCount.want('a', paint('data:image/png;base64,A'), () => undefined);
    byCount.want('b', paint('data:image/png;base64,B'), () => undefined);
    run(byCount, q1);
    expect(byCount.get('a')).not.toBeNull(); // « a » relue : « b » est la moins récemment lue
    byCount.want('c', paint('data:image/png;base64,C'), () => undefined);
    run(byCount, q1);
    expect([byCount.get('a') !== null, byCount.get('b') !== null, byCount.get('c') !== null]).toEqual([true, false, true]);
    const q2: (() => void)[] = [];
    const byBytes = new SpriteRegistry('o', { max: 2, maxBytes: 100, schedule: (cb) => void q2.push(cb) });
    const big = (c: string) => `data:image/png;base64,${c.repeat(40)}`; // 62 octets
    byBytes.want('a', paint(big('A')), () => undefined);
    run(byBytes, q2);
    byBytes.want('b', paint(big('B')), () => undefined);
    run(byBytes, q2);
    expect(byBytes.get('a')).toBeNull();
    expect(byBytes.get('b')).not.toBeNull();
    expect(byBytes.bytes()).toBeLessThanOrEqual(100);
    expect(byBytes.size()).toBe(1);
  });

  it('aucune URL de carte dans une clé ni dans un peintre', () => {
    const URL = 'https://x/y.jpg';
    const layout: Layout = [
      { id: 's', kind: 'shelf', col: 2, row: 4 },
      ...(['cd', 'book', 'dvd', 'game'] as const).map((shape, i) => ({ id: `c${i}`, kind: 'stored' as const, shape, shelfId: 's', level: 0 as const, order: i, slug: `S${i}` })),
    ];
    const rect = pxRect(rectOf(layout[0]!)!);
    const keys: string[] = [];
    const { reg, flush } = manual();
    const want = reg.want.bind(reg);
    reg.want = (k, job, done) => { keys.push(k); return want(k, job, done); };
    const places = [...storedPlacementsOf(layout, 's').values()];
    const c = render(reg, (
      <>
        <FurnitureSprite kind="shelf" angle={0} rect={rect} palette={palette} style="scandinave" side="right" />
        {places.map((pl) => <CarriedSprite key={pl.key} host="shelf" angle={0} rect={rect} placement={pl} palette={palette} content={{ url: URL, title: 'T' }} style="scandinave" side="right" />)}
      </>
    ));
    flush();
    expect(keys.length).toBe(1 + places.length);
    for (const k of keys) expect(k).not.toContain('http');
    expect(painter.calls.length).toBe(1 + places.length);
    for (const { parts } of painter.calls) expect(JSON.stringify(parts)).not.toContain('http');
    // La couverture est bien là, en SVG par-dessus l'image peinte.
    expect([...c.querySelectorAll('image')].some((i) => i.getAttribute('href') === URL)).toBe(true);
  });

  it('jamais de blob:', () => {
    const { reg, flush } = manual();
    const rect = pxRect(rectOf({ id: 'd', kind: 'desk', col: 3, row: 10 })!);
    const c = render(reg, (
      <>
        <FurnitureSprite kind="desk" angle={1} rect={rect} palette={palette} style="scandinave" side="left" />
        <CarriedSprite host="desk" angle={1} rect={rect} placement={{ key: 'm', shape: 'monitor', x: 40, y: 75, z: 20 }} palette={palette} style="scandinave" side="left" />
      </>
    ));
    flush();
    const sprites = [...c.querySelectorAll('[data-furniture-sprite] > image, image[data-sprite-image]')];
    expect(sprites.length).toBe(2);
    for (const i of sprites) expect(i.getAttribute('href')!.startsWith('data:image/png')).toBe(true);
  });
});
