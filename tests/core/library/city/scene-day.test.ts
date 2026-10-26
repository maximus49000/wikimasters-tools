import { describe, expect, it } from 'vitest';
import { dayContext, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Dwelling, type HouseholdType } from '../../../../src/core/library/city/households';
import { dayDraw, sceneDay, type SceneDay } from '../../../../src/core/library/city/scene-day';

const SEED = 7;
const dry = { precip: 0, snow: false, storm: false };
const rain = { precip: 1.2, snow: false, storm: false };
const ds: Dwelling[] = [1, 2, 3].flatMap((s) => cityDwellings(cityFacades(1440, 340, s), s));
const VAC = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
const SUMMER = [{ name: 'Été', start: '2026-07-04', end: '2026-09-01' }];
const dayOf = (date: YMD, weather = dry, periods = VAC): SceneDay => sceneDay(dayContext(date, periods), weather, SEED);
// Logement fictif d'un type donné, à balcon (le tirage ne lit que le foyer, les pièces et le balcon).
const ofType = (type: HouseholdType, i: number, extra: Partial<Dwelling['hh']> = {}): Dwelling => {
  const base = ds[i % ds.length]!;
  return { ...base, key: (base.key ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0, balcony: true, hh: { ...base.hh, type, ...extra } };
};
const pool = (type: HouseholdType, n: number, extra: Partial<Dwelling['hh']> = {}) => Array.from({ length: n }, (_, i) => ofType(type, i, extra));

describe('jour de scène', () => {
  it('contexte : soleil du mois, pluie, froid, vacances, fêtes, spectacle', () => {
    const oct = dayOf({ y: 2026, m: 10, d: 13 });
    expect(oct).toMatchObject({ iso: '2026-10-13', weekday: 2, weekend: false, kind: 'school', schoolHoliday: false, month: 10, wet: false, cold: false, december: false, show: null, moving: false });
    expect(oct.sunrise).toBe(Math.round(8.2 * 60));
    expect(oct.sunset).toBe(Math.round(19.0 * 60));
    expect(dayOf({ y: 2026, m: 10, d: 13 }, rain).wet).toBe(true);
    expect(dayOf({ y: 2026, m: 10, d: 13 }, { precip: 0.1, snow: false, storm: true }).wet).toBe(true);
    expect(dayOf({ y: 2026, m: 10, d: 13 }, { precip: 0.29, snow: false, storm: false }).wet).toBe(false);
    expect(dayOf({ y: 2026, m: 10, d: 20 }).schoolHoliday).toBe(true);
    expect(dayOf({ y: 2026, m: 6, d: 10 }).cold).toBe(false);
    expect(dayOf({ y: 2026, m: 11, d: 10 }).cold).toBe(true);
    const bastille = dayOf({ y: 2026, m: 7, d: 14 });
    expect(bastille.fests).toEqual(['bastille']);
    expect(bastille.show).not.toBeNull();
    const nye = dayOf({ y: 2026, m: 12, d: 31 });
    expect(nye.december).toBe(true);
    expect(nye.show!.start).toBeGreaterThanOrEqual(1438);
    expect(sceneDay(dayContext({ y: 2026, m: 10, d: 13 }, []), dry, SEED, true).moving).toBe(true);
  });

  it('soleil du lieu : lever et coucher réels, table de Paris en repli, valeurs fictives aux pôles', () => {
    const ctx = dayContext({ y: 2026, m: 12, d: 15 }, []);
    // Sans lieu (aperçus) : table de Paris du mois.
    expect(sceneDay(ctx, dry, SEED).sunset).toBe(Math.round(16.9 * 60));
    const real = sceneDay(ctx, dry, SEED, false, undefined, { kind: 'normal', sunrise: 523.6, sunset: 1014.4 });
    expect(real.sunrise).toBe(524);
    expect(real.sunset).toBe(1014);
    const night = sceneDay(ctx, dry, SEED, false, undefined, { kind: 'polar', polar: 'night' });
    const day = sceneDay(ctx, dry, SEED, false, undefined, { kind: 'polar', polar: 'day' });
    // Nuit polaire : journée courte et sombre ; jour polaire : le soleil ne se couche pas avant minuit.
    expect(night.sunset - night.sunrise).toBeLessThanOrEqual(300);
    expect(night.sunset).toBeLessThan(900);
    expect(day.sunset).toBeGreaterThanOrEqual(1440);
  });
});

describe('tirage du jour', () => {
  it('deux dates différentes → tirages différents pour un même logement', () => {
    const a = dayOf({ y: 2026, m: 10, d: 13 });
    const b = dayOf({ y: 2026, m: 10, d: 14 });
    const sample = ds.slice(0, 20);
    expect(sample.length).toBe(20);
    const differ = sample.filter((d) => {
      const x = dayDraw(d, a, SEED);
      const y = dayDraw(d, b, SEED);
      return x.guests !== y.guests || x.offOrder.join() !== y.offOrder.join() || JSON.stringify(x.optional) !== JSON.stringify(y.optional);
    }).length;
    expect(differ).toBeGreaterThanOrEqual(18);
  });

  it('même date → même tirage', () => {
    const day = dayOf({ y: 2026, m: 10, d: 13 });
    for (const d of ds.slice(0, 30)) expect(dayDraw(d, day, SEED)).toEqual(dayDraw(d, dayOf({ y: 2026, m: 10, d: 13 }), SEED));
  });

  it('extinctions = permutation des pièces, graine entière, lecture sinon télé', () => {
    const week = dayOf({ y: 2026, m: 10, d: 13 });
    for (const d of ds) {
      const w = dayDraw(d, week, SEED);
      expect([...w.offOrder].sort()).toEqual([...new Set(d.rooms)].sort());
      expect(Number.isInteger(w.rng) && w.rng >= 0).toBe(true);
      expect(w.optional.read).toBe(!w.optional.tv);
    }
  });

  it('vacances scolaires : semaine de vacances fournie par l’appelant', () => {
    const holiday = dayOf({ y: 2026, m: 10, d: 20 });
    const school = dayOf({ y: 2026, m: 10, d: 13 });
    expect(holiday.kind).toBe('holiday');
    expect(holiday.holidayWeek).toBe(true); // défaut : schoolHoliday
    expect(school.kind).toBe('school');
    expect(school.holidayWeek).toBe(false);
    // Samedi de vacances : `kind` vaut 'weekend', mais la semaine est une semaine de vacances (fournie par l'appelant).
    const satVac = sceneDay(dayContext({ y: 2026, m: 10, d: 24 }, VAC), dry, SEED, false, true);
    expect(satVac.kind).toBe('weekend');
    expect(satVac.holidayWeek).toBe(true);
    // Semaine ISO et mois de son jeudi (été : semaine du lundi 27 juillet).
    const summer = dayOf({ y: 2026, m: 7, d: 29 }, dry, SUMMER);
    expect(summer.week).toBe(202631);
    expect(summer.weekMonth).toBe(7);
  });

  it('invités surtout le vendredi et le samedi soir', () => {
    const couples = pool('couple', 600);
    const share = (day: SceneDay) => couples.filter((d) => dayDraw(d, day, SEED).guests).length / couples.length;
    const fri = dayOf({ y: 2026, m: 10, d: 9 }, dry, []);
    const tue = dayOf({ y: 2026, m: 10, d: 13 }, dry, []);
    expect(share(fri)).toBeGreaterThan(share(tue) * 1.6);
    expect(share(fri)).toBeGreaterThan(0.1);
    expect(share(fri)).toBeLessThan(0.2);
  });

  it('pluie : ni arrosage ni tapis', () => {
    const date = { y: 2026, m: 5, d: 12 };
    const wet = dayOf(date, rain);
    const sunny = dayOf(date);
    const olds = pool('retraite', 200);
    for (const d of olds) {
      const w = dayDraw(d, wet, SEED);
      expect(w.optional.water).toBe(false);
      expect(w.optional.rug).toBe(false);
      expect(w.optional.look).toBe(false); // logements à balcon : pas de balcon sous la pluie
    }
    const water = olds.filter((d) => dayDraw(d, sunny, SEED).optional.water).length / olds.length;
    const rug = olds.filter((d) => dayDraw(d, sunny, SEED).optional.rug).length / olds.length;
    expect(water).toBeGreaterThan(0.55);
    expect(rug).toBeGreaterThan(0.2);
    // Seuls les retraités arrosent et battent le tapis.
    for (const d of pool('couple', 100)) {
      const w = dayDraw(d, sunny, SEED);
      expect(w.optional.water || w.optional.rug).toBe(false);
    }
    // La pluie ne change que ce qu'elle coupe : invités, télé et extinctions identiques.
    for (const d of olds.slice(0, 40)) {
      const a = dayDraw(d, wet, SEED);
      const b = dayDraw(d, sunny, SEED);
      expect([a.guests, a.optional.tv, a.offOrder, a.rng]).toEqual([b.guests, b.optional.tv, b.offOrder, b.rng]);
    }
  });

  it('fête de la coloc seulement le samedi', () => {
    const colocs = pool('coloc', 200);
    const sat = dayOf({ y: 2026, m: 10, d: 10 }, dry, []);
    const share = colocs.filter((d) => dayDraw(d, sat, SEED).optional.party).length / colocs.length;
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.8);
    for (const date of [{ y: 2026, m: 10, d: 9 }, { y: 2026, m: 10, d: 11 }, { y: 2026, m: 10, d: 13 }]) {
      const day = dayOf(date, dry, []);
      expect(colocs.some((d) => dayDraw(d, day, SEED).optional.party)).toBe(false);
    }
    expect(pool('couple', 100).some((d) => dayDraw(d, sat, SEED).optional.party)).toBe(false);
  });

  it('fumeurs, enfants à la fenêtre : seulement les foyers concernés', () => {
    const day = dayOf({ y: 2026, m: 10, d: 13 });
    expect(pool('solo', 200, { smoker: true }).filter((d) => dayDraw(d, day, SEED).optional.smoke).length / 200).toBeGreaterThan(0.75);
    expect(pool('solo', 100, { smoker: false }).some((d) => dayDraw(d, day, SEED).optional.smoke)).toBe(false);
    const kid = pool('famille', 200).filter((d) => dayDraw(d, day, SEED).optional.kidWindow).length / 200;
    expect(kid).toBeGreaterThan(0.45);
    expect(kid).toBeLessThan(0.75);
    expect(pool('retraite', 100).some((d) => dayDraw(d, day, SEED).optional.kidWindow)).toBe(false);
  });
});
