import { describe, expect, it } from 'vitest';
import { WALL_SHAPES, wallSizeOf } from '../../../src/core/library/furniture-catalog';
import { WALL_ROWS, boardAt, canHang, firstFreeBoard, hang, moveComputer, moveHung, moveStored, shelfBoardsOf, placeComputer, placeStanding, placedSlugs, removeFurniture, sectionIsEmpty, setScreenCard, shiftLayout, storeCard, unplaceCard } from '../../../src/core/library/room-grid';

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
    const layout = hang([], 24, 'poster', 2, 4, 'Paris', 'f1');
    expect(layout).toEqual([{ id: 'f1', kind: 'wall', shape: 'poster', col: 2, row: 4, slug: 'Paris' }]);
  });

  it('refuse ce qui dépasse sur le sol', () => {
    const r = canHang([], 24, 'poster', 2, 9);
    expect(r).toMatchObject({ ok: false, reason: 'wall' });
  });

  it('refuse hors de la pièce', () => {
    expect(canHang([], 24, 'poster', 22, 4)).toMatchObject({ ok: false, reason: 'bounds' });
  });

  it('refuse sur un autre objet accroché', () => {
    const layout = hang([], 24, 'poster', 2, 4, 'A', 'f1')!;
    expect(canHang(layout, 24, 'vinyl', 3, 5)).toMatchObject({ ok: false, reason: 'taken' });
  });

  it('accepte derrière une étagère (niveau 0, le mur)', () => {
    const layout = placeStanding([], 24, 'shelf', 2, 7, 'f1')!;
    expect(canHang(layout, 24, 'vinyl', 2, 4).ok).toBe(true);
    expect(canHang(layout, 24, 'vinyl', 2, 6).ok).toBe(true);
  });

  it('un meuble se pose devant un objet accroché (niveaux différents)', () => {
    const layout = hang([], 24, 'poster', 2, 8, 'A', 'f1')!;
    expect(placeStanding(layout, 24, 'shelf', 2, 7, 'f2')).not.toBeNull();
  });

  it('se déplace, sans se bloquer lui-même', () => {
    const layout = hang([], 24, 'poster', 2, 4, 'A', 'f1')!;
    expect(moveHung(layout, 24, 'f1', 3, 4)).toEqual([{ id: 'f1', kind: 'wall', shape: 'poster', col: 3, row: 4, slug: 'A' }]);
  });

  it('suit le décalage vers la gauche et compte pour la zone du bord', () => {
    const layout = hang([], 24, 'poster', 2, 4, 'A', 'f1')!;
    expect(shiftLayout(layout, 12)[0]).toMatchObject({ col: 14 });
    expect(sectionIsEmpty(layout, 24, 'left')).toBe(false);
  });
});

describe('refus de déplacement et couleur', () => {
  it('moveHung refuse une cible bloquée ou hors du mur', () => {
    const a = hang([], 24, 'poster', 2, 4, 'A', 'f1')!;
    const two = hang(a, 24, 'poster', 8, 4, 'B', 'f2')!;
    expect(moveHung(two, 24, 'f1', 8, 4)).toBeNull();
    expect(moveHung(two, 24, 'f1', 2, 99)).toBeNull();
  });

  it('hang conserve la couleur fournie', () => {
    const layout = hang([], 24, 'poster', 2, 4, 'A', 'f1', 'red')!;
    expect(layout[0]).toMatchObject({ color: 'red' });
  });

  it('hang refuse une carte déjà posée', () => {
    const a = hang([], 24, 'poster', 2, 4, 'A', 'f1')!;
    expect(hang(a, 24, 'poster', 8, 4, 'A', 'f2')).toBeNull();
  });
});

