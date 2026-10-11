// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { BLANK_SPRITE } from '../../../src/content/figure/figure-host';
import { ShopContext, ShopRegistry, layerBox, paintShopLayer, quantDay, shopKey, useShopLayer, type ShopLook } from '../../../src/content/shop/shop-host';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});
const render = (node: ReactElement): { rerender: (n: ReactElement) => void } => {
  root = createRoot(document.createElement('div'));
  act(() => root!.render(node));
  return { rerender: (n) => act(() => root!.render(n)) };
};

const look = (o: Partial<ShopLook> = {}): ShopLook => ({ type: 'bakery', name: 'Au Pain Perdu', w: 44, h: 22, doorSide: 'right', state: 'open', day: 1, lit: false, seed: 1, ...o });

describe('registre des commerces', () => {
  it('clés distinctes par couche, état, côté, lumière, nom', () => {
    const base = shopKey(look(), 'facade');
    for (const o of [{ state: 'closed' as const }, { doorSide: 'left' as const }, { day: 0.5 }, { lit: true }, { name: 'Autre' }]) expect(shopKey(look(o), 'facade')).not.toBe(base);
    expect(shopKey(look(), 'back')).not.toBe(base);
    expect(shopKey(look({ name: 'Autre' }), 'back')).toBe(shopKey(look(), 'back'));
    expect(quantDay(0.53)).toBe(0.5);
  });

  it('cadres : la façade déborde du local, le fond tient dans la vitrine', () => {
    const f = layerBox(look(), 'facade');
    expect(f.x).toBeLessThan(0);
    expect(f.x + f.w).toBeGreaterThan(44);
    const b = layerBox(look(), 'back');
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(44);
  });

  it('sans canvas : image vide', () => {
    expect(paintShopLayer(look(), 'facade')).toBe(BLANK_SPRITE);
  });

  it('budget par passage, plafond', () => {
    const queue: (() => void)[] = [];
    const r = new ShopRegistry('t', { max: 3, perFrame: 2, schedule: (cb) => void queue.push(cb) });
    let painted = 0;
    for (const k of ['a', 'b', 'c', 'd'])
      r.want(
        k,
        () => {
          painted++;
          return `u${k}`;
        },
        () => undefined,
      );
    queue.shift()!();
    expect(painted).toBe(2);
    queue.shift()!();
    expect(painted).toBe(4);
    expect(r.size()).toBe(3);
    expect(r.get('a')).toBeNull();
    expect(r.get('d')).toBe('ud');
  });

  it('garde l’ancienne image pendant la peinture de la nouvelle', () => {
    const queue: (() => void)[] = [];
    const reg = new ShopRegistry('t', { schedule: (cb) => void queue.push(cb) });
    const seen: (string | null)[] = [];
    function Probe({ l }: { l: ShopLook }) {
      seen.push(useShopLayer(l, 'facade'));
      return null;
    }
    const { rerender } = render(
      <ShopContext.Provider value={reg}>
        <Probe l={look()} />
      </ShopContext.Provider>,
    );
    expect(seen[seen.length - 1]).toBeNull();
    act(() => queue.shift()!());
    const first = seen[seen.length - 1];
    expect(first).toBe(BLANK_SPRITE);
    rerender(
      <ShopContext.Provider value={reg}>
        <Probe l={look({ day: 0.25 })} />
      </ShopContext.Provider>,
    );
    expect(seen[seen.length - 1]).toBe(first);
  });
});
