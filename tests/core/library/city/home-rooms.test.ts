import { describe, expect, it } from 'vitest';
import { addDays, dayContext, type DayContext, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Dwelling } from '../../../../src/core/library/city/households';
import { householdMeals, NANNY_M, roomTimeline, type RoomSpan } from '../../../../src/core/library/city/home-rooms';
import { dayRng } from '../../../../src/core/library/city/person-traits';
import { householdDays, type HouseholdDays } from '../../../../src/core/library/city/person-day';
import { approximatePeriods } from '../../../../src/core/library/city/school-calendar';

// Pièces occupées et repas du foyer (tâche 8) : villes de 1440 px, 3 graines, novembre 2026.
const PERIODS = approximatePeriods(2026);
const ctx = (date: YMD): DayContext => ({ ...dayContext(date, PERIODS), periods: PERIODS });
const NOV1: YMD = { y: 2026, m: 11, d: 1 };
const NOVEMBER: DayContext[] = Array.from({ length: 30 }, (_, i) => ctx(addDays(NOV1, i)));
const TOWNS = [1, 2, 3].map((seed) => ({ seed, dwellings: cityDwellings(cityFacades(1440, 340, seed), seed) }));
type Row = { d: Dwelling; day: DayContext; hd: HouseholdDays; spans: RoomSpan[]; meals: ReturnType<typeof householdMeals> };
const ROWS: Row[] = TOWNS.flatMap(({ seed, dwellings }) =>
  dwellings.flatMap((d) => NOVEMBER.map((day) => {
    const hd = householdDays(d, day, seed);
    const meals = householdMeals(d, hd, dayRng(d.hh.seed, 0, day.iso, 'repas'));
    return { d, day, hd, meals, spans: roomTimeline(d, hd, meals, []) };
  })));
const inside = (out: readonly (readonly [number, number])[], t: number): boolean => out.some(([a, b]) => t >= a && t < b);

