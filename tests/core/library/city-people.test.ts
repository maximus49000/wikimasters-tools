import { describe, expect, it } from 'vitest';
import { type CityIntensity } from '../../../src/core/library/city/intensity';
import { outfitFor, pedestrianGate, pedestriansFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';

const zero: CityIntensity = { traffic: 0, walkers: 0, suits: 0, schoolTo: 0, schoolFrom: 0, kids: 0, sport: 0, umbrellas: false, weekendLike: false };

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
  it('deux passants voisins ne partagent presque jamais la même tenue', () => {
    const list = pedestriansFor(1440, 2).filter((p) => p.role === 'general');
    let same = 0;
    for (let i = 1; i < list.length; i++) if (JSON.stringify(list[i]!.outfit) === JSON.stringify(list[i - 1]!.outfit)) same++;
    expect(same).toBeLessThanOrEqual(1);
  });
});
