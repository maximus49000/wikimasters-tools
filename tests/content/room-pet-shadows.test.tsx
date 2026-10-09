// @vitest-environment jsdom
// Câblage des animaux vers le calque de lumière : RoomView fabrique `getPetBoxes` à partir de `petFrames`.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Box } from '../../src/core/library/light/occluders';
import type { PetFrame } from '../../src/core/library/pets/runner';

const seen: Array<{ getPetBoxes?: () => readonly Box[] }> = [];
vi.mock('../../src/content/light-layer', () => ({
  LightLayer: (props: { getPetBoxes?: () => readonly Box[] }) => { seen.push(props); return null; },
}));

import { RoomView } from '../../src/content/RoomView';
import { createInitialState, activeRoom, updateLayout } from '../../src/core/library/library-book';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { createWeatherClock, steadySource } from '../../src/core/library/weather/weather-clock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
beforeEach(() => {
  seen.length = 0;
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

const clock = createWeatherClock();
clock.setSource(steadySource('sun'), Date.now());
const weather = { clock, flags: { gloom: false, rainy: false } };
const state = updateLayout(createInitialState(), 'r1', () => [{ id: 'w0', kind: 'window' as const, col: 2, row: 1, w: 6, h: 5 }]);
const room = activeRoom(state);
const cat = (x: number): PetFrame => ({ id: 'p1', species: 'cat', coat: 'tabby', name: 'Mimi', pose: 'walk', facing: 'r', behind: 0, top: false, on: null, pos: { x, y: 400 }, depthY: 400 } as PetFrame);

const show = (petFrames?: () => readonly PetFrame[], pets: never[] = []) =>
  act(() => root.render(
    <RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined}
      sceneView={{ sky: skyAt(13 * 60, times), minutes: 13 * 60, weather }} light petFrames={petFrames} pets={pets} />,
  ));

describe('RoomView — ombres des animaux', () => {
  it('sans petFrames, le calque se monte sans getPetBoxes', () => {
    show();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)!.getPetBoxes).toBeUndefined();
  });
  it('avec petFrames, le calque reçoit un getPetBoxes qui relit les images courantes', () => {
    let x = 100;
    show(() => [cat(x)]);
    const get = seen.at(-1)!.getPetBoxes!;
    expect(get).toBeTypeOf('function');
    const a = get();
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((b) => b.owner === 'p1')).toBe(true);
    x = 300;
    const b = get();
    expect(b[0]!.x0).toBeGreaterThan(a[0]!.x0);
  });
  it('getPetBoxes garde la même identité d’un rendu à l’autre (le calque n’est pas relancé)', () => {
    const frames = () => [cat(100)];
    show(frames);
    const first = seen.at(-1)!.getPetBoxes;
    show(frames, []);
    show(frames, [] as never[]);
    expect(seen.at(-1)!.getPetBoxes).toBe(first);
  });
});
