// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPositionForTests } from '../../src/content/scene-position';
import { useWeather, type WeatherView } from '../../src/content/use-weather';
import type { WeatherSetting } from '../../src/core/library/library-types';
import { targetOf } from '../../src/core/library/weather/weather-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let last: WeatherView | null = null;

function Probe({ setting }: { setting: WeatherSetting }) {
  last = useWeather(setting);
  return null;
}
const render = (setting: WeatherSetting): void => act(() => root.render(<Probe setting={setting} />));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 21, 14, 0));
  resetPositionForTests();
  container = document.createElement('div');
  root = createRoot(container);
  last = null;
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('useWeather', () => {
  it('forcé : la météo choisie, son libellé et ses drapeaux', () => {
    render({ mode: 'forced', state: 'storm' });
    act(() => vi.advanceTimersByTime(40_000));
    expect(last?.label).toBe('Orage');
    expect(last?.clock.read(Date.now()).lightning).toBe(1);
    expect(last?.flags).toEqual({ gloom: true, rainy: true });
    expect(last?.real).toBeNull();
  });
  it('aléatoire : valeurs bornées et déterministes à un instant donné', () => {
    render({ mode: 'random' });
    const a = last!.clock.read(Date.now());
    const b = last!.clock.read(Date.now());
    expect(a).toEqual(b);
    expect(a.cloud).toBeGreaterThanOrEqual(0);
    expect(last?.real).toBeNull();
  });
  it('réelle sans position connue : repli sur l’aléatoire, signalé', () => {
    render({ mode: 'real' });
    expect(last?.real).toBe('fallback');
    expect(last?.tempC).toBeNull();
  });
  it('un changement de réglage fond la météo au lieu de la basculer', () => {
    render({ mode: 'forced', state: 'sun' });
    act(() => vi.advanceTimersByTime(40_000));
    render({ mode: 'forced', state: 'storm' });
    const now = Date.now();
    const start = last!.clock.read(now);
    expect(start.cloud).toBeCloseTo(targetOf('sun').cloud, 1);
    act(() => vi.advanceTimersByTime(15_000));
    const mid = last!.clock.read(Date.now());
    expect(mid.cloud).toBeGreaterThan(start.cloud);
    expect(mid.cloud).toBeLessThan(1);
  });
});
