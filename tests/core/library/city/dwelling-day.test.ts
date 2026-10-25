import { describe, expect, it } from 'vitest';
import { addDays, dayContext, type DayContext, type HolidayPeriod, type YMD } from '../../../../src/core/library/city/calendar';
import { dwellingDay, type DwellingDay } from '../../../../src/core/library/city/dwelling-day';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Dwelling } from '../../../../src/core/library/city/households';
import { sceneDay } from '../../../../src/core/library/city/scene-day';
import { occupiedRooms, type Segment } from '../../../../src/core/library/city/schedules';

// Emplois du temps tirés des journées de chaque habitant (tâche 10) : mêmes logements que schedules.test.ts (villes de
// 1440 px, graines 1 à 3), vacances de la Toussaint.
const dry = { precip: 0, snow: false, storm: false };
const VAC: HolidayPeriod[] = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
const SUMMER: HolidayPeriod[] = [{ name: 'Été', start: '2026-07-04', end: '2026-09-01' }];
const TOWNS = [1, 2, 3].map((s) => ({ s, list: cityDwellings(cityFacades(1440, 340, s), s) }));
const ds: Dwelling[] = TOWNS.flatMap((t) => t.list);
const SEEDS = new Map(TOWNS.flatMap((t) => t.list.map((d) => [d, t.s] as const)));
const ctxOf = (date: YMD, periods: readonly HolidayPeriod[] = VAC): DayContext => ({ ...dayContext(date, [...periods]), periods });
const full = (d: Dwelling, date: YMD, periods: readonly HolidayPeriod[] = VAC): DwellingDay => {
  const seed = SEEDS.get(d) ?? 1;
  const ctx = ctxOf(date, periods);
  return dwellingDay(d, ctx, sceneDay(ctx, dry, seed), seed);
};
const WEEK: YMD[] = [12, 13, 14, 15, 16, 17, 18].map((d) => ({ y: 2026, m: 10, d }));
type Act = Extract<Segment, { k: 'act' }>;
type Lit = Extract<Segment, { k: 'lit' }>;
const acts = (x: DwellingDay): Act[] => x.schedule.segments.filter((g): g is Act => g.k === 'act');
const lits = (x: DwellingDay): Lit[] => x.schedule.segments.filter((g): g is Lit => g.k === 'lit');

// Minutes où quelqu'un est éveillé au logement : membres (lever → coucher hors sorties, retour de nuit 10 min) et
// visiteurs entrés.
function occupied(x: DwellingDay): [number, number][] {
  const out: [number, number][] = [];
  if (x.hd.away.state === 'away') return out;
  for (const p of x.hd.people) {
    const end = p.outing && p.outing.ret > 1440 ? 1440 : p.bed;
    let cur: [number, number][] = [[Math.max(0, p.wake), end]];
    for (const [a, b] of p.out) cur = cur.flatMap(([u, v]): [number, number][] => (b <= u || a >= v ? [[u, v]] : [...(a > u ? [[u, a] as [number, number]] : []), ...(b < v ? [[b, v] as [number, number]] : [])]));
    out.push(...cur);
    const night = p.blocks.find((b) => b.k === 'outing' && b.a === 0 && b.b > 0);
    if (night) out.push([night.b, night.b + 10]);
  }
  for (const v of x.visits) if (v.inside) out.push([v.arrive, v.leave]);
  return out;
}
// Plus long morceau de [t0, t1] qu'aucun intervalle ne couvre.
function longestGap(t0: number, t1: number, cover: readonly [number, number][]): number {
  const s = cover.filter(([a, b]) => b > t0 && a < t1).sort((p, q) => p[0] - q[0]);
  let t = t0, gap = 0;
  for (const [a, b] of s) {
    if (a > t) gap = Math.max(gap, a - t);
    t = Math.max(t, b);
    if (t >= t1) break;
  }
  return Math.max(gap, t1 - t);
}

