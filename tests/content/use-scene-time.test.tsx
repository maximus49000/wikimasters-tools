// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSceneTime } from '../../src/content/use-scene-time';
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
  container = document.createElement('div');
  root = createRoot(container);
  last = null;
});
afterEach(() => {
  act(() => root.unmount());
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
});
