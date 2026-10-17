// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameBox } from '../../src/content/game-box-service';
import { BackMagnifier } from '../../src/content/opened-item/back-magnifier';
import { caseStyleOfPlatformName } from '../../src/core/game/platform-boxes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RDR2: GameBox = {
  format: 'bluray', style: caseStyleOfPlatformName('Sony Playstation 4'), platformName: 'Sony Playstation 4',
  frontUrl: 'https://img/front.jpg', backUrl: 'https://img/medium/back.jpg', backFullUrl: 'https://img/original/back.jpg', shots: [], title: 'Red Dead Redemption 2',
};
const HOLLOW: GameBox = {
  format: 'switch', style: caseStyleOfPlatformName('Nintendo Switch'), platformName: 'Nintendo Switch',
  frontUrl: 'https://img/hk.jpg', shots: [], title: 'Hollow Knight', summary: 'Sous la ville déchue d’Hallownest, un chevalier explore un royaume oublié.',
};

let container: HTMLDivElement;
let root: Root;
const render = (el: ReactElement) => act(() => root.render(el));
const q = <E extends Element = HTMLElement>(s: string) => container.querySelector<E>(s as never) as E | null;
const stage = () => q('[data-magnifier-stage]')!;
const scale = () => Number(stage().dataset.scale);
const pan = () => ({ x: Number(stage().dataset.tx), y: Number(stage().dataset.ty) });
// Événement pointeur (jsdom n'a pas PointerEvent) : un MouseEvent qui porte pointerId.
const ptr = (type: string, id: number, x: number, y: number) => act(() => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(e, 'pointerId', { value: id });
  Object.defineProperty(e, 'pointerType', { value: 'touch' });
  stage().dispatchEvent(e);
});
// Zone d'affichage de 800 × 400 (jsdom ne mesure rien).
const sized = () => {
  Object.defineProperty(stage(), 'clientWidth', { configurable: true, value: 800 });
  Object.defineProperty(stage(), 'clientHeight', { configurable: true, value: 400 });
  stage().getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 400, width: 800, height: 400, x: 0, y: 0, toJSON: () => ({}) });
};
// Pincement centré sur la zone : les deux doigts passent d'un écart `from` à un écart `to`.
const pinch = (from: number, to: number) => {
  ptr('pointerdown', 1, 400 - from / 2, 200);
  ptr('pointerdown', 2, 400 + from / 2, 200);
  ptr('pointermove', 1, 400 - to / 2, 200);
  ptr('pointermove', 2, 400 + to / 2, 200);
  ptr('pointerup', 1, 400 - to / 2, 200);
  ptr('pointerup', 2, 400 + to / 2, 200);
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.assign(window, { innerWidth: 800, innerHeight: 400 });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('BackMagnifier (loupe sur le dos)', () => {
  it('s’ouvre à l’échelle 1, dos entier ajusté (contain) ; image originale, repli medium pendant le chargement', () => {
    render(<BackMagnifier box={RDR2} onClose={vi.fn()} />);
    expect(scale()).toBe(1);
    const low = q<HTMLImageElement>('img[data-magnifier-img="low"]')!;
    const full = q<HTMLImageElement>('img[data-magnifier-img="full"]')!;
    expect(low.getAttribute('src')).toBe('https://img/medium/back.jpg');
    expect(full.getAttribute('src')).toBe('https://img/original/back.jpg');
    expect(low.style.objectFit).toBe('contain');
    expect(full.style.objectFit).toBe('contain');
    // Tant que l'originale charge, c'est la medium qu'on voit.
    expect(full.style.opacity).toBe('0');
    act(() => { full.dispatchEvent(new Event('load')); });
    expect(full.style.opacity).toBe('1');
  });
  it('originale en erreur : la medium reste ; les deux en erreur : dos fabriqué', () => {
    render(<BackMagnifier box={RDR2} onClose={vi.fn()} />);
    act(() => { q('img[data-magnifier-img="full"]')!.dispatchEvent(new Event('error')); });
    expect(q('img[data-magnifier-img="full"]')).toBeNull();
    expect(q('img[data-magnifier-img="low"]')).not.toBeNull();
    act(() => { q('img[data-magnifier-img="low"]')!.dispatchEvent(new Event('error')); });
    expect(q('[data-made-back]')).not.toBeNull();
  });
  it('deux doigts qui s’écartent ×2 → échelle 2 ; au plus 6, au moins 1', () => {
    render(<BackMagnifier box={RDR2} onClose={vi.fn()} />);
    sized();
    pinch(100, 200);
    expect(scale()).toBeCloseTo(2, 5);
    pinch(100, 1000);
    expect(scale()).toBe(6);
    pinch(400, 10);
    expect(scale()).toBe(1);
  });
  it('glisser une fois zoomé déplace, borné aux bords du dos ; à 1× rien ne bouge', () => {
    render(<BackMagnifier box={RDR2} onClose={vi.fn()} />);
    sized();
    ptr('pointerdown', 1, 400, 200);
    ptr('pointermove', 1, 500, 260);
    ptr('pointerup', 1, 500, 260);
    expect(pan()).toEqual({ x: 0, y: 0 });
    pinch(100, 300);
    expect(scale()).toBeCloseTo(3, 5);
    ptr('pointerdown', 1, 400, 200);
    ptr('pointermove', 1, 430, 200);
    expect(pan().x).toBeCloseTo(30, 5);
    ptr('pointermove', 1, 5000, 5000);
    ptr('pointerup', 1, 5000, 5000);
    // Dos Blu-ray (≈ 0,8 : 1) ajusté dans 800 × 400 → ≈ 320 × 400 ; à 3× : ≈ 960 × 1200, donc au plus ±80 et ±400.
    const p = pan();
    expect(p.x).toBeGreaterThan(60);
    expect(p.x).toBeLessThan(100);
    expect(p.y).toBeCloseTo(400, 0);
  });
  it('double toucher → retour à 1×, au centre', () => {
    render(<BackMagnifier box={RDR2} onClose={vi.fn()} />);
    sized();
    pinch(100, 250);
    expect(scale()).toBeCloseTo(2.5, 5);
    ptr('pointerdown', 1, 300, 200);
    ptr('pointerup', 1, 300, 200);
    ptr('pointerdown', 1, 302, 201);
    ptr('pointerup', 1, 302, 201);
    expect(scale()).toBe(1);
    expect(pan()).toEqual({ x: 0, y: 0 });
  });
  it('✕ et Échap appellent onClose', () => {
    const onClose = vi.fn();
    render(<BackMagnifier box={RDR2} onClose={onClose} />);
    const x = q<HTMLButtonElement>('button[data-action="close-magnifier"]')!;
    expect(x.textContent).toBe('✕');
    act(() => x.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it('dos fabriqué : la loupe montre MadeBack agrandi (titre, description)', () => {
    render(<BackMagnifier box={HOLLOW} onClose={vi.fn()} />);
    const made = q('[data-magnifier-stage] [data-made-back]')!;
    expect(made).not.toBeNull();
    expect(made.querySelector('[data-made-back-summary]')!.textContent).toContain('Hallownest');
    expect(q('img[data-magnifier-img]')).toBeNull();
    // Le dessin remplit la zone (ajusté sans déformation).
    const svg = made.closest('svg')!;
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(svg.getAttribute('width')).toBe('100%');
  });
});
