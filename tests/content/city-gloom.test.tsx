// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoomView, type SceneView } from '../../src/content/RoomView';
import { dayContext } from '../../src/core/library/city/calendar';
import type { Room } from '../../src/core/library/library-types';
import { skyAt } from '../../src/core/library/sky';
import { targetOf } from '../../src/core/library/weather/weather-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const room: Room = { id: 'r1', name: 'Salon', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 48, pets: [], layout: [{ id: 'w1', kind: 'window', col: 2, row: 1, w: 6, h: 5 }] };
const sky = skyAt(12 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });
const view = (gloom: boolean, rainy: boolean): SceneView => ({
  sky,
  minutes: 12 * 60,
  weather: { clock: { read: () => targetOf('sun') }, flags: { gloom, rainy } },
  city: { day: dayContext({ y: 2026, m: 10, d: 10 }, []), forcedNight: false },
});
const mount = (v: SceneView) =>
  act(async () => {
    root.render(<RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} sceneView={v} />);
  });

describe('Ville : parapluies', () => {
  it('ciel couvert sans pluie : aucun parapluie', async () => {
    await mount(view(true, false));
    expect(container.querySelectorAll('[data-ped][data-active="true"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-umbrella]')).toBeNull();
  });
  it('sous la pluie : des parapluies', async () => {
    await mount(view(true, true));
    expect(container.querySelector('[data-umbrella]')).not.toBeNull();
  });
});
