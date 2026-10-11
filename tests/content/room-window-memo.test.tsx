// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const renders = vi.hoisted(() => ({ weather: 0 }));
vi.mock('../../src/content/scene-weather', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/content/scene-weather')>();
  const React = await import('react');
  const Counted = React.memo(function CountedWeather(props: React.ComponentProps<typeof mod.WeatherLayer>) {
    renders.weather++;
    return React.createElement(mod.WeatherLayer, props);
  });
  return { ...mod, WeatherLayer: Counted };
});

import { RoomView } from '../../src/content/RoomView';
import { createInitialState, activeRoom, setRoomScene, updateLayout } from '../../src/core/library/library-book';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { createWeatherClock, steadySource } from '../../src/core/library/weather/weather-clock';
import { dayContext } from '../../src/core/library/city/calendar';

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

describe('RoomView — météo mémoïsée', () => {
  it('un glissé (re-rendu de la pièce seul) ne refait pas la couche météo', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('rain'), Date.now());
    let state = setRoomScene(createInitialState(), 'r1', 'city');
    state = updateLayout(state, 'r1', () => [{ id: 'w0', kind: 'window' as const, col: 2, row: 1, w: 6, h: 5 }, { id: 'w1', kind: 'window' as const, col: 12, row: 1, w: 6, h: 5 }]);
    const room = activeRoom(state);
    const sceneView = { sky: skyAt(13 * 60, times), minutes: 13 * 60, weather: { clock, flags: { gloom: true, rainy: true } }, city: { day: dayContext({ y: 2024, m: 6, d: 21 }, []), forcedNight: false } };
    const draw = (x: number) =>
      act(() => root.render(<RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} drag={{ id: 'w0', x, y: 100, ok: true, ghost: null }} sceneView={sceneView} />));
    draw(100);
    const before = renders.weather;
    expect(before).toBeGreaterThan(0);
    draw(120);
    draw(140);
    expect(renders.weather).toBe(before);
  });
});
