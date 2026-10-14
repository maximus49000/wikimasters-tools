// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSceneTime } from '../../src/content/use-scene-time';
import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';
import { resetPositionForTests } from '../../src/content/scene-position';
import type { TimeSetting } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let last: ReturnType<typeof useSceneTime> | null = null;

function Probe({ setting }: { setting: TimeSetting }) {
  last = useSceneTime(setting);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2024, 5, 21, 14, 37));
  window.localStorage.clear();
  resetLocationForTests();
  resetPositionForTests();
  container = document.createElement('div');
  root = createRoot(container);
  last = null;
});
afterEach(() => {
  act(() => root.unmount());
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('useSceneTime', () => {
  it('heure réelle : suit l’horloge et se met à jour', () => {
    act(() => root.render(<Probe setting={{ mode: 'real' }} />));
    expect(last!.minutes).toBe(14 * 60 + 37);
    act(() => { vi.setSystemTime(new Date(2024, 5, 21, 14, 50)); vi.advanceTimersByTime(31000); });
    expect(last!.minutes).toBe(14 * 60 + 50);
  });

  it('nuit forcée : minuit et ciel de nuit', () => {
    act(() => root.render(<Probe setting={{ mode: 'night' }} />));
    expect(last!.minutes).toBe(0);
    expect(last!.sky.phase).toBe('night');
  });

  it('jour forcé : midi et plein jour', () => {
    act(() => root.render(<Probe setting={{ mode: 'day' }} />));
    expect(last!.minutes).toBe(720);
    expect(last!.sky.daylight).toBe(1);
  });
  it('ville : minutes, date et lever/coucher de la ville (Tokyo vu depuis n’importe quel appareil)', () => {
    vi.setSystemTime(new Date('2026-10-14T20:00:00Z'));
    locationSetting.set({ mode: 'city', city: { name: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' } });
    act(() => root.render(<Probe setting={{ mode: 'real' }} />));
    expect(last!.minutes).toBe(5 * 60);
    expect(last!.date).toEqual({ y: 2026, m: 10, d: 15 });
    expect(last!.tz).toBe('Asia/Tokyo');
    const t = last!.times;
    expect(t.kind).toBe('normal');
    if (t.kind === 'normal') {
      // Tokyo le 15 octobre : lever vers 5 h 45, coucher vers 17 h 10 (heure de Tokyo).
      expect(t.sunrise).toBeGreaterThan(5 * 60 + 30);
      expect(t.sunrise).toBeLessThan(6 * 60);
      expect(t.sunset).toBeGreaterThan(16 * 60 + 55);
      expect(t.sunset).toBeLessThan(17 * 60 + 25);
    }
  });

  it('changer de lieu recalcule l’heure sans attendre la relecture des 30 s', () => {
    vi.setSystemTime(new Date('2026-10-14T20:00:00Z'));
    act(() => root.render(<Probe setting={{ mode: 'real' }} />));
    expect(last!.tz).toBeNull();
    act(() => locationSetting.set({ mode: 'city', city: { name: 'Bombay', country: 'Inde', lat: 19.08, lon: 72.88, tz: 'Asia/Kolkata' } }));
    expect(last!.minutes).toBe(90);
    expect(last!.tz).toBe('Asia/Kolkata');
  });
});
