// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FondLife } from '../../src/content/fond-life';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
import { fondMoment, SUNNY } from '../../src/core/library/paint/fond-time';

// Calque de la vie du fond (ville peinte) : nœuds à opacité 0 cachés (display none) au repos, sans rien changer à l'écran.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const plan = cityPaintPlan(1440, 340, 7);
const moment = fondMoment({ y: 2026, m: 10, d: 27 }, 0, SUNNY);
const render = (h: number, daylight: number) =>
  act(() => {
    root.render(
      <svg>
        <FondLife plan={plan} moment={moment} minutes={h * 60} daylight={daylight} twilight={0} gloom={false} dim={1 - daylight} at={h} still={false} />
      </svg>,
    );
  });
const windows = () => [...container.querySelectorAll('[data-vie^="fenetre-"]')];
const isOn = (el: Element) => Number(el.getAttribute('opacity')) > 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('vie du fond : nœuds invisibles cachés', () => {
  it('fenêtres éteintes cachées ; extinction cachée après le fondu de 4 s ; rallumage depuis 0', () => {
    // 22 h : des fenêtres du fond allumées, d'autres éteintes.
    render(22, 0);
    const on = windows().filter(isOn);
    const off = windows().filter((el) => !isOn(el));
    expect(on.length).toBeGreaterThan(0);
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((el) => el.getAttribute('display') === 'none')).toBe(true);
    expect(on.every((el) => el.getAttribute('display') === 'inline')).toBe(true);
    // Allumées au montage : écrites telles quelles (pas de fondu depuis 0, comme avant).
    expect(on.every((el) => (el as SVGElement).style.transition === 'opacity 4s ease')).toBe(true);
    // Midi : tout s'éteint ; montrées à 0 le temps du fondu, cachées ensuite (la boucle tourne à 15 images/s).
    render(12, 1);
    expect(on.every((el) => el.getAttribute('display') === 'inline' && el.getAttribute('opacity') === '0')).toBe(true);
    act(() => void vi.advanceTimersByTime(3800));
    expect(on.every((el) => el.getAttribute('display') === 'inline')).toBe(true);
    act(() => void vi.advanceTimersByTime(600));
    expect(on.every((el) => el.getAttribute('display') === 'none')).toBe(true);
    // Rallumage : montrée (display inline) à 0, style relu, puis son opacité (le fondu CSS part de 0).
    const read: string[] = [];
    const real = window.getComputedStyle.bind(window);
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
      if (el === on[0]) read.push(`${el.getAttribute('display')}|${el.getAttribute('opacity')}`);
      return real(el, pseudo);
    });
    render(22, 0);
    spy.mockRestore();
    expect(read).toEqual(['inline|0']);
    expect(on.every((el) => el.getAttribute('display') === 'inline' && isOn(el))).toBe(true);
  });

  it('rallumée pendant le fondu de sortie : jamais cachée', () => {
    render(22, 0);
    const on = windows().filter(isOn);
    render(12, 1);
    act(() => void vi.advanceTimersByTime(2000));
    render(22, 0);
    act(() => void vi.advanceTimersByTime(5000));
    expect(on.every((el) => el.getAttribute('display') === 'inline' && isOn(el))).toBe(true);
  });
});
