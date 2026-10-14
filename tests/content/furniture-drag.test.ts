import { describe, expect, it } from 'vitest';
import { deskAtCell, dropTargetFor, hostAtCell, pointerToCell } from '../../src/content/furniture-drag';
import type { Layout } from '../../src/core/library/library-types';
import { CELL_H, CELL_W, HEIGHT, boardAt, shelfBoardsOf, shelfLayoutOf } from '../../src/core/library/room-grid';

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

  it('suit le doigt par demi-colonnes (les lignes restent entières)', () => {
    const rect = { left: 0, top: 0, width: COLS * CELL_W, height: HEIGHT };
    expect(pointerToCell(rect, COLS * CELL_W, HEIGHT, 2.5 * CELL_W + 1, 5.6 * CELL_H)).toMatchObject({ col: 2.5, row: 5 });
    expect(pointerToCell(rect, COLS * CELL_W, HEIGHT, 2.5 * CELL_W - 1, 5 * CELL_H)).toMatchObject({ col: 2 });
  });

  it('tient compte de l’échelle (svg plus large que son contenu)', () => {
    const rect = { left: 0, top: 0, width: 2 * COLS * CELL_W, height: 2 * HEIGHT };
    const p = pointerToCell(rect, COLS * CELL_W, HEIGHT, 2 * 65, 2 * 5 * CELL_H + 2);
    expect(p).toMatchObject({ col: 2, row: 5, x: 65 });
  });

  it('donne des cases négatives hors de la pièce', () => {
    const rect = { left: 0, top: 0, width: COLS * CELL_W, height: HEIGHT };
    expect(pointerToCell(rect, COLS * CELL_W, HEIGHT, -20, -5)).toMatchObject({ col: -1, row: -1 });
  });
});

describe('deskAtCell', () => {
  const layout: Layout = [desk('f1', 2, 11), { id: 'f2', kind: 'shelf', col: 8, row: 7 }];
  it('trouve le bureau qui contient la case', () => {
    expect(deskAtCell(layout, 3, 12)).toBe('f1');
  });
  it('ignore les cases hors bureau et les autres meubles', () => {
    // Bureau de 6 colonnes (2 à 7) : la colonne 8 est déjà hors du bureau.
    expect(deskAtCell(layout, 8, 12)).toBeNull();
    expect(deskAtCell(layout, 8, 8)).toBeNull();
  });
});

