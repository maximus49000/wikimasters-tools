import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Dwelling, type Member } from '../../../../src/core/library/city/households';
import { FIRST_NAMES, firstNameFor } from '../../../../src/core/library/city/first-names';
import { IDENTITY_YEAR } from '../../../../src/core/library/city/identity';
import { mulberry32 } from '../../../../src/core/library/scene-world';

const W = 1440;
const H = 340;
const dwellingsOf = (seed: number): Dwelling[] => cityDwellings(cityFacades(W, H, seed), seed);
const all = [1, 2, 3, 4, 5].flatMap((s) => dwellingsOf(s));
// Proportions des statuts : 20 graines (sur 5, les personnes seules actives ne sont qu'environ 70 : ± 6 points d'écart type).
const many = Array.from({ length: 20 }, (_, i) => i + 1).flatMap((s) => dwellingsOf(s));
const share = <T>(list: readonly T[], f: (x: T) => boolean): number => list.filter(f).length / list.length;
const near = (got: number, want: number, label: string) => expect(Math.abs(got - want), `${label} : ${got.toFixed(3)} au lieu de ${want}`).toBeLessThanOrEqual(0.08);

describe('identité des habitants', () => {
  it('même graine → mêmes identités, autre graine → différentes', () => {
    const who = (ds: Dwelling[]) => ds.map((d) => d.hh.members.map((m) => m.who));
    const a = who(dwellingsOf(7));
    expect(a.flat().length).toBeGreaterThan(0);
    expect(who(dwellingsOf(7))).toEqual(a);
    const names = (ds: Dwelling[]) => ds.flatMap((d) => d.hh.members.map((m) => `${m.who.first}:${m.who.age}`)).join(',');
    expect(names(dwellingsOf(8))).not.toBe(names(dwellingsOf(7)));
  });

  it('familles : écart parent-enfant 18-45 ans, enfants < 18', () => {
    let families = 0;
    let bigEldest = 0;
    for (const { hh } of all) {
      if (hh.type !== 'famille') continue;
      families++;
      const [p1, p2, ...kids] = hh.members as [Member, Member, ...Member[]];
      for (const p of [p1, p2]) {
        expect(p.kid).toBe(false);
        expect(p.who.age).toBeGreaterThanOrEqual(28);
        expect(p.who.age).toBeLessThanOrEqual(52);
        expect(p.who.children).toEqual(kids.map((_, i) => i + 2));
        expect(p.who.parents).toEqual([]);
      }
      expect(p1.who.partner).toBe(1);
      expect(p2.who.partner).toBe(0);
      expect(kids.length).toBeGreaterThanOrEqual(1);
      for (const k of kids) {
        expect(k.kid).toBe(true);
        expect(k.who.status).toBe('enfant');
        expect(k.who.age).toBeGreaterThanOrEqual(1);
        expect(k.who.age).toBeLessThan(18);
        expect(k.who.parents).toEqual([0, 1]);
        expect(k.who.partner).toBeNull();
        expect(k.who.children).toEqual([]);
        expect(k.who.job).toBeNull();
        expect(k.who.contract).toBeNull();
        for (const p of [p1, p2]) {
          expect(p.who.age - k.who.age).toBeGreaterThanOrEqual(18);
          expect(p.who.age - k.who.age).toBeLessThanOrEqual(45);
        }
        // Taille selon l'âge.
        const a = k.who.age;
        expect(k.size).toBe(a <= 5 ? 0.58 : a <= 10 ? 0.64 : a <= 14 ? 0.8 : 0.92);
      }
      if (Math.max(...kids.map((k) => k.who.age)) >= 11) bigEldest++;
    }
    expect(families).toBeGreaterThan(30);
    near(bigEldest / families, 0.35, 'aîné de 11 ans et plus');
  });

  it('conjoints réciproques, écart ≤ 15 ans, coloc et solo sans conjoint', () => {
    const pairs: [Member, Member][] = [];
    for (const { hh } of all) {
      hh.members.forEach((m, i) => {
        if (m.who.partner === null) return;
        const p = hh.members[m.who.partner]!;
        expect(p.who.partner).toBe(i);
        expect(Math.abs(p.who.age - m.who.age)).toBeLessThanOrEqual(15);
        if (i < m.who.partner) pairs.push([m, p]);
      });
      const partnered = hh.members.filter((m) => m.who.partner !== null).length;
      if (hh.type === 'coloc' || hh.type === 'solo' || hh.type === 'etudiant') expect(partnered).toBe(0);
      if (hh.type === 'couple' || hh.type === 'famille') expect(partnered).toBe(2);
      if (hh.type === 'retraite') expect(partnered).toBe(hh.members.length === 2 ? 2 : 0);
      if (hh.type !== 'famille') for (const m of hh.members) expect(m.who.children.length + m.who.parents.length).toBe(0);
    }
    near(share(pairs, ([a, b]) => a.who.sex !== b.who.sex), 0.9, 'couples femme + homme');
  });

  it('prénoms uniques par foyer et cohérents avec le sexe et l’année de naissance', () => {
    for (const sex of ['f', 'm'] as const) {
      expect(FIRST_NAMES.filter((n) => n.sex === sex).length).toBeGreaterThanOrEqual(40);
      for (const [from, to] of [[1935, 1965], [1966, 1990], [1991, 2010], [2011, 2026]] as const) {
        expect(FIRST_NAMES.filter((n) => n.sex === sex && n.from === from && n.to === to).length, `${sex} ${from}`).toBeGreaterThanOrEqual(10);
      }
    }
    expect(new Set(FIRST_NAMES.map((n) => n.name)).size).toBe(FIRST_NAMES.length);
    for (const { hh } of all) {
      const names = hh.members.map((m) => m.who.first);
      expect(new Set(names).size).toBe(names.length);
      for (const m of hh.members) {
        const born = IDENTITY_YEAR - m.who.age;
        const entry = FIRST_NAMES.find((n) => n.name === m.who.first);
        expect(entry, m.who.first).toBeDefined();
        expect(entry!.sex).toBe(m.who.sex);
        expect(born, `${m.who.first} né·e en ${born}`).toBeGreaterThanOrEqual(entry!.from);
        expect(born, `${m.who.first} né·e en ${born}`).toBeLessThanOrEqual(entry!.to);
      }
    }
    // Génération épuisée : un prénom du même sexe quand même, jamais un prénom déjà pris.
    const rng = mulberry32(3);
    const taken = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const n = firstNameFor('f', 2020, rng, taken);
      expect(taken.has(n)).toBe(false);
      expect(FIRST_NAMES.find((e) => e.name === n)!.sex).toBe('f');
      taken.add(n);
    }
  });

  it('répartition des statuts sur 20 graines dans ± 8 points des proportions', () => {
    const adults = (types: string[]) => many.filter((d) => types.includes(d.hh.type)).flatMap((d) => d.hh.members.filter((m) => !m.kid));
    const actifs = adults(['couple', 'famille']);
    for (const m of actifs) expect(m.who.age).toBeGreaterThanOrEqual(25);
    near(share(actifs, (m) => m.who.status === 'cadre'), 0.4, 'couple/famille cadre');
    near(share(actifs, (m) => m.who.status === 'non-cadre'), 0.5, 'couple/famille non-cadre');
    near(share(actifs, (m) => m.who.status === 'chomeur'), 0.1, 'couple/famille chômeur');
    const coloc = adults(['coloc']);
    near(share(coloc, (m) => m.who.status === 'etudiant'), 0.4, 'coloc étudiant');
    near(share(coloc, (m) => m.who.status === 'non-cadre'), 0.4, 'coloc non-cadre');
    near(share(coloc, (m) => m.who.status === 'cadre'), 0.2, 'coloc cadre');
    const colocNC = coloc.filter((m) => m.who.status === 'non-cadre');
    near(share(colocNC, (m) => m.who.contract === 'hcr'), 1 / 3, 'coloc non-cadre en hcr');
    for (const m of colocNC.filter((x) => x.who.contract === 'hcr')) expect(['serveuse', 'serveur', 'cuisinière', 'cuisinier']).toContain(m.who.job);
    const solo = adults(['solo']);
    for (const m of solo) {
      expect(m.who.age).toBeGreaterThanOrEqual(25);
      expect(m.who.age).toBeLessThanOrEqual(85);
      if (m.who.age >= 65) expect(m.who.status).toBe('retraite');
      else expect(['cadre', 'non-cadre', 'chomeur']).toContain(m.who.status);
    }
    const soloActif = solo.filter((m) => m.who.age < 65);
    near(share(soloActif, (m) => m.who.status === 'cadre'), 0.4, 'solo cadre');
    near(share(soloActif, (m) => m.who.status === 'non-cadre'), 0.45, 'solo non-cadre');
    near(share(soloActif, (m) => m.who.status === 'chomeur'), 0.15, 'solo chômeur');
    for (const d of all) {
      for (const m of d.hh.members) {
        const w = m.who;
        if (d.hh.type === 'retraite') {
          expect(w.status).toBe('retraite');
          expect(w.age).toBeGreaterThanOrEqual(65);
          expect(w.age).toBeLessThanOrEqual(88);
        }
        if (d.hh.type === 'etudiant') {
          expect(w.status).toBe('etudiant');
          expect(w.age).toBeGreaterThanOrEqual(18);
          expect(w.age).toBeLessThanOrEqual(26);
        }
        if (d.hh.type === 'coloc') {
          expect(w.age).toBeGreaterThanOrEqual(20);
          expect(w.age).toBeLessThanOrEqual(32);
        }
        if (d.hh.type === 'couple') expect(w.age).toBeLessThanOrEqual(60);
        // Travail : métier et contrat pour les actifs seulement.
        const works = w.status === 'cadre' || w.status === 'non-cadre';
        expect(w.job !== null, `${w.status} ${w.job}`).toBe(works);
        expect(w.contract !== null).toBe(works);
        if (w.status === 'cadre') expect(['forfait', '39h']).toContain(w.contract);
        if (w.status === 'non-cadre') expect(['35h', '39h', 'fonction-publique', 'hcr']).toContain(w.contract);
      }
    }
    // Contrats (hors coloc, dont les hcr sont tirés à part).
    const cadres = adults(['couple', 'famille', 'solo']).filter((m) => m.who.status === 'cadre');
    near(share(cadres, (m) => m.who.contract === 'forfait'), 0.7, 'cadre au forfait');
    const nc = adults(['couple', 'famille', 'solo']).filter((m) => m.who.status === 'non-cadre');
    near(share(nc, (m) => m.who.contract === '35h'), 0.4, 'non-cadre 35h');
    near(share(nc, (m) => m.who.contract === '39h'), 0.3, 'non-cadre 39h');
    near(share(nc, (m) => m.who.contract === 'fonction-publique'), 0.2, 'non-cadre fonction publique');
    near(share(nc, (m) => m.who.contract === 'hcr'), 0.1, 'non-cadre hcr');
    for (const m of all.flatMap((d) => d.hh.members)) {
      if (m.who.contract === 'hcr') expect(['serveuse', 'serveur', 'cuisinière', 'cuisinier']).toContain(m.who.job);
    }
    // Métiers accordés au sexe : jamais une forme féminine pour un homme.
    for (const m of all.flatMap((d) => d.hh.members).filter((x) => x.who.sex === 'm' && x.who.job)) expect(m.who.job).not.toMatch(/(euse|rice|ière|ienne|ante|ée|fe)( |$)/);
    expect(all.flatMap((d) => d.hh.members).some((m) => m.who.sex === 'f' && /(euse|rice|ière|ienne|ante|ée|fe)( |$)/.test(m.who.job ?? ''))).toBe(true);
  });

  it('lucarne : étudiant seul', () => {
    let seen = 0;
    for (const d of all) {
      if (d.bays.length !== 1 || d.hh.type !== 'etudiant') continue;
      seen++;
      expect(d.hh.members.length).toBe(1);
      const w = d.hh.members[0]!.who;
      expect(w.status).toBe('etudiant');
      expect(w.partner).toBeNull();
      expect(w.children).toEqual([]);
      expect(w.parents).toEqual([]);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('tirages existants inchangés (types, couleurs, drapeaux, graine)', () => {
    const fixture = JSON.parse(readFileSync(new URL('../fixtures/foyers-empreinte.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    for (const s of [1, 2, 3]) {
      const got = dwellingsOf(s).map((d) => ({
        id: d.id, type: d.hh.type, smoker: d.hh.smoker, sapin: d.hh.sapin, late: d.hh.late, seed: d.hh.seed,
        members: d.hh.members.map((m) => ({ kid: m.kid, shirt: m.shirt, pants: m.pants, skin: m.skin, ...(m.kid ? {} : { size: m.size }) })),
      }));
      expect(got).toEqual(fixture[String(s)]);
    }
  });
});
