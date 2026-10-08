import { describe, expect, it } from 'vitest';
import { WALL_SHAPES, wallSizeOf } from '../../../src/core/library/furniture-catalog';
import { WALL_ROWS, canHang, hang, moveHung, placeStanding, sectionIsEmpty, shiftLayout } from '../../../src/core/library/room-grid';

describe('catalogue des formes', () => {
  it('chaque forme murale tient dans la hauteur du mur', () => {
    for (const shape of WALL_SHAPES) {
      const { w, h } = wallSizeOf(shape);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeLessThanOrEqual(WALL_ROWS);
    }
  });
});

describe('objets accrochés', () => {
  it("s'accroche sur un mur libre", () => {
    const layout = hang([], 24, 'poster', 2, 1, 'Paris', 'f1');
    expect(layout).toEqual([{ id: 'f1', kind: 'wall', shape: 'poster', col: 2, row: 1, slug: 'Paris' }]);
  });

  it('refuse ce qui dépasse sur le sol', () => {
    const r = canHang([], 24, 'poster', 2, 6);
    expect(r).toMatchObject({ ok: false, reason: 'wall' });
  });

  it('refuse hors de la pièce', () => {
    expect(canHang([], 24, 'poster', 22, 1)).toMatchObject({ ok: false, reason: 'bounds' });
  });

  it('refuse sur un autre objet accroché', () => {
    const layout = hang([], 24, 'poster', 2, 1, 'A', 'f1')!;
    expect(canHang(layout, 24, 'vinyl', 3, 2)).toMatchObject({ ok: false, reason: 'taken' });
  });

  it('refuse derrière une étagère', () => {
    const layout = placeStanding([], 24, 'shelf', 2, 4, 'f1')!;
    expect(canHang(layout, 24, 'vinyl', 2, 1).ok).toBe(true);
    expect(canHang(layout, 24, 'vinyl', 2, 3)).toMatchObject({ ok: false, reason: 'taken' });
  });

  it('un meuble ne se pose pas sur un objet accroché', () => {
    const layout = hang([], 24, 'poster', 2, 5, 'A', 'f1')!;
    expect(placeStanding(layout, 24, 'shelf', 2, 4, 'f2')).toBeNull();
  });

  it('se déplace, sans se bloquer lui-même', () => {
    const layout = hang([], 24, 'poster', 2, 1, 'A', 'f1')!;
    expect(moveHung(layout, 24, 'f1', 3, 1)).toEqual([{ id: 'f1', kind: 'wall', shape: 'poster', col: 3, row: 1, slug: 'A' }]);
  });

  it('suit le décalage vers la gauche et compte pour la zone du bord', () => {
    const layout = hang([], 24, 'poster', 2, 1, 'A', 'f1')!;
    expect(shiftLayout(layout, 12)[0]).toMatchObject({ col: 14 });
    expect(sectionIsEmpty(layout, 24, 'left')).toBe(false);
  });
});
