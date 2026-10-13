import { describe, expect, it } from 'vitest';
import { buildWalkMap } from '../../../src/core/library/pets/walk-map';
import { WALL_ROWS } from '../../../src/core/library/room-grid';

describe('carte de marche d’un meuble tourné', () => {
  it('bloque l’escalier, laisse libres les cases hors escalier', () => {
    // Canapé à ¾ en (0,9) : escalier sur les lignes 14 (colonnes 2 à 4), 15 (1 à 6), 16 (3 à 8) et 17 (6 et 7).
    const map = buildWalkMap([{ id: 'a', kind: 'sofa', col: 0, row: 9, angle: 1 }], 24);
    expect(map.blocked[16 - WALL_ROWS]![0]).toBe(false);
    expect(map.blocked[16 - WALL_ROWS]![4]).toBe(true);
    expect(map.blocked[14 - WALL_ROWS]![2]).toBe(true);
    expect(map.blocked[14 - WALL_ROWS]![0]).toBe(false);
  });
});
