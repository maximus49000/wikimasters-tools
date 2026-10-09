// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const render = (minutes: number, scene: 'city' = 'city', weather: { gloom?: boolean; rainy?: boolean } = {}) =>
  act(() =>
    root.render(
      <svg>
        <ScenePanorama scene={scene} width={720} height={340} sky={skyAt(minutes, times)} minutes={minutes} seed={5} {...weather} />
      </svg>,
    ),
  );

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

describe('ScenePanorama (ville)', () => {
  it('contient le ciel, les astres, le décor et les acteurs', () => {
    render(13 * 60);
    expect(container.querySelector('[data-panorama][data-scene="city"]')).not.toBeNull();
    expect(container.querySelector('[data-sky]')).not.toBeNull();
    expect(container.querySelector('[data-celestial]')).not.toBeNull();
    expect(container.querySelector('[data-scene-body]')).not.toBeNull();
    expect(container.querySelectorAll('[data-actor]').length).toBeGreaterThan(0);
  });

  it('le soleil se voit le jour, la lune et les étoiles la nuit', () => {
    render(13 * 60);
    expect(container.querySelector('[data-sun]')).not.toBeNull();
    expect(container.querySelector('[data-moon]')).toBeNull();
    render(0);
    expect(container.querySelector('[data-sun]')).toBeNull();
    expect(container.querySelector('[data-moon]')).not.toBeNull();
    expect(container.querySelectorAll('[data-star]').length).toBeGreaterThan(10);
  });

  it('beaucoup de fenêtres allumées à 21 h, presque aucune à 4 h', () => {
    const lit = (minutes: number): number => {
      render(minutes);
      return Array.from(container.querySelectorAll<SVGElement>('[data-lamp]')).filter((el) => el.getAttribute('data-lit') === 'true').length;
    };
    const evening = lit(21 * 60);
    const deepNight = lit(4 * 60);
    expect(evening).toBeGreaterThan(deepNight * 5);
    expect(deepNight).toBeLessThan(evening / 5 + 1);
  });

  // Ville vivante 1a : les passants de la ville ne sont plus des acteurs (voir city/people.ts) ; à réactiver quand le rendu de la population sera branché.
  it.skip('les acteurs humains sont présents le soir, presque absents à 4 h (opacité cible)', () => {
    const present = (minutes: number): number => {
      render(minutes);
      return Array.from(container.querySelectorAll<SVGElement>('[data-actor][data-kind="walker"]')).filter((el) => el.getAttribute('data-active') === 'true').length;
    };
    expect(present(21 * 60)).toBeGreaterThan(present(4 * 60));
  });

  it('ciel sombre (gloom) : des fenêtres s’allument en plein jour, et se voient', () => {
    // À midi quelques lampes sont « allumées » (insomniaques) mais invisibles en plein jour (opacité ≈ 0).
    const litAtNoon = (gloom: boolean): SVGElement[] => {
      render(12 * 60, 'city', { gloom });
      return Array.from(container.querySelectorAll<SVGElement>('[data-lamp][data-lit="true"]'));
    };
    const visible = (lamps: SVGElement[]): number => lamps.filter((lamp) => Number(lamp.getAttribute('opacity')) >= 0.5).length;
    const plain = litAtNoon(false);
    expect(visible(plain)).toBe(0);
    const lit = litAtNoon(true);
    expect(lit.length).toBeGreaterThan(plain.length);
    expect(visible(lit)).toBe(lit.length);
    for (const lamp of lit) expect(Number(lamp.getAttribute('opacity'))).toBeGreaterThanOrEqual(0.7);
  });

  // Ville vivante 1a : les passants de la ville ne sont plus des acteurs (voir city/people.ts) ; à réactiver quand le rendu de la population sera branché.
  it.skip('pluie (rainy) : les passants ouvrent un parapluie, rien sans pluie', () => {
    render(21 * 60, 'city', { rainy: true });
    const walkers = Array.from(container.querySelectorAll('[data-actor][data-kind="walker"][data-active="true"]'));
    expect(walkers.length).toBeGreaterThan(0);
    for (const w of walkers) expect(w.querySelector('[data-umbrella]')).not.toBeNull();
    expect(container.querySelector('[data-actor][data-kind="car"] [data-umbrella]')).toBeNull();
    render(21 * 60, 'city', { rainy: false });
    expect(container.querySelector('[data-umbrella]')).toBeNull();
  });

  it('place les acteurs au montage (transform) même sans animation', () => {
    render(13 * 60);
    const first = container.querySelector<SVGElement>('[data-actor]')!;
    expect(first.getAttribute('transform')).toMatch(/translate\(/);
    expect(first.getAttribute('data-u')).toMatch(/^-?\d*\.?\d+$/);
  });
});
