// @vitest-environment jsdom
// tests/content/shop/scene-pool-fallback.test.ts
import { describe, expect, it } from 'vitest';
import { placeSlots, pooledSlotsOf } from '../../../src/content/shop/scene-read';

const NS = 'http://www.w3.org/2000/svg';
// Fenêtre de boutique : réserve cachée (un objet `accessory`, encore au repli de son accessoire peint) + un emplacement.
function build(): { win: Element; base: Element } {
  const win = document.createElementNS(NS, 'svg');
  const pool = document.createElementNS(NS, 'g');
  pool.setAttribute('data-prop-pool', '');
  const base = document.createElementNS(NS, 'g');
  base.setAttribute('data-scene-prop', 'accessory');
  base.innerHTML = '<g data-prop-fallback=""><rect data-classic=""/></g>';
  pool.appendChild(base);
  const slot = document.createElementNS(NS, 'g');
  slot.setAttribute('data-prop-slot', '0');
  win.append(pool, slot);
  return { win, base };
}

describe('emplacements à réserve : copie d’un objet encore au repli', () => {
  it('la copie suit l’image cuite après coup (le repli copié ne reste pas affiché)', () => {
    const { win, base } = build();
    const slots = pooledSlotsOf(win, '[data-prop-slot]', '[data-prop-pool]', 'data-scene-prop', []);
    placeSlots(slots, [{ id: 'accessory', x: 0, y: 0, k: 1 }]);
    const slot = win.querySelector('[data-prop-slot]')!;
    expect(slot.querySelector('[data-prop-fallback]')).not.toBeNull();
    // L'image de l'accessoire est cuite : React remplace le repli par l'<image> dans la réserve.
    base.innerHTML = '<image href="data:image/png;base64,"/>';
    placeSlots(slots, [{ id: 'accessory', x: 0, y: 0, k: 1 }]);
    expect(slot.querySelector('[data-prop-fallback]')).toBeNull();
    expect(slot.querySelector('image')).not.toBeNull();
    expect(slot.children).toHaveLength(1);
  });
  it('copie sans repli : gardée d’une image à l’autre (pas de recopie)', () => {
    const { win, base } = build();
    base.innerHTML = '<image href="data:image/png;base64,"/>';
    const slots = pooledSlotsOf(win, '[data-prop-slot]', '[data-prop-pool]', 'data-scene-prop', []);
    placeSlots(slots, [{ id: 'accessory', x: 0, y: 0, k: 1 }]);
    const first = win.querySelector('[data-prop-slot] > *');
    placeSlots(slots, [{ id: 'accessory', x: 1, y: 0, k: 1 }]);
    placeSlots(slots, []);
    placeSlots(slots, [{ id: 'accessory', x: 0, y: 0, k: 1 }]);
    expect(win.querySelector('[data-prop-slot] > *')).toBe(first);
  });
});
