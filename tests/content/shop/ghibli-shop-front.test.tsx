// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { GhibliShopFront, shopLookOf } from '../../../src/content/shop/ghibli-shop-front';
import { ghibliStaffPost } from '../../../src/content/shop/ghibli-shop-glass';
import { facadeGeometry } from '../../../src/core/library/paint/shop/facade';
import { interiorPostOf } from '../../../src/core/library/paint/shop/interiors';
import { ShopContext, ShopRegistry } from '../../../src/content/shop/shop-host';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import type { ShopView } from '../../../src/core/library/city/shops/view';
import { skyAt } from '../../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});
const mount = (node: ReactElement): HTMLElement => {
  const host = document.createElement('div');
  root = createRoot(host);
  act(() => root!.render(<svg>{node}</svg>));
  return host;
};

const sun = { kind: 'normal' as const, sunrise: 360, sunset: 1200 };
const noon = skyAt(12 * 60, sun);
const night = skyAt(22 * 60, sun);
const slot = shopSlotsFor(720, 340, 1)[0]!;
const frame = shopFrame(slot, 238);
const view = (o: Partial<ShopView> = {}): ShopView => ({ slot, phase: 'open', sign: { type: 'bakery', name: 'Au Pain Perdu' }, placard: false, interior: 'bakery', works: null, moving: null, interiorStage: null, ...o });

function scene(reg: ShopRegistry, v: ShopView, sky = noon, slices?: { shown: number; n: number; doorRight: boolean }): ReactElement {
  return (
    <ShopContext.Provider value={reg}>
      <GhibliShopFront view={v} frame={frame} sky={sky} curb={258} interior={v.interior} slices={slices}>
        <g data-shop="classic" />
      </GhibliShopFront>
    </ShopContext.Provider>
  );
}
const drain = (queue: (() => void)[]): void => {
  while (queue.length) act(() => queue.shift()!());
};

describe('devantures Ghibli', () => {
  it('repli sur le classique tant que la façade n’est pas peinte, puis images', () => {
    const queue: (() => void)[] = [];
    const reg = new ShopRegistry('t', { schedule: (cb) => void queue.push(cb) });
    const host = mount(scene(reg, view()));
    expect(host.querySelector('[data-shop="classic"]')).not.toBeNull();
    drain(queue);
    expect(host.querySelector('[data-shop="classic"]')).toBeNull();
    expect(host.querySelector('[data-ghibli-shop] image[data-shop-layer="facade"]')).not.toBeNull();
    expect(host.querySelector('[data-ghibli-shop] image[data-shop-layer="back"]')).not.toBeNull();
  });

  it('états et lumière', () => {
    expect(shopLookOf(view({ phase: 'for-sale', sign: null, interior: null, placard: true }), frame, noon).state).toBe('empty');
    expect(shopLookOf(view({ phase: 'works', sign: null }), frame, noon).state).toBe('works');
    expect(shopLookOf(view({ phase: 'closed' }), frame, noon).state).toBe('closed');
    expect(shopLookOf(view(), frame, night).lit).toBe(true);
    expect(shopLookOf(view(), frame, noon).lit).toBe(false);
    expect(shopLookOf(view({ phase: 'closed' }), frame, night).lit).toBe(false);
  });

  it('tranches du déménagement : cache du côté de la porte', () => {
    const queue: (() => void)[] = [];
    const reg = new ShopRegistry('t', { schedule: (cb) => void queue.push(cb) });
    const host = mount(scene(reg, view({ phase: 'works', interior: null }), noon, { shown: 1, n: 3, doorRight: true }));
    drain(queue);
    const cover = host.querySelector('rect[data-slices-cover]')!;
    expect(cover).not.toBeNull();
    expect(Number(cover.getAttribute('width'))).toBeCloseTo((frame.window.w * 2) / 3, 5);
    expect(Number(cover.getAttribute('x'))).toBeCloseTo(frame.window.w / 3, 5);
  });

  it('pas de flaque fermé, une flaque ouvert la nuit', () => {
    for (const [v, n] of [[view({ phase: 'closed' }), 0], [view(), 1]] as const) {
      const queue: (() => void)[] = [];
      const reg = new ShopRegistry('t', { schedule: (cb) => void queue.push(cb) });
      const host = mount(scene(reg, v, night));
      drain(queue);
      expect(host.querySelectorAll('[data-shop-pool]').length).toBe(n);
      act(() => root?.unmount());
      root = null;
    }
  });

  it('premier plan (comptoir, vitre) dans le décor quand la boutique n’est pas ouverte, pas quand elle l’est', () => {
    for (const [v, n] of [[view({ phase: 'closed' }), 1], [view({ phase: 'works', interior: null }), 1], [view(), 0]] as const) {
      const queue: (() => void)[] = [];
      const reg = new ShopRegistry('t', { schedule: (cb) => void queue.push(cb) });
      const slices = v.phase === 'works' ? { shown: 2, n: 3, doorRight: true } : undefined;
      const host = mount(
        <ShopContext.Provider value={reg}>
          <GhibliShopFront view={v} frame={frame} sky={noon} curb={258} interior={v.interior ?? 'bakery'} slices={slices}>
            <g />
          </GhibliShopFront>
        </ShopContext.Provider>,
      );
      drain(queue);
      expect(host.querySelectorAll('image[data-shop-layer="front"]').length).toBe(n);
      act(() => root?.unmount());
      root = null;
    }
  });

  it('place du vendeur Ghibli : celle du comptoir peint, dans le repère de la vitrine', () => {
    for (const doorSide of ['left', 'right'] as const) {
      const sl = { ...slot, doorSide };
      const f = shopFrame(sl, 238);
      const v = view({ slot: sl });
      const g = facadeGeometry({ type: 'bakery', name: '', w: f.sign.w, doorSide, state: 'open', placard: false, night: false, lit: false });
      expect(ghibliStaffPost(v, f)).toBeCloseTo(g.glass.x - g.win.x + interiorPostOf('bakery', g.glass.w, g.glass.h), 6);
    }
  });
});

