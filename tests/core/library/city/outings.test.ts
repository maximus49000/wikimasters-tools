import { describe, expect, it } from 'vitest';
import { addDays, dayContext, type DayContext, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings } from '../../../../src/core/library/city/households';
import {
  appointmentOf, dayErrands, eveningOuting, familyErrands, lifeProfileOf, outingGroups, type Block, type LifeProfile,
} from '../../../../src/core/library/city/outings';
import { schoolDayOf } from '../../../../src/core/library/city/school-run';
import { dutyOf } from '../../../../src/core/library/city/work-day';

const SEEDS = [1, 2, 3];
const cities = SEEDS.map((seed) => ({ seed, dwellings: cityDwellings(cityFacades(1440, 340, seed), seed) }));
const dwellings = cities.flatMap((c) => c.dwellings);
const START: YMD = { y: 2026, m: 1, d: 5 }; // lundi
const YEAR: DayContext[] = Array.from({ length: 52 * 7 }, (_, i) => dayContext(addDays(START, i), []));
const WEEK = YEAR.slice(0, 7);
// Lendemain libre : week-end ou jour férié.
const nextFreeOf = (i: number): boolean => { const n = YEAR[i + 1]; return !n || n.weekday === 0 || n.weekday === 6 || !!n.publicHoliday; };

type Sample = { profile: LifeProfile; day: DayContext; free: boolean; kind: string | null; dep: number; ret: number; nanny: boolean };
const samples: Sample[] = [];
for (const d of dwellings) for (const g of outingGroups(d.hh)) YEAR.forEach((day, i) => {
  const free = nextFreeOf(i);
  const o = eveningOuting(d.hh, g, day, free);
  samples.push({ profile: lifeProfileOf(d.hh, g[0]!), day, free, kind: o?.kind ?? null, dep: o?.dep ?? 0, ret: o?.ret ?? 0, nanny: !!d.hh.nanny });
});
const rate = (list: Sample[]): number => list.filter((s) => s.kind).length / list.length;

describe('profil de vie', () => {
  it('enfant, senior (retraité ou 65 ans et plus), famille, jeune (moins de 35 ans), adulte', () => {
    const seen = new Set<LifeProfile>();
    for (const d of dwellings) d.hh.members.forEach((mem, m) => {
      const p = lifeProfileOf(d.hh, m);
      seen.add(p);
      if (mem.who.status === 'enfant') expect(p).toBe('enfant');
      else if (mem.who.status === 'retraite' || mem.who.age >= 65) expect(p).toBe('senior');
      else if (d.hh.members.some((x) => x.who.status === 'enfant')) expect(p).toBe('famille');
      else expect(p).toBe(mem.who.age < 35 ? 'jeune' : 'adulte');
    });
    expect([...seen].sort()).toEqual(['adulte', 'enfant', 'famille', 'jeune', 'senior']);
  });

  it('groupes de sortie : couple et famille ensemble (adultes), coloc et solo chacun', () => {
    for (const d of dwellings) {
      const groups = outingGroups(d.hh);
      const adults = d.hh.members.flatMap((x, m) => (x.who.status === 'enfant' ? [] : [m]));
      expect(groups.flat().sort()).toEqual(adults);
      if (d.hh.type === 'couple' || d.hh.type === 'famille') expect(groups).toHaveLength(1);
      if (d.hh.type === 'coloc' || d.hh.type === 'solo') expect(groups).toHaveLength(adults.length);
    }
  });
});

