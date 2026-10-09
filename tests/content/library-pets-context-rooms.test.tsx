// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePetContext, type PetContextInput } from '../../src/content/pet-context';
import type { PetContext } from '../../src/core/library/pets/context';
import { skyAt } from '../../src/core/library/sky';
import { targetOf } from '../../src/core/library/weather/weather-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const times = { kind: 'normal' as const, sunrise: 360, sunset: 1200 };
const room = (id: string, windows: boolean) => ({ id, cols: 24, scene: 'city', layout: windows ? [{ id: 'w', kind: 'window', col: 4, row: 2, w: 4, h: 5 }] : [] }) as never;
const view = (w = targetOf('storm')) => ({ sky: skyAt(720, times), minutes: 720, weather: { clock: { read: () => w }, flags: { gloom: false, rainy: false } } }) as never;

afterEach(() => vi.useRealTimers());

describe('usePetContext : un suivi par pièce', () => {
  it('passer d’une pièce à fenêtre sous l’orage à une pièce sans fenêtre n’invente ni fin de pluie ni orage', () => {
    vi.useFakeTimers();
    let get!: () => PetContext;
    let input: PetContextInput = { room: room('A', true), sceneView: view(), lightOn: true };
    function Probe() {
      get = usePetContext(input);
      return null;
    }
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(<Probe />));
    const at = (t: number, i: PetContextInput): PetContext => {
      vi.setSystemTime(t);
      input = i;
      act(() => root.render(<Probe />));
      return get();
    };
    const A: PetContextInput = { room: room('A', true), sceneView: view(), lightOn: true };
    const B: PetContextInput = { room: room('B', false), sceneView: view(), lightOn: true };
    const a1 = at(1000, A);
    expect(a1.storm).toEqual({ id: 1, since: 1000 });
    const b = at(5000, B);
    expect(b.storm).toBeNull();
    expect(b.rainEndedAt).toBeNull();
    const a2 = at(9000, A);
    expect(a2.storm).toEqual({ id: 1, since: 1000 });
    expect(a2.rainEndedAt).toBeNull();
    act(() => root.unmount());
  });
});
