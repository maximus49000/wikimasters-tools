import { describe, expect, it } from 'vitest';
import { WALL_SHAPES, wallSizeOf } from '../../../src/core/library/furniture-catalog';
import { WALL_ROWS, canHang, firstFreeSlot, hang, moveComputer, moveHung, moveStored, pxRect, rectOf, shelfSlots, slotAt, placeComputer, placeStanding, placedSlugs, removeFurniture, sectionIsEmpty, setScreenCard, shiftLayout, storeCard, unplaceCard } from '../../../src/core/library/room-grid';

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

describe('refus de déplacement et couleur', () => {
  it('moveHung refuse une cible bloquée ou hors du mur', () => {
    const a = hang([], 24, 'poster', 2, 1, 'A', 'f1')!;
    const two = hang(a, 24, 'poster', 8, 1, 'B', 'f2')!;
    expect(moveHung(two, 24, 'f1', 8, 1)).toBeNull();
    expect(moveHung(two, 24, 'f1', 2, 99)).toBeNull();
  });

  it('hang conserve la couleur fournie', () => {
    const layout = hang([], 24, 'poster', 2, 1, 'A', 'f1', 'red')!;
    expect(layout[0]).toMatchObject({ color: 'red' });
  });

  it('hang refuse une carte déjà posée', () => {
    const a = hang([], 24, 'poster', 2, 1, 'A', 'f1')!;
    expect(hang(a, 24, 'poster', 8, 1, 'A', 'f2')).toBeNull();
  });
});

describe('étagère et écran', () => {
  const shelf = placeStanding([], 24, 'shelf', 0, 4, 'f1')!;

  it('range dans le premier emplacement libre', () => {
    expect(firstFreeSlot(shelf, 'f1')).toBe(0);
    const a = storeCard(shelf, 'f1', 0, 'cd', 'A', 'f2')!;
    expect(firstFreeSlot(a, 'f1')).toBe(1);
  });

  it('refuse un emplacement occupé, hors étagère ou une carte déjà posée', () => {
    const a = storeCard(shelf, 'f1', 0, 'cd', 'A', 'f2')!;
    expect(storeCard(a, 'f1', 0, 'dvd', 'B', 'f3')).toBeNull();
    expect(storeCard(a, 'f1', 15, 'dvd', 'B', 'f3')).toBeNull();
    expect(storeCard(a, 'zz', 1, 'dvd', 'B', 'f3')).toBeNull();
    expect(storeCard(a, 'f1', 1, 'dvd', 'A', 'f3')).toBeNull();
  });

  it('renvoie null quand l’étagère est pleine', () => {
    let layout = shelf;
    for (let i = 0; i < 15; i++) layout = storeCard(layout, 'f1', i, 'book', `C${i}`, `s${i}`)!;
    expect(firstFreeSlot(layout, 'f1')).toBeNull();
  });

  it('retirer l’étagère retire ses objets', () => {
    const a = storeCard(shelf, 'f1', 0, 'cd', 'A', 'f2')!;
    expect(removeFurniture(a, 'f1')).toEqual([]);
  });

  it('affiche une carte à l’écran, une seule fois', () => {
    const desk = placeStanding([], 24, 'desk', 8, 8, 'f1')!;
    const withPc = placeComputer(desk, 'f1', 'f2')!;
    const shown = setScreenCard(withPc, 'f2', 'A')!;
    expect(placedSlugs(shown).has('A')).toBe(true);
    expect(setScreenCard(shown, 'f2', 'B')).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'B' })]));
    expect(unplaceCard(shown, 'f2')[1]).toEqual({ id: 'f2', kind: 'computer', deskId: 'f1' });
  });
});

describe('déplacer un objet rangé', () => {
  const shelf = placeStanding([], 24, 'shelf', 0, 4, 'f1')!;
  const a = storeCard(shelf, 'f1', 0, 'cd', 'A', 'f2')!;

  it('change d’emplacement', () => {
    expect(moveStored(a, 'f2', 'f1', 7)![1]).toMatchObject({ id: 'f2', slot: 7, shelfId: 'f1' });
  });
  it('refuse un emplacement occupé, accepte le sien', () => {
    const b = storeCard(a, 'f1', 1, 'dvd', 'B', 'f3')!;
    expect(moveStored(b, 'f2', 'f1', 1)).toBeNull();
    expect(moveStored(b, 'f2', 'f1', 0)).not.toBeNull();
  });
  it('refuse un objet non rangé, une étagère inconnue et un emplacement hors limites', () => {
    expect(moveStored(a, 'f1', 'f1', 3)).toBeNull();
    expect(moveStored(a, 'f2', 'zz', 3)).toBeNull();
    expect(moveStored(a, 'f2', 'f1', 15)).toBeNull();
    expect(moveStored(a, 'f2', 'f1', -1)).toBeNull();
  });
  it('passe d’une étagère à l’autre', () => {
    const two = placeStanding(a, 24, 'shelf', 8, 4, 'f9')!;
    expect(moveStored(two, 'f2', 'f9', 3)!.find((p) => p.id === 'f2')).toMatchObject({ shelfId: 'f9', slot: 3 });
  });
  it('retrouve l’emplacement sous un point', () => {
    const slot = shelfSlots(pxRect(rectOf(shelf[0]!)!))[4]!;
    expect(slotAt(shelf, slot.x + 2, slot.y + 2)).toEqual({ shelfId: 'f1', slot: 4 });
    expect(slotAt(shelf, 500, 5)).toBeNull();
  });
});

describe('déplacer un ordinateur avec sa carte', () => {
  it('garde la carte affichée en changeant de bureau', () => {
    const desks = placeStanding(placeStanding([], 24, 'desk', 0, 8, 'd1')!, 24, 'desk', 10, 8, 'd2')!;
    const shown = setScreenCard(placeComputer(desks, 'd1', 'pc')!, 'pc', 'A')!;
    const moved = moveComputer(shown, 'pc', 'd2')!;
    expect(moved.find((p) => p.id === 'pc')).toMatchObject({ deskId: 'd2', slug: 'A' });
  });
});