describe('dropTargetFor', () => {
  it('un objet accroché se vise comme un meuble (coin bas gauche) et refuse le sol', () => {
    const layout: Layout = [{ id: 'f1', kind: 'wall', shape: 'poster', col: 2, row: 4, slug: 'A' }];
    expect(dropTargetFor(layout, COLS, 'f1', 6, 7)).toMatchObject({ ok: true, col: 6, top: 4 });
    expect(dropTargetFor(layout, COLS, 'f1', 6, 13)).toMatchObject({ ok: false, reason: 'wall' });
  });

  it('un objet rangé vise un rang de tablette ; une tablette pleine est refusée', () => {
    const layout: Layout = [
      { id: 'f1', kind: 'shelf', col: 0, row: 7 },
      { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', level: 0, order: 0, slug: 'A' },
      { id: 'f3', kind: 'stored', shape: 'dvd', shelfId: 'f1', level: 0, order: 1, slug: 'B' },
      ...[0, 1, 2, 3, 4].map((i) => ({ id: `g${i}`, kind: 'stored', shape: 'cd', shelfId: 'f1', level: 1, order: i, slug: `G${i}` }) as const),
    ];
    const boards = shelfBoardsOf(layout[0]!);
    const at = (level: number, fx: number) => ({ x: boards[level]!.x + boards[level]!.w * fx, y: boards[level]!.y + boards[level]!.h / 2 });
    // Au bout de la tablette du haut : après le DVD (f2 écarté du calcul, il est déplacé).
    const end = dropTargetFor(layout, COLS, 'f2', 0, 7, at(0, 0.9).x, at(0, 0.9).y);
    expect(end).toMatchObject({ ok: true, shelfId: 'f1', level: 0, order: 1 });
    // Le fantôme est sa place une fois rangé à ce rang.
    const moved = shelfLayoutOf(layout.map((p) => (p.id === 'f2' ? { ...p, order: 2 } : p)), 'f1').find((b) => b.id === 'f2')!;
    expect(end.ghostPx!.x).toBeCloseTo(moved.x, 6);
    expect(dropTargetFor(layout, COLS, 'f2', 0, 7, at(0, 0.02).x, at(0, 0.02).y)).toMatchObject({ ok: true, level: 0, order: 0 });
    // Tablette du milieu : 5 CD de face (74 cm), plus de place.
    const full = dropTargetFor(layout, COLS, 'f2', 0, 7, at(1, 0.5).x, at(1, 0.5).y);
    expect(full).toMatchObject({ ok: false, reason: 'shelf-full', shelfId: 'f1', level: 1 });
    // Empreinte rouge : au bout de la tablette, après les 5 CD (elle déborde de la face).
    const last = shelfLayoutOf(layout, 'f1').find((b) => b.id === 'g4')!;
    expect(full.ghostPx!.x).toBeGreaterThanOrEqual(last.x + last.w - 1e-6);
    expect(dropTargetFor(layout, COLS, 'f2', 20, 4, 20 * CELL_W, 4 * CELL_H)).toMatchObject({ ok: false, reason: 'not-slot' });
  });

  it('meuble debout : la case visée est le bas à gauche', () => {
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 7 }];
    // Étagère de 10 rangées : bas en ligne 16 → haut en ligne 7.
    const t = dropTargetFor(layout, COLS, 'f1', 5, 16);
    expect(t.ok).toBe(true);
    expect(t.col).toBe(5);
    expect(t.top).toBe(7);
    expect(t.ghost).toMatchObject({ col: 5, row: 7 });
  });

  it('ignore le meuble lui-même (rester sur place est valide)', () => {
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 7 }];
    expect(dropTargetFor(layout, COLS, 'f1', 0, 16).ok).toBe(true);
  });

  it('refuse sur le mur, hors pièce et sur le pied d’un autre meuble, accepte devant ou derrière lui', () => {
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 7 }, desk('f2', 10, 11)];
    expect(dropTargetFor(layout, COLS, 'f1', 5, 10)).toMatchObject({ ok: false, reason: 'floor' });
    expect(dropTargetFor(layout, COLS, 'f1', -2, 16)).toMatchObject({ ok: false, reason: 'bounds' });
    // Pied sur la même ligne que celui du bureau (ligne 15) : refusé ; pied plus bas, l'étagère passe devant.
    expect(dropTargetFor(layout, COLS, 'f1', 10, 15)).toMatchObject({ ok: false, reason: 'taken' });
    expect(dropTargetFor(layout, COLS, 'f1', 10, 16).ok).toBe(true);
  });

  it('ordinateur : valide sur un bureau libre, refusé ailleurs ou sur un bureau occupé', () => {
    const layout: Layout = [desk('f1', 2, 11), desk('f2', 8, 11), { id: 'f3', kind: 'computer', deskId: 'f1' }, { id: 'f4', kind: 'computer', deskId: 'f2' }];
    expect(dropTargetFor(layout, COLS, 'f3', 8, 12)).toMatchObject({ ok: false, reason: 'desk-busy' });
    expect(dropTargetFor(layout, COLS, 'f3', 15, 12)).toMatchObject({ ok: false, reason: 'not-desk' });
    expect(dropTargetFor(layout, COLS, 'f3', 2, 12)).toMatchObject({ ok: true, deskId: 'f1' });
    const free: Layout = [desk('f1', 2, 11), desk('f2', 8, 11), { id: 'f3', kind: 'computer', deskId: 'f1' }];
    expect(dropTargetFor(free, COLS, 'f3', 8, 12)).toMatchObject({ ok: true, deskId: 'f2' });
  });

  it('meuble inconnu : refusé sans rien proposer', () => {
    expect(dropTargetFor([], COLS, 'zz', 1, 4)).toMatchObject({ ok: false, ghost: null });
  });
});

describe('porteurs superposés : le lâcher vise celui de devant', () => {
  // Étagère au niveau 1 (listée d'abord) et bureau au niveau 2 devant elle, sur les mêmes cases (même bas, ligne 15).
  const layout: Layout = [
    { id: 'sh', kind: 'shelf', col: 0, row: 6 },
    { id: 'dk', kind: 'desk', col: 0, row: 11 },
    { id: 'far', kind: 'desk', col: 15, row: 11 },
    { id: 'o', kind: 'small', item: 'plant', hostId: 'far', slot: 0 },
  ];
  it('un petit objet lâché sur les cases communes va sur le bureau de devant', () => {
    expect(hostAtCell(layout, 1, 12)).toBe('dk');
    expect(dropTargetFor(layout, COLS, 'o', 1, 12)).toMatchObject({ ok: true, hostId: 'dk' });
  });
  it('deux bureaux superposés : l’ordinateur vise celui de devant', () => {
    const desks: Layout = [{ id: 'mid', kind: 'desk', col: 0, row: 11 }, { id: 'front', kind: 'desk', col: 0, row: 11, depth: 3 }];
    expect(deskAtCell(desks, 1, 12)).toBe('front');
  });
  it('deux étagères superposées : la carte rangée vise celle de devant', () => {
    const shelves: Layout = [{ id: 'wall', kind: 'shelf', col: 0, row: 7 }, { id: 'front', kind: 'shelf', col: 0, row: 7, depth: 2 }];
    const board = shelfBoardsOf(shelves[0]!)[0]!;
    expect(boardAt(shelves, board.x + 2, board.y + 2)).toMatchObject({ shelfId: 'front', level: 0 });
  });
});
