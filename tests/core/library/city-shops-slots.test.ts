import { describe, expect, it } from 'vitest';
import { DOOR_MARGIN, DOOR_WIDTH, doorsFor } from '../../../src/core/library/city/doors';
import { SHOP_MIN_WIDTH, shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { citySkyline } from '../../../src/core/library/scene-world';

describe('locaux commerciaux', () => {
  it('ne donne un local qu’aux immeubles du premier plan assez larges (environ 60 %)', () => {
    let near = 0;
    let shops = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const visible = citySkyline(1440, 340, seed).filter((b) => !b.far && Math.min(b.x + b.w, 1440) - Math.max(b.x, 0) > 0);
      near += visible.length;
      shops += shopSlotsFor(1440, 340, seed).length;
    }
    expect(shops / near).toBeGreaterThan(0.5);
    expect(shops / near).toBeLessThan(0.7);
  });
  it('met l’entrée des habitants au bord et le local dans le reste, sans chevauchement', () => {
    const slots = shopSlotsFor(1440, 340, 7);
    const doors = doorsFor(1440, 340, 7);
    for (const s of slots) {
      expect(doors.some((d) => d.x === s.residentDoorX)).toBe(true);
      const doorEnd = s.residentDoorX + DOOR_WIDTH;
      expect(s.x >= doorEnd || s.x + s.w <= s.residentDoorX).toBe(true);
      expect(s.w).toBeGreaterThanOrEqual(SHOP_MIN_WIDTH - DOOR_WIDTH - 2 * DOOR_MARGIN - 2);
    }
  });
  it('place enseigne, vitrine et porte dans le rez-de-chaussée', () => {
    const [s] = shopSlotsFor(1440, 340, 3);
    const f = shopFrame(s!, 238);
    expect(f.sign.y).toBeGreaterThanOrEqual(238 - 30);
    expect(f.window.y + f.window.h).toBeLessThanOrEqual(238);
    expect(f.window.w + f.door.w).toBeLessThanOrEqual(s!.w);
    expect(f.window.w).toBeGreaterThanOrEqual(8);
  });
  it('donne des identifiants stables shop-0, shop-1…', () => {
    expect(shopSlotsFor(720, 340, 5).map((s) => s.id)).toEqual(shopSlotsFor(720, 340, 5).map((_, i) => `shop-${i}`));
  });
});
