// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWallClockLoop } from '../../src/content/use-wallclock-loop';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let pending: ((ms: number) => void) | null;
let cancelled: number[];
let frames: number;
let visibility: DocumentVisibilityState;

function Probe({ place, frameMs }: { place: (t: number) => void; frameMs?: number }): null {
  useWallClockLoop(place, [place], { frameMs });
  return null;
}

const reducedMotion = (reduce: boolean): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
};
const runFrame = (ms: number): void => {
  const cb = pending;
  pending = null;
  act(() => cb?.(ms));
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  pending = null;
  cancelled = [];
  frames = 0;
  visibility = 'visible';
  vi.stubGlobal('requestAnimationFrame', (cb: (ms: number) => void) => {
    pending = cb;
    return ++frames;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelled.push(id);
  });
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  reducedMotion(false);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useWallClockLoop', () => {
  it('place tout de suite à l’heure murale, puis à chaque image espacée d’au moins frameMs', () => {
    const place = vi.fn();
    act(() => root.render(<Probe place={place} frameMs={33} />));
    expect(place).toHaveBeenCalledTimes(1);
    expect(place).toHaveBeenLastCalledWith(1000);
    runFrame(40);
    expect(place).toHaveBeenCalledTimes(2);
    runFrame(50); // 10 ms après : trop tôt
    expect(place).toHaveBeenCalledTimes(2);
    runFrame(80);
    expect(place).toHaveBeenCalledTimes(3);
  });

  it('ne boucle pas quand l’utilisateur préfère réduire les animations (un seul placement)', () => {
    reducedMotion(true);
    const place = vi.fn();
    act(() => root.render(<Probe place={place} />));
    expect(place).toHaveBeenCalledTimes(1);
    expect(frames).toBe(0);
  });

  it('se met en pause quand la page est cachée et reprend ensuite', () => {
    const place = vi.fn();
    act(() => root.render(<Probe place={place} />));
    visibility = 'hidden';
    runFrame(100);
    runFrame(200);
    expect(place).toHaveBeenCalledTimes(1);
    expect(pending).not.toBeNull(); // la boucle reste armée
    visibility = 'visible';
    runFrame(300);
    expect(place).toHaveBeenCalledTimes(2);
  });

  it('annule l’image en attente au démontage', () => {
    const place = vi.fn();
    act(() => root.render(<Probe place={place} />));
    runFrame(100);
    const last = frames;
    act(() => root.render(<></>));
    expect(cancelled).toContain(last);
  });
});
