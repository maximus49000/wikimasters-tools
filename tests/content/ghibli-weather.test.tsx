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
import { TILE, tileCount } from '../../src/core/library/paint/city-painter';
import { cityPaintPlan, type CityPaintPlan } from '../../src/core/library/paint/city-plan';
import { animatedTops, skylinePath, skylinePathFromProfile } from '../../src/core/library/paint/sky-clip';
import { resetPaintedCacheForTests, setTilePainterForTests, usePaintedCity } from '../../src/content/painted-city';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const SKY: Sky = { phase: 'day', daylight: 1, twilight: 0, sunFrac: 0.5, moonFrac: null, stars: 0, top: '#6FB1E8', bottom: '#BFE0F5' };
let container: HTMLDivElement;
let root: Root;
// Clés demandées au peintre de test (dans l'ordre).
let asked: string[] = [];
beforeEach(() => {
  asked = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  vi.setSystemTime(new Date(2026, 5, 21, 14, 0));
  localStorage.clear();
  resetPaintQueueForTests();
  setJobRunnerForTests(async (j) => {
    asked.push(j.key);
    return `data:image/png;base64,${btoa(j.key)}`;
  });
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
  it('pluie en gouttes sur canvas (plus de stries en motif), neige en flocons doux', async () => {
    writeArt('ghibli');
    mount(clockOf('rain'));
    await flush(5);
    expect(container.querySelector('[data-wx-pattern="rain-near"]')).toBeNull();
    expect(container.querySelector('[data-weather] [data-rain-canvas="air"] canvas')).not.toBeNull();
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
    expect(d[0]).not.toBe('M0 0');
    expect(new Set(d).size).toBe(1);
  });

  it('neige posée : tranches peintes, étalonnées, opacité selon la neige au sol', async () => {
    writeArt('ghibli');
    mount(clockOf('snow'), 'city', { gloom: true });
    await flush(120);
    const cover = container.querySelector('[data-wx="snow-cover"]')!;
    expect(cover.tagName.toLowerCase()).toBe('g');
    expect(cover.querySelector('[data-painted-canvas="neige"]')!.getAttribute('data-images')).toBe(String(tileCount(720)));
    expect(Number(cover.getAttribute('opacity'))).toBeGreaterThan(0);
    expect(cover.querySelector('[data-painted-canvas="neige"]')!.getAttribute('data-grade')).toBe(gradeValues(gradeFor(1, 0, true)));
    // Étalonnage aux pixels de la toile : plus de filtre SVG ni d'image sur la neige posée.
    expect(cover.querySelector('feColorMatrix')).toBeNull();
    expect(cover.querySelector('image')).toBeNull();
  });

  it('nœud de neige remplacé : la boucle suit le nouveau nœud', async () => {
    writeArt('ghibli');
    const clock = clockOf('snow');
    act(() => root.render(<svg><WeatherLayer scene="city" width={720} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    await flush(120);
    act(() => root.render(<svg><WeatherLayer scene="city" width={1080} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    await flush(120);
    const cover = container.querySelector('[data-wx="snow-cover"]')!;
    expect(cover.querySelector('[data-painted-canvas="neige"]')!.getAttribute('data-images')).toBe(String(tileCount(1080)));
    expect(Number(cover.getAttribute('opacity'))).toBeGreaterThan(0);
  });
});

describe('relecture finale', () => {
  it('première apparition des nuages peints : montés à opacité 0, puis 1 (fondu)', async () => {
    writeArt('ghibli');
    const seen: { node: Element; old: string | null }[] = [];
    const observer = new MutationObserver((records) => { for (const r of records) seen.push({ node: r.target as Element, old: r.oldValue }); });
    observer.observe(container, { subtree: true, attributes: true, attributeFilter: ['style'], attributeOldValue: true });
    mount(clockOf('cloudy'));
    await flush();
    for (const r of observer.takeRecords()) seen.push({ node: r.target as Element, old: r.oldValue });
    observer.disconnect();
    const use = container.querySelector<SVGElement>('use[data-cloud-painted]')!;
    expect(use.style.opacity).toBe('1');
    expect(seen.some((s) => s.node === use && /opacity: 0[;\s]/.test(`${s.old ?? ''} `))).toBe(true);
  });

  it('temps clair : ni neige posée ni brume demandées au peintre ; neige et brume : demandées', async () => {
    writeArt('ghibli');
    mount(clockOf('sun'));
    await flush(120);
    expect(asked.some((k) => k.startsWith('snow|'))).toBe(false);
    expect(asked.some((k) => k.includes('|fog|'))).toBe(false);
    expect(container.querySelector('rect[data-wx="snow-cover"]')).not.toBeNull();
    mount(clockOf('snow'));
    await flush(120);
    expect(asked.some((k) => k.startsWith('snow|'))).toBe(true);
    expect(asked.some((k) => k.includes('|fog|'))).toBe(true);
  });

  it('brume seule : la brume est peinte, pas la neige posée', async () => {
    writeArt('ghibli');
    mount(clockOf('fog'));
    await flush(120);
    expect(asked.some((k) => k.includes('|fog|'))).toBe(true);
    expect(asked.some((k) => k.startsWith('snow|'))).toBe(false);
  });

  it('besoin gardé : la neige qui cesse ne remet pas la neige posée au rectangle', async () => {
    writeArt('ghibli');
    mount(clockOf('snow'));
    await flush(120);
    mount(clockOf('sun'));
    await flush(5);
    expect(container.querySelector('[data-wx="snow-cover"]')!.tagName.toLowerCase()).toBe('g');
  });

  it('agrandissement pendant la neige : la dernière série de tranches reste affichée', async () => {
    writeArt('ghibli');
    const clock = clockOf('snow');
    act(() => root.render(<svg><WeatherLayer scene="city" width={720} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    await flush(120);
    act(() => root.render(<svg><WeatherLayer scene="city" width={1080} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    const cover = container.querySelector('[data-wx="snow-cover"]')!;
    expect(cover.tagName.toLowerCase()).toBe('g');
    expect(Number(cover.querySelector('[data-painted-canvas="neige"]')!.getAttribute('data-images'))).toBeGreaterThan(0);
  });

  it('Ghibli → classique → Ghibli : éclair et neige classiques rétablis, nuages repris sans repeindre', async () => {
    const clock = clockOf('storm');
    let t = Date.now();
    while (!lightningAt(clock.read(t), t, 1)) t += 50;
    vi.setSystemTime(t - 1000);
    writeArt('ghibli');
    mount(clock);
    await flush(5);
    expect(hrefs()).toHaveLength(12);
    const clouds = asked.filter((k) => k.includes('|cloud|')).length;
    expect(clouds).toBe(12);
    act(() => writeArt('classic'));
    await flush(30);
    expect(container.querySelector('[data-wx-bolt-line]')).toBeNull();
    const bolt = container.querySelector('path[data-wx="bolt"]')!;
    expect(bolt.getAttribute('d')).toMatch(/^M-?\d+ 0 L/);
    expect(container.querySelector('rect[data-wx="snow-cover"]')).not.toBeNull();
    act(() => writeArt('ghibli'));
    await flush(10);
    expect(container.querySelectorAll('[data-wx-bolt-line]')).toHaveLength(3);
    expect(container.querySelector('use[data-cloud-painted]')).not.toBeNull();
    expect(asked.filter((k) => k.includes('|cloud|')).length).toBe(clouds);
  });

  it('neige : classique rétablit le rectangle, Ghibli les tranches', async () => {
    writeArt('ghibli');
    mount(clockOf('snow'));
    await flush(120);
    expect(container.querySelector('[data-wx="snow-cover"]')!.tagName.toLowerCase()).toBe('g');
    act(() => writeArt('classic'));
    await flush(5);
    expect(container.querySelector('[data-wx="snow-cover"]')!.tagName.toLowerCase()).toBe('rect');
    act(() => writeArt('ghibli'));
    await flush(5);
    expect(container.querySelector('[data-wx="snow-cover"]')!.tagName.toLowerCase()).toBe('g');
  });

  it('relance de la boucle : les nuages ne sautent pas (dérive gardée)', async () => {
    const base = clockOf('cloudy').read(Date.now());
    let wind = 1;
    const clock = { read: () => ({ ...base, wind }) };
    writeArt('ghibli');
    act(() => root.render(<svg><WeatherLayer scene="city" width={720} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    await flush(50);
    wind = 0;
    await flush(5);
    const x = (): number => Number(/translate\(([-\d.]+)/.exec(container.querySelector('[data-wx="clouds-drift"]')!.getAttribute('transform') ?? '')![1]);
    const before = x();
    // Relance de la boucle (changement de nœuds) : classique.
    act(() => writeArt('classic'));
    expect(Math.abs(x() - before)).toBeLessThan(2);
  });

  it('classique : le cran des nuages n’est pas signalé (pas de re-rendu, rien de peint)', async () => {
    mount(clockOf('cloudy'));
    await flush(30);
    expect(asked).toHaveLength(0);
  });
});

describe('captures du banc', () => {
  it('Ghibli Ville : les nuages défilent derrière les toits (découpe fixe selon la silhouette)', async () => {
    writeArt('ghibli');
    mount(clockOf('cloudy'));
    await flush(5);
    const drift = container.querySelector('[data-wx="clouds-drift"]')!;
    const clip = drift.parentElement!;
    expect(clip.getAttribute('data-wx-clip')).toBe('sky');
    const ref = /^url\(#(.+)\)$/.exec(clip.getAttribute('clip-path') ?? '')![1]!;
    const path = container.querySelector(`clipPath[id="${ref}"] path`)!;
    expect(path.getAttribute('d')).toBe(skylinePath(cityPaintPlan(720, 216, 1)));
    // La découpe ne bouge pas : seul le groupe intérieur est translaté.
    expect(clip.getAttribute('transform')).toBeNull();
  });

  it('Ghibli Ville : tranches peintes avec profil → découpe au pixel (plus de boîtes du fond)', async () => {
    writeArt('ghibli');
    resetPaintedCacheForTests();
    setTilePainterForTests(async (plan, t) => ({ url: `data:fake-${t}`, profile: new Float32Array(Math.min(TILE, plan.width - t * TILE)).fill(120 - t) }));
    const City = ({ plan }: { plan: CityPaintPlan }): null => {
      usePaintedCity(plan);
      return null;
    };
    const cityPlan = cityPaintPlan(720, 216, 1);
    try {
      act(() => root.render(<svg><City plan={cityPlan} /><WeatherLayer scene="city" width={720} height={216} seed={1} sky={SKY} clock={clockOf('cloudy')} /></svg>));
      await flush(10);
      const clip = container.querySelector('[data-wx-clip="sky"]')!;
      const ref = /^url\(#(.+)\)$/.exec(clip.getAttribute('clip-path') ?? '')![1]!;
      const d = container.querySelector(`clipPath[id="${ref}"] path`)!.getAttribute('d');
      const profile = new Float32Array(720);
      for (let x = 0; x < 720; x++) profile[x] = 120 - Math.floor(x / TILE);
      expect(d).toBe(skylinePathFromProfile(cityPlan, profile, animatedTops(cityPlan)));
      expect(d).not.toBe(skylinePath(cityPlan));
    } finally {
      setTilePainterForTests(null);
      resetPaintedCacheForTests();
    }
  });

  it('classique : pas de découpe des nuages', async () => {
    mount(clockOf('cloudy'));
    await flush(5);
    expect(container.querySelector('[data-wx="clouds-drift"]')!.closest('[clip-path]')).toBeNull();
    expect(container.querySelector('[data-wx-clip]')).toBeNull();
  });

  it('Ghibli Ville : réserve de nuages divisée par deux ; classique et autres scènes : réserve entière', async () => {
    mount(clockOf('cloudy'));
    await flush(2);
    const full = container.querySelectorAll('[data-wx-cloud]').length;
    expect(full).toBe(36);
    writeArt('ghibli');
    mount(clockOf('cloudy'), 'countryside');
    await flush(2);
    expect(container.querySelectorAll('[data-wx-cloud]').length).toBe(full);
    mount(clockOf('cloudy'));
    await flush(2);
    expect(container.querySelectorAll('[data-wx-cloud]').length).toBe(18);
  });
});
