import { describe, expect, it } from 'vitest';
import { nextFurnitureId } from '../../src/core/library/library-book';
import type { Layout } from '../../src/core/library/library-types';
import { hang, moveStanding, placeComputer, placeSmall, placeStanding, placeWindow, setAngle, setScreenCard, storeCard } from '../../src/core/library/room-grid';
import { DRAFT_ID, canRotate, rotatePlacement, commitPlacement, displayOfPlacement, displayPlacement, editPlacement, movePlacement, moveToItem, nudgePlacement, placingView, slidePlacement, spotAt, startPlacement } from '../../src/content/placement';

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
    // Étagère de 10 rangées : bas en ligne 11 (sur le mur), haut en ligne 2.
    const p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'shelf' }, CENTER), COLS, spotAt(3, 11));
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
    expect(commitPlacement(p)).toEqual(storeCard(shelf, 'f1', p.target.level!, p.target.order!, 'book', 'Paris', nextFurnitureId(shelf)));
  });

  it('carte impossible à ranger sur une étagère de profil (angle 2) : face cachée', () => {
    const shelf = setAngle(placeStanding([], COLS, 'shelf', 2, 6, 'f1')!, 'f1', 2);
    const choice = { target: 'shelf', shape: 'book', slug: 'Paris' } as const;
    const p = startPlacement(shelf, COLS, { type: 'card', choice }, CENTER);
    expect(p.target.ok).toBe(false);
    expect(commitPlacement(p)).toBeNull();
    expect(moveToItem(p, COLS, 'f1').target.ok).toBe(false);
  });

  it('carte à l’écran', () => {
    const withPc = placeComputer(desk, 'f1', 'f2')!;
    const p = startPlacement(withPc, COLS, { type: 'card', choice: { target: 'screen', slug: 'Paris' } }, CENTER);
    expect(commitPlacement(p)).toEqual(setScreenCard(withPc, 'f2', 'Paris'));
  });

  it('déplacement', () => {
    // Bureau de 5 rangées : bas en ligne 15 → haut en ligne 11.
    const p = movePlacement(startPlacement(desk, COLS, { type: 'move', id: 'f1' }, CENTER), COLS, spotAt(12, 15));
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

  it('avancer / reculer déplace le fantôme d’une ligne, et refuse hors du sol', () => {
    let p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'chair' }, CENTER), COLS, spotAt(10, 15));
    p = nudgePlacement(p, COLS, 1)!;
    expect(commitPlacement(p)!.find((x) => x.kind === 'chair')).toMatchObject({ col: 10, row: 11 });
    // Chaise de 6 lignes, pied sur la dernière ligne : plus bas, elle sortirait de la pièce.
    p = nudgePlacement(p, COLS, 1)!;
    expect(nudgePlacement(p, COLS, 1)).toBeNull();
    p = nudgePlacement(p, COLS, -1)!;
    expect(commitPlacement(p)!.find((x) => x.kind === 'chair')).toMatchObject({ row: 11 });
  });

  it('◀ ▶ décalent le fantôme d’une demi-colonne, refusé en rouge sur un voisin', () => {
    let p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'chair' }, CENTER), COLS, spotAt(10, 15));
    p = slidePlacement(p, COLS, 1)!;
    expect(commitPlacement(p)!.find((x) => x.kind === 'chair')).toMatchObject({ col: 10.5 });
    p = slidePlacement(slidePlacement(p, COLS, -1)!, COLS, -1)!;
    expect(commitPlacement(p)!.find((x) => x.kind === 'chair')).toMatchObject({ col: 9.5 });
    // Contre une chaise déjà posée juste à droite : la demi-case de trop chevauche, le fantôme reste dessiné mais refusé.
    const base = placeStanding([], COLS, 'chair', 12, 12, 'c1')!;
    const right = (base[0] as { col: number }).col;
    let q = movePlacement(startPlacement(base, COLS, { type: 'new', kind: 'chair' }, CENTER), COLS, spotAt(right - 4, 15));
    let lastOk = q.target.col!;
    while (q.target.ok) {
      lastOk = q.target.col!;
      q = slidePlacement(q, COLS, 1)!;
    }
    expect(q.target.col).toBe(lastOk + 0.5);
    expect(placingView(q).ghost).not.toBeNull();
  });

  it('◀ ▶ ne s’appliquent pas à un objet porté (petit objet, carte rangée)', () => {
    const p = startPlacement(desk, COLS, { type: 'new', kind: 'computer' }, CENTER);
    expect(slidePlacement(p, COLS, 1)).toBeNull();
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

describe('rotation pendant le placement', () => {
  it('⟲ tourne d’un cran vers la gauche (+1), ⟳ vers la droite (−1)', () => {
    const p = startPlacement([], COLS, { type: 'new', kind: 'sofa' }, CENTER);
    expect(canRotate(p)).toBe(true);
    const left = rotatePlacement(p, COLS, 1)!;
    expect(left.angle).toBe(1);
    expect(left.draft.find((x) => x.id === DRAFT_ID)).toMatchObject({ angle: 1 });
    expect(rotatePlacement(p, COLS, -1)!.angle).toBe(7);
  });
  it('l’angle suit le fantôme quand on le déplace, et ✓ l’enregistre', () => {
    const p = rotatePlacement(startPlacement([], COLS, { type: 'new', kind: 'sofa' }, CENTER), COLS, 1)!;
    const moved = movePlacement(p, COLS, spotAt(4, 16));
    expect(moved.target.ok).toBe(true);
    expect(commitPlacement(moved)!.find((x) => x.kind === 'sofa')).toMatchObject({ angle: 1 });
  });
  it('un angle qui ne tient pas : fantôme tourné, rouge, ✓ refusé', () => {
    // étagère contre le bord droit : de profil elle tient (1 colonne), en diagonale (4 colonnes) elle déborde
    const p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'shelf' }, CENTER), COLS, spotAt(22, 14));
    const side = rotatePlacement(rotatePlacement(p, COLS, 1)!, COLS, 1)!;
    expect(side.angle).toBe(2);
    expect(side.target.ok).toBe(true);
    const diag = rotatePlacement(side, COLS, -1)!;
    expect(diag.angle).toBe(1);
    expect(diag.target).toMatchObject({ ok: false, reason: 'bounds' });
    expect(diag.draft.find((x) => x.id === DRAFT_ID)).toMatchObject({ angle: 1 });
    expect(commitPlacement(diag)).toBeNull();
  });
  it('déplacer un meuble tourné garde son angle', () => {
    const l = placeStanding([], COLS, 'sofa', 0, 10, 'f1', 2)!;
    const p = startPlacement(l, COLS, { type: 'move', id: 'f1' }, CENTER);
    expect(p.angle).toBe(2);
    expect(commitPlacement(movePlacement(p, COLS, spotAt(10, 16)))![0]).toMatchObject({ angle: 2 });
  });
  it('les cases au sol du fantôme sont exposées (escalier compris)', () => {
    const p = rotatePlacement(startPlacement([], COLS, { type: 'new', kind: 'sofa' }, CENTER), COLS, 1)!;
    expect(placingView(p).floor).toHaveLength(17);
  });
  it('une fenêtre, une carte ou un ordinateur ne tournent pas', () => {
    expect(canRotate(startPlacement([], COLS, { type: 'new', kind: 'window' }, CENTER))).toBe(false);
    expect(rotatePlacement(startPlacement(desk, COLS, { type: 'new', kind: 'computer' }, CENTER), COLS, 1)).toBeNull();
  });
});

