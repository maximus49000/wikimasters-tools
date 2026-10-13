import { describe, expect, it } from 'vitest';
import { nextFurnitureId } from '../../src/core/library/library-book';
import type { Layout } from '../../src/core/library/library-types';
import { hang, moveStanding, placeComputer, placeSmall, placeStanding, placeWindow, setScreenCard, storeCard } from '../../src/core/library/room-grid';
import { DRAFT_ID, commitPlacement, editPlacement, movePlacement, moveToItem, placingView, spotAt, startPlacement } from '../../src/content/placement';

const COLS = 24;
const CENTER = spotAt(12, 15);
const desk: Layout = placeStanding([], COLS, 'desk', 2, 11, 'f1')!;

describe('startPlacement', () => {
  it('pose un meuble neuf à la place libre la plus proche du centre', () => {
    const p = startPlacement([], COLS, { type: 'new', kind: 'shelf' }, CENTER);
    expect(p.target.ok).toBe(true);
    expect(p.draft.some((x) => x.id === DRAFT_ID && x.kind === 'shelf')).toBe(true);
    const placed = p.draft.find((x) => x.id === DRAFT_ID)! as { col: number };
    expect(Math.abs(placed.col - 12)).toBeLessThanOrEqual(3);
  });

  it('sans aucune place, le fantôme est au centre et refusé', () => {
    const p = startPlacement([], COLS, { type: 'new', kind: 'computer' }, CENTER);
    expect(p.target.ok).toBe(false);
    expect(p.target.reason).toBe('not-desk');
    expect(commitPlacement(p)).toBeNull();
  });

  it('un objet déplacé part de sa place actuelle, valide', () => {
    const p = startPlacement(desk, COLS, { type: 'move', id: 'f1' }, CENTER);
    expect(p.target.ok).toBe(true);
    expect(p.draft).toEqual(desk);
  });

  it('un ordinateur neuf va sur le bureau libre', () => {
    const p = startPlacement(desk, COLS, { type: 'new', kind: 'computer' }, CENTER);
    expect(p.target).toMatchObject({ ok: true, deskId: 'f1' });
  });

  it('une carte d’écran vise un ordinateur', () => {
    const withPc = placeComputer(desk, 'f1', 'f2')!;
    const p = startPlacement(withPc, COLS, { type: 'card', choice: { target: 'screen', slug: 'Paris' } }, CENTER);
    expect(p.target).toMatchObject({ ok: true, computerId: 'f2' });
    expect(placingView(p).id).toBe('f2');
  });
});

describe('movePlacement', () => {
  it('donne la même raison que dropTargetFor sur le mur', () => {
    const p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'shelf' }, CENTER), COLS, spotAt(3, 8));
    expect(p.target).toMatchObject({ ok: false, reason: 'floor' });
    // Le fantôme est dessiné là où on l'a mis, même refusé.
    expect(p.draft.find((x) => x.id === DRAFT_ID)).toMatchObject({ col: 3 });
    expect(commitPlacement(p)).toBeNull();
  });

  it('hors de la pièce : refusé sans planter', () => {
    const p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'shelf' }, CENTER), COLS, spotAt(40, 15));
    expect(p.target.ok).toBe(false);
    expect(commitPlacement(p)).toBeNull();
  });

  it('un déplacement refusé ne change rien à la disposition de départ', () => {
    const p = movePlacement(startPlacement(desk, COLS, { type: 'move', id: 'f1' }, CENTER), COLS, spotAt(12, 8));
    expect(p.target.ok).toBe(false);
    expect(p.base).toEqual(desk);
  });
});

