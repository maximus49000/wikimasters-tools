// @vitest-environment jsdom
// tests/content/ghibli-sky.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeArt } from '../../src/content/art-setting';
import { resetPaintQueueForTests, setJobRunnerForTests } from '../../src/content/paint-queue';
import { ScenePanoramaStatic } from '../../src/content/scene-panorama';
import type { SceneId } from '../../src/core/library/library-types';
import type { Sky } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const DAY: Sky = { phase: 'day', daylight: 1, twilight: 0, sunFrac: 0.5, moonFrac: null, stars: 0, top: '#6FB1E8', bottom: '#BFE0F5' };
const NIGHT: Sky = { phase: 'night', daylight: 0, twilight: 0, sunFrac: null, moonFrac: 0.5, stars: 1, top: '#0B1030', bottom: '#1A2350' };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetPaintQueueForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setJobRunnerForTests(null);
  localStorage.clear();
  vi.useRealTimers();
});
const flush = async (): Promise<void> => {
  for (let i = 0; i < 40; i++) await act(async () => { await vi.advanceTimersByTimeAsync(20); });
};
const mount = (scene: SceneId, sky: Sky = DAY): void =>
  act(() => root.render(<svg><ScenePanoramaStatic scene={scene} width={720} height={340} sky={sky} minutes={720} seed={1} /></svg>));
const q = (sel: string): SVGElement | null => container.querySelector<SVGElement>(sel);
const op = (sel: string): string => q(sel)?.style.opacity ?? '';

describe('ciel peint de la Ville', () => {
  it('sous jsdom sans peintre : ciel actuel seulement', async () => {
    writeArt('ghibli');
    mount('city');
    await flush();
    expect(q('[data-sky-texture]')).toBeNull();
    expect(q('[data-sun]')).not.toBeNull();
  });

  it('Ghibli : texture, soleil peint, soleil actuel effacé', async () => {
    setJobRunnerForTests(async (j) => `data:image/png;base64,${btoa(j.key)}`);
    writeArt('ghibli');
    mount('city');
    await flush();
    expect(op('[data-sky-texture]')).toBe('1');
    expect(q('[data-ghibli-sun] image')).not.toBeNull();
    expect(op('[data-classic-sun]')).toBe('0');
  });

  it('Ghibli la nuit : lune peinte et croix d’étoiles', async () => {
    setJobRunnerForTests(async (j) => `data:image/png;base64,${btoa(j.key)}`);
    writeArt('ghibli');
    mount('city', NIGHT);
    await flush();
    expect(q('[data-ghibli-moon] image')).not.toBeNull();
    expect(container.querySelectorAll('[data-star-crosses] path').length).toBeGreaterThan(0);
  });

  it('autres scènes et graphisme classique : inchangés', async () => {
    setJobRunnerForTests(async (j) => `data:image/png;base64,${btoa(j.key)}`);
    writeArt('ghibli');
    mount('countryside');
    await flush();
    expect(q('[data-sky-texture]')).toBeNull();
    writeArt('classic');
    mount('city');
    await flush();
    expect(q('[data-sky-texture]')).toBeNull();
    expect(q('[data-ghibli-sun]')).toBeNull();
  });

  it('classique après Ghibli : le peint s’efface, l’actuel revient', async () => {
    setJobRunnerForTests(async (j) => `data:image/png;base64,${btoa(j.key)}`);
    writeArt('ghibli');
    mount('city');
    await flush();
    act(() => writeArt('classic'));
    await flush();
    expect(op('[data-classic-sun]')).toBe('1');
    expect(['0', '']).toContain(op('[data-sky-texture]'));
  });
});
