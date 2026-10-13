// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { HallLights } from '../../src/content/hall-lights';
import { DOOR_WIDTH } from '../../src/core/library/city/metrics';
import { doorsFor } from '../../src/core/library/city/doors';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});
const doors = doorsFor(1080, 340, 1);
const mount = (ghibli: boolean, lit: (x: number) => boolean): HTMLElement => {
  const host = document.createElement('div');
  root = createRoot(host);
  act(() => root!.render(<svg><HallLights doors={doors} unit={1} doorY={240} ghibli={ghibli} still={false} lit={lit} /></svg>));
  return host;
};

describe('lumières des halls (minuterie)', () => {
  it('une lumière par entrée, éteinte sauf celles dont la minuterie court', () => {
    const first = doors[0]!.x + DOOR_WIDTH / 2;
    const host = mount(true, (x) => x === first);
    const lights = host.querySelectorAll('[data-hall-light]');
    expect(lights).toHaveLength(doors.length);
    const on = [...lights].filter((n) => n.getAttribute('opacity') === '1');
    expect(on).toHaveLength(1);
    expect(on[0]!.getAttribute('data-hall-light')).toBe(String(first));
    // Ghibli : l'imposte peinte ; allumage franc.
    expect(on[0]!.querySelector('[data-entrance-light]')).not.toBeNull();
    expect((on[0] as SVGElement).style.transition).toContain('0.3s');
    expect((lights[1] as SVGElement).style.transition).toContain('1s');
  });

  it('dessin classique : vitres éclairées de l’entrée', () => {
    const host = mount(false, () => true);
    expect(host.querySelectorAll('[data-hall-light] rect').length).toBeGreaterThanOrEqual(doors.length);
    expect(host.innerHTML.toLowerCase()).toContain('#ffd27a');
  });
});
