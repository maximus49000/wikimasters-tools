// tests/core/library/city-calendar.test.ts
import { describe, expect, it } from 'vitest';
import { addDays, dayContext, easterSunday, isoDate, publicHolidays, weekdayOf, type HolidayPeriod } from '../../../src/core/library/city/calendar';

describe('Pâques et jours fériés', () => {
  it('calcule le dimanche de Pâques', () => {
    expect(isoDate(easterSunday(2024))).toBe('2024-03-31');
    expect(isoDate(easterSunday(2025))).toBe('2025-04-20');
    expect(isoDate(easterSunday(2026))).toBe('2026-04-05');
    expect(isoDate(easterSunday(2027))).toBe('2027-03-28');
  });
  it('liste les fériés fixes et mobiles de 2026', () => {
    const h = publicHolidays(2026);
    expect(h['2026-01-01']).toBeDefined();
    expect(h['2026-05-01']).toBeDefined();
    expect(h['2026-07-14']).toBeDefined();
    expect(h['2026-12-25']).toBeDefined();
    expect(h['2026-04-06']).toBeDefined(); // lundi de Pâques
    expect(h['2026-05-14']).toBeDefined(); // Ascension
    expect(h['2026-05-25']).toBeDefined(); // lundi de Pentecôte
    expect(h['2026-04-03']).toBeUndefined(); // Vendredi saint : pas férié hors Alsace-Moselle
    expect(Object.keys(h)).toHaveLength(11);
  });
  it('ajoute le Vendredi saint et le 26 décembre en Alsace-Moselle', () => {
    const h = publicHolidays(2026, true);
    expect(h['2026-04-03']).toBeDefined();
    expect(h['2026-12-26']).toBeDefined();
  });
});

describe('dates', () => {
  it('donne le jour de la semaine et ajoute des jours', () => {
    expect(weekdayOf({ y: 2026, m: 10, d: 9 })).toBe(5); // vendredi
    expect(isoDate(addDays({ y: 2026, m: 12, d: 30 }, 3))).toBe('2027-01-02');
  });
});

describe('dayContext', () => {
  const periods: HolidayPeriod[] = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
  const at = (y: number, m: number, d: number) => dayContext({ y, m, d }, periods);

  it('distingue jour d’école, mercredi, week-end, vacances et férié', () => {
    expect(at(2026, 10, 9).kind).toBe('school'); // vendredi
    expect(at(2026, 10, 7).kind).toBe('wednesday');
    expect(at(2026, 10, 10).kind).toBe('weekend');
    expect(at(2026, 10, 20).kind).toBe('holiday'); // mardi en vacances
    expect(at(2026, 10, 25).kind).toBe('weekend'); // dimanche en vacances : le week-end prime sur les vacances
    expect(at(2026, 11, 1).kind).toBe('public-holiday'); // dimanche et Toussaint : le férié prime sur le week-end
    expect(at(2026, 11, 2).kind).toBe('school'); // reprise (end exclu)
    expect(at(2026, 5, 14).kind).toBe('public-holiday');
  });
  it('schoolOn vaut vrai pour jour d’école et mercredi seulement', () => {
    expect(at(2026, 10, 9).schoolOn).toBe(true);
    expect(at(2026, 10, 7).schoolOn).toBe(true);
    expect(at(2026, 10, 20).schoolOn).toBe(false);
    expect(at(2026, 10, 10).schoolOn).toBe(false);
  });
  it('un jour férié tombant en vacances reste férié et porte son nom', () => {
    const ctx = dayContext({ y: 2026, m: 11, d: 1 }, [{ name: 'x', start: '2026-10-01', end: '2026-12-01' }]);
    expect(ctx.publicHoliday).toBeTruthy();
    expect(ctx.kind).toBe('public-holiday');
  });
});
