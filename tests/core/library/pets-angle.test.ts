import { describe, expect, it } from 'vitest';
import { buildWalkMap } from '../../../src/core/library/pets/walk-map';
import { WALL_ROWS } from '../../../src/core/library/room-grid';

describe('carte de marche d’un meuble tourné', () => {
  it('bloque l’escalier, laisse libres les cases hors escalier', () => {
    const map = buildWalkMap([{ id: 'a', kind: 'sofa', col: 0, row: 14, angle: 1 }], 24);
    expect(map.blocked[16 - WALL_ROWS]![0]).toBe(false);
    expect(map.blocked[16 - WALL_ROWS]![4]).toBe(true);
    expect(map.blocked[14 - WALL_ROWS]![0]).toBe(true);
  });
});
