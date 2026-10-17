import { describe, expect, it } from 'vitest';
import { citizen, citizenFromOutfit, citizenKey, expand, PEAUX, type CitizenDesc } from '../../../src/core/citizens/catalogue';
import type { Outfit } from '../../../src/core/library/city/people';

const SEEDS = Array.from({ length: 2000 }, (_, i) => i + 1);
const noms = (d: CitizenDesc): string[] => d.items.map((i) => i.k);
const jupes = (d: CitizenDesc): boolean => noms(d).some((k) => /jupe|robe/.test(k));

const base: Outfit = {
  skin: '#E0A97F', hair: 'short', hairColor: '#3B2A1E', hatColor: '#C0463A', top: 'tee', topColor: '#3B6FD6',
  bottom: 'pants', bottomColor: '#243044', accessory: 'none', accessoryColor: '#2E8B6A',
};
const tenue = (o: Partial<Outfit>): Outfit => ({ ...base, ...o });
const FEMMES = ['femme-frele', 'mamie'];

describe('générateur aléatoire', () => {
  it('est déterministe', () => {
    for (const s of [1, 7, 99, 1234]) expect(citizenKey(citizen(s))).toBe(citizenKey(citizen(s)));
    expect(citizenKey(citizen(1))).not.toBe(citizenKey(citizen(2)));
  });

  it("ne met une barbe qu'aux hommes et aux papys", () => {
    for (const s of SEEDS) {
      const d = citizen(s);
      if (d.beard) expect(['homme-fort', 'homme-maigre', 'papy']).toContain(d.base);
    }
  });

  it("ne met jupe ou robe qu'aux femmes, mamies et enfants", () => {
    for (const s of SEEDS) {
      const d = citizen(s);
      if (jupes(d)) expect(['femme-frele', 'mamie', 'enfant']).toContain(d.base);
    }
  });

  it('ne met jamais de casquette aux anciens', () => {
    for (const s of SEEDS) {
      const d = citizen(s);
      if (d.base === 'papy' || d.base === 'mamie') expect(d.cap).toBeNull();
    }
  });

  it('fait apparaître les 8 peaux, les 6 bases et des humeurs variées', () => {
    const ds = SEEDS.map(citizen);
    expect(new Set(ds.map((d) => d.skin)).size).toBe(PEAUX.length);
    expect(new Set(ds.map((d) => d.base)).size).toBe(6);
    const humeurs = new Set(ds.map((d) => d.mood));
    expect(humeurs.has('neutre') && humeurs.has('content')).toBe(true);
    expect(humeurs.size).toBeGreaterThan(3);
  });

  it('donne une taille proche de celle de la base', () => {
    const metres: Record<string, number> = { 'homme-fort': 1.7, 'homme-maigre': 1.82, 'femme-frele': 1.62, papy: 1.66, mamie: 1.54, enfant: 1.25 };
    for (const s of SEEDS.slice(0, 200)) {
      const d = citizen(s);
      const m = metres[d.base]!;
      expect(d.height).toBeGreaterThanOrEqual(m * 0.95 - 1e-9);
      expect(d.height).toBeLessThanOrEqual(m * 1.05 + 1e-9);
    }
  });

  it('développe en pièces cohérentes', () => {
    for (const s of SEEDS.slice(0, 300)) {
      const pieces = expand(citizen(s));
      expect(pieces.some((p) => p.k === 'shoes' || p.k === 'boots')).toBe(true);
    }
  });
});

describe('clé stable', () => {
  it("couvre tout ce qui change l'aspect", () => {
    const d = citizen(5);
    const k = citizenKey(d);
    expect(citizenKey({ ...d, mood: d.mood === 'fache' ? 'neutre' : 'fache' })).not.toBe(k);
    expect(citizenKey({ ...d, skin: '#000000' })).not.toBe(k);
    expect(citizenKey({ ...d, height: d.height + 0.05 })).not.toBe(k);
    expect(citizenKey({ ...d, items: d.items.slice(1) })).not.toBe(k);
  });
});

