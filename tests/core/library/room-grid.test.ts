import { describe, expect, it } from 'vitest';
import {
  MAX_COLS,
  MIN_COLS,
  ROWS,
  SECTION,
  VISIBLE_COLS,
  WALL_ROWS,
  canPlace,
  canPlaceComputer,
  moveComputer,
  moveStanding,
  placeComputer,
  placeStanding,
  pxRect,
  rectOf,
  removeFurniture,
  screenCols,
  fitsWithin,
  sectionIsEmpty,
  shiftLayout,
} from '../../../src/core/library/room-grid';
import type { Layout } from '../../../src/core/library/library-types';
import { byDrawOrder, footBottom, hitRectOf, overhangRow } from '../../../src/core/library/room-grid';
import { overhangOf, pieceBounds, projectOf } from '../../../src/core/library/furniture-render3d';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { drawSize, floorCells } from '../../../src/core/library/footprint';

describe('lampadaire arc au-dessus d’un fauteuil', () => {
  const rowFor = (k: 'armchair' | 'arc-lamp' | 'chair') => 18 - drawSize(k, 0).h;
  it('le globe passe au-dessus du fauteuil : la pose est acceptée', () => {
    const layout: Layout = [{ id: 'a', kind: 'armchair', col: 10, row: rowFor('armchair') }];
    expect(canPlace(layout, 36, 'arc-lamp', 10, rowFor('arc-lamp')).ok).toBe(true);
  });
  it('mais pas sur le socle : une chaise ne se pose pas sur ses cases', () => {
    const layout: Layout = [{ id: 'l', kind: 'arc-lamp', col: 10, row: rowFor('arc-lamp') }];
    const foot = floorCells('arc-lamp', 0, 10, rowFor('arc-lamp'))[0]!;
    expect(canPlace(layout, 36, 'chair', foot.col, rowFor('chair')).ok).toBe(false);
  });
});

describe('constantes', () => {
  it('décrit la pièce et les fenêtres visibles', () => {
    expect([ROWS, WALL_ROWS, SECTION, MIN_COLS, MAX_COLS]).toEqual([18, 12, 12, 24, 96]);
    expect(VISIBLE_COLS).toEqual({ landscape: 24, portrait: 16 });
  });
});

describe('canPlace', () => {
  it('accepte un meuble dont le bas est au sol', () => {
    expect(canPlace([], 24, 'shelf', 0, 7).ok).toBe(true);
  });

  it('refuse un meuble dont le bas est sur le mur', () => {
    // Étagère 4 × 10 : sa rangée au sol (la dernière) en ligne 10, sur le mur.
    const res = canPlace([], 24, 'shelf', 0, 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('floor');
  });

  it('refuse un meuble qui dépasse de la pièce, selon sa largeur', () => {
    const res = canPlace([], 24, 'shelf', 21, 7);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('bounds');
    expect(canPlace([], 36, 'shelf', 21, 7).ok).toBe(true);
  });

  it('refuse un chevauchement et donne les cases en conflit', () => {
    // Les pieds du bureau (ligne 16) tomberaient sur ceux de l'étagère (ligne 16, colonnes 0 à 3).
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 7 }];
    const res = canPlace(layout, 24, 'desk', 3, 12);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('taken');
      expect(res.cells.length).toBeGreaterThan(0);
    }
  });

  it('ignore le meuble déplacé', () => {
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 7 }];
    expect(canPlace(layout, 24, 'shelf', 1, 7, 'f1').ok).toBe(true);
  });
});

