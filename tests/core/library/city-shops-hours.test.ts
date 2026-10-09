import { describe, expect, it } from 'vitest';
import { SHOP_DEFS } from '../../../src/core/library/city/shops/catalog';
import { crowdAt, dayNumber, isOpenAt, isWorkday, nextWorkday, ymdOfDay } from '../../../src/core/library/city/shops/hours';

const ymd = (y: number, m: number, d: number) => ({ y, m, d });

describe('jours', () => {
  it('numérote les jours depuis 1970 et revient à la date', () => {
    expect(dayNumber(ymd(1970, 1, 2))).toBe(1);
    expect(ymdOfDay(dayNumber(ymd(2026, 10, 9)))).toEqual(ymd(2026, 10, 9));
  });
  it('saute les dimanches et les jours fériés', () => {
    expect(isWorkday(dayNumber(ymd(2026, 10, 11)))).toBe(false); // dimanche
    expect(isWorkday(dayNumber(ymd(2026, 11, 11)))).toBe(false); // 11 novembre (mercredi)
    expect(isWorkday(dayNumber(ymd(2026, 10, 10)))).toBe(true); // samedi
    expect(ymdOfDay(nextWorkday(dayNumber(ymd(2026, 10, 11))))).toEqual(ymd(2026, 10, 12));
    expect(ymdOfDay(nextWorkday(dayNumber(ymd(2026, 12, 25))))).toEqual(ymd(2026, 12, 26));
  });
});

describe('horaires', () => {
  it('ferme la boulangerie le lundi et l’ouvre le dimanche matin seulement', () => {
    const b = SHOP_DEFS.bakery;
    expect(isOpenAt(b, ymd(2026, 10, 12), 600)).toBe(false); // lundi
    expect(isOpenAt(b, ymd(2026, 10, 13), 7 * 60)).toBe(true); // mardi 7 h
    expect(isOpenAt(b, ymd(2026, 10, 11), 12 * 60)).toBe(true); // dimanche midi
    expect(isOpenAt(b, ymd(2026, 10, 11), 14 * 60)).toBe(false); // dimanche après-midi
  });
  it('rattache la plage qui passe minuit au jour où elle commence', () => {
    const bar = SHOP_DEFS.bar;
    expect(isOpenAt(bar, ymd(2026, 10, 11), 90)).toBe(true); // dimanche 1 h 30 : soirée du samedi
    expect(isOpenAt(bar, ymd(2026, 10, 11), 150)).toBe(false); // 2 h 30
    const club = SHOP_DEFS.nightclub;
    expect(isOpenAt(club, ymd(2026, 10, 10), 4 * 60)).toBe(true); // samedi 4 h : nuit du vendredi
    expect(isOpenAt(club, ymd(2026, 10, 12), 60)).toBe(false); // lundi 1 h : dimanche fermé
  });
  it('ferme les jours fériés sauf les commerces qui y ouvrent', () => {
    const noel = ymd(2026, 12, 25); // vendredi
    expect(isOpenAt(SHOP_DEFS.bookshop, noel, 15 * 60)).toBe(false);
    expect(isOpenAt(SHOP_DEFS.minimarket, noel, 15 * 60)).toBe(true);
  });
  it('donne une clientèle nulle hors des heures de pointe d’un commerce de nuit', () => {
    expect(crowdAt(SHOP_DEFS.nightclub, 12 * 60)).toBe(0);
    expect(crowdAt(SHOP_DEFS.nightclub, 60)).toBeGreaterThan(0.5);
    expect(crowdAt(SHOP_DEFS.bakery, 8 * 60)).toBeGreaterThan(crowdAt(SHOP_DEFS.bakery, 15 * 60));
  });
});
