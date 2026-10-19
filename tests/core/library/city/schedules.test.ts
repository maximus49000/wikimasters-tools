import { describe, expect, it } from 'vitest';
import { dayContext, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Dwelling, type HouseholdType } from '../../../../src/core/library/city/households';
import { dayDraw, sceneDay, type SceneDay } from '../../../../src/core/library/city/scene-day';
import { buildSchedule, type Schedule, type Segment } from '../../../../src/core/library/city/schedules';
import { sunTimes, type SunTimes } from '../../../../src/core/library/sky';

const SEED = 7;
const dry = { precip: 0, snow: false, storm: false };
const ds: Dwelling[] = [1, 2, 3].flatMap((s) => cityDwellings(cityFacades(1440, 340, s), s));
const VAC = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
const dayOf = (date: YMD, seed = SEED, weather = dry): SceneDay => sceneDay(dayContext(date, VAC), weather, seed);
const TYPES: HouseholdType[] = ['couple', 'famille', 'retraite', 'etudiant', 'coloc', 'solo'];
// Logement fictif d'un type donné (clé changée pour varier les tirages), balcon au choix.
const ofType = (type: HouseholdType, i: number, balcony = i % 2 === 0): Dwelling => {
  const base = ds[i % ds.length]!;
  return { ...base, id: `${base.id}#${i}`, key: (base.key ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0, balcony, hh: { ...base.hh, type, smoker: i % 3 === 0 } };
};
const pool = (type: HouseholdType, n: number) => Array.from({ length: n }, (_, i) => ofType(type, i));
const mixed = (n: number) => Array.from({ length: n }, (_, i) => ofType(TYPES[i % TYPES.length]!, i));
const sched = (d: Dwelling, day: SceneDay, seed = SEED): Schedule => buildSchedule(d, day, dayDraw(d, day, seed));
const WEEK = [12, 13, 14, 15, 16, 17, 18].map((d) => dayOf({ y: 2026, m: 10, d }));
const acts = (s: Schedule) => s.segments.filter((g): g is Extract<Segment, { k: 'act' }> => g.k === 'act');

describe('emplois du temps', () => {
  it('chaque scène commence et finit dans les bornes du jour (0-1800) et dure > 0', () => {
    const days = [...WEEK, dayOf({ y: 2026, m: 7, d: 14 }), dayOf({ y: 2026, m: 12, d: 31 }), dayOf({ y: 2026, m: 6, d: 21 })];
    for (const d of [...ds, ...mixed(120)]) {
      for (const day of days) {
        for (const g of sched(d, day).segments) {
          if ('t0' in g) {
            expect(g.t0).toBeGreaterThanOrEqual(0);
            expect(g.t1).toBeLessThanOrEqual(1800);
            expect(g.t1).toBeGreaterThan(g.t0);
          } else {
            expect(g.t).toBeGreaterThanOrEqual(0);
            expect(g.t).toBeLessThanOrEqual(1800);
            if ('dur' in g) {
              expect(g.dur).toBeGreaterThan(0);
              expect(g.t + g.dur).toBeLessThanOrEqual(1800);
            }
          }
        }
      }
    }
  });

  it('un membre ne joue jamais deux chorégraphies en même temps', () => {
    const dws = mixed(200);
    expect(dws.length).toBe(200);
    for (const d of dws) {
      for (const day of WEEK) {
        const byMember = new Map<number, { t0: number; t1: number }[]>();
        for (const a of acts(sched(d, day))) (byMember.get(a.m) ?? byMember.set(a.m, []).get(a.m)!).push(a);
        for (const list of byMember.values()) {
          list.sort((a, b) => a.t0 - b.t0);
          for (let i = 1; i < list.length; i++) expect(list[i]!.t0).toBeGreaterThanOrEqual(list[i - 1]!.t1 - 1e-9);
        }
      }
    }
  });

  it('un membre absent (entre depart et return) ne joue aucune scène', () => {
    for (const d of mixed(200)) {
      for (const day of [...WEEK, dayOf({ y: 2026, m: 7, d: 14 })]) {
        const s = sched(d, day);
        const street = s.segments.filter((g): g is Extract<Segment, { k: 'return' | 'depart' }> => g.k === 'return' || g.k === 'depart').sort((a, b) => a.t - b.t);
        const gone: [number, number, number][] = [];
        const ms = new Set(street.map((g) => g.m));
        for (const m of ms) {
          const own = street.filter((g) => g.m === m);
          if (own[0]!.k === 'return') gone.push([m, 0, own[0]!.t]); // invité : pas là avant son arrivée
          own.forEach((g, i) => {
            if (g.k !== 'depart') return;
            const back = own.slice(i + 1).find((x) => x.k === 'return');
            gone.push([m, g.t, back ? back.t : 1800]);
          });
        }
        for (const a of acts(s)) for (const [m, from, to] of gone) if (a.m === m) expect(a.t1 <= from || a.t0 >= to).toBe(true);
      }
    }
  });

  it('deux jours différents → journées différentes pour un même logement (heures et scènes)', () => {
    const mon = dayOf({ y: 2026, m: 10, d: 12 });
    const tue = dayOf({ y: 2026, m: 10, d: 13 });
    const sig = (s: Schedule) => s.segments.map((g) => g.k + Math.round('t' in g ? g.t : g.t0)).join(',');
    const differ = ds.filter((d) => sig(sched(d, mon)) !== sig(sched(d, tue))).length;
    expect(ds.length).toBeGreaterThan(40);
    expect(differ / ds.length).toBeGreaterThanOrEqual(0.9);
  });

  it('week-end : réveil plus tard en moyenne (≥ 60 min)', () => {
    const sat = dayOf({ y: 2026, m: 10, d: 10 });
    const tue = dayOf({ y: 2026, m: 10, d: 13 });
    const wake = (s: Schedule) => Math.min(...s.segments.filter((g) => g.k === 'lit' && g.t0 < 720).map((g) => (g as { t0: number }).t0));
    let sum = 0;
    let count = 0;
    for (const d of mixed(300)) {
      const a = sched(d, sat);
      const b = sched(d, tue);
      if (!a.segments.length || !b.segments.length || dayDraw(d, tue, SEED).presence === 'sick') continue;
      sum += wake(a) - wake(b);
      count++;
    }
    expect(count).toBeGreaterThan(200);
    expect(sum / count).toBeGreaterThanOrEqual(60);
  });

  it('famille : parfois une seule pièce allumée le soir (télé au salon)', () => {
    const tue = dayOf({ y: 2026, m: 10, d: 13 });
    const fams = pool('famille', 100).map((d) => ({ ...d, rooms: ['cuisine', 'chambre', 'salon'] as Dwelling['rooms'] }));
    const at = 21 * 60 + 30;
    const one = fams.filter((d) => sched(d, tue).segments.filter((g) => g.k === 'lit' && g.t0 <= at && g.t1 > at).length === 1).length;
    expect(one).toBeGreaterThanOrEqual(20);
  });

  it('pièces : pas deux lumières à la fois dans la même pièce', () => {
    for (const d of mixed(120)) {
      for (const day of [...WEEK, dayOf({ y: 2026, m: 12, d: 31 })]) {
        const lits = sched(d, day).segments.filter((g): g is Extract<Segment, { k: 'lit' }> => g.k === 'lit');
        for (const a of lits) for (const b of lits) if (a !== b && a.room === b.room) expect(a.t1 <= b.t0 || b.t1 <= a.t0).toBe(true);
      }
    }
  });

  it("ordre des extinctions du soir variable d'un jour à l'autre pour un même logement", () => {
    const days = Array.from({ length: 10 }, (_, i) => dayOf({ y: 2026, m: 11, d: 2 + i }));
    let varied = 0;
    let checked = 0;
    for (const type of ['couple', 'retraite'] as const) {
      for (const i of [0, 1, 2, 3]) {
        const d = { ...ofType(type, i), rooms: ['cuisine', 'chambre', 'salon'] as Dwelling['rooms'] };
        const orders = new Set<string>();
        for (const day of days) {
          const s = sched(d, day);
          if (!s.segments.length) continue;
          const last = new Map<string, number>();
          for (const g of s.segments) if (g.k === 'lit') last.set(g.room, Math.max(last.get(g.room) ?? 0, g.t1));
          const evening = [...last].filter(([, t]) => t > 20 * 60).sort((a, b) => a[1] - b[1]).map(([room]) => room);
          orders.add(evening.join('>'));
        }
        checked++;
        if (orders.size >= 2) varied++;
      }
    }
    expect(varied).toBeGreaterThanOrEqual(checked * 0.75);
  });

  it('aucune pièce éteinte pendant qu’un acteur y joue', () => {
    for (const d of mixed(150).map((x) => ({ ...x, rooms: ['cuisine', 'chambre', 'salon'] as Dwelling['rooms'] }))) {
      for (const day of [...WEEK, dayOf({ y: 2026, m: 12, d: 31 }), dayOf({ y: 2026, m: 7, d: 14 })]) {
        const s = sched(d, day);
        const lits = s.segments.filter((g): g is Extract<Segment, { k: 'lit' }> => g.k === 'lit');
        for (const l of lits) {
          if (l.t1 < 18 * 60 || lits.some((x) => x.room === l.room && x.t0 === l.t1)) continue; // extinctions du soir
          for (const a of acts(s)) if (a.room === l.room && a.where === 'in') expect(a.t0 < l.t1 && a.t1 > l.t1).toBe(false);
        }
      }
    }
  });

  it('feux : adultes d’abord, enfants couchés absents', () => {
    const day = dayOf({ y: 2026, m: 7, d: 14 });
    for (const d of pool('famille', 80)) {
      const fam = { ...d, hh: { ...d.hh, members: [...d.hh.members.slice(0, 2).map((m) => ({ ...m, size: 1, kid: false })), { ...d.hh.members[0]!, size: 0.62, kid: true }] } };
      const watchers = acts(sched(fam, day)).filter((a) => a.event).map((a) => a.m);
      if (watchers.length) expect(watchers.slice(0, 2).every((m) => m < 2)).toBe(true);
      expect(watchers.includes(2)).toBe(false); // couché vers 20 h 30, bien avant 22 h 15
    }
  });

  it('absent : aucun lit ni act ; malade : aucun depart', () => {
    let away = 0;
    let sick = 0;
    const dws = mixed(600);
    for (const day of WEEK.slice(0, 3)) {
      for (const d of dws) {
        const p = dayDraw(d, day, SEED).presence;
        const s = sched(d, day);
        if (p === 'away') {
          away++;
          expect(s.segments.some((g) => g.k === 'lit' || g.k === 'act')).toBe(false);
          expect(s.maxActors).toBe(0);
        }
        if (p === 'sick') {
          sick++;
          expect(s.segments.some((g) => g.k === 'depart')).toBe(false);
          expect(s.segments.some((g) => g.k === 'lit' && g.t0 > 11 * 60 && g.t1 < 16 * 60 && g.room === 'salon') || !d.rooms.includes('salon')).toBe(true);
        }
      }
    }
    expect(away).toBeGreaterThan(0);
    expect(sick).toBeGreaterThan(0);
  });

  it('invités : sièges en plus au dîner, arrivés et repartis par la porte', () => {
    const fri = dayOf({ y: 2026, m: 10, d: 16 });
    const hosts = mixed(600).filter((d) => dayDraw(d, fri, SEED).presence === 'guests');
    expect(hosts.length).toBeGreaterThan(10);
    for (const d of hosts) {
      const s = sched(d, fri);
      const n = d.hh.members.length;
      const guests = acts(s).filter((a) => a.m >= n && a.choreo === 'table');
      expect(guests.length).toBeGreaterThan(0);
      for (const g of guests) expect(g.party).toBeGreaterThan(n);
      expect(s.segments.some((g) => g.k === 'return' && g.m >= n)).toBe(true);
    }
  });

  it('14 juillet : penchés et dim autour du spectacle tiré, pas à heure fixe', () => {
    const date = { y: 2026, m: 7, d: 14 };
    const seeds = [7, 11];
    const dims = seeds.map((seed) => {
      const day = dayOf(date, seed);
      const show = day.show!;
      const d = pool('couple', 40).find((x) => dayDraw(x, day, seed).presence === 'normal')!;
      const s = sched(d, day, seed);
      const dim = s.segments.find((g) => g.k === 'dim') as { t0: number; t1: number };
      expect(dim.t0).toBeCloseTo(show.start - 1, 6);
      const leaners = acts(s).filter((a) => a.event && (a.choreo === 'lean' || a.choreo === 'leanRail'));
      expect(leaners.length).toBeGreaterThan(0);
      expect(Math.min(...leaners.map((a) => a.t0))).toBeCloseTo(show.start - 2, 6);
      for (const a of leaners) expect(a.t1).toBeCloseTo(show.end + 1, 6);
      return dim.t0;
    });
    expect(dims[0]).not.toBeCloseTo(dims[1]!, 3);
  });

  it('feux : la famille déjà couchée ne réagit pas', () => {
    const day = dayOf({ y: 2026, m: 12, d: 31 });
    for (const d of pool('retraite', 60)) {
      const s = sched(d, day);
      const lastLit = Math.max(0, ...s.segments.filter((g) => g.k === 'lit').map((g) => (g as { t1: number }).t1));
      if (lastLit < day.show!.start - 30) expect(s.segments.some((g) => g.k === 'dim')).toBe(false);
    }
  });

  it('volets du retraité fermés à la tombée de la nuit', () => {
    const day = dayOf({ y: 2026, m: 10, d: 13 });
    const nightfall = Math.max(day.sunset + 20, 1086);
    const olds = pool('retraite', 40).map((d) => ({ ...d, shutters: 'battant' as const }));
    const checked = olds.filter((d) => dayDraw(d, day, SEED).presence !== 'away');
    for (const d of checked) {
      const closers = acts(sched(d, day)).filter((a) => a.choreo === 'closeShutters');
      expect(closers[0]!.t0).toBeCloseTo(nightfall, 6);
    }
    // En été, la nuit tombe après le coucher : volets fermés avant d'éteindre le salon.
    const july = dayOf({ y: 2026, m: 7, d: 7 });
    for (const d of olds.filter((x) => dayDraw(x, july, SEED).presence !== 'away')) {
      const s = sched(d, july);
      const salonOff = Math.max(...s.segments.filter((g) => g.k === 'lit' && g.room === 'salon').map((g) => (g as { t1: number }).t1));
      expect(acts(s).find((a) => a.choreo === 'closeShutters')!.t0).toBeLessThan(salonOff);
    }
  });

  it('volets du retraité : le coucher du soleil du lieu, la table de Paris sans lieu', () => {
    const at = (date: YMD, sun?: SunTimes): SceneDay => sceneDay(dayContext(date, VAC), dry, SEED, false, undefined, sun);
    const olds = pool('retraite', 40).map((d) => ({ ...d, shutters: 'battant' as const }));
    const closeAt = (day: SceneDay) =>
      olds.filter((d) => dayDraw(d, day, SEED).presence !== 'away').map((d) => acts(sched(d, day)).find((a) => a.choreo === 'closeShutters')!.t0);
    // Même jour d'automne : Oslo (UTC+2) ferme plus tôt que Paris.
    const oct = { y: 2026, m: 10, d: 13 };
    const paris = closeAt(at(oct, sunTimes(oct, { lat: 48.85, lon: 2.35 }, 120)));
    const oslo = closeAt(at(oct, sunTimes(oct, { lat: 59.91, lon: 10.75 }, 120)));
    expect(Math.max(...oslo)).toBeLessThan(Math.min(...paris));
    // Hiver à Paris (UTC+1) : la fermeture suit le coucher réel (16 h 55), plus le plancher de 18 h 06.
    const dec = { y: 2026, m: 12, d: 15 };
    const sun = sunTimes(dec, { lat: 48.85, lon: 2.35 }, 60) as Extract<SunTimes, { kind: 'normal' }>;
    const winter = at(dec, sun);
    const nightfall = Math.round(sun.sunset) + 20;
    const closes = closeAt(winter);
    for (const t of closes) {
      expect(t).toBeGreaterThanOrEqual(nightfall - 1e-6);
      expect(t).toBeLessThan(1086);
    }
    // Sauf qui regarde encore la rue à cette heure (il referme après), tous ferment au coucher + 20 min.
    expect(closes.filter((t) => Math.abs(t - nightfall) < 1e-6).length).toBeGreaterThan(closes.length / 2);
    // Personne ne ferme les volets du salon pendant qu'un membre regarde la rue par sa fenêtre ou son balcon.
    for (const d of olds.filter((x) => dayDraw(x, winter, SEED).presence !== 'away')) {
      const all = acts(sched(d, winter));
      const close = all.find((a) => a.choreo === 'closeShutters' && a.room === 'salon');
      if (!close) continue;
      for (const a of all) if (a.room === 'salon' && (a.choreo === 'lean' || a.choreo === 'leanRail') && a.t0 < close.t0) expect(a.t1).toBeLessThanOrEqual(close.t0);
    }
    // Sans lieu : table de Paris du mois (coucher 16 h 54 en décembre).
    expect(closeAt(at(dec)).filter((t) => Math.abs(t - (Math.round(16.9 * 60) + 20)) < 1e-6).length).toBeGreaterThan(0);
  });

  it('volets du retraité aux pôles : nuit polaire tôt, jour polaire au coucher du foyer', () => {
    const dec = { y: 2026, m: 12, d: 15 };
    const olds = pool('retraite', 40).map((d) => ({ ...d, shutters: 'battant' as const }));
    const polarNight = sceneDay(dayContext(dec, VAC), dry, SEED, false, undefined, { kind: 'polar', polar: 'night' });
    const polarDay = sceneDay(dayContext({ y: 2026, m: 6, d: 16 }, VAC), dry, SEED, false, undefined, { kind: 'polar', polar: 'day' });
    for (const d of olds.filter((x) => dayDraw(x, polarNight, SEED).presence !== 'away')) {
      expect(acts(sched(d, polarNight)).find((a) => a.choreo === 'closeShutters')!.t0).toBeLessThan(1086);
    }
    for (const d of olds.filter((x) => dayDraw(x, polarDay, SEED).presence !== 'away')) {
      const s = sched(d, polarDay);
      const salonOff = Math.max(...s.segments.filter((g) => g.k === 'lit' && g.room === 'salon').map((g) => (g as { t1: number }).t1));
      const t = acts(s).find((a) => a.choreo === 'closeShutters')!.t0;
      expect(t).toBeLessThan(salonOff);
      expect(t).toBeGreaterThan(salonOff - 60);
    }
  });

  it('étudiant et coloc : aucun segment shut', () => {
    for (const d of [...pool('etudiant', 100), ...pool('coloc', 100)].map((x) => ({ ...x, shutters: 'persienne' as const }))) {
      for (const day of WEEK) {
        const s = sched(d, day);
        expect(s.segments.some((g) => g.k === 'shut')).toBe(false);
        expect(s.shutUser).toBe(false);
      }
    }
  });

  it('maxActors = nombre maximal de scènes simultanées', () => {
    for (const d of mixed(60)) {
      const s = sched(d, WEEK[5]!);
      const as = acts(s);
      let max = 0;
      for (const a of as) max = Math.max(max, as.filter((b) => b.t0 <= a.t0 && b.t1 > a.t0).length);
      expect(s.maxActors).toBe(max);
    }
  });
});
