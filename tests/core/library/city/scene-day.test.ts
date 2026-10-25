import { describe, expect, it } from 'vitest';
import { dayContext, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Dwelling, type HouseholdType } from '../../../../src/core/library/city/households';
import { awayState } from '../../../../src/core/library/city/leave-plan';
import { dayDraw, sceneDay, type Presence, type SceneDay } from '../../../../src/core/library/city/scene-day';

const SEED = 7;
const dry = { precip: 0, snow: false, storm: false };
const rain = { precip: 1.2, snow: false, storm: false };
const ds: Dwelling[] = [1, 2, 3].flatMap((s) => cityDwellings(cityFacades(1440, 340, s), s));
const VAC = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
const SUMMER = [{ name: 'Été', start: '2026-07-04', end: '2026-09-01' }];
const dayOf = (date: YMD, weather = dry, periods = VAC): SceneDay => sceneDay(dayContext(date, periods), weather, SEED);
// Logement fictif d'un type donné, à balcon (la présence et les scènes ne lisent que le foyer, les pièces et le balcon).
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
      return x.wake !== y.wake || x.presence !== y.presence || JSON.stringify(x.optional) !== JSON.stringify(y.optional);
    }).length;
    expect(differ).toBeGreaterThanOrEqual(18);
  });

  it('même date → même tirage', () => {
    const day = dayOf({ y: 2026, m: 10, d: 13 });
    for (const d of ds.slice(0, 30)) expect(dayDraw(d, day, SEED)).toEqual(dayDraw(d, dayOf({ y: 2026, m: 10, d: 13 }), SEED));
  });

  it('décalages dans les amplitudes, extinctions = permutation des pièces', () => {
    const week = dayOf({ y: 2026, m: 10, d: 13 });
    const sat = dayOf({ y: 2026, m: 10, d: 10 });
    const armistice = dayOf({ y: 2026, m: 11, d: 11 });
    expect(armistice.kind).toBe('public-holiday');
    let wideWake = 0;
    let wideHoliday = 0;
    for (const d of ds) {
      const w = dayDraw(d, week, SEED);
      expect(Math.abs(w.wake)).toBeLessThanOrEqual(25);
      expect(w.back).toBeGreaterThanOrEqual(w.presence === 'late' ? -45 + 60 : -45);
      expect(w.back).toBeLessThanOrEqual(w.presence === 'late' ? 45 + 150 : 45);
      expect(Math.abs(w.evening)).toBeLessThanOrEqual(40);
      expect(w.bed).toBeGreaterThanOrEqual(w.presence === 'guests' ? -35 + 45 : -35);
      expect(w.bed).toBeLessThanOrEqual(w.presence === 'guests' ? 35 + 90 : 35);
      expect([...w.offOrder].sort()).toEqual([...new Set(d.rooms)].sort());
      expect(Number.isInteger(w.rng) && w.rng >= 0).toBe(true);
      expect(w.optional.read).toBe(!w.optional.tv);
      const s = dayDraw(d, sat, SEED);
      expect(Math.abs(s.wake)).toBeLessThanOrEqual(50);
      if (Math.abs(s.wake) > 25) wideWake++;
      expect(s.presence).not.toBe('late');
      expect(Math.abs(dayDraw(d, armistice, SEED).wake)).toBeLessThanOrEqual(50);
      if (Math.abs(dayDraw(d, armistice, SEED).wake) > 25) wideHoliday++;
    }
    expect(wideHoliday).toBeGreaterThan(ds.length * 0.3);
    expect(wideWake).toBeGreaterThan(ds.length * 0.3);
  });

  it('vacances scolaires : semaine de vacances fournie par l’appelant ; familles parties pendant leurs congés d’été, jamais en période scolaire', () => {
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
    // L'absence vient des congés (leave-plan.ts) : familles réelles (leurs membres décident des semaines de CP).
    const fams = ds.filter((d) => d.hh.type === 'famille');
    expect(fams.length).toBeGreaterThan(10);
    const share = (day: SceneDay) => fams.filter((d) => dayDraw(d, day, SEED).presence === 'away').length / fams.length;
    expect(share(dayOf({ y: 2026, m: 7, d: 29 }, dry, SUMMER))).toBeGreaterThan(0.15);
    expect(share(school)).toBe(0);
  });

  it('parti du samedi au dimanche suivant, sans trou', () => {
    // Semaine du lundi 27 juillet 2026 : samedi 25 départ (ou déjà parti), dimanche 26 → samedi 1er août parti.
    const on = (d: number, m = 7) => sceneDay(dayContext({ y: 2026, m, d }, SUMMER), dry, SEED);
    const mon = on(27);
    const days = [on(26), on(28), on(29), on(30), on(31), on(1, 8)];
    let away = 0;
    for (const d of ds) {
      if (dayDraw(d, mon, SEED).presence !== 'away') continue;
      away++;
      for (const day of days) expect(dayDraw(d, day, SEED).presence).toBe('away');
      // Samedi d'avant : départ dans la journée (présent jusque-là) ou déjà parti.
      expect(['leaves', 'away']).toContain(awayState(d, SEED, { y: 2026, m: 7, d: 25 }, SUMMER).state);
      expect(['returns', 'away']).toContain(awayState(d, SEED, { y: 2026, m: 8, d: 2 }, SUMMER).state);
    }
    expect(away).toBeGreaterThan(5);
    // Semaine suivante : nouveau tirage, certains rentrent.
    const next = on(3, 8);
    expect(ds.some((d) => (dayDraw(d, mon, SEED).presence === 'away') !== (dayDraw(d, next, SEED).presence === 'away'))).toBe(true);
  });

  it('invités surtout le vendredi et le samedi soir, rentrés tard seulement en semaine', () => {
    const couples = pool('couple', 600);
    const count = (day: SceneDay, p: Presence) => couples.filter((d) => dayDraw(d, day, SEED).presence === p).length / couples.length;
    const fri = dayOf({ y: 2026, m: 10, d: 9 }, dry, []);
    const tue = dayOf({ y: 2026, m: 10, d: 13 }, dry, []);
    const sun = dayOf({ y: 2026, m: 10, d: 11 }, dry, []);
    expect(count(fri, 'guests')).toBeGreaterThan(count(tue, 'guests') * 1.6);
    expect(count(tue, 'late')).toBeGreaterThan(0.06);
    expect(count(sun, 'late')).toBe(0);
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
    // La pluie ne change que ce qu'elle coupe : présence et horaires identiques.
    for (const d of olds.slice(0, 40)) {
      const a = dayDraw(d, wet, SEED);
      const b = dayDraw(d, sunny, SEED);
      expect([a.presence, a.wake, a.back, a.bed, a.optional.tv]).toEqual([b.presence, b.wake, b.back, b.bed, b.optional.tv]);
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
