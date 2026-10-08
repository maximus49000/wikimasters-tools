// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import type { SceneId } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const render = (scene: SceneId, minutes: number) =>
  act(() => root.render(<svg><ScenePanorama scene={scene} width={1080} height={340} sky={skyAt(minutes, times)} minutes={minutes} seed={9} /></svg>));

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Espace', () => {
  it('reste étoilé et sans soleil quelle que soit l’heure', () => {
    for (const minutes of [0, 13 * 60]) {
      render('space', minutes);
      expect(container.querySelector('[data-scene-art="space"]')).not.toBeNull();
      expect(container.querySelectorAll('[data-star]').length).toBeGreaterThan(20);
      expect(container.querySelector('[data-sun]')).toBeNull();
      expect(container.querySelector('[data-moon]')).toBeNull();
    }
  });
  it('a un satellite et une sonde', () => {
    render('space', 0);
    expect(container.querySelector('[data-actor][data-kind="satellite"]')).not.toBeNull();
  });
});

describe('Terre vue d’en haut', () => {
  it('montre la planète et la station', () => {
    render('earth', 13 * 60);
    expect(container.querySelector('[data-scene-art="earth"] [data-earth]')).not.toBeNull();
    expect(container.querySelector('[data-actor][data-kind="station"]')).not.toBeNull();
  });
  it('les villes lumineuses du côté nuit suivent l’activité', () => {
    const lit = (m: number): number => { render('earth', m); return container.querySelectorAll('[data-lamp][data-lit="true"]').length; };
    expect(lit(21 * 60)).toBeGreaterThan(lit(4 * 60));
  });
  it('la face éclairée change entre le jour et la nuit', () => {
    render('earth', 13 * 60);
    const day = container.querySelector('[data-earth]')!.getAttribute('fill');
    render('earth', 0);
    expect(container.querySelector('[data-earth]')!.getAttribute('fill')).not.toBe(day);
  });
});
