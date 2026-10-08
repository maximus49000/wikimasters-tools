// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import { createInitialState, activeRoom, setRoomScene, updateLayout } from '../../src/core/library/library-book';
import { skyAt, sunTimes } from '../../src/core/library/sky';

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

function show(windows: number, scene: 'city' | 'sea' = 'city') {
  let state = setRoomScene(createInitialState(), 'r1', scene);
  state = updateLayout(state, 'r1', () => Array.from({ length: windows }, (_, i) => ({ id: `w${i}`, kind: 'window' as const, col: 2 + i * 10, row: 1, w: 6 + i * 2, h: 5 })));
  act(() =>
    root.render(<RoomView room={activeRoom(state)} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} sceneView={{ sky: skyAt(13 * 60, times), minutes: 13 * 60 }} />),
  );
}

describe('RoomView — fenêtres', () => {
  it('sans fenêtre, aucun décor n’est dessiné', () => {
    show(0);
    expect(container.querySelector('[data-panorama]')).toBeNull();
  });

  it('deux fenêtres partagent UN SEUL décor', () => {
    show(2);
    expect(container.querySelectorAll('[data-panorama]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-furniture="window"]')).toHaveLength(2);
    const uses = container.querySelectorAll('use[data-window-view]');
    expect(uses).toHaveLength(2);
    expect(uses[0]!.getAttribute('href')).toBe(uses[1]!.getAttribute('href'));
  });

  it('chaque vitre est découpée à la taille de sa fenêtre', () => {
    show(2);
    const clips = Array.from(container.querySelectorAll('clipPath rect'));
    expect(clips).toHaveLength(2);
    const widths = clips.map((r) => Number(r.getAttribute('width')));
    expect(widths[1]!).toBeGreaterThan(widths[0]!);
  });

  it('le décor suit la scène de la pièce', () => {
    show(1, 'sea');
    expect(container.querySelector('[data-panorama][data-scene="sea"]')).not.toBeNull();
  });
});
