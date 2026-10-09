// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import { createInitialState, activeRoom, setRoomScene, updateLayout } from '../../src/core/library/library-book';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { createWeatherClock, steadySource } from '../../src/core/library/weather/weather-clock';
import type { SceneId } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);

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

type WeatherProp = { clock: ReturnType<typeof createWeatherClock>; flags: { gloom: boolean; rainy: boolean } };
const rainyWeather = (): WeatherProp => {
  const clock = createWeatherClock();
  clock.setSource(steadySource('rain'), Date.now());
  return { clock, flags: { gloom: true, rainy: true } };
};

function show(windows: number, scene: SceneId = 'city', weather?: WeatherProp) {
  let state = setRoomScene(createInitialState(), 'r1', scene);
  state = updateLayout(state, 'r1', () => Array.from({ length: windows }, (_, i) => ({ id: `w${i}`, kind: 'window' as const, col: 2 + i * 10, row: 1, w: 6 + i * 2, h: 5 })));
  act(() =>
    root.render(<RoomView room={activeRoom(state)} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} sceneView={{ sky: skyAt(13 * 60, times), minutes: 13 * 60, weather }} />),
  );
}

describe('RoomView — fenêtres', () => {
  it('sans fenêtre, aucun décor n’est dessiné', () => {
    show(0);
    expect(container.querySelector('[data-panorama]')).toBeNull();
  });

  it('deux fenêtres partagent UN SEUL décor', () => {
    show(2);
    expect(container.querySelectorAll('[data-panorama]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-furniture="window"]')).toHaveLength(2);
    const uses = container.querySelectorAll('use[data-window-view]');
    expect(uses).toHaveLength(2);
    expect(uses[0]!.getAttribute('href')).toBe(uses[1]!.getAttribute('href'));
  });

  it('décor fixe et acteurs animés sont deux groupes distincts, partagés par toutes les fenêtres', () => {
    show(2);
    // Un seul décor fixe, un seul groupe d’acteurs, et les acteurs ne sont PAS dans le décor fixe
    // (la boucle d’animation ne touche que le groupe des acteurs : les copies du décor fixe ne sont pas recalculées).
    expect(container.querySelectorAll('defs [data-panorama]')).toHaveLength(1);
    expect(container.querySelectorAll('defs [data-actors]')).toHaveLength(1);
    expect(container.querySelector('[data-panorama] [data-actor]')).toBeNull();
    expect(container.querySelector('[data-actors] [data-actor]')).not.toBeNull();
    const staticId = container.querySelector('defs [data-panorama]')!.closest('g[id]')!.id;
    const actorsId = container.querySelector('defs [data-actors]')!.closest('g[id]')!.id;
    expect(staticId).not.toBe(actorsId);
    const windows = container.querySelectorAll('[data-window-art]');
    expect(windows).toHaveLength(2);
    for (const w of windows) {
      const uses = w.querySelectorAll('use');
      expect(uses).toHaveLength(2);
      // Les deux copies sont dans le MÊME groupe découpé, le décor fixe d’abord.
      expect(uses[0]!.parentElement).toBe(uses[1]!.parentElement);
      expect(uses[0]!.getAttribute('href')).toBe(`#${staticId}`);
      expect(uses[0]!.hasAttribute('data-window-view')).toBe(true);
      expect(uses[1]!.getAttribute('href')).toBe(`#${actorsId}`);
      expect(uses[1]!.hasAttribute('data-window-actors')).toBe(true);
    }
  });

  it('chaque vitre est découpée à la taille de sa fenêtre', () => {
    show(2);
    const clips = Array.from(container.querySelectorAll('clipPath rect'));
    expect(clips).toHaveLength(2);
    const widths = clips.map((r) => Number(r.getAttribute('width')));
    expect(widths[1]!).toBeGreaterThan(widths[0]!);
  });

  it('le décor suit la scène de la pièce', () => {
    show(1, 'sea');
    expect(container.querySelector('[data-panorama][data-scene="sea"]')).not.toBeNull();
  });
});

describe('RoomView — météo dans les fenêtres', () => {
  it('avec la météo, chaque fenêtre montre le sol mouillé, la pluie et des gouttes sur la vitre', () => {
    show(2, 'city', rainyWeather());
    expect(container.querySelectorAll('defs [data-weather]')).toHaveLength(1);
    expect(container.querySelectorAll('defs [data-weather-ground]')).toHaveLength(1);
    const skyId = container.querySelector('defs [data-weather]')!.id;
    const groundId = container.querySelector('defs [data-weather-ground]')!.id;
    expect(skyId).not.toBe('');
    expect(groundId).not.toBe(skyId);
    for (const w of container.querySelectorAll('[data-window-art]')) {
      expect(w.querySelector('[data-window-weather]')?.getAttribute('href')).toBe(`#${skyId}`);
      expect(w.querySelector('[data-window-weather-ground]')?.getAttribute('href')).toBe(`#${groundId}`);
      expect(w.querySelectorAll('[data-glass-drops] [data-glass-drop]').length).toBeGreaterThanOrEqual(3);
      // Ordre : décor fixe, sol (flaques, neige), acteurs, puis ciel et précipitations par-dessus.
      const order = Array.from(w.querySelectorAll('use')).map((u) => Array.from(u.attributes).find((a) => a.name.startsWith('data-window-'))!.name);
      expect(order).toEqual(['data-window-view', 'data-window-weather-ground', 'data-window-actors', 'data-window-weather']);
    }
  });

  // Ville vivante 1a : les passants de la ville ne sont plus des acteurs (voir city/people.ts) ; à réactiver quand le rendu de la population sera branché.
  it.skip('les drapeaux de la météo atteignent le décor : parapluies sous la pluie', () => {
    show(1, 'city', rainyWeather());
    expect(container.querySelector('[data-actors] [data-umbrella]')).not.toBeNull();
  });

  it('par temps sec, pas de gouttes sur la vitre (ni leur animation)', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('sun'), Date.now());
    show(2, 'city', { clock, flags: { gloom: false, rainy: false } });
    expect(container.querySelectorAll('[data-window-weather]')).toHaveLength(2);
    expect(container.querySelector('[data-glass-drops]')).toBeNull();
    expect(container.querySelector('[data-window-art] animate')).toBeNull();
  });

  it('sans météo, ni calque ni gouttes', () => {
    show(2);
    expect(container.querySelector('[data-weather]')).toBeNull();
    expect(container.querySelector('[data-window-weather]')).toBeNull();
    expect(container.querySelector('[data-glass-drops]')).toBeNull();
  });

  it.each(['space', 'earth'] as const)('scène %s : pas de météo même si le panneau en fournit une', (scene) => {
    show(2, scene, rainyWeather());
    expect(container.querySelector('[data-weather]')).toBeNull();
    expect(container.querySelector('[data-window-weather]')).toBeNull();
    expect(container.querySelector('[data-window-weather-ground]')).toBeNull();
    expect(container.querySelector('[data-glass-drops]')).toBeNull();
    expect(container.querySelector('[data-umbrella]')).toBeNull();
  });
});
