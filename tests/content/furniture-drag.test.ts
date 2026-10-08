import { describe, expect, it } from 'vitest';
import { deskAtCell, dropTargetFor, pointerToCell } from '../../src/content/furniture-drag';
import type { Layout } from '../../src/core/library/library-types';
import { CELL_H, CELL_W, HEIGHT, pxRect, shelfSlots } from '../../src/core/library/room-grid';

const COLS = 24;
const desk = (id: string, col: number, row: number) => ({ id, kind: 'desk' as const, col, row });

describe('pointerToCell', () => {
  it('convertit un point de l’écran en case, avec un cadre à l’échelle 1', () => {
    const rect = { left: 100, top: 50, width: COLS * CELL_W, height: HEIGHT };
    const p = pointerToCell(rect, COLS * CELL_W, HEIGHT, 100 + 65, 50 + 5 * CELL_H + 1);
    expect(p.col).toBe(2);
    expect(p.row).toBe(5);
    expect(p.x).toBe(65);
  });

  it('tient compte de l’échelle (svg plus large que son contenu)', () => {
    const rect = { left: 0, top: 0, width: 2 * COLS * CELL_W, height: 2 * HEIGHT };
    const p = pointerToCell(rect, COLS * CELL_W, HEIGHT, 2 * 65, 2 * 5 * CELL_H + 2);
    expect(p).toMatchObject({ col: 2, row: 5, x: 65 });
  });

  it('donne des cases négatives hors de la pièce', () => {
    const rect = { left: 0, top: 0, width: COLS * CELL_W, height: HEIGHT };
    expect(pointerToCell(rect, COLS * CELL_W, HEIGHT, -5, -5)).toMatchObject({ col: -1, row: -1 });
  });
});

describe('deskAtCell', () => {
  const layout: Layout = [desk('f1', 2, 8), { id: 'f2', kind: 'shelf', col: 8, row: 4 }];
  it('trouve le bureau qui contient la case', () => {
    expect(deskAtCell(layout, 3, 9)).toBe('f1');
  });
  it('ignore les cases hors bureau et les autres meubles', () => {
    expect(deskAtCell(layout, 7, 9)).toBeNull();
    expect(deskAtCell(layout, 8, 5)).toBeNull();
  });
});

describe('dropTargetFor', () => {
  it('un objet accroché se vise comme un meuble (coin bas gauche) et refuse le sol', () => {
    const layout: Layout = [{ id: 'f1', kind: 'wall', shape: 'poster', col: 2, row: 1, slug: 'A' }];
    expect(dropTargetFor(layout, COLS, 'f1', 6, 4)).toMatchObject({ ok: true, col: 6, top: 1 });
    expect(dropTargetFor(layout, COLS, 'f1', 6, 10)).toMatchObject({ ok: false, reason: 'wall' });
  });

  it('un objet rangé vise un emplacement libre, pas un emplacement occupé', () => {
    const layout: Layout = [
      { id: 'f1', kind: 'shelf', col: 0, row: 4 },
      { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'A' },
      { id: 'f3', kind: 'stored', shape: 'dvd', shelfId: 'f1', slot: 1, slug: 'B' },
    ];
    const slots = shelfSlots(pxRect({ col: 0, row: 4, w: 6, h: 8 }));
    const center = (i: number) => ({ x: slots[i]!.x + slots[i]!.w / 2, y: slots[i]!.y + slots[i]!.h / 2 });
    const busy = dropTargetFor(layout, COLS, 'f2', 0, 4, center(1).x, center(1).y);
    expect(busy).toMatchObject({ ok: false, reason: 'slot-busy' });
    const free = dropTargetFor(layout, COLS, 'f2', 0, 4, center(2).x, center(2).y);
    expect(free).toMatchObject({ ok: true, shelfId: 'f1', slot: 2, ghostPx: slots[2] });
    expect(dropTargetFor(layout, COLS, 'f2', 0, 4, center(0).x, center(0).y)).toMatchObject({ ok: true, slot: 0 });
    expect(dropTargetFor(layout, COLS, 'f2', 20, 1, 20 * CELL_W, 1 * CELL_H)).toMatchObject({ ok: false, reason: 'not-slot' });
  });

  it('meuble debout : la case visée est le bas à gauche', () => {
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 4 }];
    const t = dropTargetFor(layout, COLS, 'f1', 5, 11);
    expect(t.ok).toBe(true);
    expect(t.col).toBe(5);
    expect(t.top).toBe(4);
    expect(t.ghost).toMatchObject({ col: 5, row: 4 });
  });

  it('ignore le meuble lui-même (rester sur place est valide)', () => {
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 4 }];
    expect(dropTargetFor(layout, COLS, 'f1', 0, 11).ok).toBe(true);
  });

  it('refuse sur le mur, hors pièce et sur un autre meuble', () => {
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 4 }, desk('f2', 10, 8)];
    expect(dropTargetFor(layout, COLS, 'f1', 5, 7)).toMatchObject({ ok: false, reason: 'floor' });
    expect(dropTargetFor(layout, COLS, 'f1', -2, 11)).toMatchObject({ ok: false, reason: 'bounds' });
    const clash = dropTargetFor(layout, COLS, 'f1', 10, 11);
    expect(clash).toMatchObject({ ok: false, reason: 'taken' });
    expect(clash.cells.length).toBeGreaterThan(0);
  });

  it('ordinateur : valide sur un bureau libre, refusé ailleurs ou sur un bureau occupé', () => {
    const layout: Layout = [desk('f1', 2, 8), desk('f2', 8, 8), { id: 'f3', kind: 'computer', deskId: 'f1' }, { id: 'f4', kind: 'computer', deskId: 'f2' }];
    expect(dropTargetFor(layout, COLS, 'f3', 8, 9)).toMatchObject({ ok: false, reason: 'desk-busy' });
    expect(dropTargetFor(layout, COLS, 'f3', 15, 9)).toMatchObject({ ok: false, reason: 'not-desk' });
    expect(dropTargetFor(layout, COLS, 'f3', 2, 9)).toMatchObject({ ok: true, deskId: 'f1' });
    const free: Layout = [desk('f1', 2, 8), desk('f2', 8, 8), { id: 'f3', kind: 'computer', deskId: 'f1' }];
    expect(dropTargetFor(free, COLS, 'f3', 8, 9)).toMatchObject({ ok: true, deskId: 'f2' });
  });

  it('meuble inconnu : refusé sans rien proposer', () => {
    expect(dropTargetFor([], COLS, 'zz', 1, 1)).toMatchObject({ ok: false, ghost: null });
  });
});