describe('emplois du temps depuis les journées de chacun', () => {
  it('les départs et retours de chaque membre sont ceux de ses intervalles out (même minute)', () => {
    let checked = 0;
    for (const d of ds) {
      for (const date of WEEK) {
        const x = full(d, date);
        d.hh.members.forEach((_, m) => {
          const p = x.hd.people[m]!;
          const want = {
            depart: p.out.filter(([a]) => a > 0 && a <= 1800).map(([a]) => a),
            return: p.out.filter(([, b]) => b > 0 && b <= 1440).map(([, b]) => b),
          };
          for (const k of ['depart', 'return'] as const) {
            const got = x.schedule.segments.filter((g) => g.k === k && g.m === m).map((g) => (g as { t: number }).t);
            expect(got.sort((a, b) => a - b), `${d.id}#${m} ${k} ${x.hd.iso}`).toEqual(want[k].sort((a, b) => a - b));
            checked += got.length;
          }
        });
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('aucune pièce allumée plus de 10 min sans occupant éveillé au logement', () => {
    let seen = 0;
    for (const d of ds) {
      for (const date of [...WEEK, { y: 2026, m: 12, d: 31 }, { y: 2026, m: 7, d: 14 }]) {
        const x = full(d, date);
        const cover = occupied(x);
        for (const l of lits(x)) {
          seen++;
          expect(longestGap(l.t0, l.t1, cover), `${d.id} ${l.room} ${l.t0.toFixed(1)}-${l.t1.toFixed(1)} ${x.hd.iso}`).toBeLessThanOrEqual(10 + 1e-6);
        }
      }
    }
    expect(seen).toBeGreaterThan(1000);
  });

  it('lumières de 3 h - 5 h seulement dans la chambre d\'un membre rentré de boîte, 10 min', () => {
    let nights = 0;
    for (const d of ds) {
      const bedRoom = d.rooms.includes('chambre') ? 'chambre' : 'salon';
      for (const date of [...WEEK, ...[19, 20, 21, 22, 23, 24, 25].map((dd) => ({ y: 2026, m: 10, d: dd }))]) {
        const x = full(d, date);
        const backs = x.hd.people.flatMap((p) => p.blocks.filter((b) => b.k === 'outing' && b.a === 0 && b.b > 0).map((b) => b.b));
        // Avant le premier lever (un lève-tôt debout à 4 h 50 allume, lui, chez lui).
        const up = Math.min(...x.hd.people.map((p) => p.wake));
        for (const l of lits(x)) {
          if (l.t1 <= 180 || l.t0 >= 300 || l.t0 >= up) continue;
          nights++;
          expect(l.room, `${d.id} ${x.hd.iso}`).toBe(bedRoom);
          // Chaque minute allumée tombe dans les 10 min qui suivent le retour d'un membre (deux retours proches : 10 min chacun).
          expect(longestGap(l.t0, l.t1, backs.map((b): [number, number] => [b, b + 10])), `${d.id} ${x.hd.iso} ${l.t0}-${l.t1}`).toBe(0);
          expect(backs.some((b) => Math.abs(b - l.t0) <= 1)).toBe(true);
        }
      }
    }
    expect(nights).toBeGreaterThan(0);
  });

  it('retour de coupure HCR : salon allumé l\'après-midi si c\'est la nuit', () => {
    // Décembre : à 16 h il fait déjà sombre ; le serveur rentré pour la coupure est au salon, la lumière est allumée (le
    // calque ne la montre que la nuit).
    const towns = [1, 2, 3, 4, 5].flatMap((s) => cityDwellings(cityFacades(1440, 340, s), s).map((d) => ({ d, s })));
    let checked = 0;
    for (const { d, s } of towns) {
      for (const day of [1, 2, 3, 4, 5, 8, 9, 10, 11, 12]) {
        const ctx = ctxOf({ y: 2026, m: 12, d: day }, []);
        const x = dwellingDay(d, ctx, sceneDay(ctx, dry, s), s);
        x.hd.people.forEach((p) => {
          const w = p.duty?.kind === 'work' ? p.duty.w : null;
          if (!w?.split || !w.homeAtBreak) return;
          if (p.out.some(([a, b]) => a <= 960 && b > 960) || p.wake > 960) return;
          checked++;
          expect(lits(x).some((l) => l.room === 'salon' && l.t0 <= 960 && l.t1 > 960), `${d.id} ${ctx.iso}`).toBe(true);
        });
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('aucune scène act d\'un membre ne contient dressAt ni undressAt', () => {
    let checked = 0;
    for (const d of ds) {
      for (const date of [...WEEK, { y: 2026, m: 12, d: 31 }]) {
        const x = full(d, date);
        for (const a of acts(x)) {
          if (a.m >= d.hh.members.length) continue;
          const p = x.hd.people[a.m]!;
          for (const t of [p.dressAt, p.undressAt]) {
            checked++;
            expect(a.t1 <= t - 1.5 + 1e-6 || a.t0 >= t + 1.5 - 1e-6, `${d.id}#${a.m} ${a.choreo} ${a.t0.toFixed(1)}-${a.t1.toFixed(1)} ⊃ ${t}`).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('jour away : aucun segment ; leaves : dernier segment = depart commun', () => {
    let away = 0, leaves = 0;
    const sat = { y: 2026, m: 7, d: 25 };
    for (const d of ds) {
      for (const date of [sat, ...[26, 27, 28, 29, 30, 31].map((dd) => ({ y: 2026, m: 7, d: dd })), { y: 2026, m: 7, d: 18 }, { y: 2026, m: 8, d: 1 }]) {
        const x = full(d, date, SUMMER);
        if (x.hd.away.state === 'away') {
          away++;
          expect(x.schedule.segments).toEqual([]);
          expect(x.schedule.maxActors).toBe(0);
        } else if (x.hd.away.state === 'leaves') {
          leaves++;
          const at = x.hd.away.at!;
          const segs = x.schedule.segments;
          const last = segs[segs.length - 1]!;
          expect(last.k, `${d.id} ${x.hd.iso}`).toBe('depart');
          expect((last as { t: number }).t).toBe(at);
          const departs = segs.filter((g): g is Extract<Segment, { k: 'return' | 'depart' }> => g.k === 'depart');
          expect(departs.map((g) => g.m).sort()).toEqual(d.hh.members.map((_, m) => m));
          expect(departs.every((g) => g.t === at)).toBe(true);
          for (const g of segs) expect('t' in g ? g.t : g.t1).toBeLessThanOrEqual(at);
        }
      }
    }
    expect(away).toBeGreaterThan(5);
    expect(leaves).toBeGreaterThan(0);
  });

  it('visites inside : return et depart aux heures de la visite, un siège de plus au dîner', () => {
    let dinners = 0, inside = 0;
    for (const d of ds) {
      const n = d.hh.members.length;
      for (const date of [...WEEK, { y: 2026, m: 10, d: 9 }, { y: 2026, m: 10, d: 10 }, { y: 2026, m: 10, d: 23 }, { y: 2026, m: 10, d: 24 }]) {
        const x = full(d, date);
        x.visits.filter((v) => v.inside).forEach((v, k) => {
          inside++;
          const m = n + k;
          const ret = x.schedule.segments.filter((g) => g.k === 'return' && g.m === m).map((g) => (g as { t: number }).t);
          const dep = x.schedule.segments.filter((g) => g.k === 'depart' && g.m === m).map((g) => (g as { t: number }).t);
          expect(ret, `${d.id} ${x.hd.iso} ${v.kind}`).toEqual([v.arrive]);
          expect(dep).toEqual([v.leave]);
          for (const a of acts(x)) if (a.m === m) expect(a.t0 >= v.arrive && a.t1 <= v.leave).toBe(true);
          if (v.kind !== 'diner') return;
          const seat = acts(x).find((a) => a.m === m && a.choreo === 'table');
          expect(seat, `${d.id} ${x.hd.iso} invité ${k}`).toBeDefined();
          const hosts = new Set(acts(x).filter((a) => a.m < n && a.choreo === 'table' && a.t0 < seat!.t1 && a.t1 > seat!.t0).map((a) => a.m));
          expect(seat!.party).toBeGreaterThan(hosts.size);
          expect(seat!.party).toBeGreaterThanOrEqual(2);
          dinners++;
        });
      }
    }
    expect(dinners).toBeGreaterThan(10);
    expect(inside).toBeGreaterThan(dinners);
  });

  it('même (logement, jour, graine) → même journée ; veille recalculée', () => {
    const d = ds[5]!;
    const date = WEEK[2]!;
    expect(full(d, date)).toEqual(full(d, date));
    expect(full(d, addDays(date, -1)).hd.iso).toBe('2026-10-13');
  });

  it('par pièce : chaque minute allumée au plus 10 min après une présence ou une scène dans cette pièce', () => {
    let seen = 0;
    for (const d of ds) {
      for (const date of [...WEEK, { y: 2026, m: 12, d: 31 }, { y: 2026, m: 7, d: 14 }]) {
        const x = full(d, date);
        const rooms = occupiedRooms(d, x.hd, x.meals, x.visits);
        for (const l of lits(x)) {
          const cover = [
            ...rooms.filter((s) => s.room === l.room).map((s): [number, number] => [s.a, s.b + 10]),
            ...acts(x).filter((a) => a.room === l.room).map((a): [number, number] => [a.t0, a.t1 + 10]),
          ];
          seen++;
          expect(longestGap(l.t0, l.t1, cover), `${d.id} ${l.room} ${l.t0.toFixed(1)}-${l.t1.toFixed(1)} ${x.hd.iso}`).toBeLessThanOrEqual(1e-6);
        }
      }
    }
    expect(seen).toBeGreaterThan(1000);
  });

  it('fête : on ne danse qu\'au salon, jamais pendant son coucher', () => {
    let dances = 0;
    for (const d of ds.filter((x) => x.hh.type === 'coloc' || x.hh.type === 'couple')) {
      for (const date of [{ y: 2026, m: 10, d: 10 }, { y: 2026, m: 10, d: 17 }, { y: 2026, m: 10, d: 24 }, { y: 2026, m: 12, d: 31 }]) {
        const x = full(d, date);
        const rooms = occupiedRooms(d, x.hd, x.meals, x.visits);
        for (const a of acts(x)) {
          if (a.choreo !== 'dance' || a.event) continue;
          dances++;
          expect(rooms.some((s) => s.m === a.m && s.room === 'salon' && s.what !== 'bedtime' && s.a <= a.t0 + 1e-6 && s.b >= a.t1 - 1e-6), `${d.id}#${a.m} ${x.hd.iso}`).toBe(true);
        }
      }
    }
    expect(dances).toBeGreaterThan(0);
  });

  it('vaisselle : après le dîner, un adulte présent range la cuisine 10 à 20 min, cuisine allumée', () => {
    let dinners = 0, dishes = 0;
    for (const d of ds) {
      const K = d.rooms.includes('cuisine') ? 'cuisine' : 'salon';
      for (const date of WEEK) {
        const x = full(d, date);
        const T = x.meals.dinner;
        if (T === null) continue;
        dinners++;
        const dish = acts(x).find((a) => a.choreo === 'cook' && a.room === K && a.t0 >= T + 40 && a.t0 <= T + 75 && a.t1 - a.t0 >= 10 - 1e-6 && a.t1 - a.t0 <= 20 + 1e-6);
        if (!dish) continue;
        dishes++;
        expect(d.hh.members[dish.m]!.kid).toBe(false);
        expect(lits(x).some((l) => l.room === K && l.t0 <= dish.t0 && l.t1 >= dish.t1)).toBe(true);
      }
    }
    expect(dishes).toBeGreaterThan(dinners * 0.7);
  });

  it('de 20 h à 22 h, un logement où quelqu\'un est éveillé a au moins une pièce allumée (hors feux)', () => {
    let checked = 0;
    for (const d of ds) {
      for (const date of WEEK) {
        const x = full(d, date);
        const cover = occupied(x);
        for (const t of [1200, 1230, 1260, 1290, 1320]) {
          if (!cover.some(([a, b]) => a <= t && b > t)) continue;
          if (x.schedule.segments.some((g) => g.k === 'dim' && g.t0 <= t && g.t1 > t)) continue;
          checked++;
          expect(lits(x).some((l) => l.t0 <= t && l.t1 > t), `${d.id} ${x.hd.iso} ${t}`).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('malade au logement : salon allumé l\'après-midi quand il y est', () => {
    let sick = 0;
    const days = Array.from({ length: 21 }, (_, i) => addDays({ y: 2026, m: 11, d: 2 }, i));
    for (const d of ds) {
      for (const date of days) {
        const x = full(d, date);
        const rooms = occupiedRooms(d, x.hd, x.meals, x.visits);
        x.hd.people.forEach((p) => {
          if (!p.sick) return;
          for (const t of [690, 840, 900, 930]) {
            // Au salon (journée au logement), hors lever, repas et coucher.
            if (!rooms.some((s) => s.m === p.m && s.what === 'home' && s.a <= t && s.b > t)) continue;
            sick++;
            expect(lits(x).some((l) => l.room === 'salon' && l.t0 <= t && l.t1 > t), `${d.id} ${x.hd.iso} ${t}`).toBe(true);
          }
        });
      }
    }
    expect(sick).toBeGreaterThan(10);
  });
});