describe('pièces occupées et repas du foyer', () => {
  it('aucune RoomSpan pendant un intervalle out du membre', () => {
    let n = 0;
    const bad: string[] = [];
    for (const r of ROWS) {
      for (const s of r.spans) {
        const p = r.hd.people[s.m];
        if (!p) continue;
        if (s.what === 'night') continue; // retour de nuit : la fin de l'intervalle out est le début de la span
        if (p.out.some(([a, b]) => s.a < b && s.b > a)) bad.push(`${r.d.id} ${r.day.iso} m${s.m} ${s.what} ${s.a}-${s.b}`);
        n++;
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(n).toBeGreaterThan(5000);
  });

  it('chaque membre éveillé au logement est dans exactement une pièce à chaque minute', () => {
    const bad: string[] = [];
    for (const r of ROWS) {
      r.hd.people.forEach((p) => {
        const cover = new Uint8Array(1440);
        for (const s of r.spans) if (s.m === p.m) for (let t = s.a; t < Math.min(s.b, 1440); t++) cover[t] = (cover[t] ?? 0) + 1;
        for (let t = 0; t < 1440; t++) {
          const awake = t >= p.wake && t < p.bed && !inside(p.out, t) && r.hd.away.state !== 'away';
          // Le soir d'une sortie qui finit après minuit : le retour appartient à la journée suivante.
          const nightTail = p.outing !== null && p.outing.ret > 1440 && t >= p.outing.dep;
          if ((cover[t] ?? 0) !== (awake && !nightTail ? 1 : Math.min(cover[t] ?? 0, 1))) bad.push(`${r.d.id} ${r.day.iso} m${p.m} ${t} x${cover[t]}`);
        }
      });
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('pièce absente du logement → salon', () => {
    let small = 0;
    for (const r of ROWS) {
      for (const s of r.spans) expect(r.d.rooms.includes(s.room) || s.room === 'salon', `${r.d.id} ${s.room}`).toBe(true);
      if (!r.d.rooms.includes('cuisine') && r.spans.length) {
        small++;
        expect(r.spans.every((s) => s.room === 'salon')).toBe(true);
      }
    }
    expect(small).toBeGreaterThan(0);
  });

  it('dîner après le retour du dernier adulte qui dîne, enfants avant 19 h 30', () => {
    let n = 0;
    for (const r of ROWS) {
      const { dinner, kidsDinner } = r.meals;
      if (dinner === null) continue;
      r.spans.filter((s) => s.what === 'dinner').forEach((s) => {
        const p = r.hd.people[s.m];
        if (!p) return;
        const kid = r.d.hh.members[s.m]!.who.status === 'enfant';
        if (kid) return;
        expect(s.a).toBe(dinner);
        for (const [a, b] of p.out) if (a < dinner && b <= 1380) expect(b + 10, `${r.d.id} ${r.day.iso} m${s.m}`).toBeLessThanOrEqual(dinner);
        n++;
      });
      if (kidsDinner !== null) {
        expect(kidsDinner).toBeLessThanOrEqual(1170);
        r.spans.filter((s) => s.what === 'dinner' && r.hd.people[s.m] && r.d.hh.members[s.m]!.who.age < 11).forEach((s) => expect(s.a).toBeLessThanOrEqual(Math.max(1170, dinner)));
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('retour de nuit : chambre 10 min, puis rien', () => {
    let n = 0;
    for (const r of ROWS) {
      r.hd.people.forEach((p) => {
        const b = p.blocks.find((x) => x.k === 'outing' && x.a === 0 && x.b > 0);
        if (!b || r.hd.away.state !== 'home') return;
        const nights = r.spans.filter((s) => s.m === p.m && s.what === 'night');
        expect(nights.length).toBe(1);
        expect(nights[0]).toMatchObject({ a: b.b, b: b.b + 10 });
        if (r.d.rooms.includes('chambre')) expect(nights[0]!.room).toBe('chambre');
        // Puis rien jusqu'au lever.
        const between = r.spans.filter((s) => s.m === p.m && s.what !== 'night' && s.a < p.wake);
        expect(between).toEqual([]);
        n++;
      });
    }
    expect(n).toBeGreaterThan(5);
  });

  it('endormi : aucune couverture hors chambre ; une span night ne chevauche jamais un out', () => {
    const bad: string[] = [];
    let nights = 0;
    for (const r of ROWS) {
      r.hd.people.forEach((p) => {
        for (const s of r.spans) {
          if (s.m !== p.m) continue;
          if (s.what === 'night') {
            nights++;
            if (p.out.some(([a, b]) => s.a < b && s.b > a) && !p.out.some(([a, b]) => s.a >= a && s.a === b)) bad.push(`night/out ${r.d.id} ${r.day.iso} m${p.m}`);
            if (s.a >= p.wake) bad.push(`night après lever ${r.d.id} ${r.day.iso} m${p.m}`);
          }
          const asleep = s.b <= p.wake || s.a >= p.bed;
          if (asleep && s.what !== 'night') bad.push(`asleep ${r.d.id} ${r.day.iso} m${p.m} ${s.what} ${s.a}`);
          if (asleep && r.d.rooms.includes('chambre') && s.room !== 'chambre') bad.push(`room ${r.d.id} ${r.day.iso} m${p.m}`);
        }
      });
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(nights).toBeGreaterThan(5);
  });

  it('matin : chambre, cuisine puis salon, sans trou tant que l’on est au logement', () => {
    let seq = 0;
    const bad: string[] = [];
    for (const r of ROWS) {
      const full = r.d.rooms.includes('cuisine') && r.d.rooms.includes('chambre');
      r.hd.people.forEach((p) => {
        const mine = r.spans.filter((s) => s.m === p.m && s.what !== 'night');
        // Continuité : deux spans consécutives ne laissent un trou que sur un intervalle out.
        for (let i = 1; i < mine.length; i++) {
          const gap = mine[i]!.a - mine[i - 1]!.b;
          if (gap > 0 && !p.out.some(([a, b]) => a <= mine[i - 1]!.b + 1 && b >= mine[i]!.a - 1)) bad.push(`trou ${r.d.id} ${r.day.iso} m${p.m} ${mine[i - 1]!.b}-${mine[i]!.a}`);
        }
        if (!full || mine[0]?.what !== 'wake' || mine[1]?.what !== 'breakfast') return;
        expect(mine[0]!.room).toBe('chambre');
        expect(mine[1]!.room).toBe('cuisine');
        if (mine[2]) expect(mine[2].room === 'salon' || mine[2].what === 'bedtime' || mine[2].what === 'dinner' || mine[2].what === 'lunch' || mine[2].what === 'snack' || mine[2].what === 'homework').toBe(true);
        seq++;
      });
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(seq).toBeGreaterThan(1000);
  });

  it('chaque enfant goûte dès son arrivée après 16 h ; petits : dîner avant 19 h 30 s’ils sont rentrés à 19 h 20', () => {
    let snacks = 0, dinners = 0;
    for (const r of ROWS) {
      r.hd.people.forEach((p) => {
        const kid = r.d.hh.members[p.m]!;
        if (kid.who.status !== 'enfant' || r.meals.snack === null) return;
        const here = (t: number): boolean => t >= p.wake && t < p.bed && !inside(p.out, t) && r.hd.away.state !== 'away';
        let first = -1;
        for (let t = 960; t < 1200 && first < 0; t++) if (here(Math.round(t))) first = t;
        if (first < 0) return;
        const sn = r.spans.find((s) => s.m === p.m && s.what === 'snack');
        expect(sn?.a, `${r.d.id} ${r.day.iso} m${p.m}`).toBe(first);
        snacks++;
        if (kid.who.age < 11 && r.meals.kidsDinner !== null && here(1160) && (p.outing === null || p.outing.dep > 1240)) {
          const dn = r.spans.find((s) => s.m === p.m && s.what === 'dinner');
          expect(dn, `${r.d.id} ${r.day.iso} m${p.m} ${JSON.stringify([p.wake, p.bed, p.out, p.outing, r.meals, r.hd.away])}`).toBeDefined();
          expect(dn!.a).toBeLessThanOrEqual(1170);
          dinners++;
        }
      });
    }
    expect(snacks).toBeGreaterThan(100);
    expect(dinners).toBeGreaterThan(20);
  });

  it('invités et nounou : indices au-delà des membres, avec leur hôte', () => {
    const r = ROWS.find((x) => x.meals.dinner !== null && x.d.hh.nanny && x.hd.nanny)!;
    expect(r).toBeDefined();
    const n = r.d.hh.members.length;
    const spans = roomTimeline(r.d, r.hd, r.meals, [{ m: n + 1, a: r.meals.dinner! - 12, b: r.meals.dinner! + 120 }]);
    const guest = spans.filter((s) => s.m === n + 1);
    expect(guest.length).toBeGreaterThan(0);
    expect(guest.some((s) => s.what === 'dinner')).toBe(true);
    const nanny = spans.filter((s) => s.m === NANNY_M);
    expect(nanny.length).toBeGreaterThan(0);
    for (const s of nanny) expect(r.hd.nanny!.visits.some((v) => s.a >= Math.round(v.arrive) && s.b <= Math.round(v.leave))).toBe(true);
    // La nounou est en cuisine pendant le goûter des enfants.
    const sk = ROWS.find((x) => x.hd.nanny && x.d.rooms.includes('cuisine') && x.spans.some((y) => y.m === NANNY_M && y.what === 'snack'))!;
    expect(sk).toBeDefined();
    expect(sk.spans.filter((y) => y.m === NANNY_M && y.what === 'snack').every((y) => y.room === 'cuisine')).toBe(true);
  });
});
