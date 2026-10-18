// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { HallLights } from '../../src/content/hall-lights';
import { StairLights, stairTransition } from '../../src/content/stair-lights';
import { cityFacades, stairsFor } from '../../src/core/library/city/facades';
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

describe('cage d’escalier (minuterie des halls)', () => {
  const stairs = stairsFor(cityFacades(1080, 340, 1));
  const [doorX, wins] = [...stairs].find(([, w]) => w.length >= 2)!;
  const mountStairs = (ghibli: boolean, still: boolean, lit: (x: number, k: number) => boolean): HTMLElement => {
    const host = document.createElement('div');
    root = createRoot(host);
    act(() => root!.render(<svg><StairLights stairs={stairs} ghibli={ghibli} still={still} lit={lit} /></svg>));
    return host;
  };
  const nodesOf = (host: HTMLElement, x: number): SVGElement[] =>
    [...host.querySelectorAll<SVGElement>(`[data-stair-light="${x}"]`)].sort((a, b) => Number(a.getAttribute('data-floor')) - Number(b.getAttribute('data-floor')));

  it('cage éteinte de jour et sans passage ; allumée du bas jusqu’à l’étage atteint après un passage de nuit', () => {
    const total = [...stairs.values()].reduce((s, w) => s + w.length, 0);
    const off = mountStairs(true, false, () => false);
    // Chaque fenêtre de cage a son nœud monté en permanence, éteint.
    expect(off.querySelectorAll('[data-stair-light]')).toHaveLength(total);
    expect([...off.querySelectorAll('[data-stair-light]')].every((n) => n.getAttribute('opacity') === '0')).toBe(true);
    act(() => root?.unmount());
    const host = mountStairs(true, false, (x, k) => x === doorX && k < 2);
    const nodes = nodesOf(host, doorX);
    expect(nodes).toHaveLength(wins.length);
    expect(nodes.map((n) => n.getAttribute('opacity'))).toEqual(wins.map((_, k) => (k < 2 ? '1' : '0')));
    // Étage 0 = la fenêtre la plus basse (stairsFor les trie de bas en haut) ; Ghibli : la fenêtre peinte (StairWindow).
    expect(nodes[0]!.querySelector('g[transform]')!.getAttribute('transform')).toBe(`translate(${wins[0]!.x} ${wins[0]!.y})`);
    expect(host.querySelectorAll('[data-stair-light][opacity="1"]')).toHaveLength(2);
  });

  it('étage par étage : délai croissant avec l’étage à l’allumage', () => {
    const host = mountStairs(true, false, (x) => x === doorX);
    const delays = nodesOf(host, doorX).map((n) => n.style.transition);
    expect(delays[0]).toBe('opacity 0.3s ease 0s');
    expect(delays[1]).toBe('opacity 0.3s ease 0.5s');
    // Extinction : douce, toutes ensemble.
    act(() => root?.unmount());
    const off = mountStairs(true, false, () => false);
    expect(nodesOf(off, doorX).every((n) => n.style.transition === 'opacity 1s ease')).toBe(true);
  });

  it('mouvement réduit : aucune transition', () => {
    const host = mountStairs(true, true, (x) => x === doorX);
    const nodes = [...host.querySelectorAll<SVGElement>('[data-stair-light]')];
    expect(nodes.every((n) => n.style.transition === 'none')).toBe(true);
    expect(stairTransition(true, 3, true)).toBe('none');
  });

  it('dessin classique : rectangle simple à la taille de chaque fenêtre', () => {
    const host = mountStairs(false, false, () => true);
    const rects = nodesOf(host, doorX).map((n) => n.querySelector('rect')!);
    expect(rects[0]!.getAttribute('fill')).toBe('#F4F0D8');
    expect(Number(rects[0]!.getAttribute('width'))).toBe(wins[0]!.w);
    expect(Number(rects[0]!.getAttribute('y'))).toBe(wins[0]!.y);
  });
});