describe('sorties du soir', () => {
  const near = (v: number, target: number, tol: number): void => { expect(Math.abs(v - target)).toBeLessThanOrEqual(tol); };
  const within = (list: Sample[], key: 'dep' | 'ret', lo: number, hi: number): void => { for (const s of list) { expect(s[key]).toBeGreaterThanOrEqual(lo); expect(s[key]).toBeLessThanOrEqual(hi); } };
  const jeunes = samples.filter((s) => s.profile === 'jeune');

  it('jeunes, lendemain libre : 45 % des soirs, 35 % en boîte (départ 22 h 30-23 h 30, retour 3 h 30-5 h), sinon bar (0 h 30-2 h)', () => {
    const free = jeunes.filter((s) => s.free);
    expect(free.length).toBeGreaterThan(2000);
    near(rate(free), 0.45, 0.03);
    const out = free.filter((s) => s.kind);
    near(out.filter((s) => s.kind === 'boite').length / out.length, 0.35, 0.05);
    expect(new Set(out.map((s) => s.kind))).toEqual(new Set(['bar', 'boite']));
    within(out.filter((s) => s.kind === 'boite'), 'dep', 1350, 1410);
    within(out.filter((s) => s.kind === 'boite'), 'ret', 1650, 1740);
    within(out.filter((s) => s.kind === 'bar'), 'dep', 1170, 1260);
    within(out.filter((s) => s.kind === 'bar'), 'ret', 1470, 1560);
  });

  it('jeunes, lendemain travaillé : bar 12 % (retour avant minuit) ; jeudi : boîte 10 % de plus (retour 2 h 45-3 h 45)', () => {
    const busy = jeunes.filter((s) => !s.free);
    const other = busy.filter((s) => s.day.weekday !== 4), thursday = busy.filter((s) => s.day.weekday === 4);
    expect(other.length).toBeGreaterThan(5000);
    expect(thursday.length).toBeGreaterThan(1000);
    near(rate(other), 0.12, 0.02);
    expect(other.every((s) => s.kind === null || s.kind === 'bar')).toBe(true);
    near(thursday.filter((s) => s.kind === 'bar').length / thursday.length, 0.12, 0.03);
    near(thursday.filter((s) => s.kind === 'boite').length / thursday.length, 0.1, 0.03);
    within(busy.filter((s) => s.kind === 'bar'), 'dep', 1170, 1230);
    within(busy.filter((s) => s.kind === 'bar'), 'ret', 1365, 1440);
    within(busy.filter((s) => s.kind === 'boite'), 'dep', 1350, 1395);
    within(busy.filter((s) => s.kind === 'boite'), 'ret', 1605, 1665);
  });

  it('boîte seulement chez les jeunes, retour entre 2 h 45 et 5 h', () => {
    const clubs = samples.filter((s) => s.kind === 'boite');
    expect(clubs.length).toBeGreaterThan(500);
    for (const s of clubs) expect(s.profile).toBe('jeune');
    within(clubs, 'ret', 1605, 1800);
  });

  it('adultes : 25 % avant un jour libre (resto, bar, amis), 6 % sinon (resto)', () => {
    const adultes = samples.filter((s) => s.profile === 'adulte');
    const free = adultes.filter((s) => s.free), busy = adultes.filter((s) => !s.free);
    expect(free.length).toBeGreaterThan(1500);
    expect(busy.length).toBeGreaterThan(4000);
    near(rate(free), 0.25, 0.03);
    near(rate(busy), 0.06, 0.02);
    const out = free.filter((s) => s.kind);
    expect(new Set(out.map((s) => s.kind))).toEqual(new Set(['resto', 'bar', 'amis']));
    within(out, 'dep', 1185, 1215);
    within(out, 'ret', 1380, 1455);
    const late = busy.filter((s) => s.kind);
    expect(late.every((s) => s.kind === 'resto')).toBe(true);
    within(late, 'dep', 1185, 1215);
    within(late, 'ret', 1350, 1410);
  });

  it('seniors : samedi 30 %, vendredi 15 %, autres jours 6 %, départ 19 h 15-19 h 45, retour ≤ 23 h', () => {
    const seniors = samples.filter((s) => s.profile === 'senior');
    const outs = seniors.filter((s) => s.kind);
    within(outs, 'dep', 1155, 1185);
    within(outs, 'ret', 1320, 1380);
    expect(outs.every((s) => ['resto', 'theatre', 'amis'].includes(s.kind!))).toBe(true);
    expect(outs.some((s) => s.kind === 'theatre')).toBe(true);
    const on = (days: number[]) => seniors.filter((s) => days.includes(s.day.weekday));
    expect(on([6]).length).toBeGreaterThan(700);
    near(rate(on([6])), 0.3, 0.03);
    near(rate(on([5])), 0.15, 0.03);
    near(rate(on([0, 1, 2, 3, 4])), 0.06, 0.03);
  });

  it('familles : jamais sans nounou ; avec nounou, samedi 15 % seulement, en resto (départ 19 h 45-20 h 15, retour 23 h-0 h)', () => {
    const fam = samples.filter((s) => s.profile === 'famille');
    for (const s of fam) if (!s.nanny) expect(s.kind).toBeNull();
    const nanny = fam.filter((s) => s.nanny);
    for (const s of nanny) if (s.day.weekday !== 6) expect(s.kind).toBeNull();
    const sat = nanny.filter((s) => s.day.weekday === 6);
    expect(sat.length).toBeGreaterThan(1000);
    near(rate(sat), 0.15, 0.025);
    const outs = sat.filter((s) => s.kind);
    expect(outs.every((s) => s.kind === 'resto')).toBe(true);
    within(outs, 'dep', 1185, 1215);
    within(outs, 'ret', 1380, 1440);
  });

  it('déterministe : même foyer, même jour, même sortie', () => {
    for (const d of dwellings.slice(0, 30)) for (const g of outingGroups(d.hh)) for (const day of WEEK) {
      expect(eveningOuting(d.hh, g, day, true)).toEqual(eveningOuting(d.hh, g, day, true));
    }
  });
});