describe('présentation d’un objet rangé (de face / sur la tranche)', () => {
  const shelf: Layout = placeStanding([], COLS, 'shelf', 2, 6, 's')!;
  // 4 CD de face (4 × 14 + 3 = 59 cm) et un livre sur la tranche (3 + 1 = 63 cm) sur la tablette du haut.
  const full: Layout = [
    ...shelf,
    ...[0, 1, 2, 3].map((order) => ({ id: `c${order}`, kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order, slug: `cd${order}` }) as const),
    { id: 'b', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 4, slug: 'Dune' },
  ];
  const displayOfIn = (l: Layout, id: string) => (l.find((x) => x.id === id) as { display?: string }).display;

  it('basculer change la présentation dans le brouillon seulement ; elle n’est enregistrée qu’au ✓', () => {
    const p = startPlacement(full, COLS, { type: 'move', id: 'c3' }, CENTER);
    const q = displayPlacement(p, COLS, 'spine');
    expect(q.target.ok).toBe(true);
    expect(displayOfIn(q.draft, 'c3')).toBe('spine');
    expect(displayOfIn(q.base, 'c3')).toBeUndefined();
    expect(displayOfIn(commitPlacement(q)!, 'c3')).toBe('spine');
    // Il garde sa tablette et son rang.
    expect(commitPlacement(q)!.find((x) => x.id === 'c3')).toMatchObject({ level: 0, order: 3 });
  });

  it('refusé si l’objet ne tient plus sur sa tablette sous sa nouvelle présentation', () => {
    // Le livre de face prend 15 cm : 59 + 1 + 15 = 75 > 74.
    const p = displayPlacement(startPlacement(full, COLS, { type: 'move', id: 'b' }, CENTER), COLS, 'cover');
    expect(p.target.ok).toBe(false);
    expect(p.target.reason).toBe('shelf-full');
    expect(commitPlacement(p)).toBeNull();
    // Revenir sur la tranche le rend valide.
    expect(displayPlacement(p, COLS, 'spine').target.ok).toBe(true);
  });

  it('la présentation suit l’objet quand on le déplace ensuite ailleurs', () => {
    const two: Layout = [...full, ...placeStanding([], COLS, 'shelf', 14, 6, 't')!];
    const p = displayPlacement(startPlacement(two, COLS, { type: 'move', id: 'c0' }, CENTER), COLS, 'spine');
    const q = moveToItem(p, COLS, 't');
    expect(q.target.ok).toBe(true);
    expect(commitPlacement(q)!.find((x) => x.id === 'c0')).toMatchObject({ shelfId: 't', display: 'spine' });
  });

  it('toucher une étagère vise la première tablette où l’objet tient sous la présentation choisie', () => {
    // Étagère t : tablette du haut à 63 cm (11 cm libres) : un CD sur la tranche (1 cm) y tient, pas de face (14 cm).
    const t: Layout = [
      ...placeStanding([], COLS, 'shelf', 14, 6, 't')!,
      ...[0, 1, 2, 3].map((order) => ({ id: `t${order}`, kind: 'stored', shape: 'cd', shelfId: 't', level: 0, order, slug: `t${order}` }) as const),
      { id: 'tb', kind: 'stored', shape: 'book', shelfId: 't', level: 0, order: 4, slug: 'Tb' },
    ];
    const p = displayPlacement(startPlacement([...shelf, { id: 'm', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'M' }, ...t], COLS, { type: 'move', id: 'm' }, CENTER), COLS, 'spine');
    const q = moveToItem(p, COLS, 't');
    expect(q.target.ok).toBe(true);
    expect(commitPlacement(q)!.find((x) => x.id === 'm')).toMatchObject({ shelfId: 't', level: 0, order: 5, display: 'spine' });
  });

  it('une carte neuve rangée prend la présentation choisie', () => {
    const p = startPlacement(shelf, COLS, { type: 'card', choice: { target: 'shelf', shape: 'cd', slug: 'Kiki' } }, CENTER);
    const q = displayPlacement(p, COLS, 'spine');
    expect(q.target.ok).toBe(true);
    expect(commitPlacement(q)!.find((x) => x.kind === 'stored')).toMatchObject({ slug: 'Kiki', display: 'spine' });
  });

  it('displayOfPlacement : la présentation montrée pendant le placement (défaut du type sinon)', () => {
    const p = startPlacement(full, COLS, { type: 'move', id: 'b' }, CENTER);
    expect(displayOfPlacement(p)).toBe('spine');
    expect(displayOfPlacement(displayPlacement(p, COLS, 'cover'))).toBe('cover');
    expect(displayOfPlacement(startPlacement(desk, COLS, { type: 'move', id: 'f1' }, CENTER))).toBeNull();
  });
});
