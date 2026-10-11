import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WindowArt, glassRect } from '../../src/content/window-art';
import { CELL_H, WALL_ROWS } from '../../src/core/library/room-grid';
import { paletteOf } from '../../src/core/library/styles';

const palette = paletteOf('scandinave');
const wallH = WALL_ROWS * CELL_H;
const html = (rect: { x: number; y: number; w: number; h: number }): string => renderToStaticMarkup(<svg><WindowArt rect={rect} palette={palette} steampunk={false} /></svg>);
// Barres du cadre : rectangles de 4 px de large (montants) ou de haut (traverse).
const posts = (s: string): number => (s.match(/ width="4" height=/g) ?? []).length;
const crossbars = (s: string): number => (s.match(/ height="4" fill=/g) ?? []).length;

describe('vitre des fenêtres', () => {
  it("descend la vitre d'une baie jusqu'au bas du mur", () => {
    const g = glassRect({ x: 0, y: 0, w: 300, h: wallH });
    expect(g.y + g.h).toBeGreaterThanOrEqual(wallH - 2);
    const small = glassRect({ x: 0, y: 30, w: 120, h: 150 });
    expect(small.y + small.h).toBe(30 + 150 - 7);
  });

  it('une baie au sol n’a pas de traverse et reçoit deux montants à 300 px', () => {
    const s = html({ x: 0, y: 0, w: 314, h: wallH });
    expect(posts(s)).toBe(2);
    expect(crossbars(s)).toBe(0);
  });

  it('une fenêtre en hauteur garde sa traverse', () => {
    const s = html({ x: 0, y: 30, w: 120, h: 150 });
    expect(crossbars(s)).toBe(1);
  });
});
