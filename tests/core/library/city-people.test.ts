import { describe, expect, it } from 'vitest';
import type { FestivityId } from '../../../src/core/library/city/calendar';
import { type CityIntensity } from '../../../src/core/library/city/intensity';
import { festiveMark, outfitFor, pedestrianGate, pedestriansFor } from '../../../src/core/library/city/people';
import { hashString, mulberry32 } from '../../../src/core/library/scene-world';

const zero: CityIntensity = { traffic: 0, walkers: 0, suits: 0, schoolTo: 0, schoolFrom: 0, kids: 0, sport: 0, umbrellas: false, weekendLike: false, festive: null };

describe('pedestriansFor', () => {
  it('est déterministe et borné pour 720 px', () => {
    const a = pedestriansFor(720, 7);
    expect(a).toEqual(pedestriansFor(720, 7));
    expect(a).not.toEqual(pedestriansFor(720, 8));
    expect(a.length).toBeGreaterThan(8);
    expect(a.length).toBeLessThanOrEqual(40);
  });
  it('les groupes d’école ont des enfants et vont dans un sens fixe selon le trajet', () => {
    const groups = pedestriansFor(1440, 3).filter((p) => p.role === 'schoolTo' || p.role === 'schoolFrom');
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.companions.length).toBeGreaterThanOrEqual(1);
      expect(g.dir).toBe(g.role === 'schoolTo' ? 1 : -1);
    }
  });
  it('la porte du seuil suit l’intensité du profil', () => {
    const [p] = pedestriansFor(2000, 1).filter((x) => x.profile === 'suit');
    expect(p).toBeDefined();
    expect(pedestrianGate(p!, zero)).toBe(0);
    expect(pedestrianGate(p!, { ...zero, suits: 0.8 })).toBe(0.8);
  });
});

describe('outfitFor — variété', () => {
  it('donne des tenues variées sur 60 tirages', () => {
    const rng = mulberry32(5);
    const tops = new Set<string>();
    const colors = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const o = outfitFor('ordinary', rng);
      tops.add(o.top);
      colors.add(o.topColor);
    }
    expect(tops.size).toBeGreaterThanOrEqual(4);
    expect(colors.size).toBeGreaterThanOrEqual(6);
  });
  it('respecte les profils', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 30; i++) {
      expect(outfitFor('suit', rng).top).toBe('suit');
      expect(['jersey']).toContain(outfitFor('jogger', rng).top);
      expect(['backpack', 'ball']).toContain(outfitFor('child', rng).accessory);
    }
  });
  it('un grand tableau de passants est varié', () => {
    const list = pedestriansFor(2000, 2);
    expect(new Set(list.map((p) => p.outfit.top)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(list.map((p) => p.outfit.topColor)).size).toBeGreaterThanOrEqual(8);
  });
});

describe('passants festifs', () => {
  const peds = pedestriansFor(720, 7);
  const base = peds.filter((p) => p.role !== 'festive');
  const none: CityIntensity = { ...zero, walkers: 0.5, festive: null };
  const festive = (id: FestivityId, share = 0.5): CityIntensity => ({ ...none, festive: { id, share } });
  it('laisse les passants existants intacts (tirages inchangés)', () => {
    expect(hashString(JSON.stringify(base))).toBe(135529279);
    expect(peds.slice(0, base.length)).toEqual(base);
  });
  it('ajoute des couples (Saint-Valentin) et des groupes d’enfants (Pâques)', () => {
    const fest = peds.filter((p) => p.role === 'festive');
    expect(fest.some((p) => p.fest === 'valentine' && p.pair && p.companions.length === 1)).toBe(true);
    expect(fest.some((p) => p.fest === 'easter' && p.profile === 'child')).toBe(true);
  });
  it('ne montre un festif que pendant sa fête', () => {
    const couple = peds.find((p) => p.fest === 'valentine')!;
    expect(pedestrianGate(couple, festive('valentine'))).toBeGreaterThan(0);
    expect(pedestrianGate(couple, festive('easter'))).toBe(0);
    expect(pedestrianGate(couple, none)).toBe(0);
  });
  it('donne un signe par fête, déterministe, sans tirage', () => {
    const a = peds[0]!;
    expect(festiveMark(a, none)).toBeNull();
    expect(festiveMark(a, festive('bastille', 1))).toBe('flag');
    expect(festiveMark(a, festive('bastille', 0))).toBeNull();
    const marks = (id: FestivityId) => festiveMark(a, festive(id, 1));
    expect([marks('epiphany'), marks('valentine'), marks('easter'), marks('may-day'), marks('armistice'), marks('new-year'), marks('music')]).toEqual(['crown', 'heart-balloon', 'basket', 'lily', 'poppy', 'streamer', 'note']);
    expect(marks('christmas-eve')).toBeNull();
  });
  it('le signe touche une part des passants proche du partage demandé', () => {
    const n = base.filter((p) => festiveMark(p, festive('bastille', 0.5)) !== null).length;
    expect(n).toBeGreaterThan(base.length * 0.2);
    expect(n).toBeLessThan(base.length * 0.8);
  });
});
