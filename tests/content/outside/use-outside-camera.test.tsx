// @vitest-environment jsdom
import { act, createElement, useRef, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOutsideCamera, type OutsidePhase } from '../../../src/content/outside/use-outside-camera';
import type { Rect } from '../../../src/core/library/outside-camera';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Props = { phase: OutsidePhase; from: Rect | null; windows: readonly Rect[]; onSettled: (p: 'outside' | 'inside') => void };
const WORLD = { w: 1440, h: 340 };

// Temps et images manuels : une file d'images, une horloge pilotée par flush().
let now = 0;
let nextId = 1;
let frames = new Map<number, FrameRequestCallback>();
let boxSize = { w: 720, h: 340 };
let rects = new Map<Element, { x: number; y: number; w: number; h: number }>();
let reducedMotionOn = false;
let cancelSpy: ReturnType<typeof vi.fn>;

function flush(ms: number): void {
  const end = now + ms;
  while (now < end) {
    now = Math.min(now + 16, end);
    const batch = [...frames.entries()];
    frames = new Map();
    for (const [, f] of batch) f(now);
  }
}
const flushMicrotasks = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

function Harness(p: Props): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideCamera({ svg: () => ref.current?.querySelector<SVGSVGElement>('svg[role="img"]') ?? null, box: () => ref.current, world: WORLD, ...p });
  return createElement('div', {
    'data-box': '',
    ref,
    dangerouslySetInnerHTML: {
      __html:
        '<svg role="img"><svg data-window-views=""><g data-life-id="p"></g><g data-follow-marker="" opacity="0"></g></svg></svg><button type="button">ok</button>',
    },
  });
}

let host: HTMLDivElement;
let root: Root;
function render(p: Props): void {
  act(() => root.render(createElement(Harness, p)));
}
const svg = (): SVGSVGElement => host.querySelector<SVGSVGElement>('svg[role="img"]')!;
const box = (): HTMLElement => host.querySelector<HTMLElement>('[data-box]')!;
const marker = (): Element => host.querySelector('[data-follow-marker]')!;
const figure = (): Element => host.querySelector('[data-life-id]')!;
const vb = (): number[] => svg().getAttribute('viewBox')!.split(' ').map(Number);
const reduced = (on: boolean): void => {
  reducedMotionOn = on;
};

function pointer(target: Element, type: string, x: number, y: number, id = 1): void {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(e, 'pointerId', { value: id });
  target.dispatchEvent(e);
}
const tap = (x: number, y: number): void => {
  pointer(box(), 'pointerdown', x, y);
  pointer(box(), 'pointerup', x, y);
};
const wheel = (x: number, y: number, deltaY: number): void => {
  box().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY }));
};

// Sort (réduit) puis passe en phase « dehors » : caméra initiale au centre du monde (x = 360).
async function goOutside(): Promise<void> {
  reduced(true);
  const settled = vi.fn();
  render({ phase: 'leaving', from: null, windows: [], onSettled: settled });
  await flushMicrotasks();
  render({ phase: 'outside', from: null, windows: [], onSettled: settled });
}

