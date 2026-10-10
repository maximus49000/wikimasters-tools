// @vitest-environment jsdom
// tests/content/shop-sprites.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { CarriedPlacard, CarriedSign, ForSalePlacard, LadderSprite, ShopFront } from '../../src/content/shop-sprites';
import { shopFrame } from '../../src/core/library/city/shops/slots';
import type { ShopView } from '../../src/core/library/city/shops/view';
import { skyAt } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const slot = { id: 'shop-0', index: 0, x: 100, w: 30, doorSide: 'left' as const, residentDoorX: 84 };
const frame = shopFrame(slot, 238);
const sky = skyAt(12 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});
const mount = (node: React.ReactNode): HTMLElement => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<svg>{node}</svg>));
  return host;
};
const draw = (view: Partial<ShopView>, children?: React.ReactNode): HTMLElement =>
  mount(
    <ShopFront
      frame={frame}
      view={{ slot, phase: 'open', sign: { type: 'cafe', name: 'Le Zinc' }, placard: false, interior: 'cafe', works: null, moving: null, interiorStage: null, ...view }}
      sky={sky}
      lit={false}
    >
      {children}
    </ShopFront>,
  );

describe('devanture', () => {
  it('écrit le nom sur l’enseigne et met un store au café', () => {
    const c = draw({});
    expect(c.querySelector('[data-shop-sign="cafe"]')?.textContent).toContain('Le Zinc');
    expect(c.querySelector('[data-awning]')).not.toBeNull();
    expect(c.querySelector('[data-shutter]')).toBeNull();
    expect(c.querySelector('[data-shop="shop-0"]')).not.toBeNull();
  });
  it('baisse le rideau quand c’est fermé', () => {
    expect(draw({ phase: 'closed' }).querySelector('[data-shutter]')).not.toBeNull();
  });
  it('teint le rideau et l’écriteau la nuit', () => {
    const night = skyAt(3 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });
    const fillOf = (c: HTMLElement, sel: string): string => c.querySelector(sel + ' rect')?.getAttribute('fill') ?? '';
    const view = { slot, phase: 'closed' as const, sign: null, placard: true, interior: null, works: null, moving: null, interiorStage: null };
    const at = (s: typeof sky): HTMLElement => mount(<ShopFront frame={frame} view={view} sky={s} lit={false} />);
    const day = fillOf(at(sky), '[data-shutter]');
    const dark = fillOf(at(night), '[data-shutter]');
    expect(day.toUpperCase()).toBe('#8C939C');
    expect(dark).not.toBe(day);
    const lum = (h: string): number => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(lum(dark)).toBeLessThan(lum(day));
    expect(fillOf(at(night), '[data-placard]')).not.toBe(fillOf(at(sky), '[data-placard]'));
  });
  it('À vendre : bandeau nu et écriteau', () => {
    const c = draw({ phase: 'for-sale', sign: null, placard: true, interior: null });
    expect(c.querySelector('[data-shop-sign="bare"]')).not.toBeNull();
    expect(c.querySelector('[data-placard]')?.textContent).toContain('À VENDRE');
  });
  it('ajuste un nom trop long et place l’intérieur dans la vitrine', () => {
    const c = draw({ sign: { type: 'cafe', name: 'Café de la Grande Place Centrale' } }, <rect data-inside="1" />);
    expect(c.querySelector('text')?.getAttribute('textLength')).toBe(String(frame.sign.w - 2));
    expect(c.querySelector('svg svg [data-inside]')).not.toBeNull();
  });
  it('n’utilise aucun id (la scène est copiée dans chaque fenêtre par <use>)', () => {
    expect(draw({}).querySelector('[id]')).toBeNull();
    const c = mount(<g><LadderSprite height={20} /><CarriedSign type="bakery" name="Au Fournil" w={20} sky={sky} /><CarriedPlacard w={14} sky={sky} /><ForSalePlacard x={0} y={0} w={20} sky={sky} /></g>);
    expect(c.querySelector('[id]')).toBeNull();
    expect(c.textContent).toContain('À VENDRE');
  });
});
