import { describe, expect, it } from 'vitest';
import { SHOP_DEFS, SHOP_TYPE_IDS } from '../../../src/core/library/city/shops/catalog';
import { terraceAt, terraceGuests, terraceWeatherAt, type TerraceWeather } from '../../../src/core/library/city/shops/terrace';
import { targetOf } from '../../../src/core/library/weather/weather-types';

const FINE: TerraceWeather = { rain: false, snow: false, storm: false, wind: false, sunny: false };
const SUN: TerraceWeather = { ...FINE, sunny: true };
const H = (h: number, m = 0): number => h * 60 + m;
const CAFE = SHOP_DEFS.cafe;
const BAR = SHOP_DEFS.bar;
const OPEN = H(8);
const CLOSE = H(21);

describe('terrasse : catalogue', () => {
  it('donne des tables aux seuls cinq types prévus', () => {
    const expected: Record<string, number> = { bar: 3, cafe: 4, restaurant: 3, tearoom: 3, pizzeria: 2 };
    for (const id of SHOP_TYPE_IDS) expect(SHOP_DEFS[id].terrace).toBe(expected[id] ?? 0);
  });
});

describe('terrasse : état', () => {
  it('reste « none » pour les 27 types sans terrasse', () => {
    for (const id of SHOP_TYPE_IDS.filter((i) => SHOP_DEFS[i].terrace === 0))
      for (let m = 0; m < 1440; m += 10) expect(terraceAt(SHOP_DEFS[id], true, m, SUN, H(8), H(21)).state).toBe('none');
  });
  it('ne met jamais de table sous pluie, neige, orage ou vent', () => {
    for (const bad of ['rain', 'snow', 'storm', 'wind'] as const)
      for (let m = H(8); m < H(21); m += 5) {
        const r = terraceAt(CAFE, true, m, { ...SUN, [bad]: true }, OPEN, CLOSE);
        expect(r.state).toBe('none');
        expect(r.tables).toBe(0);
      }
  });
  it('est vide quand le local est fermé', () => {
    expect(terraceAt(CAFE, false, H(12), SUN, OPEN, CLOSE).state).toBe('none');
  });
  it('n\'a jamais de table de 22 h à 7 h', () => {
    for (let m = 0; m < H(7); m++) expect(terraceAt(BAR, true, m, SUN, 0, 1800).state).toBe('none');
    for (let m = H(22); m < 1440; m++) expect(terraceAt(BAR, true, m, SUN, H(10), 1800).state).toBe('none');
  });
  it('monte seulement dans les 6 premières minutes après l\'ouverture', () => {
    for (let m = OPEN; m < CLOSE; m++) {
      const r = terraceAt(CAFE, true, m, FINE, OPEN, CLOSE);
      if (m < OPEN + 6) {
        expect(r.state).toBe('setting-up');
        expect(r.progress).toBeCloseTo((m - OPEN) / 6);
      } else expect(r.state).not.toBe('setting-up');
    }
  });
  it('est ouverte en plein jour par temps correct, avec le nombre de tables du catalogue', () => {
    const r = terraceAt(CAFE, true, H(12), FINE, OPEN, CLOSE);
    expect(r).toMatchObject({ state: 'open', tables: 4 });
  });
  it('met les parasols seulement s\'il fait beau', () => {
    expect(terraceAt(CAFE, true, H(12), SUN, OPEN, CLOSE).state).toBe('umbrellas');
    for (let m = OPEN; m < CLOSE; m++) expect(terraceAt(CAFE, true, m, FINE, OPEN, CLOSE).state).not.toBe('umbrellas');
  });
  it('démonte puis laisse vide avant la fermeture (10 min, 30 min pour le bar)', () => {
    const close = H(18);
    expect(terraceAt(CAFE, true, close - 11, FINE, OPEN, close).state).toBe('open');
    expect(terraceAt(CAFE, true, close - 10, FINE, OPEN, close).state).toBe('clearing');
    expect(terraceAt(CAFE, true, close - 1, FINE, OPEN, close).state).toBe('none');
    const barClose = H(21, 30);
    expect(terraceAt(BAR, true, barClose - 31, FINE, H(10), barClose).state).toBe('open');
    expect(terraceAt(BAR, true, barClose - 30, FINE, H(10), barClose).state).toBe('clearing');
    expect(terraceAt(BAR, true, barClose - 1, FINE, H(10), barClose).state).toBe('none');
  });
  it('garde la terrasse retirée 10 min après un coup de pluie (hystérésis)', () => {
    const t = H(14);
    const RAIN = { ...FINE, rain: true };
    // La pluie dure de t à t + 2 ; l'appelant résume aussi les 10 dernières minutes (pluie s'il en est tombé à un moment).
    const raining = (m: number): boolean => m >= t && m < t + 3;
    const recent = (m: number): boolean => Array.from({ length: 10 }, (_, i) => m - i).some(raining);
    const at = (m: number) => terraceAt(CAFE, true, m, raining(m) ? RAIN : FINE, OPEN, CLOSE, recent(m) ? RAIN : FINE);
    expect(at(t - 1).state).toBe('open');
    for (let m = t; m < t + 12; m++) expect(at(m).state).toBe('none');
    expect(at(t + 12).state).toBe('open');
  });
});

describe('terrasse : météo réelle', () => {
  it('traduit les états du ciel', () => {
    expect(terraceWeatherAt(targetOf('sun'))).toEqual({ rain: false, snow: false, storm: false, wind: false, sunny: true });
    expect(terraceWeatherAt(targetOf('cloudy'))).toMatchObject({ rain: false, sunny: false });
    expect(terraceWeatherAt(targetOf('rain')).rain).toBe(true);
    expect(terraceWeatherAt(targetOf('drizzle')).rain).toBe(true);
    expect(terraceWeatherAt(targetOf('snow'))).toMatchObject({ snow: true, rain: false });
    expect(terraceWeatherAt(targetOf('storm'))).toMatchObject({ storm: true, wind: true });
  });
});

describe('terrasse : convives', () => {
  it('n\'en met jamais plus de 4, à des tables et places valides', () => {
    for (let m = H(8); m < H(21); m += 7) {
      const g = terraceGuests(4, 11, 'slot-a', m, 1);
      expect(g.length).toBeLessThanOrEqual(4);
      for (const x of g) {
        expect(x.table).toBeGreaterThanOrEqual(0);
        expect(x.table).toBeLessThan(4);
        expect([0, 1]).toContain(x.seat);
        expect(x.leavesAt).toBeGreaterThan(m);
      }
      expect(new Set(g.map((x) => `${x.table}/${x.seat}`)).size).toBe(g.length);
    }
  });
  it('est vide sans table, sans affluence ou hors « open/umbrellas »', () => {
    expect(terraceGuests(0, 1, 's', H(12), 1)).toEqual([]);
    expect(terraceGuests(4, 1, 's', H(12), 0)).toEqual([]);
    expect(terraceGuests(4, 1, 's', H(12), 1, 'clearing')).toEqual([]);
    expect(terraceGuests(4, 1, 's', H(12), 1, 'setting-up')).toEqual([]);
  });
  it('est déterministe et plus fourni quand l\'affluence monte', () => {
    expect(terraceGuests(3, 5, 's', H(13), 0.8)).toEqual(terraceGuests(3, 5, 's', H(13), 0.8));
    let low = 0, high = 0;
    for (let m = H(8); m < H(21); m += 10) {
      low += terraceGuests(4, 9, 's', m, 0.2).length;
      high += terraceGuests(4, 9, 's', m, 1).length;
    }
    expect(high).toBeGreaterThan(low);
  });
});
