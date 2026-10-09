// @vitest-environment jsdom
// tests/content/library-light.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIGHT_KEY, readLight, writeLight } from '../../src/content/light-setting';
import { LightLayer } from '../../src/content/light-layer';
import { RoomView, type SceneView } from '../../src/content/RoomView';
import type { Room } from '../../src/core/library/library-types';
import { skyAt } from '../../src/core/library/sky';
import { targetOf } from '../../src/core/library/weather/weather-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sky = skyAt(13 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });
const clock = { read: () => targetOf('sun') };
const windows = [{ x: 100, y: 60, w: 60, h: 100 }];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
const realMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = realMatchMedia;
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const mount = (toUrl: (m: unknown) => string | null, c: { read(n: number): ReturnType<typeof clock.read> } = clock) =>
  act(async () => {
    root.render(
      <svg viewBox="0 0 600 510">
        <LightLayer windows={windows} width={600} height={510} wallH={340} sky={sky} clock={c} toUrl={toUrl as never} />
      </svg>,
    );
  });

describe('LightLayer', () => {
  it('pose l’image calculée et la renouvelle quatre fois par seconde quand le ciel change', async () => {
    const toUrl = vi.fn(() => 'data:image/png;base64,AAAA');
    await mount(toUrl, { read: (n) => ({ ...targetOf('sun'), cloud: (Math.floor(n / 250) % 50) / 50 }) });
    const image = container.querySelector('image[data-light]');
    expect(image?.getAttribute('href')).toBe('data:image/png;base64,AAAA');
    expect(image?.getAttribute('width')).toBe('600');
    const first = toUrl.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(toUrl.mock.calls.length).toBeGreaterThanOrEqual(first + 3);
  });
  it('ne recalcule rien tant que les entrées ne changent pas, puis recalcule si les nuages changent', async () => {
    const toUrl = vi.fn(() => 'data:x');
    let cloud = 0;
    await mount(toUrl, { read: () => ({ ...targetOf('sun'), cloud }) });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(toUrl).toHaveBeenCalledTimes(1);
    cloud = 0.5;
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(toUrl).toHaveBeenCalledTimes(2);
  });
  it('n’écrit pas d’href si le canvas est indisponible', async () => {
    await mount(() => null);
    expect(container.querySelector('image[data-light]')?.hasAttribute('href')).toBe(false);
  });
  it('ne se renouvelle pas en mouvement réduit', async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} })) as never;
    const toUrl = vi.fn(() => 'data:x');
    await mount(toUrl);
    const first = toUrl.mock.calls.length;
    expect(first).toBe(1);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(toUrl.mock.calls.length).toBe(first);
  });
});

const room = (scene: Room['scene']): Room => ({
  id: 'r1', name: 'Salon', style: 'scandinave', scene, orientation: 'landscape', cols: 48, pets: [],
  layout: [{ id: 'w1', kind: 'window', col: 2, row: 1, w: 6, h: 5 }],
});
const sceneView: SceneView = { sky, minutes: 13 * 60, weather: { clock, flags: { gloom: false, rainy: false } } };
const mountRoom = (r: Room, light?: boolean) =>
  act(async () => {
    root.render(<RoomView room={r} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} sceneView={sceneView} light={light} />);
  });

describe('RoomView : calque de lumière', () => {
  it('monte le calque avec light, une scène terrestre et une fenêtre', async () => {
    await mountRoom(room('city'), true);
    expect(container.querySelector('image[data-light]')).not.toBeNull();
  });
  it('ne le monte pas sans light', async () => {
    await mountRoom(room('city'));
    expect(container.querySelector('image[data-light]')).toBeNull();
  });
  it('ne le monte pas en scène spatiale', async () => {
    await mountRoom(room('space'), true);
    expect(container.querySelector('image[data-light]')).toBeNull();
  });
});

describe('réglage Lumière', () => {
  afterEach(() => { try { localStorage.removeItem(LIGHT_KEY); } catch { /* */ } });
  it('est actif par défaut, s’éteint et se rallume', () => {
    expect(readLight()).toBe(true);
    writeLight(false);
    expect(readLight()).toBe(false);
    expect(localStorage.getItem(LIGHT_KEY)).toBe('off');
    writeLight(true);
    expect(readLight()).toBe(true);
  });
  it('reste actif si le stockage lève une exception', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readLight()).toBe(true);
    spy.mockRestore();
  });
});
