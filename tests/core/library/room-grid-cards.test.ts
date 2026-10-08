import { describe, expect, it } from 'vitest';
import { WALL_SHAPES, wallSizeOf } from '../../../src/core/library/furniture-catalog';
import { WALL_ROWS } from '../../../src/core/library/room-grid';

describe('catalogue des formes', () => {
  it('chaque forme murale tient dans la hauteur du mur', () => {
    for (const shape of WALL_SHAPES) {
      const { w, h } = wallSizeOf(shape);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeLessThanOrEqual(WALL_ROWS);
    }
  });
});