describe('rendez-vous', () => {
  it('jours ouvrés seulement, chômeur ≈ 20 %, retraité ≈ 10 % (± 4 points)', () => {
    const stat: Record<string, { n: number; rdv: number }> = { chomeur: { n: 0, rdv: 0 }, retraite: { n: 0, rdv: 0 } };
    for (const d of dwellings) d.hh.members.forEach((mem, m) => {
      for (const day of YEAR) {
        const a = appointmentOf(d.hh, m, day);
        const status = mem.who.status;
        const workday = day.weekday >= 1 && day.weekday <= 5 && !day.publicHoliday;
        if (!workday || (status !== 'chomeur' && status !== 'retraite')) { expect(a).toBeNull(); continue; }
        stat[status]!.n++;
        if (!a) continue;
        stat[status]!.rdv++;
        if (status === 'chomeur') {
          expect(a.at).toBeGreaterThanOrEqual(525); expect(a.at).toBeLessThanOrEqual(600);
          expect(a.dur).toBe(60); expect(a.commute).toBeGreaterThanOrEqual(15); expect(a.commute).toBeLessThanOrEqual(35);
        } else {
          expect(a.at).toBeGreaterThanOrEqual(510); expect(a.at).toBeLessThanOrEqual(630);
          expect(a.dur).toBe(45); expect(a.commute).toBeGreaterThanOrEqual(10); expect(a.commute).toBeLessThanOrEqual(25);
        }
        expect(a.at % 5).toBe(0);
        expect(a.label.length).toBeGreaterThan(0);
      }
    });
    expect(stat.chomeur!.n).toBeGreaterThan(1000);
    expect(stat.retraite!.n).toBeGreaterThan(1000);
    expect(Math.abs(stat.chomeur!.rdv / stat.chomeur!.n - 0.2)).toBeLessThan(0.04);
    expect(Math.abs(stat.retraite!.rdv / stat.retraite!.n - 0.1)).toBeLessThan(0.04);
  });
});

