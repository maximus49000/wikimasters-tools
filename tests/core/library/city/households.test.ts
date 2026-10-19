import { describe, expect, it } from 'vitest';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, householdFor, type Dwelling, type HouseholdType } from '../../../../src/core/library/city/households';

const W = 1440;
const H = 340;
const dwellingsOf = (seed: number, width = W): Dwelling[] => cityDwellings(cityFacades(width, H, seed), seed);
const all = [1, 2, 3, 4, 5].flatMap((s) => dwellingsOf(s));

describe('foyers par logement', () => {
  it('même graine → mêmes foyers ; autre graine → tirage différent', () => {
    const a = dwellingsOf(7);
    expect(a.length).toBeGreaterThan(0);
    expect(dwellingsOf(7)).toEqual(a);
    const b = dwellingsOf(8);
    const types = (ds: Dwelling[]) => ds.map((d) => d.hh.type).join(',');
    expect(types(b)).not.toBe(types(a));
    // Le foyer ne dépend que de la graine et de la clé du logement.
    const f = cityFacades(W, H, 7);
    const d = a[0]!;
    expect(householdFor(f[d.facade]!.homes[d.home]!, 7)).toEqual(d.hh);
  });

  it('identifiants : `${façade}:${logement}`, comme `data-home` du calque des fenêtres, un par logement', () => {
    const f = cityFacades(W, H, 3);
    const ds = cityDwellings(f, 3);
    const expected = f.flatMap((b, i) => (b.far ? [] : b.homes.map((_, h) => `${i}:${h}`)));
    expect(ds.map((d) => d.id)).toEqual(expected);
    for (const d of ds) {
      expect(d.id).toBe(`${d.facade}:${d.home}`);
      expect(d.key).toBe(f[d.facade]!.homes[d.home]!.key);
      expect(d.climb).toBeCloseTo(0.35 + 0.22 * (d.floorIdx + 1), 9);
    }
  });

  it('proportions de la maquette sur 5 graines', () => {
    expect(all.length).toBeGreaterThanOrEqual(300);
    const target: Record<HouseholdType, number> = { couple: 0.25, famille: 0.2, retraite: 0.18, etudiant: 0.12, coloc: 0.1, solo: 0.15 };
    for (const [type, p] of Object.entries(target)) {
      const share = all.filter((d) => d.hh.type === type).length / all.length;
      expect(Math.abs(share - p), type).toBeLessThanOrEqual(0.06);
    }
  });

  it('pièces : 2 travées → cuisine + salon ; 3 et plus → cuisine, chambre, salon ; lucarne → une pièce salon', () => {
    const f1 = [1, 2, 3, 4, 5].map((s) => cityFacades(W, H, s));
    let dormers = 0;
    for (const d of all) {
      if (d.bays.length === 1) expect(d.rooms).toEqual(['salon']);
      else if (d.bays.length === 2) expect(d.rooms).toEqual(['cuisine', 'salon']);
      else expect(d.rooms).toEqual(['cuisine', 'chambre', 'salon']);
      expect(d.rooms.length).toBe(d.bays.length);
    }
    [1, 2, 3, 4, 5].forEach((s, k) => {
      for (const d of dwellingsOf(s)) {
        const b = f1[k]![d.facade]!;
        const home = b.homes[d.home]!;
        const wins = b.lamps.filter((w) => w.home === d.home);
        expect(wins.length).toBe(d.bays.length);
        // Chaque fenêtre du logement a sa pièce (clé : travée de la fenêtre).
        for (const w of wins) expect(d.roomOfWindow.get(w.bay)).toBe(d.rooms[d.bays.indexOf(w.bay)]);
        if (home.level === -1) {
          dormers++;
          expect(d.rooms).toEqual(['salon']);
          expect(d.floorIdx).toBe(b.layout!.levels.length);
          expect(d.balcony).toBe(false);
        }
      }
    });
    expect(dormers).toBeGreaterThan(0);
  });

  it('famille : au moins un enfant (kid, size 0,62/0,66) ; retraité : size 0,94/0,66 ; coloc : 2 à 3 membres', () => {
    const seen = new Set<HouseholdType>();
    for (const { hh } of all) {
      seen.add(hh.type);
      if (hh.type === 'famille') {
        expect(hh.members.some((m) => m.kid && m.size === 0.62)).toBe(true);
        expect(hh.members.filter((m) => !m.kid).length).toBe(2);
        for (const m of hh.members) expect(m.kid).toBe(m.size < 0.8);
      } else expect(hh.members.some((m) => m.kid)).toBe(false);
      if (hh.type === 'retraite') {
        expect(hh.members.length).toBeGreaterThanOrEqual(1);
        expect(hh.members.length).toBeLessThanOrEqual(2);
        for (const m of hh.members) expect(m.size).toBe(0.94);
      }
      if (hh.type === 'coloc') {
        expect(hh.members.length).toBeGreaterThanOrEqual(2);
        expect(hh.members.length).toBeLessThanOrEqual(3);
      }
      if (hh.type === 'couple') expect(hh.members.length).toBe(2);
      if (hh.type === 'solo' || hh.type === 'etudiant') expect(hh.members.length).toBe(1);
      if (hh.type !== 'couple' && hh.type !== 'solo') expect(hh.smoker).toBe(false);
      if (hh.type !== 'etudiant') expect(hh.late).toBe(false);
      for (const m of hh.members) {
        expect(m.shirt).toMatch(/^#[0-9A-F]{6}$/);
        expect(m.pants).toMatch(/^#[0-9A-F]{6}$/);
        expect(m.skin).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
    expect(seen.size).toBe(6);
    // Fumeurs, sapins, couche-tard : présents, sans être la règle (40 %, 55 %, 50 %).
    const share = (list: Dwelling[], f: (d: Dwelling) => boolean) => list.filter(f).length / list.length;
    expect(Math.abs(share(all.filter((d) => d.hh.type === 'couple' || d.hh.type === 'solo'), (d) => d.hh.smoker) - 0.4)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(share(all, (d) => d.hh.sapin) - 0.55)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(share(all.filter((d) => d.hh.type === 'etudiant'), (d) => d.hh.late) - 0.5)).toBeLessThanOrEqual(0.1);
  });

  it('logement d’une travée (lucarne) : jamais une famille ni une coloc', () => {
    for (const d of all) if (d.bays.length === 1) expect(['famille', 'coloc']).not.toContain(d.hh.type);
  });

  it('volets : haussmann → persienne, faubourg → battant, faubourg sans volets → null, socle → null, quel que soit le foyer', () => {
    const f = cityFacades(W, H, 1);
    const ds = cityDwellings(f, 1);
    const tower = (d: Dwelling) => d.home < (f[d.facade]!.layout?.homes.length ?? 0) && f[d.facade]!.homes[d.home]!.level >= 0;
    const haussmann = ds.filter((d) => tower(d) && f[d.facade]!.layout!.kind === 'haussmann');
    const faubourg = ds.filter((d) => tower(d) && f[d.facade]!.layout!.kind === 'faubourg');
    const socle = ds.filter((d) => d.home >= (f[d.facade]!.layout?.homes.length ?? 0));
    expect(haussmann.length).toBeGreaterThan(0);
    expect(faubourg.length).toBeGreaterThan(0);
    expect(socle.length).toBeGreaterThan(0);
    for (const d of haussmann) expect(d.shutters).toBe('persienne');
    for (const d of faubourg) expect(d.shutters).toBe('battant');
    for (const d of socle) expect(d.shutters).toBeNull();
    // Étudiants et colocs gardent les volets de leur immeuble (ils ne les ferment pas : emploi du temps, tâche 2).
    expect(haussmann.concat(faubourg).some((d) => d.hh.type === 'etudiant' || d.hh.type === 'coloc')).toBe(true);
    // Faubourg dont la mise en page n'a pas de volets : aucun.
    const fi = faubourg[0]!.facade;
    const bare = f.map((b, i) => (i === fi ? { ...b, layout: { ...b.layout!, shutters: null } } : b));
    for (const d of cityDwellings(bare, 1).filter((x) => x.facade === fi && tower(x))) expect(d.shutters).toBeNull();
  });

  it('étudiant et coloc n’ont jamais de volets battants à fermer (shutters ignorés par l’emploi du temps) ; lucarne : shutters null', () => {
    [1, 2, 3, 4, 5].forEach((s) => {
      const f = cityFacades(W, H, s);
      for (const d of cityDwellings(f, s)) {
        const b = f[d.facade]!;
        const home = b.homes[d.home]!;
        const podium = d.home >= (b.layout?.homes.length ?? 0);
        // Lucarne et socle (« ni volets ni jardinières » au peintre) : jamais de volets.
        if (podium || home.level < 0) expect(d.shutters).toBeNull();
        const level = podium || home.level < 0 ? null : b.layout!.levels[home.level]!;
        expect(d.balcony).toBe(level !== null && level.balcony !== 'none');
        expect(d.floorIdx).toBe(podium ? 0 : home.level < 0 ? b.layout!.levels.length : home.level);
        expect(d.doorX).toBe(b.layout?.doorCx ?? null);
      }
    });
  });

  it('largeur où seuls des socles existent : aucun plantage, tableau éventuellement vide', () => {
    // Largeurs minuscules (aucun logement en deçà de 24 px pour ces graines) : tableau vide ou logements cohérents.
    for (const width of [0, 1, 4, 8, 12, 16, 20, 24, 30, 40, 60]) {
      for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const f = cityFacades(width, H, s);
        const ds = cityDwellings(f, s);
        expect(ds.length).toBe(f.reduce((n, b) => n + (b.far ? 0 : b.homes.length), 0));
      }
    }
    expect(cityDwellings(cityFacades(4, H, 1), 1)).toEqual([]);
    expect(cityDwellings([], 1)).toEqual([]);
    // Socle seul (tour sans mise en page : partie visible trop étroite) : logements du socle, sans porte ni volets.
    const twin = cityFacades(W, H, 2).find((b) => !b.far && b.podiumLayout && b.podiumLayout.homes.length > 0)!;
    expect(twin).toBeDefined();
    const alone = { ...twin, layout: null, lamps: twin.podiumLayout!.windows, homes: twin.podiumLayout!.homes };
    const ds = cityDwellings([alone], 2);
    expect(ds.length).toBe(twin.podiumLayout!.homes.length);
    for (const d of ds) {
      expect(d.floorIdx).toBe(0);
      expect(d.doorX).toBeNull();
      expect(d.shutters).toBeNull();
      expect(d.balcony).toBe(false);
      expect(d.rooms.length).toBe(d.bays.length);
    }
  });
});
