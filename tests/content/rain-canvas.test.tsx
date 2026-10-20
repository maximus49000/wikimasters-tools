// @vitest-environment jsdom
// tests/content/rain-canvas.test.tsx
// Pluie naturelle dans la scène et sur les vitres : place des canvas dans l'empilement, boucles (actives seulement s'il pleut),
// redimensionnement sans remontage, monde de la pluie (bâti seulement en Ville), copie soulevée sans gouttes.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RainAirCanvas, rainLightsFor, rainLoopsActive, rainWorldFor } from '../../src/content/rain-canvas';
import { WeatherLayer } from '../../src/content/scene-weather';
import { RoomView } from '../../src/content/RoomView';
import { activeRoom, createInitialState, setRoomScene, updateLayout } from '../../src/core/library/library-book';
import { skyAt, sunTimes, type Sky } from '../../src/core/library/sky';
import { createWeatherClock, steadySource } from '../../src/core/library/weather/weather-clock';
import type { SceneId } from '../../src/core/library/library-types';
import { dayContext } from '../../src/core/library/city/calendar';
import { recordingCtx, type RecordingCtx } from '../core/library/paint/recording-ctx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SKY: Sky = { phase: 'day', daylight: 1, twilight: 0, sunFrac: 0.5, moonFrac: null, stars: 0, top: '#6FB1E8', bottom: '#BFE0F5' };
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const cityDay = dayContext({ y: 2024, m: 6, d: 21 }, []);

// Faux contexte 2D (jsdom n'a pas de canvas) : compte les dessins.
type FakeCtx = RecordingCtx & { images: number };
let drawn = 0;
function fakeCtx(): FakeCtx {
  const base = recordingCtx() as FakeCtx;
  base.images = 0;
  const stroke = base.stroke;
  Object.assign(base, {
    drawImage: () => { base.images++; drawn++; },
    clearRect: () => undefined,
    setTransform: () => undefined,
    getTransform: () => ({ a: 1, d: 1 }),
    stroke: () => { drawn++; stroke(); },
    canvas: { width: 100, height: 100 },
  });
  return base;
}

let container: HTMLDivElement;
let root: Root;
const originalMatchMedia = window.matchMedia;
const reduceMotion = (): void => {
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  vi.setSystemTime(new Date(2024, 5, 21, 13, 0));
  drawn = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx() as never);
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
const clockOf = (state: State) => {
  const clock = createWeatherClock();
  clock.setSource(steadySource(state), Date.now());
  return clock;
};
const mountLayer = (state: State, scene: SceneId = 'city'): void => {
  act(() => root.render(<svg><WeatherLayer scene={scene} width={720} height={216} seed={1} sky={SKY} clock={clockOf(state)} /></svg>));
};

function showRoom(opts: { outside?: boolean; drag?: { id: string; x: number; y: number } | null; state?: State } = {}): void {
  let st = setRoomScene(createInitialState(), 'r1', 'city');
  st = updateLayout(st, 'r1', () => [
    { id: 'w0', kind: 'window' as const, col: 2, row: 1, w: 6, h: 5 },
    { id: 'w1', kind: 'window' as const, col: 12, row: 1, w: 8, h: 5 },
  ]);
  const weather = { clock: clockOf(opts.state ?? 'rain'), flags: { gloom: true, rainy: true } };
  act(() =>
    root.render(
      <RoomView
        room={activeRoom(st)} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined}
        drag={opts.drag ? { ...opts.drag, ok: true, ghost: null } : null}
        outside={opts.outside ?? false} roomLayers={opts.outside ? 'hidden' : 'shown'}
        sceneView={{ sky: skyAt(13 * 60, times), minutes: 13 * 60, weather, city: { day: cityDay, forcedNight: false } }}
      />,
    ),
  );
}