describe('commitPlacement : mêmes dispositions que les anciennes fonctions de pose', () => {
  const id = nextFurnitureId(desk);

  it('meuble debout', () => {
    const p = movePlacement(startPlacement(desk, COLS, { type: 'new', kind: 'shelf' }, CENTER), COLS, spotAt(14, 14));
    expect(commitPlacement(p)).toEqual(placeStanding(desk, COLS, 'shelf', p.target.col!, p.target.top!, id));
  });

  it('fenêtre', () => {
    const p = movePlacement(startPlacement(desk, COLS, { type: 'new', kind: 'window' }, CENTER), COLS, spotAt(12, 9));
    expect(commitPlacement(p)).toEqual(placeWindow(desk, COLS, p.target.col!, p.target.top!, id));
  });

  it('ordinateur', () => {
    const p = startPlacement(desk, COLS, { type: 'new', kind: 'computer' }, CENTER);
    expect(commitPlacement(p)).toEqual(placeComputer(desk, 'f1', id));
  });

  it('petit objet', () => {
    const p = startPlacement(desk, COLS, { type: 'new', kind: 'small-plant' }, CENTER);
    expect(commitPlacement(p)).toEqual(placeSmall(desk, 'f1', 'plant', id));
  });

  it('carte au mur', () => {
    const choice = { target: 'wall', shape: 'poster', slug: 'Paris' } as const;
    const p = movePlacement(startPlacement(desk, COLS, { type: 'card', choice }, CENTER), COLS, spotAt(14, 8));
    expect(commitPlacement(p)).toEqual(hang(desk, COLS, 'poster', p.target.col!, p.target.top!, 'Paris', id));
  });

  it('carte sur une étagère', () => {
    const shelf = placeStanding([], COLS, 'shelf', 2, 6, 'f1')!;
    const choice = { target: 'shelf', shape: 'book', slug: 'Paris' } as const;
    const p = startPlacement(shelf, COLS, { type: 'card', choice }, CENTER);
    expect(p.target.ok).toBe(true);
    expect(commitPlacement(p)).toEqual(storeCard(shelf, 'f1', p.target.slot!, 'book', 'Paris', nextFurnitureId(shelf)));
  });

  it('carte à l’écran', () => {
    const withPc = placeComputer(desk, 'f1', 'f2')!;
    const p = startPlacement(withPc, COLS, { type: 'card', choice: { target: 'screen', slug: 'Paris' } }, CENTER);
    expect(commitPlacement(p)).toEqual(setScreenCard(withPc, 'f2', 'Paris'));
  });

  it('déplacement', () => {
    const p = movePlacement(startPlacement(desk, COLS, { type: 'move', id: 'f1' }, CENTER), COLS, spotAt(12, 14));
    expect(commitPlacement(p)).toEqual(moveStanding(desk, COLS, 'f1', 12, 11));
  });

  it('toucher un bureau amène le petit objet dessus', () => {
    const two = placeStanding(desk, COLS, 'desk', 12, 11, 'f2')!;
    const p = moveToItem(startPlacement(two, COLS, { type: 'new', kind: 'small-plant' }, spotAt(3, 14)), COLS, 'f2');
    expect(p.target).toMatchObject({ ok: true, hostId: 'f2' });
  });
});

describe('retouches pendant le placement', () => {
  it('une lampe éteinte puis déplacée reste éteinte (pas de double bascule)', () => {
    let p = startPlacement([], COLS, { type: 'new', kind: 'lamp' }, CENTER);
    p = editPlacement(p, COLS, { type: 'lamp' })!;
    p = movePlacement(p, COLS, spotAt(5, 15));
    p = movePlacement(p, COLS, spotAt(8, 15));
    expect(commitPlacement(p)!.find((x) => x.kind === 'lamp')).toMatchObject({ lit: false });
  });

  it('une fenêtre agrandie puis déplacée garde sa taille', () => {
    let p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'window' }, CENTER), COLS, spotAt(4, 9));
    const before = p.draft.find((x) => x.id === DRAFT_ID) as { w: number; h: number };
    p = editPlacement(p, COLS, { type: 'size', w: before.w + 1, h: before.h })!;
    p = movePlacement(p, COLS, spotAt(14, 9));
    expect(commitPlacement(p)!.find((x) => x.kind === 'window')).toMatchObject({ w: before.w + 1, h: before.h });
  });

  it('la profondeur choisie est gardée au commit', () => {
    let p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'chair' }, CENTER), COLS, spotAt(10, 15));
    const next = editPlacement(p, COLS, { type: 'depth', delta: -1 });
    expect(next).not.toBeNull();
    p = next!;
    const committed = commitPlacement(p)!.find((x) => x.kind === 'chair') as { depth?: number };
    expect(committed.depth).toBeDefined();
  });

  it('une retouche impossible renvoie null', () => {
    const p = startPlacement([], COLS, { type: 'new', kind: 'computer' }, CENTER);
    expect(editPlacement(p, COLS, { type: 'lamp' })).toBeNull();
  });
});

describe('revue finale', () => {
  it('une fenêtre déjà posée, rétrécie puis déplacée contre le bord, est validée à sa nouvelle taille', () => {
    const base: Layout = [{ id: 'w1', kind: 'window', col: 2, row: 3, w: 6, h: 5 }];
    let p = startPlacement(base, COLS, { type: 'move', id: 'w1' }, CENTER);
    p = editPlacement(p, COLS, { type: 'size', w: 3, h: 5 })!;
    // Coin bas gauche en colonne 21 : 3 colonnes tiennent (21 à 23), 6 non.
    p = movePlacement(p, COLS, spotAt(21, 7));
    expect(p.target.ok).toBe(true);
    expect(commitPlacement(p)!.find((x) => x.id === 'w1')).toMatchObject({ col: 21, w: 3, h: 5 });
  });
});
