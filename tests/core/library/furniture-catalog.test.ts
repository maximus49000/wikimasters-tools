import { describe, expect, it } from 'vitest';
import { CATEGORIES, FURNITURE_KINDS, SMALL_ITEM_OF, isSmallKind, isStandingKind, labelOf, layerOf, poisOf, sizeOf } from '../../../src/core/library/furniture-catalog';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { MIN_COLS, ROWS, WALL_ROWS } from '../../../src/core/library/room-grid';

describe('catalogue', () => {
  it('chaque meuble tient dans la pièce', () => {
    for (const kind of STANDING_KINDS) {
      const { w, h } = sizeOf(kind);
      expect(w, kind).toBeLessThanOrEqual(MIN_COLS);
      expect(h, kind).toBeLessThanOrEqual(layerOf(kind) === 'rug' ? ROWS - WALL_ROWS : ROWS);
    }
  });

  it('les points d’intérêt sont dans l’emprise du meuble', () => {
    for (const kind of STANDING_KINDS) {
      const { w, h } = sizeOf(kind);
      for (const poi of poisOf(kind)) {
        expect(poi.dx, kind).toBeGreaterThanOrEqual(0);
        expect(poi.dx, kind).toBeLessThan(w);
        expect(poi.dy, kind).toBeGreaterThanOrEqual(0);
        expect(poi.dy, kind).toBeLessThan(h);
      }
    }
  });

  it('les meubles pour animaux et les assises déclarent leurs points', () => {
    expect(poisOf('sofa').filter((p) => p.type === 'seat')).toHaveLength(3);
    expect(poisOf('basket').map((p) => p.type)).toEqual(['curl']);
    expect(poisOf('bowl').map((p) => p.type)).toEqual(['eat']);
    expect(poisOf('kennel').map((p) => p.type).sort()).toEqual(['enter', 'sleep']);
  });

  it('seul le tapis est sur la couche tapis', () => {
    expect(STANDING_KINDS.filter((k) => layerOf(k) === 'rug')).toEqual(['rug']);
  });

  it('les catégories couvrent chaque type une seule fois', () => {
    const all = [...STANDING_KINDS, 'computer', 'small-plant', 'small-lamp'].sort();
    expect([...FURNITURE_KINDS].sort()).toEqual(all);
    expect(CATEGORIES.map((c) => c.id)).toEqual(['storage', 'seats', 'pets', 'deco', 'steampunk']);
  });

  it('chaque type a un libellé et les aides de type répondent', () => {
    for (const kind of FURNITURE_KINDS) expect(labelOf(kind).length).toBeGreaterThan(0);
    expect(isStandingKind('sofa')).toBe(true);
    expect(isStandingKind('computer')).toBe(false);
    expect(isSmallKind('small-lamp')).toBe(true);
    expect(SMALL_ITEM_OF['small-plant']).toBe('plant');
  });
});
