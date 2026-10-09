import { describe, expect, it } from 'vitest';
import { dayContext } from '../../../src/core/library/city/calendar';
import { cityIntensity, type CityContext } from '../../../src/core/library/city/intensity';

const vacations = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
const DAYS = {
  school: dayContext({ y: 2026, m: 10, d: 9 }, vacations), // vendredi
  wednesday: dayContext({ y: 2026, m: 10, d: 7 }, vacations),
  weekend: dayContext({ y: 2026, m: 10, d: 10 }, vacations),
  holiday: dayContext({ y: 2026, m: 10, d: 20 }, vacations),
};
const at = (hours: number, kind: keyof typeof DAYS, extra: Partial<CityContext> = {}) =>
  cityIntensity({ minutes: Math.round(hours * 60), day: DAYS[kind], precip: 0, snow: false, storm: false, daylight: hours > 6 && hours < 20 ? 1 : 0, ...extra });

describe('circulation', () => {
  it('a des pointes à 8 h et 17 h en semaine, avec montée et descente', () => {
    expect(at(8, 'school').traffic).toBeGreaterThan(0.9);
    expect(at(17, 'school').traffic).toBeGreaterThan(0.9);
    expect(at(7, 'school').traffic).toBeGreaterThan(at(6.5, 'school').traffic);
    expect(at(9, 'school').traffic).toBeLessThan(at(8, 'school').traffic);
    expect(at(10.5, 'school').traffic).toBeLessThan(0.6);
    expect(at(3, 'school').traffic).toBeLessThan(0.1);
  });
  it('est très atténuée le week-end et un peu réduite en vacances', () => {
    expect(at(8, 'weekend').traffic).toBeLessThan(0.5 * at(8, 'school').traffic);
    expect(at(8, 'holiday').traffic).toBeLessThan(at(8, 'school').traffic);
    expect(at(8, 'holiday').traffic).toBeGreaterThan(at(8, 'weekend').traffic - 0.001);
  });
  it('augmente sous la pluie', () => {
    expect(at(11, 'school', { precip: 0.8 }).traffic).toBeGreaterThan(at(11, 'school').traffic);
  });
});

describe('piétons', () => {
  it('sont plus nombreux le week-end à midi qu’en semaine à midi', () => {
    expect(at(12, 'weekend').walkers).toBeGreaterThan(at(12, 'school').walkers);
  });
  it('baissent sous la pluie et déclenchent les parapluies', () => {
    const rain = at(12, 'weekend', { precip: 0.8 });
    expect(rain.walkers).toBeLessThan(0.5 * at(12, 'weekend').walkers);
    expect(rain.umbrellas).toBe(true);
    expect(at(12, 'weekend').umbrellas).toBe(false);
  });
  it('sont presque absents la nuit', () => {
    expect(at(3.5, 'school').walkers).toBeLessThan(0.08);
  });
  it('les costumes dominent la pointe du matin de semaine et disparaissent le week-end', () => {
    expect(at(8, 'school').suits).toBeGreaterThan(0.6);
    expect(at(8, 'weekend').suits).toBeLessThan(0.02);
    expect(at(8, 'holiday').suits).toBeLessThan(at(8, 'school').suits * 0.4);
  });
});

describe('école', () => {
  it('aller de 7 h 50 à 8 h 30, sortie à 16 h 45 les jours d’école', () => {
    expect(at(8.25, 'school').schoolTo).toBeGreaterThan(0.9);
    expect(at(7.5, 'school').schoolTo).toBe(0);
    expect(at(8.5, 'school').schoolTo).toBe(0);
    expect(at(16.75, 'school').schoolFrom).toBeGreaterThan(0.9);
    expect(at(16, 'school').schoolFrom).toBe(0);
  });
  it('le mercredi : aller le matin, sortie vers midi, rien à 16 h 45', () => {
    expect(at(8.25, 'wednesday').schoolTo).toBeGreaterThan(0.9);
    expect(at(12, 'wednesday').schoolFrom).toBeGreaterThan(0.9);
    expect(at(16.75, 'wednesday').schoolFrom).toBe(0);
  });
  it('aucun groupe le week-end ni en vacances', () => {
    for (const kind of ['weekend', 'holiday'] as const) {
      expect(at(8.25, kind).schoolTo).toBe(0);
      expect(at(16.75, kind).schoolFrom).toBe(0);
    }
  });
});

describe('enfants dehors et sportifs', () => {
  it('beaucoup d’enfants qui jouent le week-end, peu en semaine, quasi aucun sous la pluie ou la nuit', () => {
    expect(at(14, 'weekend').kids).toBeGreaterThan(0.6);
    expect(at(14, 'school').kids).toBeLessThan(0.1);
    expect(at(14, 'weekend', { precip: 0.8 }).kids).toBeLessThan(0.15);
    expect(at(22, 'weekend').kids).toBeLessThan(0.1);
  });
  it('peu de sportifs', () => {
    for (let h = 0; h < 24; h += 0.5) expect(at(h, 'weekend').sport).toBeLessThanOrEqual(0.25);
  });
});

describe('bornes', () => {
  it('reste dans [0, 1] à toute heure et dans tous les cas', () => {
    for (const kind of Object.keys(DAYS) as (keyof typeof DAYS)[]) {
      for (let h = 0; h < 24; h += 0.25) {
        for (const extra of [{}, { precip: 1, storm: true }, { snow: true, precip: 0.5 }]) {
          const i = at(h, kind, extra);
          for (const v of [i.traffic, i.walkers, i.suits, i.schoolTo, i.schoolFrom, i.kids, i.sport]) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});
