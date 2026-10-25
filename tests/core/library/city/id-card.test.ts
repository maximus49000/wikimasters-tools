import { describe, expect, it } from 'vitest';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, householdFor, type Dwelling } from '../../../../src/core/library/city/households';
import { idCardOf, idCardOfVisitor } from '../../../../src/core/library/city/id-card';
import { traitsOf } from '../../../../src/core/library/city/person-traits';

const W = 1440;
const H = 340;
const dwellingsOf = (seed: number): Dwelling[] => cityDwellings(cityFacades(W, H, seed), seed);
const many = Array.from({ length: 20 }, (_, i) => i + 1).flatMap((s) => dwellingsOf(s));
const SCHOOL = (age: number, f: boolean): string =>
  age < 3 ? 'à la crèche' : age < 11 ? (f ? 'écolière' : 'écolier') : age < 15 ? (f ? 'collégienne' : 'collégien') : f ? 'lycéenne' : 'lycéen';

describe("carte d'identité des habitants", () => {
  it("carte d'un parent : en couple avec le prénom du conjoint, enfants avec prénoms et âges", () => {
    const fams = many.filter((d) => d.hh.type === 'famille');
    expect(fams.length).toBeGreaterThan(10);
    for (const d of fams) {
      for (const p of [0, 1]) {
        const card = idCardOf(d, p);
        const who = d.hh.members[p]!.who;
        expect(card.first).toBe(who.first);
        expect(card.age).toBe(who.age);
        expect(card.situation).toEqual({ kind: 'couple', with: d.hh.members[1 - p]!.who.first });
        expect(card.children).toEqual(d.hh.members.slice(2).map((m) => ({ first: m.who.first, age: m.who.age })));
        expect(card.quarter).toBeNull();
        if (who.job) expect(card.job).toBe(who.job);
        else if (who.status === 'chomeur') expect(card.job).toBe('en recherche d’emploi');
      }
    }
  });

  it("carte d'un enfant : enfant de ses deux parents (prénoms), pas d'enfants, crèche avant 3 ans puis métier scolaire selon l'âge", () => {
    const kids = many.flatMap((d) => d.hh.members.map((m, i) => ({ d, m, i })).filter((x) => x.m.who.status === 'enfant'));
    expect(new Set(kids.map((k) => SCHOOL(k.m.who.age, true))).size).toBe(4);
    for (const { d, m, i } of kids) {
      const card = idCardOf(d, i);
      expect(card.situation).toEqual({ kind: 'enfant', of: m.who.parents.map((p) => d.hh.members[p]!.who.first) });
      expect(m.who.parents.length).toBe(2);
      expect(card.children).toEqual([]);
      expect(card.job).toBe(SCHOOL(m.who.age, m.who.sex === 'f'));
    }
  });

  it('solo célibataire', () => {
    const solos = many.filter((d) => d.hh.type === 'solo' || d.hh.type === 'etudiant');
    expect(solos.length).toBeGreaterThan(10);
    for (const d of solos) {
      const who = d.hh.members[0]!.who;
      const card = idCardOf(d, 0);
      expect(card.situation).toEqual({ kind: 'celibataire' });
      expect(card.children).toEqual([]);
      const f = who.sex === 'f';
      const want = who.job ?? (who.status === 'retraite' ? (f ? 'retraitée' : 'retraité') : who.status === 'etudiant' ? (f ? 'étudiante' : 'étudiant') : 'en recherche d’emploi');
      expect(card.job).toBe(want);
    }
  });

  it('nounou seulement si enfant < 11 et deux parents actifs, identité stable, quartier non vide', () => {
    let eligible = 0;
    let withNanny = 0;
    for (const d of many) {
      const hh = d.hh;
      const ok = hh.type === 'famille'
        && hh.members.some((m) => m.who.status === 'enfant' && m.who.age < 11)
        && traitsOf(hh, 0).work !== null && traitsOf(hh, 1).work !== null;
      if (ok) eligible++;
      if (!hh.nanny) continue;
      withNanny++;
      expect(ok, `nounou chez ${d.id}`).toBe(true);
      const n = hh.nanny;
      expect(n.job).toBe('nounou');
      expect(n.who.contract).toBe('particulier');
      expect(n.who.job).toBe('nounou');
      expect(n.who.age).toBeGreaterThanOrEqual(25);
      expect(n.who.age).toBeLessThanOrEqual(60);
      expect(n.who.partner).toBeNull();
      expect(n.quarter.length).toBeGreaterThan(0);
      expect(hh.members.map((m) => m.who.first)).not.toContain(n.who.first);
      const card = idCardOfVisitor(n);
      expect(card).toMatchObject({ first: n.who.first, age: n.who.age, job: 'nounou', situation: { kind: 'celibataire' }, children: [], quarter: n.quarter });
    }
    // Probabilité 0,6 parmi les familles éligibles.
    expect(eligible).toBeGreaterThan(10);
    expect(withNanny).toBeGreaterThan(0);
    expect(withNanny).toBeLessThan(eligible);
    expect(Math.abs(withNanny / eligible - 0.6)).toBeLessThanOrEqual(0.2);
    // Stable : même logement, même graine → même nounou.
    const f = cityFacades(W, H, 3);
    for (const d of cityDwellings(f, 3)) expect(householdFor(f[d.facade]!.homes[d.home]!, 3).nanny).toEqual(d.hh.nanny);
  });
});
