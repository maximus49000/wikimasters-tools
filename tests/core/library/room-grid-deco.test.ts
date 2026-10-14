import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { decoFit, decoSizeOf, depthOf, hangDeco, moveDeco, rectOf, resizeDeco, setDecoSettings, shiftLayout } from '../../../src/core/library/room-grid';

const COLS = 24;
const win: Layout[number] = { id: 'w1', kind: 'window', col: 8, row: 1, w: 6, h: 5 };

describe('objets décoratifs du mur', () => {
  it('une horloge à aiguilles se pose en 2×2 au niveau du mur', () => {
    const layout = hangDeco([], COLS, 'wall-clock', 2, 1, 'f1')!;
    expect(layout).toEqual([{ id: 'f1', kind: 'deco', deco: 'wall-clock', col: 2, row: 1 }]);
    expect(rectOf(layout[0]!)).toEqual({ col: 2, row: 1, w: 2, h: 2 });
    expect(depthOf(layout, layout[0]!)).toBe(0);
  });

  it('un panneau se pose à sa taille par défaut (4×3, néon 5×2)', () => {
    const chalk = hangDeco([], COLS, 'panel-chalk', 0, 0, 'f1')![0]!;
    expect(chalk).toMatchObject({ w: 4, h: 3 });
    const neon = hangDeco([], COLS, 'panel-neon', 0, 0, 'f2')![0]!;
    expect(decoSizeOf(neon as Extract<Layout[number], { kind: 'deco' }>)).toEqual({ w: 5, h: 2 });
  });

  it('l horloge numérique et la station météo font 3×2', () => {
    expect(rectOf(hangDeco([], COLS, 'digital-clock', 2, 1, 'f1')![0]!)).toMatchObject({ w: 3, h: 2 });
    expect(rectOf(hangDeco([], COLS, 'weather-station', 2, 1, 'f1')![0]!)).toMatchObject({ w: 3, h: 2 });
  });

  it('refuse le sol, le bord et une fenêtre', () => {
    expect(hangDeco([], COLS, 'barometer', 0, 10, 'f1')).toBeNull();
    expect(hangDeco([], COLS, 'wall-clock', 23, 0, 'f1')).toBeNull();
    expect(hangDeco([win], COLS, 'wall-clock', 9, 2, 'f1')).toBeNull();
  });

  it('se déplace sans se bloquer lui-même', () => {
    const layout = hangDeco([], COLS, 'digital-clock', 2, 1, 'f1')!;
    expect(moveDeco(layout, COLS, 'f1', 3, 1)![0]).toMatchObject({ col: 3, row: 1 });
  });

  it('un panneau change de taille dans ses bornes, jamais contre un voisin ni hors du mur', () => {
    const layout = [...hangDeco([], COLS, 'panel-cork', 2, 1, 'f1')!, win];
    expect(resizeDeco(layout, COLS, 'f1', 5, 3)![0]).toMatchObject({ w: 5, h: 3 });
    expect(decoFit(layout, COLS, 'f1', 1, 3).ok).toBe(false);
    expect(decoFit(layout, COLS, 'f1', 13, 3).ok).toBe(false);
    expect(decoFit(layout, COLS, 'f1', 7, 3)).toMatchObject({ ok: false, reason: 'taken' });
    expect(decoFit(layout, COLS, 'f1', 4, 12)).toMatchObject({ ok: false });
  });

  it('une horloge ne change pas de taille', () => {
    const layout = hangDeco([], COLS, 'wall-clock', 2, 1, 'f1')!;
    expect(resizeDeco(layout, COLS, 'f1', 3, 3)).toBeNull();
  });

  it('enregistre et retire les réglages', () => {
    const layout = hangDeco([], COLS, 'wall-clock', 2, 1, 'f1')!;
    const tokyo = setDecoSettings(layout, 'f1', { city: { name: 'Tokyo', tz: 'Asia/Tokyo' } });
    expect(tokyo[0]).toMatchObject({ city: { name: 'Tokyo', tz: 'Asia/Tokyo' } });
    expect(setDecoSettings(tokyo, 'f1', { city: null })[0]).not.toHaveProperty('city');
    const panel = hangDeco([], COLS, 'panel-neon', 0, 0, 'p1')!;
    expect(setDecoSettings(panel, 'p1', { text: 'x'.repeat(200), neon: 'cyan' })[0]).toMatchObject({ text: 'x'.repeat(140), neon: 'cyan' });
  });

  it('suit la pièce agrandie à gauche', () => {
    const layout = hangDeco([], COLS, 'wall-clock', 2, 1, 'f1')!;
    expect(shiftLayout(layout, 12)[0]).toMatchObject({ col: 14 });
  });
});
