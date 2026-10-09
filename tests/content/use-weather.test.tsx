// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPosition, resetPositionForTests } from '../../src/content/scene-position';
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
  window.localStorage.clear();
  container = document.createElement('div');
  root = createRoot(container);
  last = null;
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
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

  describe('mode réel avec position connue', () => {
    const reply = (over: Record<string, number> = {}) => ({ ok: true, code: 61, temp: 8, cloud: 90, precip: 1, wind: 12, visibility: 9000, ...over });
    const stubFetch = (body: () => unknown) => {
      const fn = vi.fn(async () => ({ ok: true, json: async () => body() }) as Response);
      vi.stubGlobal('fetch', fn);
      return fn;
    };
    const grant = async (): Promise<void> => {
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 48.85, longitude: 2.35 } }) },
        configurable: true,
      });
      await act(async () => {
        await requestPosition();
      });
    };

    it('utilise l’observation, puis suit de nouvelles mesures au même code météo', async () => {
      let body = reply();
      const fetchFn = stubFetch(() => body);
      await grant();
      render({ mode: 'real' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(last?.real).toBe('ok');
      expect(last?.tempC).toBe(8);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40_000);
      });
      expect(last?.flags).toEqual({ gloom: true, rainy: true });
      expect(last!.clock.read(Date.now()).precip).toBeGreaterThan(0);
      const before = last!.clock.read(Date.now());
      expect(fetchFn).toHaveBeenCalledTimes(1);

      body = reply({ cloud: 100, precip: 3, temp: 9 });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16 * 60_000 + 60_000);
      });
      expect(fetchFn.mock.calls.length).toBeGreaterThan(1);
      expect(last?.tempC).toBe(9);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40_000);
      });
      const after = last!.clock.read(Date.now());
      expect(after.precip).toBeGreaterThan(before.precip);
    });

    it('le démontage arrête l’interrogation périodique', async () => {
      const fetchFn = stubFetch(() => reply());
      await grant();
      render({ mode: 'real' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      act(() => root.unmount());
      await vi.advanceTimersByTimeAsync(40 * 60_000);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      root = createRoot(container);
    });
  });
});