describe('sorties de jour', () => {
  const adults = dwellings.flatMap((d) => d.hh.members.flatMap((x, m) => (x.who.status === 'enfant' ? [] : [{ d, m, status: x.who.status }])));
  const overlap = (a: Block, b: Block): boolean => a.a < b.b && b.a < a.b;

  it("dayErrands : aucun bloc qui chevauche busy, fin ≤ sortie d'école − 20 si mustPickAt", () => {
    let n = 0, pick = 0;
    for (const { d, m } of adults.slice(0, 150)) for (const [i, day] of YEAR.entries()) {
      if (i % 3) continue;
      const wake = 480 + (i % 4) * 30;
      const busy: Block[] = i % 2 ? [{ a: 840 + (i % 5) * 20, b: 940 + (i % 5) * 20, k: 'rdv', label: 'x' }] : [];
      const must = i % 4 === 0 ? 990 : null;
      const out = dayErrands(d.hh, m, day, wake, busy, must);
      for (const b of out) {
        n++;
        expect(b.k).toBe('out');
        expect(b.b).toBeGreaterThan(b.a);
        expect(b.a).toBeGreaterThanOrEqual(wake);
        for (const x of busy) expect(overlap(b, x)).toBe(false);
        if (must !== null) { expect(b.b).toBeLessThanOrEqual(must - 20); pick++; }
      }
      for (let k = 0; k < out.length; k++) for (let l = k + 1; l < out.length; l++) expect(overlap(out[k]!, out[l]!)).toBe(false);
    }
    expect(n).toBeGreaterThan(100);
    expect(pick).toBeGreaterThan(10);
  });

  it('dayErrands : rien un jour travaillé ni pour un enfant ; matin des retraités ≈ 65 %', () => {
    let worked = 0, out = 0, retMorning = 0, retN = 0;
    for (const { d, m, status } of adults) for (const day of YEAR.slice(0, 120)) {
      const duty = dutyOf(d.hh, m, day);
      const blocks = dayErrands(d.hh, m, day, 450, [], null);
      if (duty?.kind === 'work') { worked++; expect(blocks).toEqual([]); }
      else out += blocks.length;
      if (status === 'retraite' && !d.hh.members.some((x) => x.who.status === 'enfant')) {
        retN++;
        if (blocks.some((b) => b.a < 780)) retMorning++;
      }
    }
    expect(worked).toBeGreaterThan(100);
    expect(out).toBeGreaterThan(100);
    expect(retMorning / retN).toBeGreaterThan(0.5);
    expect(retMorning / retN).toBeLessThan(0.75);
    for (const d of dwellings) d.hh.members.forEach((x, m) => { if (x.who.status === 'enfant') expect(dayErrands(d.hh, m, YEAR[5]!, 450, [], null)).toEqual([]); });
  });

  it('dayErrands : une fréquence par cas (retraité, chômeur, jour de congé, jour ordinaire), matin et après-midi', () => {
    const cases: Record<string, { n: number; am: number; pm: number }> = {};
    const bump = (k: string, blocks: Block[]): void => {
      const c = (cases[k] ??= { n: 0, am: 0, pm: 0 });
      c.n++;
      if (blocks.some((b) => b.a < 780)) c.am++;
      if (blocks.some((b) => b.a >= 840)) c.pm++;
    };
    for (const { d, m, status } of adults) {
      if (d.hh.members.some((x) => x.who.status === 'enfant')) continue;
      for (const day of YEAR) {
        const duty = dutyOf(d.hh, m, day);
        if (duty?.kind === 'work' || duty?.kind === 'sick') continue;
        const off = day.weekday === 0 || day.weekday === 6 || !!day.publicHoliday || duty?.kind === 'leave';
        const key = status === 'retraite' ? 'retraite' : off ? 'conge' : status === 'chomeur' ? 'chomeur' : 'ordinaire';
        bump(key, dayErrands(d.hh, m, day, 450, [], null));
      }
    }
    const want: Record<string, [number, number]> = { retraite: [0.65, 0.5], chomeur: [0.35, 0.4], conge: [0.55, 0.5], ordinaire: [0.2, 0.25] };
    for (const [k, [am, pm]] of Object.entries(want)) {
      const c = cases[k]!;
      expect(c.n).toBeGreaterThan(1500);
      expect(Math.abs(c.am / c.n - am)).toBeLessThanOrEqual(0.03);
      expect(Math.abs(c.pm / c.n - pm)).toBeLessThanOrEqual(0.03);
    }
  });

  it("familyErrands : seulement un jour libre sans école, parc tous ensemble ≈ 70 %, courses d'un adulte ≈ 60 %", () => {
    let free = 0, park = 0, shop = 0;
    for (const d of dwellings) {
      const kids = d.hh.members.flatMap((x, m) => (x.who.status === 'enfant' && x.who.age < 11 ? [m] : []));
      for (const day of YEAR) {
        const f = familyErrands(d.hh, day);
        const adultsFree = d.hh.members.every((x, m) => x.who.status === 'enfant' || !['work', 'sick'].includes(dutyOf(d.hh, m, day)?.kind ?? ''));
        const noSchool = kids.every((m) => !schoolDayOf(d.hh, m, day));
        if (!kids.length || !adultsFree || !noSchool) { expect(f).toEqual({ all: null, one: null }); continue; }
        free++;
        if (f.all) {
          park++;
          expect(f.all.k).toBe('out');
          expect(f.all.a).toBeGreaterThanOrEqual(900); expect(f.all.a).toBeLessThanOrEqual(930);
          expect(f.all.b - f.all.a).toBeGreaterThanOrEqual(90); expect(f.all.b - f.all.a).toBeLessThanOrEqual(120);
        }
        if (f.one) {
          shop++;
          expect(d.hh.members[f.one.m]!.who.status).not.toBe('enfant');
          expect(f.one.b.a).toBeGreaterThanOrEqual(630); expect(f.one.b.a).toBeLessThanOrEqual(675);
          expect(f.one.b.b - f.one.b.a).toBeGreaterThanOrEqual(45); expect(f.one.b.b - f.one.b.a).toBeLessThanOrEqual(75);
        }
      }
    }
    expect(free).toBeGreaterThan(500);
    expect(Math.abs(park / free - 0.7)).toBeLessThan(0.06);
    expect(Math.abs(shop / free - 0.6)).toBeLessThan(0.06);
  });
});
