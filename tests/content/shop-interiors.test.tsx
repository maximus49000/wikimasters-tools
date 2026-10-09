// @vitest-environment jsdom
// tests/content/shop-interiors.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { SHOP_TYPE_IDS } from '../../src/core/library/city/shops/catalog';
import { skyAt } from '../../src/core/library/sky';
import { ShopInterior } from '../../src/content/shop-interiors';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sky = skyAt(12 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });
const night = skyAt(23 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });
const luma = (hex: string): number => {
  const v = parseInt(hex.slice(1), 16);
  return 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
};

// Pas de @testing-library dans le projet : rendu par createRoot + act, démonté après chaque test.
const mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => {
  for (const m of mounted.splice(0)) {
    act(() => m.root.unmount());
    m.host.remove();
  }
});
const render = (node: React.ReactNode): { container: HTMLElement } => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  mounted.push({ root, host });
  return { container: host };
};

describe('intérieurs', () => {
  it.each(SHOP_TYPE_IDS)('%s : dessine son mobilier, aux petites comme aux grandes largeurs', (type) => {
    for (const w of [8, 20, 40]) {
      const c = render(<svg><ShopInterior type={type} w={w} h={21} sky={sky} lit={false} staffed seed={1} /></svg>).container;
      const root = c.querySelector(`[data-interior="${type}"]`)!;
      expect(root).not.toBeNull();
      expect(root.querySelectorAll('rect, circle, path, ellipse, polygon, line').length).toBeGreaterThan(4);
      expect(c.querySelector('[id]')).toBeNull();
    }
  });
  it.each(SHOP_TYPE_IDS)('%s : éclairé la nuit, toujours dans la vitrine, sans id, avec son mobilier', (type) => {
    for (const w of [8, 20, 40]) {
      const c = render(<svg><ShopInterior type={type} w={w} h={21} sky={night} lit staffed={false} seed={1} /></svg>).container;
      const root = c.querySelector(`[data-interior="${type}"]`)!;
      expect(root.querySelectorAll('rect, circle, path, ellipse, polygon, line').length).toBeGreaterThan(4);
      expect(c.querySelector('[id]')).toBeNull();
      for (const r of c.querySelectorAll('rect')) {
        const x = Number(r.getAttribute('x') ?? 0);
        const y = Number(r.getAttribute('y') ?? 0);
        expect(x).toBeGreaterThanOrEqual(-0.01);
        expect(y).toBeGreaterThanOrEqual(-0.01);
        expect(x + Number(r.getAttribute('width') ?? 0)).toBeLessThanOrEqual(w + 0.01);
        expect(y + Number(r.getAttribute('height') ?? 0)).toBeLessThanOrEqual(21.01);
      }
    }
  });
  it('la nuit, une boutique ouverte (lit) a un mur plus clair qu’une boutique éteinte', () => {
    const wall = (lit: boolean): string =>
      render(<svg><ShopInterior type="bakery" w={24} h={21} sky={night} lit={lit} staffed={false} seed={1} /></svg>).container
        .querySelector('[data-interior] > rect')!.getAttribute('fill')!;
    expect(wall(true)).not.toBe(wall(false));
    expect(luma(wall(true))).toBeGreaterThan(luma(wall(false)));
  });
  it('montre le vendeur seulement quand c’est ouvert', () => {
    const on = render(<svg><ShopInterior type="bakery" w={24} h={21} sky={sky} lit={false} staffed seed={1} /></svg>).container;
    const off = render(<svg><ShopInterior type="bakery" w={24} h={21} sky={sky} lit={false} staffed={false} seed={1} /></svg>).container;
    expect(on.querySelector('[data-staff]')).not.toBeNull();
    expect(off.querySelector('[data-staff]')).toBeNull();
  });
  it('ne dessine pas hors de la vitrine (rectangles dans [0, w] × [0, h])', () => {
    for (const type of SHOP_TYPE_IDS) {
      const c = render(<svg><ShopInterior type={type} w={20} h={21} sky={sky} lit={false} staffed={false} seed={1} /></svg>).container;
      for (const r of c.querySelectorAll('rect')) {
        const x = Number(r.getAttribute('x') ?? 0);
        const y = Number(r.getAttribute('y') ?? 0);
        expect(x).toBeGreaterThanOrEqual(-0.01);
        expect(y).toBeGreaterThanOrEqual(-0.01);
        expect(x + Number(r.getAttribute('width') ?? 0)).toBeLessThanOrEqual(20.01);
        expect(y + Number(r.getAttribute('height') ?? 0)).toBeLessThanOrEqual(21.01);
      }
    }
  });
});