describe('pose, déplacement, retrait', () => {
  it('pose puis déplace un meuble', () => {
    const placed = placeStanding([], 24, 'desk', 2, 11, 'f1');
    expect(placed).toEqual([{ id: 'f1', kind: 'desk', col: 2, row: 11 }]);
    const moved = moveStanding(placed!, 24, 'f1', 10, 11);
    expect(moved).toEqual([{ id: 'f1', kind: 'desk', col: 10, row: 11 }]);
  });

  it('refuse un déplacement invalide', () => {
    const layout = placeStanding([], 24, 'desk', 2, 11, 'f1')!;
    expect(moveStanding(layout, 24, 'f1', 2, 5)).toBeNull();
  });

  it('ne pose un ordinateur que sur un bureau libre', () => {
    const layout = placeStanding([], 24, 'desk', 2, 11, 'f1')!;
    expect(canPlaceComputer(layout, 'inconnu')).toBe(false);
    const withPc = placeComputer(layout, 'f1', 'f2')!;
    expect(withPc).toHaveLength(2);
    expect(canPlaceComputer(withPc, 'f1')).toBe(false);
    expect(placeComputer(withPc, 'f1', 'f3')).toBeNull();
  });

  it("ne pose pas un ordinateur sur une étagère", () => {
    const layout = placeStanding([], 24, 'shelf', 2, 7, 'f1')!;
    expect(canPlaceComputer(layout, 'f1')).toBe(false);
  });

  it('déplace un ordinateur vers un autre bureau', () => {
    let layout = placeStanding([], 24, 'desk', 0, 11, 'f1')!;
    layout = placeStanding(layout, 24, 'desk', 10, 11, 'f2')!;
    layout = placeComputer(layout, 'f1', 'f3')!;
    const moved = moveComputer(layout, 'f3', 'f2');
    expect(moved?.find((p) => p.id === 'f3')).toEqual({ id: 'f3', kind: 'computer', deskId: 'f2' });
  });

  it("retire un bureau avec l'ordinateur qui y est posé", () => {
    let layout = placeStanding([], 24, 'desk', 0, 11, 'f1')!;
    layout = placeComputer(layout, 'f1', 'f2')!;
    expect(removeFurniture(layout, 'f1')).toEqual([]);
  });
});

describe('décalage et zones de bord', () => {
  it("décale les meubles au sol et laisse l'ordinateur suivre son bureau", () => {
    let layout = placeStanding([], 24, 'desk', 2, 11, 'f1')!;
    layout = placeComputer(layout, 'f1', 'f2')!;
    expect(shiftLayout(layout, 12)).toEqual([
      { id: 'f1', kind: 'desk', col: 14, row: 11 },
      { id: 'f2', kind: 'computer', deskId: 'f1' },
    ]);
  });

  it('dit si la zone du bord est vide', () => {
    const layout = placeStanding([], 24, 'desk', 2, 11, 'f1')!;
    expect(sectionIsEmpty(layout, 24, 'left')).toBe(false);
    expect(sectionIsEmpty(layout, 24, 'right')).toBe(true);
    const both = placeStanding(layout, 24, 'shelf', 18, 7, 'f2')!;
    expect(sectionIsEmpty(both, 24, 'right')).toBe(false);
  });

  it('compte un meuble à cheval sur la frontière comme occupant la zone', () => {
    const layout = placeStanding([], 36, 'desk', 10, 11, 'f1')!;
    expect(sectionIsEmpty(layout, 36, 'left')).toBe(false);
  });
});

describe('rectangles en pixels', () => {
  it('convertit un meuble en pixels', () => {
    const rect = rectOf({ id: 'f1', kind: 'desk', col: 2, row: 11 })!;
    expect(rect).toEqual({ col: 2, row: 11, w: 6, h: 5 });
    expect(pxRect(rect)).toMatchObject({ x: 60, w: 180 });
  });
});

describe('largeur adaptée à l écran', () => {
  it('compte les colonnes qui remplissent l écran à la hauteur de la pièce', () => {
    expect(screenCols(2400, 1080)).toBe(38); // 20:9
    expect(screenCols(1920, 1080)).toBe(30); // 16:9
    expect(screenCols(1000, 1000)).toBe(MIN_COLS);
    expect(screenCols(10000, 1000)).toBe(MAX_COLS);
    expect(screenCols(0, 0)).toBe(MIN_COLS);
  });

  it('sait si aucun meuble ne dépasse une largeur', () => {
    const layout: Layout = [{ id: 'w1', kind: 'window', col: 30, row: 0, w: 8, h: 5 }];
    expect(fitsWithin(layout, 38)).toBe(true);
    expect(fitsWithin(layout, 37)).toBe(false);
    expect(fitsWithin([], 24)).toBe(true);
  });
});

