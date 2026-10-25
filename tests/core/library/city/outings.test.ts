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
  it('jeunes : sorties plus fréquentes avant un jour libre (ratio ≥ 3)', () => {
    const jeunes = samples.filter((s) => s.profile === 'jeune');
    expect(jeunes.length).toBeGreaterThan(5000);
    const free = rate(jeunes.filter((s) => s.free)), busy = rate(jeunes.filter((s) => !s.free));
    expect(free).toBeGreaterThan(0.38);
    expect(free).toBeLessThan(0.52);
    expect(free / busy).toBeGreaterThanOrEqual(3);
  });

  it('boîte seulement chez les jeunes, retour entre 2 h 45 et 5 h', () => {
    const clubs = samples.filter((s) => s.kind === 'boite');
    expect(clubs.length).toBeGreaterThan(50);
    for (const s of clubs) {
      expect(s.profile).toBe('jeune');
      expect(s.ret).toBeGreaterThanOrEqual(1605);
      expect(s.ret).toBeLessThanOrEqual(1800);
      expect(s.dep).toBeGreaterThanOrEqual(1350);
      expect(s.dep).toBeLessThanOrEqual(1410);
    }
    // Le jeudi, lendemain travaillé : boîte rare mais présente.
    expect(clubs.some((s) => s.day.weekday === 4 && !s.free)).toBe(true);
    for (const s of samples.filter((x) => x.kind === 'bar' && x.profile === 'jeune' && !x.free)) expect(s.ret).toBeLessThanOrEqual(1440);
  });

  it('adultes : plus de sorties avant un jour libre, retour avant 0 h 15', () => {
    const adultes = samples.filter((s) => s.profile === 'adulte');
    expect(rate(adultes.filter((s) => s.free))).toBeGreaterThan(0.18);
    expect(rate(adultes.filter((s) => s.free))).toBeLessThan(0.32);
    for (const s of adultes) if (s.kind) { expect(['resto', 'bar', 'amis']).toContain(s.kind); expect(s.ret).toBeLessThanOrEqual(1455); }
  });

  it('seniors : retour ≤ 23 h, plus de sorties le samedi', () => {
    const seniors = samples.filter((s) => s.profile === 'senior');
    expect(seniors.length).toBeGreaterThan(3000);
    for (const s of seniors) if (s.kind) {
      expect(s.ret).toBeLessThanOrEqual(1380);
      expect(['resto', 'theatre', 'amis']).toContain(s.kind);
      expect(s.dep).toBeGreaterThanOrEqual(1155);
      expect(s.dep).toBeLessThanOrEqual(1185);
    }
    const sat = rate(seniors.filter((s) => s.day.weekday === 6)), other = rate(seniors.filter((s) => s.day.weekday >= 1 && s.day.weekday <= 4));
    expect(sat).toBeGreaterThan(other * 2.5);
    expect(rate(seniors.filter((s) => s.day.weekday === 5))).toBeGreaterThan(other);
  });

  it('familles sans nounou : aucune sortie du soir ; avec nounou : le samedi seulement, en resto', () => {
    const fam = samples.filter((s) => s.profile === 'famille');
    expect(fam.some((s) => s.nanny)).toBe(true);
    expect(fam.some((s) => !s.nanny)).toBe(true);
    for (const s of fam) {
      if (!s.nanny) expect(s.kind).toBeNull();
      if (s.kind) { expect(s.day.weekday).toBe(6); expect(s.kind).toBe('resto'); }
    }
    expect(fam.filter((s) => s.kind).length).toBeGreaterThan(0);
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
