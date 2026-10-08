import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { WINDOW_DEFAULT, WINDOW_MAX, WINDOW_MIN, labelOf } from '../../../src/core/library/furniture-catalog';
import { moveWindow, placeWindow, rectOf, resizeWindow, shiftLayout, windowFit } from '../../../src/core/library/room-grid';

const COLS = 24;
const win = (over: Partial<Extract<Layout[number], { kind: 'window' }>> = {}): Layout[number] => ({ id: 'w1', kind: 'window', col: 2, row: 1, w: 6, h: 5, ...over });

describe('fenêtre dans la grille', () => {
  it('a un libellé et des bornes de taille', () => {
    expect(labelOf('window')).toBe('Fenêtre');
    expect(WINDOW_MIN).toEqual({ w: 3, h: 3 });
    expect(WINDOW_MAX).toEqual({ w: 12, h: 10 });
    expect(WINDOW_DEFAULT).toEqual({ w: 6, h: 5 });
  });

  it('se pose en 6×5 sur le mur', () => {
    const layout = placeWindow([], COLS, 2, 1, 'f1');
    expect(layout).toEqual([{ id: 'f1', kind: 'window', col: 2, row: 1, w: 6, h: 5 }]);
    expect(rectOf(layout![0]!)).toEqual({ col: 2, row: 1, w: 6, h: 5 });
  });

  it('refuse un chevauchement, le sol et le bord', () => {
    const base = [win()];
    expect(placeWindow(base, COLS, 4, 2, 'f2')).toBeNull();
    expect(placeWindow([], COLS, 2, 9, 'f2')).toBeNull();
    expect(placeWindow([], COLS, 20, 1, 'f2')).toBeNull();
  });

  it('se déplace sans se bloquer lui-même', () => {
    expect(moveWindow([win()], COLS, 'w1', 3, 1)).toEqual([win({ col: 3 })]);
    expect(moveWindow([win(), win({ id: 'w2', col: 12 })], COLS, 'w1', 10, 1)).toBeNull();
  });

  it('se redimensionne dans les bornes', () => {
    expect(resizeWindow([win()], COLS, 'w1', 7, 5)).toEqual([win({ w: 7 })]);
    expect(resizeWindow([win()], COLS, 'w1', 2, 5)).toBeNull();
    expect(resizeWindow([win()], COLS, 'w1', 13, 5)).toBeNull();
    expect(resizeWindow([win()], COLS, 'w1', 6, 11)).toBeNull();
  });

  it('refuse un agrandissement qui chevauche un autre objet et signale les cases', () => {
    const layout = [win(), win({ id: 'w2', col: 8, row: 1, w: 3, h: 3 })];
    const check = windowFit(layout, COLS, 'w1', 7, 5);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.cells.length).toBeGreaterThan(0);
    expect(resizeWindow(layout, COLS, 'w1', 7, 5)).toBeNull();
    expect(resizeWindow(layout, COLS, 'w1', 5, 5)).not.toBeNull();
  });

  it('refuse un agrandissement qui sort du mur', () => {
    expect(resizeWindow([win({ row: 4 })], COLS, 'w1', 6, 9)).toBeNull();
  });

  it('suit le décalage de la pièce', () => {
    expect(shiftLayout([win()], 12)).toEqual([win({ col: 14 })]);
  });
});
