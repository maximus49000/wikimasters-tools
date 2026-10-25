import { describe, expect, it } from 'vitest';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Dwelling } from '../../../../src/core/library/city/households';
import lot1 from '../fixtures/person-traits-lot1.json';
import { dayRng, traitsOf } from '../../../../src/core/library/city/person-traits';

const dwellingsOf = (seed: number): Dwelling[] => cityDwellings(cityFacades(1440, 340, seed), seed);
const people = [1, 2, 3, 4, 5].flatMap((s) => dwellingsOf(s).flatMap((d) => d.hh.members.map((m, i) => ({ hh: d.hh, m, i }))));
const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
// Pause déjeuner comptée dans l'amplitude d'une journée continue (min).
const LUNCH = 90;

describe('traits de journée des habitants', () => {
  it('bornes de chaque trait', () => {
    expect(people.length).toBeGreaterThan(50);
    for (const { hh, m, i } of people) {
      const t = traitsOf(hh, i);
      const w = m.who;
      const age = w.age;
      const sleepLo = w.status === 'enfant' ? (age <= 5 ? 690 : age < 11 ? 630 : 570) : w.status === 'retraite' ? 390 : w.status === 'etudiant' ? 450 : 420;
      const sleepHi = w.status === 'enfant' ? sleepLo : w.status === 'retraite' ? 450 : w.status === 'etudiant' ? 510 : 480;
      expect(inRange(t.sleep, sleepLo, sleepHi), `sommeil ${w.status} ${t.sleep}`).toBe(true);
      if (w.status === 'enfant') expect(t.bedtime, `coucher enfant ${age} ans`).toBe(age < 11 ? 1230 : 1290);
      else {
        const [lo, hi] = age >= 65 || w.status === 'retraite' ? [1320, 1395] : age < 35 && !hh.members.some((x) => x.who.status === 'enfant') ? [1425, 1485] : [1365, 1425];
        expect(inRange(t.bedtime, lo, hi), `coucher ${age} ans ${t.bedtime}`).toBe(true);
      }
      expect(t.earlyP === 0 || (w.status === 'retraite' && inRange(t.earlyP, 0.15, 0.85))).toBe(true);
      if (w.status === 'retraite') expect(t.earlyP).toBeGreaterThan(0);
      if (t.work) {
        const k = t.work;
        if (w.status === 'cadre') expect(inRange(k.start, 510, 570)).toBe(true);
        if (w.status === 'non-cadre' && w.contract !== 'hcr') expect(inRange(k.start, 390, 480)).toBe(true);
        expect(inRange(k.commute, 10, 50)).toBe(true);
        expect(k.walk).toBe(k.commute <= 15);
        expect(inRange(k.prep, 30, 60)).toBe(true);
        const eff = { '35h': [420, 420], '39h': [468, 468], forfait: [450, 510], 'fonction-publique': [450, 450], hcr: [450, 450], particulier: [0, 600] }[w.contract!] as number[];
        expect(inRange(k.effective, eff[0]!, eff[1]!), `effectif ${w.contract} ${k.effective}`).toBe(true);
        expect(k.rttPerYear).toBe({ '35h': 0, '39h': 11, forfait: 11, 'fonction-publique': 15, hcr: 0, particulier: 0 }[w.contract!]);
      }
      if (t.school) {
        expect(t.school.start).toHaveLength(5);
        expect(t.school.kind).toBe(w.status === 'etudiant' ? 'fac' : age < 3 ? 'creche' : age < 11 ? 'ecole' : 'college');
        if (w.status === 'enfant' && age < 3) {
          expect(t.school.start).toEqual([510, 510, 510, 510, 510]);
          expect(t.school.autonomous).toBe(false);
        } else if (w.status === 'enfant' && age < 11) {
          expect(t.school.start).toEqual([500, 500, 500, 500, 500]);
          expect(t.school.autonomous).toBe(false);
        } else if (w.status === 'enfant') {
          expect(t.school.autonomous).toBe(true);
          for (const s of t.school.start) expect([480, 540, 600]).toContain(s);
        } else {
          for (const s of t.school.start) expect(s === -1 || inRange(s, 480, 660)).toBe(true);
        }
      }
    }
  });

  it('actifs seulement ont work', () => {
    for (const { hh, m, i } of people) {
      const t = traitsOf(hh, i);
      const actif = m.who.status === 'cadre' || m.who.status === 'non-cadre';
      expect(t.work !== null, `${m.who.status}`).toBe(actif);
      expect(t.school !== null).toBe(m.who.status === 'enfant' || m.who.status === 'etudiant');
    }
  });

  it('hcr : services 11 h-14 h 30 et 18 h 30-22 h 30, mardi → samedi', () => {
    const hcr = people.filter((p) => p.m.who.contract === 'hcr');
    expect(hcr.length).toBeGreaterThan(0);
    for (const { hh, i } of hcr) {
      const split = traitsOf(hh, i).work!.split!;
      expect(split.a).toEqual([660, 870]);
      expect(split.b).toEqual([1110, 1350]);
      expect(split.days).toEqual([2, 3, 4, 5, 6]);
    }
    for (const { hh, m, i } of people) if (m.who.contract !== 'hcr' && m.who.status !== 'enfant') expect(traitsOf(hh, i).work?.split ?? null).toBeNull();
  });

  it('travail effectif ≤ 10 h et amplitude ≤ 11 h (13 h coupé)', () => {
    for (const { hh, i } of people) {
      const w = traitsOf(hh, i).work;
      if (!w) continue;
      expect(w.effective).toBeLessThanOrEqual(600);
      if (w.split) {
        const { a, b } = w.split;
        expect(a[1] - a[0] + (b[1] - b[0])).toBe(w.effective);
        expect(b[1] - a[0]).toBeLessThanOrEqual(780);
      } else expect(w.effective + LUNCH).toBeLessThanOrEqual(660);
    }
  });

  it('même membre → mêmes traits (mémoïsé), membres différents indépendants', () => {
    const { hh, i } = people[0]!;
    expect(traitsOf(hh, i)).toBe(traitsOf(hh, i));
    expect(traitsOf(structuredClone(hh), i)).toEqual(traitsOf(hh, i));
    const sleeps = new Set(people.map(({ hh: h, i: j }) => traitsOf(h, j).sleep));
    expect(sleeps.size).toBeGreaterThan(3);
  });

  it('traits du lot 1 inchangés', () => {
    for (const seed of [1, 2, 3]) {
      const now = dwellingsOf(seed).flatMap((d) => d.hh.members.map((_, i) => {
        const { commute, walk, prep, pause, ...t } = traitsOf(d.hh, i) as Record<string, any>;
        void commute; void walk; void prep; void pause;
        if (t.school) { const { end, ...sc } = t.school; void end; t.school = sc; }
        return JSON.parse(JSON.stringify(t));
      }));
      expect(now).toEqual((lot1 as unknown as Record<string, unknown[]>)[seed]);
    }
  });

  it('trajet et préparation pour tous, pause cadre dans [45, 90], 30 sinon', () => {
    for (const { hh, m, i } of people) {
      const t = traitsOf(hh, i);
      expect(inRange(t.commute, 10, 50)).toBe(true);
      expect(t.walk).toBe(t.commute <= 15);
      expect(inRange(t.prep, 30, 60)).toBe(true);
      if (m.who.status === 'cadre') expect(inRange(t.pause, 45, 90), `pause ${t.pause}`).toBe(true);
      else expect(t.pause).toBe(30);
    }
  });

  it('fin des cours après le début, collège fini à 12 h le mercredi', () => {
    let seen = 0;
    for (const { hh, i } of people) {
      const sc = traitsOf(hh, i).school;
      if (!sc) continue;
      expect(sc.end).toHaveLength(5);
      sc.start.forEach((s, d) => {
        const e = sc.end[d]!;
        if (s === -1) return void expect(e).toBe(-1);
        expect(e).toBeGreaterThan(s);
        seen++;
        if (sc.kind === 'college') {
          if (d === 2) expect(e).toBe(720);
          else { expect(e).toBeLessThanOrEqual(1050); expect(e).toBeGreaterThanOrEqual(Math.min(s + 390, 1050)); }
        } else if (sc.kind === 'fac') { expect(e).toBeLessThanOrEqual(1110); expect(e).toBeGreaterThanOrEqual(Math.min(s + 180, 1110)); }
      });
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('dayRng : mêmes arguments même suite, usage différent autre suite', () => {
    const a = dayRng(42, 0, '2026-10-25', 'lever');
    const b = dayRng(42, 0, '2026-10-25', 'lever');
    const c = dayRng(42, 0, '2026-10-25', 'sortie');
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect([c(), c(), c()]).not.toEqual(sa);
    expect(dayRng(42, 1, '2026-10-25', 'lever')()).not.toBe(sa[0]);
  });
});
