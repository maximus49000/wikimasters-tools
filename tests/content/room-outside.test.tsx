// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import { createInitialState, activeRoom, setRoomScene, updateLayout } from '../../src/core/library/library-book';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import type { SceneId } from '../../src/core/library/library-types';
import { dayContext } from '../../src/core/library/city/calendar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const cityDay = dayContext({ y: 2024, m: 6, d: 21 }, []);

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Mode = { outside?: boolean; roomLayers?: 'shown' | 'hidden' };
function show(windows: number, scene: SceneId = 'city', weather?: undefined, drag: null = null, mode: Mode = {}) {
  let state = setRoomScene(createInitialState(), 'r1', scene);
  state = updateLayout(state, 'r1', () => Array.from({ length: windows }, (_, i) => ({ id: `w${i}`, kind: 'window' as const, col: 2 + i * 10, row: 1, w: 6 + i * 2, h: 5 })));
  act(() =>
    root.render(<RoomView room={activeRoom(state)} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} drag={drag} sceneView={{ sky: skyAt(13 * 60, times), minutes: 13 * 60, weather, city: { day: cityDay, forcedNight: false } }} {...mode} />),
  );
}

describe('RoomView — dehors', () => {
  it('dehors, le décor couvre tout le monde même sans fenêtre, et la pièce disparaît', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true })); // mouvement réduit : pas de fondu
    show(0, 'city', undefined, null, { outside: true, roomLayers: 'hidden' });
    const views = container.querySelector('svg[data-window-views]')!;
    expect(views.getAttribute('viewBox')).toBe(`0 0 ${24 * 30} 340`);
    expect(container.querySelector('[data-panorama]')).not.toBeNull();
    expect(container.querySelector('[data-window-wall]')).toBeNull();
    expect(container.querySelector('[data-room-layers]')).toBeNull();
    expect(container.querySelector('[data-follow-marker]')).not.toBeNull();
    const svg = container.querySelector('svg[role="img"]')!;
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${24 * 30} 340`);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
  });

  it('la bascule garde le même nœud du monde (les acteurs continuent)', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    show(1);
    const before = container.querySelector('[data-window-actors]');
    show(1, 'city', undefined, null, { outside: true, roomLayers: 'hidden' });
    expect(container.querySelector('[data-window-actors]')).toBe(before);
    show(1);
    expect(container.querySelector('[data-window-actors]')).toBe(before);
    expect(container.querySelector('[data-furniture="window"]')).not.toBeNull();
  });

  it('sans mouvement réduit, la pièce s’estompe 400 ms avant d’être retirée', () => {
    vi.useFakeTimers();
    show(1);
    show(1, 'city', undefined, null, { outside: true, roomLayers: 'hidden' });
    const layers = container.querySelector<SVGGElement>('[data-room-layers]')!;
    expect(layers.style.opacity).toBe('0');
    act(() => { vi.advanceTimersByTime(400); });
    expect(container.querySelector('[data-room-layers]')).toBeNull();
  });
});