describe('étagère et écran', () => {
  const shelf = placeStanding([], 24, 'shelf', 0, 7, 'f1')!;

  it('range sur la première tablette libre, à la suite', () => {
    expect(firstFreeBoard(shelf, 'f1', { shape: 'cd' })).toEqual({ level: 0, order: 0 });
    const a = storeCard(shelf, 'f1', 0, 0, 'cd', 'A', 'f2')!;
    expect(firstFreeBoard(a, 'f1', { shape: 'cd' })).toEqual({ level: 0, order: 1 });
  });

  it('refuse une tablette hors bornes, hors étagère ou une carte déjà posée', () => {
    const a = storeCard(shelf, 'f1', 0, 0, 'cd', 'A', 'f2')!;
    expect(storeCard(a, 'f1', 3 as 0, 0, 'dvd', 'B', 'f3')).toBeNull();
    expect(storeCard(a, 'zz', 0, 1, 'dvd', 'B', 'f3')).toBeNull();
    expect(storeCard(a, 'f1', 0, 1, 'dvd', 'A', 'f3')).toBeNull();
  });

  it('renvoie null quand l’étagère est pleine', () => {
    let layout = shelf;
    // 5 DVD de face par tablette : 5 × (13,5 + 1) = 72,5 cm ; il reste 1,5 cm, trop peu même pour un CD sur la tranche (2 cm).
    for (let i = 0; i < 15; i++) layout = storeCard(layout, 'f1', Math.floor(i / 5) as 0, i % 5, 'dvd', `C${i}`, `s${i}`)!;
    expect(firstFreeBoard(layout, 'f1', { shape: 'dvd' })).toBeNull();
    expect(firstFreeBoard(layout, 'f1', { shape: 'cd', display: 'spine' })).toBeNull();
  });

  it('retirer l’étagère retire ses objets', () => {
    const a = storeCard(shelf, 'f1', 0, 0, 'cd', 'A', 'f2')!;
    expect(removeFurniture(a, 'f1')).toEqual([]);
  });

  it('affiche une carte à l’écran, une seule fois', () => {
    const desk = placeStanding([], 24, 'desk', 8, 11, 'f1')!;
    const withPc = placeComputer(desk, 'f1', 'f2')!;
    const shown = setScreenCard(withPc, 'f2', 'A')!;
    expect(placedSlugs(shown).has('A')).toBe(true);
    expect(setScreenCard(shown, 'f2', 'B')).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'B' })]));
    expect(unplaceCard(shown, 'f2')[1]).toEqual({ id: 'f2', kind: 'computer', deskId: 'f1' });
  });
});

describe('déplacer un objet rangé', () => {
  const shelf = placeStanding([], 24, 'shelf', 0, 7, 'f1')!;
  const a = storeCard(shelf, 'f1', 0, 0, 'cd', 'A', 'f2')!;

  it('change de tablette', () => {
    expect(moveStored(a, 'f2', 'f1', 1, 0)![1]).toMatchObject({ id: 'f2', level: 1, order: 0, shelfId: 'f1' });
  });
  it('refuse un objet non rangé, une étagère inconnue et une tablette hors bornes', () => {
    expect(moveStored(a, 'f1', 'f1', 1, 0)).toBeNull();
    expect(moveStored(a, 'f2', 'zz', 1, 0)).toBeNull();
    expect(moveStored(a, 'f2', 'f1', 3 as 0, 0)).toBeNull();
    expect(moveStored(a, 'f2', 'f1', -1 as 0, 0)).toBeNull();
  });
  it('passe d’une étagère à l’autre', () => {
    const two = placeStanding(a, 24, 'shelf', 8, 7, 'f9')!;
    expect(moveStored(two, 'f2', 'f9', 0, 3)!.find((p) => p.id === 'f2')).toMatchObject({ shelfId: 'f9', level: 0, order: 0 });
  });
  it('retrouve la tablette sous un point', () => {
    const board = shelfBoardsOf(shelf[0]!)[2]!;
    expect(boardAt(shelf, board.x + 2, board.y + 2)).toMatchObject({ shelfId: 'f1', level: 2 });
    expect(boardAt(shelf, 500, 5)).toBeNull();
  });
});

describe('déplacer un ordinateur avec sa carte', () => {
  it('garde la carte affichée en changeant de bureau', () => {
    const desks = placeStanding(placeStanding([], 24, 'desk', 0, 11, 'd1')!, 24, 'desk', 10, 11, 'd2')!;
    const shown = setScreenCard(placeComputer(desks, 'd1', 'pc')!, 'pc', 'A')!;
    const moved = moveComputer(shown, 'pc', 'd2')!;
    expect(moved.find((p) => p.id === 'pc')).toMatchObject({ deskId: 'd2', slug: 'A' });
  });
});
