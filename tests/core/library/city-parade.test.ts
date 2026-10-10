import { describe, expect, it } from 'vitest';
import { CLOSURE, CROWD_LANE, MUSIC_CLOSURE, PARADE, paradeOn, PARADE_SPEED, crowdFor, crowdLevel, flypastWindow, spectatorAt, spectatorTimes, paradeUnits, paradeX, roadClosed, type ParadeKind } from '../../../src/core/library/city/parade';
import { cityEventSchedule, defOf, eligible, EVENT_DEFS, conditionsKey, type EventConditions } from '../../../src/core/library/city/events';
import { cityIntensity, type CityContext } from '../../../src/core/library/city/intensity';
import { dayContext, type YMD } from '../../../src/core/library/city/calendar';
import { laneSpeeds, vehicleGate, vehiclesFor } from '../../../src/core/library/city/vehicles';

const HALF: Record<ParadeKind, number> = { motorbikes: 40, flags: 50, band: 90, infantry: 70, cavalry: 80, jeeps: 60, trucks: 80, tanks: 90, firetruck: 80 };
const DAY0 = 1_000_000 * 86400 / 86400; // instant (s) arbitraire de début de journée
const ctx = (date: YMD, minutes: number): CityContext => ({ minutes, day: dayContext(date, []), precip: 0, snow: false, storm: false, daylight: 1 });

