import { describe, expect, it } from 'vitest';
import { streetFor } from '../../../src/core/library/city/shops/scene/street';
import { direct } from '../../../src/core/library/city/shops/scene/director';
import { castFor } from '../../../src/core/library/city/shops/scene/cast';
import { SLOT_S } from '../../../src/core/library/city/shops/scene/slots';
import type { Score, StreetState } from '../../../src/core/library/city/shops/scene/types';
import type { ShopTypeId } from '../../../src/core/library/city/shops/catalog';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { outfitFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';

const slot = shopSlotsFor(720, 340, 9)[0]!;
const frame = shopFrame(slot, 238);
const wide = { ...frame, sign: { ...frame.sign, w: 62 }, window: { ...frame.window, w: 55 } };
const outfit = outfitFor('ordinary', mulberry32(1));
const staff = [{ id: 'A', outfit, present: [0, 9999] as [number, number] }];
const NO_STREET: StreetState = { rainFrom: null, paradeFrom: null, busAt: [] };
const run = (type: ShopTypeId, index: number, street: StreetState, fr = frame): Score => {
  const key = { seed: 9, slotId: slot.id, type, day: 20738, index };
  return direct({ key, frame: fr, staff, parties: castFor({ ...key, gate: 1, capacity: 4, dayMinutesAtStart: 480 }), street });
};
const segs = (sc: Score, move: string) => sc.tracks.flatMap((tr) => tr.segments.filter((s) => s.move === move).map((s) => ({ tr, s })));
// Chaque client entré ressort avant la fin du créneau ; segments contigus.
function sane(sc: Score, L: number): void {
  for (const tr of sc.tracks) {
    if (tr.role === 'customer' && tr.enter !== null) {
      expect(tr.exit).not.toBeNull();
      expect(tr.exit!).toBeLessThanOrEqual(L + 1e-6);
    }
    for (let k = 1; k < tr.segments.length; k++) expect(tr.segments[k]!.t0).toBeCloseTo(tr.segments[k - 1]!.t1, 6);
  }
}

describe('rue d’un créneau', () => {
  it('trouve le début d’averse', () => {
    const s = streetFor({ slotStartS: 36000, length: 240, precipAt: (m) => (m >= 602 ? 0.6 : 0), paradeActive: () => false, busArrivalsS: [36100, 50000] });
    expect(s.rainFrom).toBe(120);
    expect(s.paradeFrom).toBeNull();
    expect(s.busAt).toEqual([100]);
  });
  it('défilé, pluie faible ignorée, parapluies, bus hors créneau écartés', () => {
    const s = streetFor({ slotStartS: 36000, length: 240, precipAt: () => 0.2, paradeActive: (m) => m >= 601, busArrivalsS: [35999, 36000, 36240], umbrellas: true });
    expect(s.rainFrom).toBeNull();
    expect(s.paradeFrom).toBe(60);
    expect(s.busAt).toEqual([0]);
    expect(s.umbrellas).toBe(true);
    expect(streetFor({ slotStartS: 0, length: 240, precipAt: () => 0, paradeActive: () => false, busArrivalsS: [] }).umbrellas).toBe(false);
  });
});

describe('réactions à la rue', () => {
  it('averse : le client qui sortait attend à la porte (wait-rain) jusqu’à rainFrom + 20 s', () => {
    const street: StreetState = { rainFrom: 30, paradeFrom: null, busAt: [] };
    let waited = 0;
    for (let i = 0; i < 30; i++) {
      const sc = run('bakery', i, street);
      sane(sc, SLOT_S('bakery'));
      const logged = sc.log.some((l) => l.includes("attend que l'averse passe"));
      const rain = segs(sc, 'wait-rain');
      if (logged) waited++;
      expect(rain.length > 0).toBe(logged);
      for (const { tr, s } of rain) {
        expect(s.t0).toBeGreaterThanOrEqual(30 - 1e-6);
        expect(s.t1).toBeLessThanOrEqual(50 + 1e-6);
        // Il attend dedans : il n'a pas encore franchi la porte.
        expect(tr.exit!).toBeGreaterThanOrEqual(s.t1 - 1e-6);
      }
    }
    expect(waited).toBeGreaterThan(0);
  });
  it('averse avec parapluies : personne n’attend', () => {
    for (let i = 0; i < 30; i++) {
      const sc = run('bakery', i, { rainFrom: 30, paradeFrom: null, busAt: [], umbrellas: true });
      expect(sc.log.some((l) => l.includes("attend que l'averse passe"))).toBe(false);
      expect(sc).toEqual(run('bakery', i, NO_STREET));
    }
  });
  it('averse : la fermeture l’emporte (tout le monde sort avant la fin)', () => {
    const L = SLOT_S('bakery');
    for (let i = 0; i < 30; i++) sane(run('bakery', i, { rainFrom: L - 25, paradeFrom: null, busAt: [] }), L);
  });
  it('défilé : employé libre et clients non servis vont à la vitrine regarder la rue', () => {
    let staffLooked = 0;
    let customersLooked = 0;
    for (const type of ['bookshop', 'bar', 'bakery'] as const) for (let i = 0; i < 20; i++) {
      const sc = run(type, i, { rainFrom: null, paradeFrom: 20, busAt: [] }, wide);
      sane(sc, SLOT_S(type));
      const looks = segs(sc, 'look-street');
      for (const { s } of looks) expect(s.t0).toBeGreaterThanOrEqual(20 - 1e-6);
      if (looks.some(({ tr }) => tr.role === 'staff')) staffLooked++;
      if (looks.some(({ tr }) => tr.role === 'customer')) customersLooked++;
      if (looks.length) expect(sc.log.some((l) => l.includes('regarde le défilé'))).toBe(true);
      expect(sc).toEqual(run(type, i, { rainFrom: null, paradeFrom: 20, busAt: [] }, wide));
    }
    expect(staffLooked).toBeGreaterThan(0);
    expect(customersLooked).toBeGreaterThan(0);
  });
  it('bus : les acteurs libres tournent la tête ~1 s, sans casser les services', () => {
    let turned = 0;
    let withBus = 0;
    let without = 0;
    const opens = (sc: Score) => sc.log.filter((l) => /(?:libre → accueille|→ place à la table|→ installe|→ encaisse)/.test(l)).length;
    for (const type of ['bakery', 'restaurant', 'hairdresser'] as const) for (let i = 0; i < 20; i++) {
      const busAt = [40, 90, 150];
      const sc = run(type, i, { rainFrom: null, paradeFrom: null, busAt }, wide);
      sane(sc, SLOT_S(type));
      for (const { s } of segs(sc, 'head-turn')) {
        turned++;
        expect(busAt.some((b) => s.t0 >= b - 1e-6 && s.t0 < b + 0.25 + 1e-6)).toBe(true);
        expect(s.t1 - s.t0).toBeLessThanOrEqual(1 + 1e-6);
      }
      withBus += opens(sc);
      without += opens(run(type, i, NO_STREET, wide));
    }
    expect(turned).toBeGreaterThan(0);
    // Les services se déroulent toujours (un regard d'une seconde ne fait pas renoncer les clients).
    expect(withBus).toBeGreaterThanOrEqual(without * 0.9);
  });
  it('sans rue : partition identique à l’absence de réaction (rien ne bouge)', () => {
    for (let i = 0; i < 10; i++) expect(run('bakery', i, { rainFrom: null, paradeFrom: null, busAt: [], umbrellas: false })).toEqual(run('bakery', i, NO_STREET));
  });
});
