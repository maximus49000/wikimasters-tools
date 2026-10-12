import { describe, expect, it } from 'vitest';
import { frontLots } from '../../../src/core/library/city/lots';
import { shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { doorsFor } from '../../../src/core/library/city/doors';

describe('lots du premier plan', () => {
  it('regroupe les deux tours d\'un jumeau en un seul lot couvrant le socle', () => {
    const lots = frontLots(1440, 340, 4);
    for (const l of lots) {
      if (l.podium) {
        expect(l.towers).toHaveLength(2);
        expect(l.x).toBe(l.podium.x);
        expect(l.w).toBe(l.podium.w);
      } else expect(l.towers).toHaveLength(1);
    }
  });
  it('donne un seul local par jumeau visible, sur sa largeur visible, et une seule entrée', () => {
    for (let s = 1; s <= 20; s++) {
      const lots = frontLots(1440, 340, s);
      const slots = shopSlotsFor(1440, 340, s);
      const doors = doorsFor(1440, 340, s);
      for (const l of lots.filter((x) => x.podium)) {
        const lo = Math.max(l.x, 0), hi = Math.min(l.x + l.w, 1440);
        const inLot = slots.filter((sl) => sl.x >= lo - 1e-9 && sl.x + sl.w <= hi + 1e-9);
        const doorsIn = doors.filter((d) => d.x >= lo && d.x + 12 <= hi);
        expect(inLot.length).toBe(hi - lo >= 38 ? 1 : 0);
        expect(doorsIn.length).toBeLessThanOrEqual(1);
        if (inLot.length) expect(inLot[0]!.w).toBeGreaterThan(hi - lo - 12 - 2 * 4 - 2 - 1e-9 - 0.1);
      }
    }
  });
  it('agrandit les vitrines (moyenne > 30 u sur 30 villes)', () => {
    let n = 0, sum = 0;
    for (let s = 1; s <= 30; s++) for (const sl of shopSlotsFor(2000, 340, s)) { n++; sum += sl.w; }
    expect(sum / n).toBeGreaterThan(30);
  });
});
