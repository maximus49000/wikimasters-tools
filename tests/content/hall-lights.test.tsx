// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fadeSettled, writeFade } from '../../src/content/fade-light';
import { HallLights } from '../../src/content/hall-lights';
import { StairLights, placeStairFigures, stairTransition } from '../../src/content/stair-lights';
import { climbRun, stairFigureAt } from '../../src/core/library/city/hall-lights';
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
  const sky = { daylight: 0.1 } as Parameters<typeof StairLights>[0]['sky'];
  const mountStairs = (ghibli: boolean, still: boolean, lit: (x: number, k: number) => boolean): HTMLElement => {
    const host = document.createElement('div');
    root = createRoot(host);
    act(() => root!.render(<svg><StairLights stairs={stairs} ghibli={ghibli} still={still} lit={lit} sky={sky} /></svg>));
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

  it('silhouette : une par fenêtre de cage, cachée, découpée par la vitre ; aucune en mouvement réduit ni en dessin classique', () => {
    const total = [...stairs.values()].reduce((s, w) => s + w.length, 0);
    const host = mountStairs(true, false, () => false);
    const figs = host.querySelectorAll<SVGElement>('[data-stair-figure]');
    expect(figs).toHaveLength(total);
    expect([...figs].every((n) => n.getAttribute('opacity') === '0')).toBe(true);
    // Pantin 2D en silhouette, coupé par le <clipPath> SVG de sa fenêtre (pas de clip-path CSS).
    const f0 = host.querySelector<SVGElement>(`[data-stair-figure="${doorX}"][data-floor="0"]`)!;
    expect(f0.querySelector('[data-figure]')).not.toBeNull();
    const clip = f0.getAttribute('clip-path')!;
    expect(clip).toMatch(/^url\(#.+\)$/);
    const rect = host.querySelector(`${clip.slice(4, -1).replace(/:/g, '\:')} rect`)!;
    expect(Number(rect.getAttribute('y'))).toBe(wins[0]!.y);
    expect(f0.style.clipPath).toBe('');
    act(() => root?.unmount());
    expect(mountStairs(true, true, () => true).querySelectorAll('[data-stair-figure]')).toHaveLength(0);
    act(() => root?.unmount());
    expect(mountStairs(false, false, () => true).querySelectorAll('[data-stair-figure]')).toHaveLength(0);
  });

  it('silhouette qui monte : un étage à la fois, du rez-de-chaussée à l’étage du foyer, en n’écrivant qu’aux changements', () => {
    const host = mountStairs(true, false, () => true);
    const nodes = [...host.querySelectorAll<SVGElement>(`[data-stair-figure="${doorX}"]`)].sort((a, b) => Number(a.getAttribute('data-floor')) - Number(b.getAttribute('data-floor')));
    const run = climbRun({ climb: 0.35 + 0.22 * 3 }, 2, 100, 'in');
    let shown = -1;
    const seen: number[] = [];
    for (let t = 100; t < run.start + run.dur + 5; t += 0.5) {
      const k = stairFigureAt(run, t);
      shown = placeStairFigures(nodes, shown, k);
      const on = nodes.map((n, i) => (n.getAttribute('opacity') === '1' ? i : -1)).filter((i) => i >= 0);
      expect(on.length).toBeLessThanOrEqual(1);
      const cur = on[0] ?? -1;
      if (seen[seen.length - 1] !== cur) seen.push(cur);
    }
    expect(seen).toEqual([-1, 0, 1, -1]);
  });

  it('table refaite (nouvelle boucle) : tous les nœuds sont écrits, une seule silhouette, jamais figée', () => {
    const host = mountStairs(true, false, () => true);
    const nodes = [...host.querySelectorAll<SVGElement>(`[data-stair-figure="${doorX}"]`)].sort((a, b) => Number(a.getAttribute('data-floor')) - Number(b.getAttribute('data-floor')));
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    // L'ancienne boucle montrait l'étage 0 ; la nouvelle ne le sait pas (shown inconnu).
    nodes[0]!.setAttribute('opacity', '1');
    expect(placeStairFigures(nodes, undefined, 1)).toBe(1);
    expect(nodes.map((n) => n.getAttribute('opacity'))).toEqual(nodes.map((_, i) => (i === 1 ? '1' : '0')));
    // Fin de la montée sous une table refaite : plus aucune silhouette.
    expect(placeStairFigures(nodes, undefined, -1)).toBe(-1);
    expect(nodes.every((n) => n.getAttribute('opacity') === '0')).toBe(true);
  });

  it('silhouettes à opacité 0 cachées (display none), montrées dans la même écriture que l’opacité 1', () => {
    const host = mountStairs(true, false, () => true);
    const nodes = [...host.querySelectorAll<SVGElement>(`[data-stair-figure="${doorX}"]`)].sort((a, b) => Number(a.getAttribute('data-floor')) - Number(b.getAttribute('data-floor')));
    // Rendu : toutes cachées.
    expect(nodes.every((n) => n.getAttribute('display') === 'none')).toBe(true);
    let shown = placeStairFigures(nodes, undefined, 0);
    const state = () => nodes.map((n) => `${n.getAttribute('opacity')}|${n.getAttribute('display') ?? ''}`);
    expect(state()).toEqual(nodes.map((_, i) => (i === 0 ? '1|' : '0|none')));
    shown = placeStairFigures(nodes, shown, 1);
    expect(state()).toEqual(nodes.map((_, i) => (i === 1 ? '1|' : '0|none')));
    placeStairFigures(nodes, shown, -1);
    expect(nodes.every((n) => n.getAttribute('display') === 'none')).toBe(true);
  });
});

describe('lumière basculée par la boucle (writeFade)', () => {
  const node = (opacity: string): SVGElement => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('opacity', opacity);
    return g;
  };
  it('premier placement éteint : caché tout de suite ; extinction : caché après le fondu ; rallumée pendant le fondu : jamais cachée', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const off = node('0');
      writeFade(off, false, 'opacity 1s ease', 1);
      expect(off.getAttribute('display')).toBe('none');
      expect(fadeSettled(off, false)).toBe(true);
      const g = node('1');
      writeFade(g, false, 'opacity 1s ease', 1);
      expect(g.getAttribute('opacity')).toBe('0');
      expect(g.hasAttribute('display')).toBe(false);
      expect(fadeSettled(g, false)).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(g.hasAttribute('display')).toBe(false);
      vi.advanceTimersByTime(200);
      expect(g.getAttribute('display')).toBe('none');
      // Rallumage d'un nœud caché : montré à 0, style relu, puis opacité 1 (le fondu et son délai d'étage partent de 0).
      const read: string[] = [];
      const real = window.getComputedStyle.bind(window);
      const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
        if (el === g) read.push(`${el.getAttribute('display')}|${el.getAttribute('opacity')}|${(el as SVGElement).style.transition}`);
        return real(el, pseudo);
      });
      writeFade(g, true, stairTransition(true, 2, false), 1);
      spy.mockRestore();
      expect(read).toEqual([`null|0|${stairTransition(true, 2, false)}`]);
      expect(g.getAttribute('opacity')).toBe('1');
      expect(fadeSettled(g, true)).toBe(true);
      // Éteinte puis rallumée avant la fin du fondu : la minuterie est annulée.
      writeFade(g, false, 'opacity 1s ease', 1);
      vi.advanceTimersByTime(500);
      writeFade(g, true, 'opacity 0.3s ease', 1);
      vi.advanceTimersByTime(2000);
      expect(g.hasAttribute('display')).toBe(false);
      expect(g.getAttribute('opacity')).toBe('1');
      // Montrée allumée par un rendu React alors qu'elle était cachée : pas « en place », la boucle la réécrit.
      writeFade(g, false, 'none', 0);
      expect(g.getAttribute('display')).toBe('none');
      g.setAttribute('opacity', '1');
      expect(fadeSettled(g, true)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
