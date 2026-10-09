// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { dayContext } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { citySkyline } from '../../src/core/library/scene-world';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
// `withCity` : passe le contexte de la ville (vendredi 21 juin 2024, ordinaire), sans lequel la Ville n'a pas de population.
const render = (minutes: number, scene: 'city' = 'city', weather: { gloom?: boolean; rainy?: boolean } = {}, withCity = false, forcedNight = false) => {
  const sky = skyAt(minutes, times);
  const city: CityContext | undefined = withCity
    ? { minutes, day: dayContext({ y: 2024, m: 6, d: 21 }, []), precip: weather.rainy ? 0.7 : 0, snow: false, storm: false, daylight: sky.daylight }
    : undefined;
  act(() =>
    root.render(
      <svg>
        <ScenePanorama scene={scene} width={720} height={340} sky={sky} minutes={minutes} seed={5} {...weather} city={city} forcedNight={forcedNight} />
      </svg>,
    ),
  );
};

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

  // Ville vivante 1a : les passants sont la couche de vie de la ville (CityLifeLayer), plus des acteurs.
  it('les humains sont présents le soir, presque absents à 4 h (opacité cible)', () => {
    const present = (minutes: number): number => {
      render(minutes, 'city', {}, true);
      return Array.from(container.querySelectorAll<SVGElement>('[data-city-life] [data-ped]')).filter((el) => el.getAttribute('data-active') === 'true' && el.getAttribute('opacity') === '1').length;
    };
    const evening = present(21 * 60);
    const night = present(4 * 60);
    expect(evening).toBeGreaterThan(night);
    expect(night).toBeLessThanOrEqual(1);
  });

  it('sans contexte de ville, pas de population (ni passants ni voitures)', () => {
    render(21 * 60);
    expect(container.querySelector('[data-city-life]')).toBeNull();
    expect(container.querySelector('[data-actor][data-kind="walker"], [data-actor][data-kind="car"]')).toBeNull();
  });

  it('décor : entrées au pied des immeubles, lampadaires allumés à 23 h (21 juin : il fait encore jour à 21 h), éteints à 0 h 20 (sauf « Toujours la nuit »)', () => {
    const lit = (): number => container.querySelectorAll('[data-street-lamp][data-lit="true"]').length;
    render(23 * 60);
    // Une entrée par immeuble visible du premier plan.
    expect(container.querySelectorAll('[data-door] [data-entrance]')).toHaveLength(citySkyline(720, 340, 5).filter((b) => !b.far && b.x < 720).length);
    const lamps = container.querySelectorAll('[data-street-lamp]').length;
    expect(lamps).toBeGreaterThan(2);
    expect(lit()).toBe(lamps);
    render(20);
    expect(lit()).toBe(0);
    render(0, 'city', {}, false, true);
    expect(lit()).toBe(lamps);
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

  it('immeubles du fond : fenêtres allumées le soir, dissipées (bien moins lumineuses qu’au premier plan)', () => {
    render(22 * 60);
    const far = Array.from(container.querySelectorAll<SVGElement>('[data-far-lamp][data-lit="true"]'));
    expect(far.length).toBeGreaterThan(3);
    const nearOpacity = Math.max(...Array.from(container.querySelectorAll<SVGElement>('[data-lamp][data-lit="true"]')).map((el) => Number(el.getAttribute('opacity'))));
    for (const el of far) {
      expect(Number(el.getAttribute('opacity'))).toBeGreaterThan(0.2);
      expect(Number(el.getAttribute('opacity'))).toBeLessThanOrEqual(nearOpacity * 0.5);
    }
    render(4 * 60);
    expect(container.querySelectorAll('[data-far-lamp][data-lit="true"]').length).toBeLessThan(far.length);
  });

  it('pluie (rainy) : les passants ouvrent un parapluie, rien sans pluie', () => {
    render(21 * 60, 'city', { rainy: true }, true);
    const walkers = Array.from(container.querySelectorAll('[data-city-life] [data-ped][data-active="true"]'));
    expect(walkers.length).toBeGreaterThan(0);
    for (const w of walkers) expect(w.querySelector('[data-umbrella]')).not.toBeNull();
    expect(container.querySelector('[data-vehicle] [data-umbrella]')).toBeNull();
    render(21 * 60, 'city', { rainy: false }, true);
    expect(container.querySelector('[data-umbrella]')).toBeNull();
  });

  it('place les acteurs au montage (transform) même sans animation', () => {
    render(13 * 60);
    const first = container.querySelector<SVGElement>('[data-actor]')!;
    expect(first.getAttribute('transform')).toMatch(/translate\(/);
    expect(first.getAttribute('data-u')).toMatch(/^-?\d*\.?\d+$/);
  });
});
