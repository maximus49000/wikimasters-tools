import { describe, expect, it } from 'vitest';
import { CLOSURE, PARADE, PARADE_SPEED, flypastWindow, paradeUnits, paradeX, roadClosed, type ParadeKind } from '../../../src/core/library/city/parade';
import { cityEventSchedule, defOf, eligible, EVENT_DEFS, conditionsKey, type EventConditions } from '../../../src/core/library/city/events';
import { cityIntensity, type CityContext } from '../../../src/core/library/city/intensity';
import { dayContext, type YMD } from '../../../src/core/library/city/calendar';
import { laneSpeeds, vehicleGate, vehiclesFor } from '../../../src/core/library/city/vehicles';

const HALF: Record<ParadeKind, number> = { motorbikes: 40, flags: 50, band: 90, infantry: 70, cavalry: 80, jeeps: 60, trucks: 80, tanks: 90, firetruck: 80 };
const DAY0 = 1_000_000 * 86400 / 86400; // instant (s) arbitraire de début de journée
const ctx = (date: YMD, minutes: number): CityContext => ({ minutes, day: dayContext(date, []), precip: 0, snow: false, storm: false, daylight: 1 });

describe('roadClosed', () => {
  it('bastille uniquement, de 8 h à 12 h 30 (borne haute exclue)', () => {
    expect(CLOSURE).toEqual([480, 750]);
    expect(PARADE).toEqual([600, 720]);
    expect(roadClosed(['bastille'], 479)).toBe(false);
    expect(roadClosed(['bastille'], 480)).toBe(true);
    expect(roadClosed(['bastille'], 749)).toBe(true);
    expect(roadClosed(['bastille'], 750)).toBe(false);
    expect(roadClosed(['music'], 600)).toBe(false);
    expect(roadClosed([], 600)).toBe(false);
  });
  it('cityIntensity le calcule le 14/7 et pas un autre jour', () => {
    expect(cityIntensity(ctx({ y: 2026, m: 7, d: 14 }, 600)).closed).toBe(true);
    expect(cityIntensity(ctx({ y: 2026, m: 7, d: 14 }, 800)).closed).toBe(false);
    expect(cityIntensity(ctx({ y: 2026, m: 7, d: 13 }, 600)).closed).toBe(false);
  });
});

describe('route fermée', () => {
  const base = cityIntensity(ctx({ y: 2026, m: 7, d: 13 }, 600));
  it('vehicleGate vaut 0 pour toutes les voitures et tous les vélos', () => {
    const closed = { ...base, traffic: 0.8, walkers: 0.8, closed: true };
    for (const v of vehiclesFor(2000, 3)) expect(vehicleGate(v, closed)).toBe(0);
    const open = { ...closed, closed: false };
    expect(vehiclesFor(2000, 3).some((v) => vehicleGate(v, open) > 0)).toBe(true);
  });
  const cond = (closed: boolean): EventConditions => ({ daylight: 1, wet: false, workday: false, traffic: 0.6, walkers: 0.6, fests: ['bastille'], closed });
  it('eligible refuse tout événement de rue quand la route est fermée', () => {
    const streets = EVENT_DEFS.filter((d) => d.layer === 'street');
    expect(eligible(defOf('bus'), 660, cond(false))).toBe(true);
    for (const d of streets) expect(eligible(d, 660, cond(true))).toBe(false);
  });
  it('les événements du ciel et des trottoirs ne sont pas touchés', () => {
    expect(eligible(defOf('plane'), 660, cond(true))).toBe(true);
    expect(eligible(defOf('dog-walker'), 660, cond(true))).toBe(true);
  });
  it('aucun événement de rue programmé pendant la fermeture, programme inchangé sinon', () => {
    const run = (closed: boolean) => Array.from({ length: 150 }, (_, h) => cityEventSchedule({
      seed: 7, width: 720, hyper: 1_440_000 + h, minutesAtHyperStart: 600, cond: cond(closed), vehicles: vehiclesFor(720, 7), speeds: laneSpeeds(7),
    })).flat();
    expect(run(false).some((e) => e.layer === 'street')).toBe(true);
    expect(run(true).filter((e) => e.layer === 'street')).toEqual([]);
    expect(run(true).filter((e) => e.layer !== 'street').length).toBeGreaterThan(0);
  });
  it('la clé de conditions distingue route fermée et ouverte', () => {
    expect(conditionsKey(cond(true))).not.toBe(conditionsKey(cond(false)));
  });
});

describe('cortège', () => {
  const units = paradeUnits(7, 720, DAY0);
  it('est déterministe et dépend de la graine', () => {
    expect(paradeUnits(7, 720, DAY0)).toEqual(units);
    expect(paradeUnits(8, 720, DAY0).map((u) => u.kind)).not.toEqual(units.map((u) => u.kind));
  });
  it('commence par la fanfare, finit par les pompiers, demi-longueurs par type', () => {
    expect(units.length).toBeGreaterThan(4);
    expect(units[0]!.kind).toBe('band');
    expect(units[units.length - 1]!.kind).toBe('firetruck');
    for (const u of units) expect(u.half).toBe(HALF[u.kind]);
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
  });
  it('couvre 10 h à 12 h et ne chevauche jamais', () => {
    const first = units[0]!.start;
    expect(first).toBeGreaterThanOrEqual(DAY0 + PARADE[0] * 60 - 1);
    expect(first).toBeLessThanOrEqual(DAY0 + PARADE[0] * 60 + 60);
    expect(units[units.length - 1]!.start).toBeLessThan(DAY0 + PARADE[1] * 60);
    for (let i = 1; i < units.length; i++) {
      const gap = units[i]!.start - units[i - 1]!.start;
      expect(gap).toBeGreaterThanOrEqual((units[i]!.half + units[i - 1]!.half) / PARADE_SPEED);
    }
  });
  it('paradeX : hors champ = null, avance à PARADE_SPEED', () => {
    const u = units[0]!;
    expect(paradeX(u, 720, u.start - 1000)).toBeNull();
    expect(paradeX(u, 720, u.start + 1e6)).toBeNull();
    const a = paradeX(u, 720, u.start + 20)!;
    const b = paradeX(u, 720, u.start + 30)!;
    expect(a).not.toBeNull();
    expect(b - a).toBeCloseTo(10 * PARADE_SPEED, 6);
  });
  it('défilé aérien à 10 h, environ 40 s', () => {
    const w = flypastWindow(DAY0);
    expect(w.start).toBe(DAY0 + 600 * 60);
    expect(w.end - w.start).toBeGreaterThanOrEqual(30);
    expect(w.end - w.start).toBeLessThanOrEqual(50);
  });
});