describe("à partir d'une tenue", () => {
  it('gilet de chantier : ajoute une pièce gilet', () => {
    const d = citizenFromOutfit(3, base, { work: 'vest' });
    expect(noms(d)).toContain('gilet');
    expect(expand(d).some((p) => p.k === 'gilet')).toBe(true);
  });

  it('tablier', () => {
    expect(noms(citizenFromOutfit(3, base, { work: 'apron' }))).toContain('tablier');
  });

  it('enfant : base enfant, jamais de barbe', () => {
    for (const s of SEEDS.slice(0, 100)) {
      const d = citizenFromOutfit(s, base, { kind: 'child' });
      expect(d.base).toBe('enfant');
      expect(d.beard).toBeNull();
    }
  });

  it('jupe et robe imposent une base femme', () => {
    for (const bottom of ['skirt', 'dress'] as const) {
      for (const kind of ['adult', 'any', 'aged'] as const) {
        for (const s of SEEDS.slice(0, 60)) {
          const d = citizenFromOutfit(s, tenue({ bottom }), { kind });
          expect(FEMMES).toContain(d.base);
          expect(jupes(d)).toBe(true);
        }
      }
    }
  });

  it('adulte : ni enfant ni ancien ; ancien : papy ou mamie', () => {
    for (const s of SEEDS.slice(0, 100)) {
      expect(['enfant', 'papy', 'mamie']).not.toContain(citizenFromOutfit(s, base, { kind: 'adult' }).base);
      expect(['papy', 'mamie']).toContain(citizenFromOutfit(s, base, { kind: 'aged' }).base);
    }
  });

  it('jean : pantalon, couleur de la tenue conservée', () => {
    const d = citizenFromOutfit(4, tenue({ bottom: 'jeans', bottomColor: '#2F4A7A' }), { kind: 'adult' });
    expect(d.items.find((i) => i.k === 'pantalon')?.color).toBe('#2F4A7A');
  });

  it('manteau et couleurs reprises', () => {
    const d = citizenFromOutfit(4, tenue({ top: 'jacket', topColor: '#112233' }), { kind: 'adult' });
    expect(d.items.find((i) => i.k === 'manteau')?.color).toBe('#112233');
    expect(citizenFromOutfit(4, tenue({ top: 'coat' }), { kind: 'adult' }).items.some((i) => i.k === 'manteauLong')).toBe(true);
  });

  it('bonnet', () => {
    const d = citizenFromOutfit(4, tenue({ hair: 'beanie', hatColor: '#445566' }), { kind: 'adult' });
    expect(d.items.find((i) => i.k === 'bonnet')?.color).toBe('#445566');
    expect(expand(d).some((p) => p.k === 'bonnet')).toBe(true);
  });

  it('casquette : champ cap, sauf pour les anciens', () => {
    const adulte = citizenFromOutfit(4, tenue({ hair: 'cap', hatColor: '#778899' }), { kind: 'adult' });
    expect(adulte.cap?.[0]).toBe('#778899');
    for (const s of SEEDS.slice(0, 50)) {
      expect(citizenFromOutfit(s, tenue({ hair: 'cap' }), { kind: 'aged' }).cap).toBeNull();
    }
  });

  it('crâne rasé : pas de cheveux', () => {
    const d = citizenFromOutfit(4, tenue({ hair: 'bald' }), { kind: 'adult' });
    expect(d.hair === null || d.hair[0] === 'rase').toBe(true);
  });

  it('accessoires et parapluie', () => {
    const sac = citizenFromOutfit(4, tenue({ accessory: 'backpack', accessoryColor: '#abcdef' }), {});
    expect(sac.items.find((i) => i.k === 'accessory')).toMatchObject({ what: 'sac-a-dos', color: '#abcdef' });
    const pluie = citizenFromOutfit(4, base, { umbrella: true });
    expect(pluie.items.find((i) => i.k === 'accessory')?.what).toBe('parapluie');
    expect(citizenFromOutfit(4, base, {}).items.some((i) => i.k === 'accessory')).toBe(false);
  });

  it('peau : la plus proche des 8 teintes', () => {
    expect(citizenFromOutfit(4, tenue({ skin: '#6B4228' }), {}).skin).toBe('#73452A');
    expect(citizenFromOutfit(4, tenue({ skin: '#F2C9A5' }), {}).skin).toBe('#EEC6A6');
  });

  it('est déterministe', () => {
    const a = citizenFromOutfit(9, tenue({ top: 'suit' }), { kind: 'adult', work: 'vest' });
    const b = citizenFromOutfit(9, tenue({ top: 'suit' }), { kind: 'adult', work: 'vest' });
    expect(citizenKey(a)).toBe(citizenKey(b));
  });
});