describe('roadClosed', () => {
  const D14: YMD = { y: 2026, m: 7, d: 14 };
  const D21: YMD = { y: 2026, m: 6, d: 21 };
  const D22: YMD = { y: 2026, m: 6, d: 22 };
  it('le 14/7, de 8 h à 13 h 30, fin de la dépose des barrières (borne haute exclue)', () => {
    expect(CLOSURE).toEqual([480, 810]);
    expect(PARADE).toEqual([600, 720]);
    expect(roadClosed(D14, 479)).toBe(false);
    expect(roadClosed(D14, 480)).toBe(true);
    expect(roadClosed(D14, 809)).toBe(true);
    expect(roadClosed(D14, 760)).toBe(true);
    expect(roadClosed(D14, 810)).toBe(false);
    expect(roadClosed({ y: 2026, m: 7, d: 13 }, 600)).toBe(false);
    expect(roadClosed({ y: 2026, m: 10, d: 10 }, 600)).toBe(false);
  });
  it('Fête de la musique : du 21/6 14 h jusqu’à la fin de la dépose de nuit le 22/6 (5 h)', () => {
    expect(MUSIC_CLOSURE).toEqual({ from: 840, to: 300 });
    expect(roadClosed(D21, 839)).toBe(false);
    expect(roadClosed(D21, 840)).toBe(true);
    expect(roadClosed(D21, 1439)).toBe(true);
    expect(roadClosed(D22, 0)).toBe(true);
    expect(roadClosed(D22, 269)).toBe(true);
    expect(roadClosed(D22, 299)).toBe(true);
    expect(roadClosed(D22, 300)).toBe(false);
    expect(roadClosed(D22, 840)).toBe(false);
    expect(roadClosed({ y: 2026, m: 6, d: 20 }, 1000)).toBe(false);
    expect(roadClosed(D21, 600)).toBe(false);
  });
  it('le cortège ne part que le 14/7 (pas pour la Fête de la musique)', () => {
    expect(paradeOn(['bastille'], 600)).toBe(true);
    expect(paradeOn(['bastille'], 599)).toBe(false);
    expect(paradeOn(['bastille'], 809)).toBe(true);
    expect(paradeOn(['bastille'], 810)).toBe(false);
    expect(paradeOn(['music'], 900)).toBe(false);
  });
  it('cityIntensity le calcule le 14/7 et pas un autre jour', () => {
    expect(cityIntensity(ctx({ y: 2026, m: 7, d: 14 }, 600)).closed).toBe(true);
    expect(cityIntensity(ctx({ y: 2026, m: 7, d: 14 }, 800)).closed).toBe(true);
    expect(cityIntensity(ctx({ y: 2026, m: 7, d: 14 }, 820)).closed).toBe(false);
    expect(cityIntensity(ctx({ y: 2026, m: 7, d: 13 }, 600)).closed).toBe(false);
    expect(cityIntensity(ctx({ y: 2026, m: 6, d: 21 }, 1200)).closed).toBe(true);
    expect(cityIntensity(ctx({ y: 2026, m: 6, d: 22 }, 120)).closed).toBe(true);
    expect(cityIntensity(ctx({ y: 2026, m: 6, d: 21 }, 780)).closed).toBe(false);
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
  const all = paradeUnits(7, 720, DAY0);
  const lanes = (list: ReturnType<typeof paradeUnits>) => ({ near: list.filter((u) => u.lane === 'near'), far: list.filter((u) => u.lane === 'far') });
  const units = lanes(all).near;
  it('occupe les deux files', () => {
    const { near, far } = lanes(all);
    expect(near.length).toBeGreaterThan(4);
    expect(far.length).toBeGreaterThan(4);
    expect(near.length + far.length).toBe(all.length);
  });
  it('est déterministe et dépend de la graine', () => {
    expect(paradeUnits(7, 720, DAY0)).toEqual(all);
    expect(paradeUnits(8, 720, DAY0).map((u) => u.kind)).not.toEqual(all.map((u) => u.kind));
  });
  it('les deux files ont des tirages distincts et un départ décalé', () => {
    const { near, far } = lanes(all);
    expect(far.map((u) => u.kind)).not.toEqual(near.map((u) => u.kind));
    expect(far[0]!.start - near[0]!.start).toBeGreaterThanOrEqual(10);
  });
  it('file du premier plan : commence par la fanfare, finit par les pompiers ; file du fond : porte-drapeaux puis camions, sans fanfare', () => {
    const { near, far } = lanes(all);
    expect(near[0]!.kind).toBe('band');
    expect(near[near.length - 1]!.kind).toBe('firetruck');
    expect(far[0]!.kind).toBe('flags');
    expect(far[far.length - 1]!.kind).toBe('trucks');
    expect(far.some((u) => u.kind === 'band' || u.kind === 'firetruck')).toBe(false);
    for (const u of all) expect(u.half).toBe(HALF[u.kind]);
    expect(new Set(all.map((u) => u.id)).size).toBe(all.length);
  });
  it('couvre 10 h à 12 h et ne chevauche jamais dans une même file', () => {
    for (const list of Object.values(lanes(all))) {
      expect(list[0]!.start).toBeGreaterThanOrEqual(DAY0 + PARADE[0] * 60 - 1);
      expect(list[0]!.start).toBeLessThanOrEqual(DAY0 + PARADE[0] * 60 + 60);
      expect(list[list.length - 1]!.start).toBeLessThan(DAY0 + PARADE[1] * 60);
      for (let i = 1; i < list.length; i++) {
        const gap = list[i]!.start - list[i - 1]!.start;
        expect(gap).toBeGreaterThanOrEqual((list[i]!.half + list[i - 1]!.half) / PARADE_SPEED);
      }
    }
  });
  it('varie par file : jamais deux unités du même type de suite, fanfares rares et espacées', () => {
    for (const seed of [1, 2, 3, 7, 8, 42, 99]) {
      for (const list of Object.values(lanes(paradeUnits(seed, 720, DAY0)))) {
        for (let i = 1; i < list.length; i++) expect(list[i]!.kind).not.toBe(list[i - 1]!.kind);
        const bands = list.map((u, i) => (u.kind === 'band' ? i : -1)).filter((i) => i >= 0);
        for (let i = 1; i < bands.length; i++) expect(bands[i]! - bands[i - 1]!).toBeGreaterThan(4);
        expect(bands.length / list.length).toBeLessThan(0.1);
      }
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

describe('foule de spectateurs du défilé', () => {
  it('crowdLevel : 0 avant 8 h 30, 1 de 10 h à 12 h 15, 0 à partir de 13 h 15', () => {
    expect(crowdLevel(0)).toBe(0);
    expect(crowdLevel(509)).toBe(0);
    expect(crowdLevel(510)).toBe(0);
    expect(crowdLevel(600)).toBe(1);
    expect(crowdLevel(660)).toBe(1);
    expect(crowdLevel(735)).toBe(1);
    expect(crowdLevel(795)).toBe(0);
    expect(crowdLevel(900)).toBe(0);
    expect(crowdLevel(540)).toBeGreaterThan(0);
    expect(crowdLevel(540)).toBeLessThan(1);
  });
  it('crowdLevel : croissance monotone à l arrivée, décroissance au départ', () => {
    for (let m = 500; m < 600; m++) expect(crowdLevel(m + 1)).toBeGreaterThanOrEqual(crowdLevel(m));
    for (let m = 735; m < 800; m++) expect(crowdLevel(m + 1)).toBeLessThanOrEqual(crowdLevel(m));
  });
  it('crowdFor : déterministe, dense, trois rangs (le premier le plus dense)', () => {
    const a = crowdFor(1, 720);
    expect(crowdFor(1, 720)).toEqual(a);
    expect(crowdFor(2, 720)).not.toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(60);
    const rows = [0, 1, 2].map((r) => a.filter((s) => s.row === r).length);
    expect(rows[0]).toBeGreaterThanOrEqual(70);
    expect(rows[0]).toBeGreaterThan(rows[1]!);
    expect(rows[1]).toBeGreaterThan(rows[2]!);
    expect(rows[2]).toBeGreaterThan(0);
    expect(a.every((s) => s.u >= 0 && s.u < 1 && s.x >= -10 && s.x <= 730)).toBe(true);
    expect(new Set(a.map((s) => s.id)).size).toBe(a.length);
    expect(a.some((s) => s.kind === 'shoulders')).toBe(true);
    expect(a.some((s) => s.kind === 'child')).toBe(true);
    expect(a.some((s) => s.prop === 'flag')).toBe(true);
    expect(a.some((s) => s.prop === 'phone')).toBe(true);
  });
  it('apparition échelonnée : la part présente suit crowdLevel', () => {
    const a = crowdFor(1, 720);
    const at = (m: number): number => a.filter((s) => s.u < crowdLevel(m)).length;
    expect(at(505)).toBe(0);
    expect(at(540)).toBeGreaterThan(0);
    expect(at(540)).toBeLessThan(at(570));
    expect(at(570)).toBeLessThan(at(660));
    expect(at(660)).toBe(a.length);
  });
  it('les marcheurs ordinaires sont nettement moins nombreux pendant la fermeture', () => {
    const open = cityIntensity(ctx({ y: 2026, m: 7, d: 14 }, 840)).walkers;
    const closed = cityIntensity(ctx({ y: 2026, m: 7, d: 14 }, 660)).walkers;
    expect(closed).toBeLessThan(0.35);
    expect(closed).toBeLessThan(open);
    // Un autre jour, à la même heure, rien ne change.
    expect(cityIntensity(ctx({ y: 2026, m: 7, d: 13 }, 660)).walkers).toBeGreaterThan(0.3);
  });
});

describe('trajets des spectateurs (ils arrivent et repartent à pied)', () => {
  const W = 720;
  const DOORS = [40, 150, 260, 420, 530, 660];
  const D0 = 1_790_000_000; // début du jour de la scène (s)
  const crowd = crowdFor(1, W, DOORS);
  const at = (h: number): number => D0 + h * 3600;
  it('déterministe ; moitié par une entrée d immeuble, moitié par un bord', () => {
    expect(crowdFor(1, W, DOORS)).toEqual(crowd);
    const s = crowd[17]!;
    expect(spectatorAt(s, at(9.2), D0)).toEqual(spectatorAt(s, at(9.2), D0));
    const doors = crowd.filter((c) => c.fromDoor).length;
    expect(doors).toBeGreaterThan(crowd.length * 0.3);
    expect(doors).toBeLessThan(crowd.length * 0.7);
    for (const c of crowd) {
      if (c.fromDoor) expect(DOORS).toContain(c.from);
      else expect(c.from === -80 || c.from === W + 80).toBe(true);
    }
  });
  it('en place (standing, à sa place) exactement quand u < crowdLevel ; marche juste avant et juste après', () => {
    for (const s of crowd) {
      for (const h of [9, 9.5, 10.5, 12.5, 13]) {
        const p = spectatorAt(s, at(h), D0);
        const present = s.u < crowdLevel(h * 60);
        if (present) {
          expect(p.mode).toBe('standing');
          expect(p.x).toBe(s.x);
          expect(p.dir).toBe(s.dir);
        } else expect(p.mode).not.toBe('standing');
      }
    }
    // Avant l arrivée : en marche ; après le départ : en marche.
    const s = crowd.find((c) => c.u > 0.3 && c.u < 0.7)!;
    let first = -1;
    let last = -1;
    for (let t = at(8.4); t < at(13.4); t += 1) {
      const m = spectatorAt(s, t, D0).mode;
      if (m === 'standing') {
        if (first < 0) first = t;
        last = t;
      }
    }
    expect(spectatorAt(s, first - 2, D0).mode).toBe('walking');
    expect(spectatorAt(s, last + 2, D0).mode).toBe('walking');
  });
  it('jamais de saut : écart de x au plus vitesse × dt entre deux instants proches', () => {
    let worst = 0;
    for (const s of crowd.filter((_, i) => i % 3 === 0)) {
      const { arrive, leave } = spectatorTimes(s.u);
      // Autour de l'arrivée et du départ (les trajets durent moins de 2 min).
      for (const m of [arrive, leave]) {
        const from = D0 + m * 60 - 150;
        let prev = spectatorAt(s, from, D0);
        for (let t = from + 0.25; t < from + 300; t += 0.25) {
          const p = spectatorAt(s, t, D0);
          worst = Math.max(worst, Math.abs(p.x - prev.x) - s.speed * 0.25, Math.abs(p.depth - prev.depth) - s.speed * 0.25);
          prev = p;
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(1e-6);
  });
  it('absent : à sa porte ou hors champ ; fondu seulement à l encadrement d une porte', () => {
    for (const s of crowd) {
      for (const h of [8, 14]) {
        const p = spectatorAt(s, at(h), D0);
        expect(p.mode).toBe('absent');
        if (p.x >= 0 && p.x <= W) expect(DOORS).toContain(p.x);
      }
      for (let t = at(8.3); t < at(13.5); t += 7) {
        const p = spectatorAt(s, t, D0);
        if (p.fade !== undefined && p.fade < 1 && p.mode !== 'absent') {
          expect(DOORS.some((d) => Math.abs(d - p.x) < 15)).toBe(true);
        }
      }
    }
  });
  it('les marcheurs passent derrière la foule (couloir de marche) et sont peu nombreux à la fois', () => {
    let max = 0;
    let seen = 0;
    for (let t = at(8.4); t < at(10); t += 10) {
      const w = crowd.map((s) => spectatorAt(s, t, D0)).filter((p) => p.mode === 'walking');
      max = Math.max(max, w.length);
      seen += w.length;
      for (const p of w) expect(p.depth).toBeLessThanOrEqual(CROWD_LANE + 6);
    }
    expect(seen).toBeGreaterThan(0);
    expect(max).toBeLessThan(15);
  });
});