describe('pluie naturelle — canvas dans la scène', () => {
  it('plus de motifs rain-far / rain-near', () => {
    mountLayer('rain');
    expect(container.querySelector('[data-wx-pattern="rain-far"]')).toBeNull();
    expect(container.querySelector('[data-wx-pattern="rain-near"]')).toBeNull();
    expect(container.querySelector('[data-wx="rain-far"]')).toBeNull();
    expect(container.querySelector('[data-wx="rain-near"]')).toBeNull();
    // à leur place : un canvas « air » dans le ciel, un canvas « sol » sous les acteurs
    expect(container.querySelector('[data-weather] foreignObject[data-rain-canvas="air"] canvas')).not.toBeNull();
    expect(container.querySelector('[data-weather-ground] foreignObject[data-rain-canvas="ground"] canvas')).not.toBeNull();
    // la neige garde ses motifs
    expect(container.querySelector('[data-wx-pattern="snow-near"]')).not.toBeNull();
  });

  it('vue rue : canvas sol sous les acteurs et air au-dessus, aucun canvas vitre', () => {
    showRoom({ outside: true });
    const views = container.querySelector('[data-window-views]')!;
    const kids = Array.from(views.children);
    const at = (sel: string): number => kids.findIndex((k) => k.matches(sel) || k.querySelector(sel) !== null);
    expect(at('[data-rain-canvas="ground"]')).toBe(at('[data-window-weather-ground]'));
    expect(at('[data-rain-canvas="ground"]')).toBeLessThan(at('[data-window-actors]'));
    expect(at('[data-rain-canvas="air"]')).toBe(at('[data-window-weather]'));
    expect(at('[data-rain-canvas="air"]')).toBeGreaterThan(at('[data-window-actors]'));
    expect(container.querySelector('[data-rain-canvas="glass"]')).toBeNull();
    // l'éclair et le flash restent au-dessus de la pluie
    const sky = Array.from(container.querySelector('[data-window-weather]')!.children);
    const air = sky.findIndex((k) => k.matches('[data-rain-canvas="air"]'));
    expect(air).toBeLessThan(sky.findIndex((k) => k.matches('[data-wx="flash"]')));
    expect(air).toBeGreaterThan(sky.findIndex((k) => k.matches('[data-wx="fog"]')));
  });

  it('vue pièce : canvas vitre avant les châssis et les meubles', () => {
    showRoom();
    const glass = container.querySelector('[data-rain-canvas="glass"]');
    expect(glass).not.toBeNull();
    // dans le calque des vues, après la météo (pluie qui tombe)
    const views = container.querySelector('[data-window-views]')!;
    const kids = Array.from(views.children);
    expect(kids.indexOf(glass!)).toBeGreaterThan(kids.findIndex((k) => k.hasAttribute('data-window-weather')));
    // le calque des vues est dessiné avant les châssis (fenêtres) et les meubles
    const top = Array.from(container.querySelector('svg')!.children);
    const idx = (el: Element | null): number => top.findIndex((k) => k === el || (el !== null && k.contains(el)));
    expect(idx(glass)).toBeLessThan(idx(container.querySelector('[data-furniture="window"]')));
    expect(idx(glass)).toBeLessThan(idx(container.querySelector('[data-room-layers]')));
    // plus de gouttes SVG animées
    expect(container.querySelector('[data-glass-drops]')).toBeNull();
    expect(container.querySelector('animate[attributeName="cy"]')).toBeNull();
  });

  it('neige ou temps sec : aucune boucle active', () => {
    mountLayer('snow');
    act(() => vi.advanceTimersByTime(3000));
    expect(rainLoopsActive()).toBe(0);
    act(() => root.unmount());
    root = createRoot(container);
    mountLayer('sun');
    act(() => vi.advanceTimersByTime(3000));
    expect(rainLoopsActive()).toBe(0);
    act(() => root.unmount());
    root = createRoot(container);
    // vue pièce par temps sec : ni la pluie ni la vitre ne tournent
    showRoom({ state: 'sun' });
    act(() => vi.advanceTimersByTime(3000));
    expect(rainLoopsActive()).toBe(0);
    act(() => root.unmount());
    root = createRoot(container);
    // témoin : sous la pluie, la boucle tourne et dessine
    mountLayer('rain');
    act(() => vi.advanceTimersByTime(500));
    expect(rainLoopsActive()).toBeGreaterThan(0);
    expect(drawn).toBeGreaterThan(0);
  });

  it('la pluie qui commence relance la boucle sans remontage', () => {
    const clock = clockOf('sun');
    act(() => root.render(<svg><WeatherLayer scene="city" width={720} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    act(() => vi.advanceTimersByTime(2000));
    expect(rainLoopsActive()).toBe(0);
    clock.setSource(steadySource('rain'), Date.now());
    act(() => vi.advanceTimersByTime(40_000));
    expect(rainLoopsActive()).toBeGreaterThan(0);
  });

  it('mouvement réduit : aucune boucle', () => {
    reduceMotion();
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    showRoom();
    act(() => vi.advanceTimersByTime(3000));
    expect(raf).not.toHaveBeenCalled();
    expect(rainLoopsActive()).toBe(0);
    // une image fixe est quand même dessinée (gouttes figées)
    expect(drawn).toBeGreaterThan(0);
  });

  it('largeur qui change : redimensionnement sans remontage du composant', () => {
    const clock = clockOf('rain');
    const world = (w: number) => rainWorldFor('city', w, 216, 1);
    const render = (w: number): void =>
      act(() => root.render(<svg><RainAirCanvas width={w} height={216} scene="city" seed={1} clock={clock} sky={SKY} lights={[]} world={world(w)} /></svg>));
    render(720);
    act(() => vi.advanceTimersByTime(200));
    const canvas = container.querySelector('canvas')!;
    const before = canvas.width;
    drawn = 0;
    render(1080);
    act(() => vi.advanceTimersByTime(200));
    expect(container.querySelector('canvas')).toBe(canvas);
    expect(canvas.width).toBeGreaterThan(before);
    expect(container.querySelector('foreignObject')!.getAttribute('width')).toBe('1080');
    // la simulation recréée est préremplie : on dessine tout de suite (pas de ciel vide)
    expect(drawn).toBeGreaterThan(0);
  });

  it('campagne, montagne, mer : pas de bâti ; mer sans éclaboussures au sol', () => {
    for (const scene of ['countryside', 'mountain', 'sea'] as const) {
      const w = rainWorldFor(scene, 720, 216, 1);
      expect(w.drips).toHaveLength(0);
      expect(w.gutter).toBeNull();
      expect(w.splashGround).toBe(scene !== 'sea');
      expect(rainLightsFor(scene, 720, 216, 1, 23 * 60, 0)).toHaveLength(0);
    }
    expect(rainWorldFor('sea', 720, 216, 1).puddles).toHaveLength(0);
    // Ville : bords qui gouttent (au plus 40), caniveau à la bordure, lampadaires allumés la nuit seulement
    const city = rainWorldFor('city', 720, 216, 1);
    expect(city.drips.length).toBeGreaterThan(0);
    expect(city.drips.length).toBeLessThanOrEqual(40);
    expect(city.drips.every((d) => d.x >= 0 && d.x <= 720 && d.y >= 0 && d.y < city.groundTop)).toBe(true);
    expect(new Set(city.drips.map((d) => d.kind)).size).toBeGreaterThan(1);
    expect(city.gutter).not.toBeNull();
    expect(city.gutter!.y).toBeGreaterThan(city.groundTop);
    expect(rainLightsFor('city', 720, 216, 1, 22 * 60, 0).length).toBeGreaterThan(0);
    expect(rainLightsFor('city', 720, 216, 1, 13 * 60, 1)).toHaveLength(0);
    // vitrines ouvertes : sources seulement la nuit
    const shops = [{ x: 100, w: 40, top: 130, lit: true }];
    expect(rainLightsFor('city', 720, 216, 1, 22 * 60, 0, { shops }).some((l) => l.w > 10)).toBe(true);
    expect(rainLightsFor('city', 720, 216, 1, 22 * 60, 0, { shops: [{ ...shops[0]!, lit: false }] }).some((l) => l.w > 10)).toBe(false);
  });

  it('fenêtre soulevée : pas de gouttes sur sa copie', () => {
    showRoom({ drag: { id: 'w0', x: 300, y: 100 } });
    const copy = container.querySelector('[data-lifted-copy]');
    expect(copy).not.toBeNull();
    expect(copy!.querySelector('[data-glass-drops]')).toBeNull();
    expect(copy!.querySelector('[data-rain-canvas]')).toBeNull();
    expect(copy!.querySelector('canvas')).toBeNull();
    // la vitre soulevée n'est pas dessinée par le canvas des autres vitres
    expect(container.querySelector('[data-rain-canvas="glass"]')!.getAttribute('data-skip-pane')).toBe('0');
  });
});
