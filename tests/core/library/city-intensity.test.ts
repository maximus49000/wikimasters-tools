import { describe, expect, it } from 'vitest';
import { dayContext } from '../../../src/core/library/city/calendar';
import { cityIntensity, type CityContext } from '../../../src/core/library/city/intensity';

const vacations = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
const DAYS = {
  school: dayContext({ y: 2026, m: 10, d: 9 }, vacations), // vendredi
  wednesday: dayContext({ y: 2026, m: 10, d: 7 }, vacations),
  weekend: dayContext({ y: 2026, m: 10, d: 10 }, vacations),
  holiday: dayContext({ y: 2026, m: 10, d: 20 }, vacations),
  publicHoliday: dayContext({ y: 2026, m: 5, d: 14 }, vacations), // Ascension, jeudi férié
  wednesdayHoliday: dayContext({ y: 2026, m: 10, d: 21 }, vacations), // mercredi pendant les vacances
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
  it('la pointe du soir est centrée sur 17 h : elle retombe après 18 h 30 et reste symétrique autour de 17 h', () => {
    expect(at(18.5, 'school').traffic).toBeLessThan(at(17, 'school').traffic);
    expect(Math.abs(at(16.5, 'school').traffic - at(18, 'school').traffic)).toBeLessThanOrEqual(0.15);
  });
  it('en vacances, la pointe de 8 h est aplatie : elle reste sous 0,6 et l’écart 8 h − 12 h est inférieur à 0,25', () => {
    expect(at(8, 'holiday').traffic).toBeLessThan(0.6);
    expect(at(8, 'holiday').traffic).toBeGreaterThan(at(8, 'weekend').traffic);
    expect(at(8, 'holiday').traffic - at(12, 'holiday').traffic).toBeLessThan(0.25);
  });
  it('le mercredi, la circulation de 17 h reste une pointe de semaine (la transition vers le week-end redescend avant)', () => {
    expect(at(17, 'wednesday').traffic).toBeGreaterThan(0.9);
    expect(at(17, 'wednesday').suits).toBeGreaterThan(0.5);
  });
  it('la pluie augmente la circulation en semaine, la neige la réduit', () => {
    expect(at(8, 'school', { snow: true }).traffic).toBeLessThan(at(8, 'school').traffic);
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
  it('la pluie en semaine réduit piétons et costumes', () => {
    const dry = at(8, 'school');
    const rain = at(8, 'school', { precip: 0.8 });
    expect(rain.walkers).toBeLessThan(0.6 * dry.walkers);
    expect(rain.suits).toBeLessThan(0.6 * dry.suits);
  });
  it('l’orage et la neige réduisent nettement les piétons', () => {
    const dry = at(12, 'weekend');
    expect(at(12, 'weekend', { storm: true }).walkers).toBeLessThan(0.65 * dry.walkers);
    expect(at(12, 'weekend', { snow: true }).walkers).toBeLessThan(0.65 * dry.walkers);
  });
  it('minuit un week-end : presque personne, piétons et circulation ≤ 0,12', () => {
    for (const h of [0, 1, 2, 3]) {
      expect(at(h, 'weekend').walkers).toBeLessThanOrEqual(0.12);
      expect(at(h, 'weekend').traffic).toBeLessThanOrEqual(0.12);
    }
  });
});

describe('jours fériés', () => {
  it('un jour férié est traité comme un week-end : pas de costumes, pas d’école, plus de piétons qu’en semaine à midi', () => {
    expect(at(12, 'publicHoliday').weekendLike).toBe(true);
    expect(at(8, 'publicHoliday').suits).toBeLessThan(0.02);
    expect(at(8.25, 'publicHoliday').schoolTo).toBe(0);
    expect(at(16.75, 'publicHoliday').schoolFrom).toBe(0);
    expect(at(12, 'publicHoliday').walkers).toBeGreaterThan(at(12, 'school').walkers);
  });
  it('weekendLike est vrai le week-end et faux en semaine et en vacances', () => {
    expect(at(12, 'weekend').weekendLike).toBe(true);
    expect(at(12, 'school').weekendLike).toBe(false);
    expect(at(12, 'holiday').weekendLike).toBe(false);
  });
  it('un mercredi pendant les vacances : aucune sortie ni arrivée d’école', () => {
    for (const h of [8.25, 12, 16.75]) {
      expect(at(h, 'wednesdayHoliday').schoolTo).toBe(0);
      expect(at(h, 'wednesdayHoliday').schoolFrom).toBe(0);
    }
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
  it('fenêtres resserrées : aller nul à 7 h 40, sortie nulle à 16 h 30 les jours d’école', () => {
    expect(at(7.67, 'school').schoolTo).toBe(0);
    expect(at(8.25, 'school').schoolTo).toBeGreaterThan(0.9);
    expect(at(16.5, 'school').schoolFrom).toBe(0);
    expect(at(16.75, 'school').schoolFrom).toBeGreaterThan(0.9);
  });
  it('le mercredi : aller le matin, sortie vers midi, rien à 16 h 45', () => {
    expect(at(8.25, 'wednesday').schoolTo).toBeGreaterThan(0.9);
    expect(at(12, 'wednesday').schoolFrom).toBeGreaterThan(0.9);
    expect(at(16.75, 'wednesday').schoolFrom).toBe(0);
  });
  it('le mercredi, la sortie est nulle à 11 h 30 et atteint son plateau à midi', () => {
    expect(at(11.5, 'wednesday').schoolFrom).toBe(0);
    expect(at(12, 'wednesday').schoolFrom).toBeGreaterThan(0.9);
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
  it('l’orage et la neige coupent les enfants dehors', () => {
    const dry = at(14, 'weekend').kids;
    expect(at(14, 'weekend', { storm: true }).kids).toBeLessThan(0.55 * dry);
    expect(at(14, 'weekend', { snow: true }).kids).toBeLessThan(0.65 * dry);
  });
  it('pas d’enfants dehors un week-end à 17 h 30 sans lumière du jour', () => {
    expect(at(17.5, 'weekend', { daylight: 0 }).kids).toBe(0);
  });
  it('peu de sportifs', () => {
    for (let h = 0; h < 24; h += 0.5) expect(at(h, 'weekend').sport).toBeLessThanOrEqual(0.25);
  });
  it('pas de sport un soir d’hiver sans lumière (18 h-21 h)', () => {
    for (let h = 18; h <= 21; h += 0.5) expect(at(h, 'weekend', { daylight: 0 }).sport).toBe(0);
  });
  it('l’orage et la neige réduisent le sport', () => {
    const dry = at(8, 'weekend').sport;
    expect(at(8, 'weekend', { storm: true }).sport).toBeLessThan(0.5 * dry);
    expect(at(8, 'weekend', { snow: true }).sport).toBeLessThan(0.7 * dry);
  });
});

describe('robustesse', () => {
  it('précipitations hors bornes (1,5) et minutes négatives ou au-delà de 24 h : aucun NaN, valeurs dans [0, 1]', () => {
    for (const minutes of [-60, 1500, 0]) {
      const i = cityIntensity({ minutes, day: DAYS.weekend, precip: 1.5, snow: false, storm: false, daylight: 1 });
      for (const v of [i.traffic, i.walkers, i.suits, i.schoolTo, i.schoolFrom, i.kids, i.sport]) {
        expect(Number.isNaN(v)).toBe(false);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(i.umbrellas).toBe(true);
    }
  });
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
  it('est déterministe : deux appels identiques donnent le même résultat', () => {
    expect(at(8.25, 'school', { precip: 0.3 })).toEqual(at(8.25, 'school', { precip: 0.3 }));
  });
});
