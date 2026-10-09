// @vitest-environment jsdom
// tests/content/scene-weather.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEATHER_SCENES, WeatherLayer } from '../../src/content/scene-weather';
import { createWeatherClock, steadySource } from '../../src/core/library/weather/weather-clock';
import type { SceneId } from '../../src/core/library/library-types';
import type { Sky } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SKY: Sky = { phase: 'day', daylight: 1, twilight: 0, sunFrac: 0.5, moonFrac: null, stars: 0, top: '#6FB1E8', bottom: '#BFE0F5' };
const NIGHT: Sky = { phase: 'night', daylight: 0, twilight: 0, sunFrac: null, moonFrac: 0.5, stars: 1, top: '#0B1030', bottom: '#1A2350' };
let container: HTMLDivElement;
let root: Root;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  vi.setSystemTime(new Date(2026, 5, 21, 14, 0));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.matchMedia = originalMatchMedia;
});

type State = Parameters<typeof steadySource>[0];
const mount = (state: State, scene: SceneId = 'city', sky: Sky = SKY): void => {
  const clock = createWeatherClock();
  clock.setSource(steadySource(state), Date.now());
  act(() =>
    root.render(
      <svg>
        <WeatherLayer scene={scene} width={720} height={216} seed={1} sky={sky} clock={clock} />
      </svg>,
    ),
  );
};
const wx = (name: string): Element | null => container.querySelector(`[data-wx="${name}"]`);
const opacity = (name: string): number => Number(wx(name)?.getAttribute('opacity') ?? 'NaN');
const visibleClouds = (): number => container.querySelectorAll('[data-wx-cloud]:not([display="none"])').length;
const cloudLuma = (): number => {
  const hex = (wx('clouds')?.getAttribute('fill') ?? '#000000').slice(1);
  return parseInt(hex.slice(0, 2), 16) * 0.3 + parseInt(hex.slice(2, 4), 16) * 0.59 + parseInt(hex.slice(4, 6), 16) * 0.11;
};
const remount = (state: State): number => {
  act(() => root.unmount());
  root = createRoot(container);
  mount(state);
  return cloudLuma();
};
const driftX = (): number => Number(/translate\(([-\d.]+)/.exec(wx('clouds-drift')?.getAttribute('transform') ?? '')?.[1] ?? 'NaN');

describe('WeatherLayer', () => {
  it('quatre scènes terrestres', () => {
    expect(WEATHER_SCENES).toEqual(['city', 'countryside', 'mountain', 'sea']);
  });
  it('pluie : gouttes visibles, sol mouillé, ciel assombri, pas de flocons', () => {
    mount('rain');
    expect(opacity('rain-near')).toBeGreaterThan(0.3);
    expect(opacity('snow-near')).toBe(0);
    expect(opacity('puddles')).toBeGreaterThan(0.5);
    expect(opacity('tint')).toBeGreaterThan(0.2);
    expect(visibleClouds()).toBeGreaterThan(20);
    expect(opacity('snow-cover')).toBe(0);
  });
  it('neige : flocons et sol blanc, pas de gouttes', () => {
    mount('snow');
    expect(opacity('snow-near')).toBeGreaterThan(0.2);
    expect(opacity('rain-near')).toBe(0);
    expect(opacity('snow-cover')).toBeGreaterThan(0.5);
  });
  it('soleil : tout est éteint', () => {
    mount('sun');
    for (const name of ['rain-far', 'rain-near', 'snow-far', 'snow-near', 'puddles', 'snow-cover', 'fog']) expect(opacity(name)).toBe(0);
    expect(opacity('tint')).toBeLessThan(0.05);
    expect(visibleClouds()).toBeLessThan(8);
    expect(opacity('overcast')).toBe(0);
  });
  it('brume : voile', () => {
    mount('fog');
    expect(opacity('fog')).toBeGreaterThan(0.4);
  });
  it('met à jour sans re-rendu quand le temps passe (la boucle lit l’horloge)', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('sun'), Date.now());
    act(() => root.render(<svg><WeatherLayer scene="city" width={720} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    expect(opacity('rain-near')).toBe(0);
    clock.setSource(steadySource('rain'), Date.now());
    act(() => vi.advanceTimersByTime(40_000));
    expect(opacity('rain-near')).toBeGreaterThan(0.3);
  });
  it('mouvement réduit : affiché mais figé (pas de boucle)', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
    mount('rain');
    expect(opacity('rain-near')).toBeGreaterThan(0.3);
    expect(raf).not.toHaveBeenCalled();
    const before = driftX();
    act(() => vi.advanceTimersByTime(5000));
    expect(driftX()).toBe(before);
  });
  it('ciel : la couverture fait des nuages, la pluie les assombrit (blancs en pluie fine, presque noirs à l’orage)', () => {
    mount('cloudy');
    const cloudyCount = visibleClouds();
    const cloudyLuma = cloudLuma();
    expect(cloudyCount).toBeGreaterThan(10);
    expect(opacity('overcast')).toBe(0);
    const drizzleLuma = remount('drizzle');
    const rainLuma = remount('rain');
    const stormLuma = remount('storm');
    expect(visibleClouds()).toBeGreaterThanOrEqual(cloudyCount);
    expect(opacity('overcast')).toBeGreaterThan(0.1);
    expect(cloudyLuma).toBeGreaterThanOrEqual(drizzleLuma - 1);
    expect(drizzleLuma).toBeGreaterThan(rainLuma);
    expect(rainLuma).toBeGreaterThan(stormLuma);
  });
  it('plafonne les éléments : motifs et réserve de nuages bornée, pas un nœud par goutte', () => {
    mount('storm');
    expect(container.querySelectorAll('[data-wx-cloud]').length).toBeLessThanOrEqual(140);
    expect(container.querySelectorAll('*').length).toBeLessThan(500);
  });
  it('réserve bornée à 140 nuages même pour une pièce très large', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('storm'), Date.now());
    act(() => root.render(<svg><WeatherLayer scene="city" width={6000} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    expect(container.querySelectorAll('[data-wx-cloud]').length).toBe(140);
  });

  it.each(['storm', 'drizzle', 'cloudy'] as const)('les nuages dérivent toujours, au moins 4 px/s (%s)', (state) => {
    mount(state);
    const a = driftX();
    act(() => vi.advanceTimersByTime(5000));
    const b = driftX();
    expect(Number.isFinite(a)).toBe(true);
    const moved = (((b - a) % 720) + 720) % 720;
    // 4 px/s × 5 s, moins les arrondis d'affichage (0,1 px) ; au plus 18 px/s.
    expect(moved).toBeGreaterThanOrEqual(4 * 5 - 0.2);
    expect(moved).toBeLessThanOrEqual(18 * 5 + 0.2);
  });
  it('les nuages apparaissent en fondu quand la couverture change (jamais d’un coup)', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('sun'), Date.now());
    act(() => root.render(<svg><WeatherLayer scene="city" width={720} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    const read = (): number[] => Array.from(container.querySelectorAll('[data-wx-cloud]')).map((el) => Number(el.getAttribute('opacity')));
    clock.setSource(steadySource('storm'), Date.now());
    let previous = read();
    let partial = 0;
    for (let i = 0; i < 400; i++) {
      act(() => vi.advanceTimersByTime(100));
      const next = read();
      next.forEach((v, j) => {
        // Pas de 100 ms sur un fondu de 1,5 s (0,067) + arrondi d’affichage (1/50) ; une apparition d’un coup ferait 1.
        expect(Math.abs(v - previous[j]!)).toBeLessThanOrEqual(0.12);
        if (v > 0.05 && v < 0.95) partial++;
      });
      previous = next;
    }
    expect(partial).toBeGreaterThan(0);
    expect(visibleClouds()).toBe(container.querySelectorAll('[data-wx-cloud]').length);
  });
  it('n’écrit --wmt-precip que lorsqu’elle change', () => {
    mount('rain');
    const svg = container.querySelector('svg')!;
    expect(svg.style.getPropertyValue('--wmt-precip')).not.toBe('');
    const spy = vi.spyOn(svg.style, 'setProperty');
    act(() => vi.advanceTimersByTime(3000));
    expect(spy).not.toHaveBeenCalled();
  });
  it('la dérive ne saute pas quand le vent change (vitesse intégrée)', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('storm'), Date.now());
    act(() => root.render(<svg><WeatherLayer scene="city" width={720} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    clock.setSource(steadySource('fog'), Date.now());
    for (let i = 0; i < 20; i++) {
      const a = driftX();
      act(() => vi.advanceTimersByTime(500));
      const b = driftX();
      const step = (((b - a) % 720) + 720) % 720;
      // Au plus 18 px/s (vent maximal), arrondis compris.
      expect(step).toBeLessThanOrEqual(18 * 0.5 + 2);
    }
  });

  it('le sol (flaques, neige) est un groupe à part, dessiné sous les passants', () => {
    mount('rain');
    expect(container.querySelector('[data-weather-ground] [data-wx="puddles"]')).not.toBeNull();
    expect(container.querySelector('[data-weather-ground] [data-wx="snow-cover"]')).not.toBeNull();
    expect(container.querySelector('[data-weather] [data-wx="puddles"]')).toBeNull();
  });
  it('mer : ni flaques ni neige sur l’eau', () => {
    mount('snow', 'sea');
    expect(container.querySelectorAll('[data-wx="puddles"] ellipse')).toHaveLength(0);
    expect(Number(wx('snow-cover')?.getAttribute('height') ?? '1')).toBe(0);
  });

  describe('filets de lumière', () => {
    it.each(WEATHER_SCENES)('le groupe existe en scène %s', (scene) => {
      mount('drizzle', scene);
      expect(wx('godrays')).not.toBeNull();
    });
    it('éteints par ciel clair', () => {
      mount('sun');
      expect(opacity('godrays')).toBe(0);
    });
    it('éteints la nuit', () => {
      mount('drizzle', 'city', NIGHT);
      expect(opacity('godrays')).toBe(0);
    });
    it('occasionnels : visibles bien moins de 15 % du temps en bruine, nuageux ou pluie (et jamais à l’orage)', () => {
      // Fenêtre simulée : 3 graines × 10 min (≈ 20 épisodes de 90 s) ; l'orage, sans filets possibles, sur 2 min.
      const fraction = (state: State, seeds = [1, 2, 77], seconds = 600): number => {
        let on = 0;
        let total = 0;
        for (const seed of seeds) {
          const clock = createWeatherClock();
          clock.setSource(steadySource(state), Date.now());
          act(() => root.render(<svg><WeatherLayer key={seed} scene="city" width={720} height={340} seed={seed} sky={SKY} clock={clock} /></svg>));
          for (let i = 0; i < seconds; i++) {
            act(() => vi.advanceTimersByTime(1000));
            if (opacity('godrays') > 0.1) on++;
            total++;
          }
        }
        return on / total;
      };
      const drizzle = fraction('drizzle');
      expect(drizzle).toBeLessThan(0.15);
      expect(drizzle).toBeGreaterThan(0);
      expect(fraction('cloudy')).toBeLessThan(0.15);
      expect(fraction('rain')).toBeLessThan(0.15);
      expect(fraction('storm', [1], 120)).toBe(0);
    }, 60_000);
    it('au-dessus des nuages et du voile, sous la pluie', () => {
      mount('drizzle');
      const order = Array.from(container.querySelectorAll('[data-weather] > [data-wx]')).map((el) => el.getAttribute('data-wx'));
      expect(order.indexOf('godrays')).toBeGreaterThan(order.indexOf('clouds-drift'));
      expect(order.indexOf('godrays')).toBeGreaterThan(order.indexOf('overcast'));
      expect(order.indexOf('godrays')).toBeLessThan(order.indexOf('rain-far'));
      expect(container.querySelectorAll('[data-wx="godrays"] polygon')).toHaveLength(7);
    });
  });
});