beforeEach(() => {
  now = 0;
  nextId = 1;
  frames = new Map();
  boxSize = { w: 720, h: 340 };
  rects = new Map();
  reducedMotionOn = false;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback): number => {
    const id = nextId++;
    frames.set(id, f);
    return id;
  });
  cancelSpy = vi.fn((id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal('cancelAnimationFrame', cancelSpy);
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotionOn, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const r = this.hasAttribute('data-box') || this.getAttribute('role') === 'img' ? { x: 0, y: 0, w: boxSize.w, h: boxSize.h } : (rects.get(this) ?? { x: 0, y: 0, w: 0, h: 0 });
    return { left: r.x, top: r.y, right: r.x + r.w, bottom: r.y + r.h, width: r.w, height: r.h, x: r.x, y: r.y, toJSON: () => ({}) } as DOMRect;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useOutsideCamera', () => {
  it('sortir sans animation : cadre initial sur la fenêtre la plus proche, puis onSettled("outside")', async () => {
    reduced(true);
    const settled = vi.fn();
    render({ phase: 'leaving', from: { x: 800, y: 0, w: 720, h: 510 }, windows: [{ x: 900, y: 30, w: 240, h: 150 }], onSettled: settled });
    await flushMicrotasks();
    expect(svg().getAttribute('viewBox')).toBe('660.00 0.00 720.00 340.00');
    expect(settled).toHaveBeenCalledWith('outside');
  });

  it('sortir avec animation : le viewBox glisse en 600 ms', async () => {
    reduced(false);
    const settled = vi.fn();
    render({ phase: 'leaving', from: { x: 0, y: 0, w: 720, h: 510 }, windows: [], onSettled: settled });
    flush(300);
    const mid = vb();
    expect(mid[0]).toBeGreaterThan(0);
    expect(mid[0]).toBeLessThan(360);
    flush(400);
    await flushMicrotasks();
    expect(svg().getAttribute('viewBox')).toBe('360.00 0.00 720.00 340.00');
    expect(settled).toHaveBeenCalledWith('outside');
  });

  it('dehors : glisser déplace, la molette zoome autour du curseur, bornée à ×4', async () => {
    await goOutside();
    expect(vb()[0]).toBe(360);
    pointer(box(), 'pointerdown', 400, 170);
    pointer(box(), 'pointermove', 300, 170);
    pointer(box(), 'pointerup', 300, 170);
    expect(vb()[0]).toBe(460);
    for (let i = 0; i < 20; i++) wheel(360, 170, -100);
    expect(vb()[3]).toBe(85);
    wheel(360, 170, 100);
    expect(vb()[3]).toBeGreaterThan(85);
  });

  it('appui sur un personnage : suivi + repère ; glisser l’arrête', async () => {
    await goOutside();
    rects.set(figure(), { x: 600, y: 150, w: 20, h: 40 });
    tap(610, 170);
    expect(marker().getAttribute('opacity')).toBe('1');
    const x0 = vb()[0]!;
    for (let i = 0; i < 10; i++) flush(16);
    const x1 = vb()[0]!;
    expect(x1).toBeGreaterThan(x0);
    expect(x1).toBeLessThanOrEqual(610);
    expect(marker().getAttribute('transform')).toMatch(/^translate\(/);
    pointer(box(), 'pointerdown', 100, 100);
    pointer(box(), 'pointermove', 120, 100);
    expect(marker().getAttribute('opacity')).toBe('0');
    expect(frames.size).toBe(0);
  });

  it('sans point de tête disponible (art classique, jsdom) : repère posé sur le haut de la boîte, 4 unités au-dessus', async () => {
    await goOutside();
    rects.set(figure(), { x: 600, y: 150, w: 20, h: 40 });
    tap(610, 170);
    // Caméra initiale x = 360, zoom 1 : haut de la boîte (610, 150) -> monde (970, 150), repère à y - 4.
    expect(marker().getAttribute('transform')).toBe('translate(970.0 146.0)');
  });

  it('personnage caché plus d’1 s : le suivi s’arrête', async () => {
    await goOutside();
    rects.set(figure(), { x: 600, y: 150, w: 20, h: 40 });
    tap(610, 170);
    expect(marker().getAttribute('opacity')).toBe('1');
    rects.set(figure(), { x: 0, y: 0, w: 0, h: 0 });
    flush(1100);
    expect(marker().getAttribute('opacity')).toBe('0');
    expect(frames.size).toBe(0);
  });

  it('double appui : zoom ×2,5 autour du point, puis retour ×1', async () => {
    await goOutside();
    tap(300, 170);
    tap(300, 170);
    flush(300);
    expect(vb()[3]).toBe(136);
    tap(300, 170);
    tap(300, 170);
    flush(300);
    expect(vb()[3]).toBe(340);
  });

  it('pointerdown sur un bouton ignoré', async () => {
    await goOutside();
    rects.set(figure(), { x: 600, y: 150, w: 20, h: 40 });
    const before = svg().getAttribute('viewBox');
    const button = host.querySelector('button')!;
    pointer(button, 'pointerdown', 610, 170);
    pointer(button, 'pointerup', 610, 170);
    expect(svg().getAttribute('viewBox')).toBe(before);
    expect(marker().getAttribute('opacity')).toBe('0');
    expect(frames.size).toBe(0);
  });

  it('resize re-borne la caméra', async () => {
    await goOutside();
    pointer(box(), 'pointerdown', 500, 100);
    pointer(box(), 'pointermove', 140, 100);
    pointer(box(), 'pointerup', 140, 100);
    expect(svg().getAttribute('viewBox')).toBe('720.00 0.00 720.00 340.00');
    boxSize = { w: 1440, h: 340 };
    window.dispatchEvent(new Event('resize'));
    expect(svg().getAttribute('viewBox')).toBe('0.00 0.00 1440.00 340.00');
  });

  it('rentrer : anime vers from puis onSettled("inside") ; démontage = plus aucune image programmée', async () => {
    await goOutside();
    const settled = vi.fn();
    const from = { x: 0, y: 0, w: 720, h: 510 };
    reduced(false);
    render({ phase: 'returning', from, windows: [], onSettled: settled });
    flush(700);
    await flushMicrotasks();
    expect(svg().getAttribute('viewBox')).toBe('0.00 0.00 720.00 510.00');
    expect(settled).toHaveBeenCalledWith('inside');

    render({ phase: 'inside', from: null, windows: [], onSettled: settled });
    render({ phase: 'leaving', from, windows: [], onSettled: settled });
    flush(300);
    expect(frames.size).toBe(1);
    act(() => root.unmount());
    expect(frames.size).toBe(0);
    expect(cancelSpy).toHaveBeenCalled();
    root = createRoot(host);
  });

  it('boîte 0×0 : ne plante pas, règle sans écrire de viewBox', async () => {
    reduced(true);
    boxSize = { w: 0, h: 0 };
    const settled = vi.fn();
    render({ phase: 'leaving', from: null, windows: [], onSettled: settled });
    await flushMicrotasks();
    expect(settled).toHaveBeenCalledWith('outside');
    render({ phase: 'outside', from: null, windows: [], onSettled: settled });
    tap(10, 10);
    expect(svg().hasAttribute('viewBox')).toBe(false);
  });
});