describe('meuble à socle (lampadaire arc tourné)', () => {
  it('l’ordre de dessin suit la rangée des pieds, pas le bas du rectangle', () => {
    const lamp: Layout[number] = { id: 'l', kind: 'arc-lamp', col: 10, row: 4, angle: 6 };
    const foot = footBottom(lamp as never);
    expect(foot).toBeLessThan(4 + drawSize('arc-lamp', 6).h); // le dôme déborde devant le socle
    // Fauteuil dont les pieds sont juste devant le socle, mais au-dessus du bas du rectangle du lampadaire.
    const chair: Layout[number] = { id: 'a', kind: 'armchair', col: 11, row: foot + 1 - drawSize('armchair', 0).h };
    expect(byDrawOrder([lamp, chair], [lamp, chair] as never[]).map((p) => (p as { id: string }).id)).toEqual(['l', 'a']);
  });
  it('sans socle, la rangée des pieds est le bas du rectangle', () => {
    const sofa: Layout[number] = { id: 's', kind: 'sofa', col: 2, row: 10 };
    expect(footBottom(sofa as never)).toBe(10 + drawSize('sofa', 0).h);
  });
  it('zone de toucher : le socle seulement pour un meuble à socle, tout le rectangle sinon', () => {
    const lamp = { id: 'l', kind: 'arc-lamp', col: 10, row: 7 } as never;
    const full = pxRect(rectOf(lamp)!);
    const hit = hitRectOf(lamp);
    expect(hit.w).toBeLessThan(full.w / 2);
    expect(hit.y + hit.h).toBeCloseTo(full.y + full.h, 5);
    // perspective G6 : sans socle, le cadre englobant du dessin (était tout le rectangle) ; il contient chaque coin de chaque pièce.
    const sofa = { id: 's', kind: 'sofa', col: 2, row: 10 } as never;
    const r = pxRect(rectOf(sofa)!);
    const sh = hitRectOf(sofa);
    expect(sh.y).toBeGreaterThan(r.y);
    expect(sh.y + sh.h).toBeLessThanOrEqual(r.y + r.h + 1e-6);
    const m = FURNITURE_MODELS.sofa;
    for (const [x0, x1, y0, y1, z0, z1] of m.pieces.map(pieceBounds)) for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
      const [px, py] = projectOf(m, 0, [x, y, z]);
      expect(r.x + px).toBeGreaterThanOrEqual(sh.x - 1e-6); expect(r.x + px).toBeLessThanOrEqual(sh.x + sh.w + 1e-6);
      expect(r.y + py).toBeGreaterThanOrEqual(sh.y - 1e-6); expect(r.y + py).toBeLessThanOrEqual(sh.y + sh.h + 1e-6);
    }
  });
});

describe('surplomb d’un meuble à socle', () => {
  it('le lampadaire arc : arc et dôme en surplomb, socle et tige non', () => {
    const m = FURNITURE_MODELS['arc-lamp'];
    const over = overhangOf(m)!;
    expect(over).not.toBeNull();
    const dome = m.pieces.findIndex((q) => q.shape === 'cyl' && q.fill === 'metal' && q.cx === 19);
    const socle = m.pieces.findIndex((q) => q.shape === 'cyl' && q.cx === 149 && q.y === 0);
    expect(over.pieces.has(dome)).toBe(true);
    expect(over.pieces.has(socle)).toBe(false);
    expect(overhangOf(FURNITURE_MODELS.sofa)).toBeNull();
  });
  it('de face, le point du sol sous le dôme est sur la rangée du socle', () => {
    const lamp = { id: 'l', kind: 'arc-lamp', col: 10, row: 7 } as never;
    expect(overhangRow(lamp)).toBe(footBottom(lamp) - 1);
  });
});
