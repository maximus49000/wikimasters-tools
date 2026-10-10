// @vitest-environment jsdom
// tests/content/ghibli-weather.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeArt } from '../../src/content/art-setting';
import { resetPaintQueueForTests, setJobRunnerForTests } from '../../src/content/paint-queue';
import { WeatherLayer } from '../../src/content/scene-weather';
import type { SceneId } from '../../src/core/library/library-types';
import type { Sky } from '../../src/core/library/sky';
import { createWeatherClock, lightningAt, steadySource } from '../../src/core/library/weather/weather-clock';
import { gradeFor, gradeValues } from '../../src/core/library/paint/grade';
import { tileCount } from '../../src/core/library/paint/city-painter';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const SKY: Sky = { phase: 'day', daylight: 1, twilight: 0, sunFrac: 0.5, moonFrac: null, stars: 0, top: '#6FB1E8', bottom: '#BFE0F5' };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  vi.setSystemTime(new Date(2026, 5, 21, 14, 0));
  localStorage.clear();
  resetPaintQueueForTests();
  setJobRunnerForTests(async (j) => `data:image/png;base64,${btoa(j.key)}`);
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
type State = Parameters<typeof steadySource>[0];
export const flush = async (n = 60): Promise<void> => {
  for (let i = 0; i < n; i++) await act(async () => { await vi.advanceTimersByTimeAsync(40); });
};
const clockOf = (state: State) => {
  const clock = createWeatherClock();
  clock.setSource(steadySource(state), Date.now());
  return clock;
};
const mount = (clock: ReturnType<typeof clockOf>, scene: SceneId = 'city', extra: { gloom?: boolean } = {}): void =>
  act(() => root.render(<svg><WeatherLayer scene={scene} width={720} height={216} seed={1} sky={SKY} clock={clock} {...extra} /></svg>));
const hrefs = (): string[] => Array.from(container.querySelectorAll('defs image[id*="-cloud-"]')).map((n) => n.getAttribute('href') ?? '');

describe('cumulus peints', () => {
  it('Ghibli : 12 nuages peints dans les defs, chaque nuage de la réserve les utilise', async () => {
    writeArt('ghibli');
    mount(clockOf('cloudy'));
    await flush();
    expect(hrefs()).toHaveLength(12);
    const clouds = container.querySelectorAll('[data-wx-cloud]');
    expect(clouds.length).toBeGreaterThan(0);
    for (const c of Array.from(clouds)) expect(c.querySelector('use[data-cloud-painted]')).not.toBeNull();
  });

  it('la pluie change le cran : les images des nuages changent', async () => {
    writeArt('ghibli');
    mount(clockOf('sun'));
    await flush();
    const sunny = hrefs();
    mount(clockOf('rain'));
    await flush();
    expect(hrefs()).toHaveLength(12);
    expect(hrefs()).not.toEqual(sunny);
  });

  it('classique ou autre scène : aucun nuage peint', async () => {
    mount(clockOf('cloudy'));
    await flush();
    expect(container.querySelector('use[data-cloud-painted]')).toBeNull();
    writeArt('ghibli');
    mount(clockOf('cloudy'), 'countryside');
    await flush();
    expect(container.querySelector('use[data-cloud-painted]')).toBeNull();
  });
});

describe('précipitations et phénomènes peints', () => {
  it('pluie en stries arrondies, neige en flocons doux', async () => {
    writeArt('ghibli');
    mount(clockOf('rain'));
    await flush(5);
    expect(container.querySelector('[data-wx-pattern="rain-near"] line')!.getAttribute('stroke-linecap')).toBe('round');
    expect(container.querySelector('[data-wx-pattern="snow-near"] circle')!.getAttribute('fill')).toMatch(/^url\(#/);
  });

  it('brume : motif peint qui dérive', async () => {
    writeArt('ghibli');
    mount(clockOf('fog'));
    await flush();
    const pattern = container.querySelector('[data-wx-pattern="fog"]')!;
    expect(container.querySelector('[data-wx="fog"]')!.getAttribute('fill')).toContain('url(#');
    const before = pattern.getAttribute('patternTransform');
    await flush(10);
    expect(pattern.getAttribute('patternTransform')).not.toBe(before);
  });

  it('éclair : trois traits superposés, même tracé', async () => {
    const clock = clockOf('storm');
    let t = Date.now();
    while (!lightningAt(clock.read(t), t, 1)) t += 50;
    vi.setSystemTime(t - 200);
    writeArt('ghibli');
    mount(clock);
    await flush(10);
    const lines = Array.from(container.querySelectorAll('[data-wx-bolt-line]'));
    expect(lines).toHaveLength(3);
    const d = lines.map((l) => l.getAttribute('d'));
    expect(d[0]).toMatch(/^M/);
    expect(new Set(d).size).toBe(1);
  });

  it('neige posée : tranches peintes, étalonnées, opacité selon la neige au sol', async () => {
    writeArt('ghibli');
    mount(clockOf('snow'), 'city', { gloom: true });
    await flush(120);
    const cover = container.querySelector('[data-wx="snow-cover"]')!;
    expect(cover.tagName.toLowerCase()).toBe('g');
    expect(cover.querySelectorAll('image[data-snow-tile]')).toHaveLength(tileCount(720));
    expect(Number(cover.getAttribute('opacity'))).toBeGreaterThan(0);
    expect(cover.querySelector('feColorMatrix')!.getAttribute('values')).toBe(gradeValues(gradeFor(1, 0, true)));
  });

  it('nœud de neige remplacé : la boucle suit le nouveau nœud', async () => {
    writeArt('ghibli');
    const clock = clockOf('snow');
    act(() => root.render(<svg><WeatherLayer scene="city" width={720} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    await flush(120);
    act(() => root.render(<svg><WeatherLayer scene="city" width={1080} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    await flush(120);
    const cover = container.querySelector('[data-wx="snow-cover"]')!;
    expect(cover.querySelectorAll('image[data-snow-tile]')).toHaveLength(tileCount(1080));
    expect(Number(cover.getAttribute('opacity'))).toBeGreaterThan(0);
  });
});
