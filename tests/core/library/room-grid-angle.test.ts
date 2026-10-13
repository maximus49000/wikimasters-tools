import { describe, expect, it } from 'vitest';
import { parseLibraryState } from '../../../src/core/library/library-book';
import { angleOf, byDrawOrder, canPlace, isStanding, moveStanding, placeStanding, pxRect, rectOf, setAngle, shelfSlots, shelfSlotsOf, type Standing } from '../../../src/core/library/room-grid';
import type { Layout } from '../../../src/core/library/library-types';

describe('angle d’un meuble', () => {
  it('absent = 0, rectangle de face inchangé', () => {
    const p = { id: 'a', kind: 'sofa', col: 2, row: 14 } as const;
    expect(angleOf(p)).toBe(0);
    expect(rectOf(p)).toEqual({ col: 2, row: 14, w: 6, h: 3 });
  });
  it('de profil, le rectangle est celui de l’angle', () => {
    expect(rectOf({ id: 'a', kind: 'sofa', col: 2, row: 14, angle: 2 })).toEqual({ col: 2, row: 14, w: 3, h: 3 });
  });
});

describe('lecture de l’angle', () => {
  const stateWith = (angle: unknown) => ({
    version: 5, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
    rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout: [{ id: 'f1', kind: 'sofa', col: 2, row: 14, angle }] }],
  });
  it('garde un angle valide', () => {
    expect(parseLibraryState(stateWith(3)).rooms[0]!.layout[0]).toMatchObject({ angle: 3 });
  });
  it.each([9, -1, 1.5, '2'])('un angle abîmé (%s) donne un meuble de face, conservé', (bad) => {
    const placed = parseLibraryState(stateWith(bad)).rooms[0]!.layout[0]!;
    expect(placed).toMatchObject({ id: 'f1', kind: 'sofa' });
    expect(angleOf(placed)).toBe(0);
  });
});

describe('ordre de dessin', () => {
  it('trie par le bas du rectangle de l’angle', () => {
    // étagère de profil : 9 de haut depuis la ligne 6 → bas 15 ; canapé de face ligne 13 → bas 16
    const layout: Layout = [{ id: 'sofa', kind: 'sofa', col: 0, row: 13 }, { id: 'shelf', kind: 'shelf', col: 8, row: 6, angle: 2 }];
    const order = byDrawOrder(layout, layout.filter((p): p is Standing => isStanding(p))).map((p) => p.id);
    expect(order).toEqual(['shelf', 'sofa']);
  });
});

const COLS = 24;

describe('collision par cases au sol', () => {
  it('deux canapés de face sur la même ligne se refusent, l’un de profil à côté passe', () => {
    const one = placeStanding([], COLS, 'sofa', 0, 14, 'a')!;
    expect(canPlace(one, COLS, 'sofa', 3, 14).ok).toBe(false);
    expect(canPlace(one, COLS, 'sofa', 6, 14, undefined, 2).ok).toBe(true);
  });
  it('en diagonale, seules les cases de l’escalier comptent', () => {
    // canapé angle 1 en (0,14) : ligne 16 occupée par les colonnes 3 à 6 seulement
    const diag = placeStanding([], COLS, 'sofa', 0, 14, 'a', 1)!;
    expect(canPlace(diag, COLS, 'bowl', 0, 16).ok).toBe(true);
    expect(canPlace(diag, COLS, 'bowl', 4, 16).ok).toBe(false);
  });
  it('le tapis reste dessous', () => {
    const rug = placeStanding([], COLS, 'rug', 0, 14, 'r', 1)!;
    expect(canPlace(rug, COLS, 'sofa', 0, 14, undefined, 1).ok).toBe(true);
  });
  it('une chaise se glisse sous un bureau, pas sous un canapé', () => {
    const desk = placeStanding([], COLS, 'desk', 2, 11, 'd')!;
    expect(canPlace(desk, COLS, 'chair', 3, 12).ok).toBe(true);
    const sofa = placeStanding([], COLS, 'sofa', 2, 13, 's')!;
    expect(canPlace(sofa, COLS, 'chair', 3, 13).ok).toBe(false);
  });
  it('un profil qui sort de la pièce est refusé (bounds)', () => {
    expect(canPlace([], COLS, 'shelf', 23, 9, undefined, 2)).toMatchObject({ ok: false, reason: 'bounds' });
  });
});

describe('chevauchement ancien', () => {
  const old = [{ id: 'a', kind: 'sofa', col: 0, row: 14 }, { id: 'b', kind: 'sofa', col: 2, row: 14 }] as const;
  it('toléré tant qu’on n’y touche pas : un autre meuble se pose ailleurs', () => {
    expect(placeStanding([...old], COLS, 'bowl', 12, 16, 'c')).not.toBeNull();
  });
  it('refusé dès qu’on déplace ou tourne l’un des deux sur place', () => {
    expect(moveStanding([...old], COLS, 'b', 2, 14)).toBeNull();
    expect(moveStanding([...old], COLS, 'b', 2, 14, 2)).toBeNull(); // tourné sur place, il touche encore « a »
    expect(moveStanding([...old], COLS, 'b', 10, 14)).not.toBeNull(); // déplacé ailleurs : accepté
  });
});

describe('pose avec angle', () => {
  it('placeStanding écrit l’angle seulement s’il n’est pas 0', () => {
    expect(placeStanding([], COLS, 'sofa', 0, 14, 'a', 0)![0]).not.toHaveProperty('angle');
    expect(placeStanding([], COLS, 'sofa', 0, 14, 'a', 3)![0]).toMatchObject({ angle: 3 });
  });
  it('moveStanding garde l’angle du meuble par défaut', () => {
    const l = placeStanding([], COLS, 'sofa', 0, 14, 'a', 2)!;
    expect(moveStanding(l, COLS, 'a', 5, 14)![0]).toMatchObject({ col: 5, angle: 2 });
  });
  it('setAngle tourne sans vérifier et retire le champ à 0', () => {
    const l = placeStanding([], COLS, 'sofa', 0, 14, 'a')!;
    expect(setAngle(l, 'a', 5)[0]).toMatchObject({ angle: 5 });
    expect(setAngle(setAngle(l, 'a', 5), 'a', 0)[0]).not.toHaveProperty('angle');
  });
});

describe('emplacements d’une étagère tournée', () => {
  it('de face : comme avant ; ¾ : sur la face visible ; profil : le rectangle', () => {
    const front = { id: 's', kind: 'shelf', col: 0, row: 6 } as const;
    expect(shelfSlotsOf(front)).toEqual(shelfSlots(pxRect(rectOf(front)!)));
    const three = { ...front, angle: 1 as const };
    const slots = shelfSlotsOf(three);
    const r = pxRect(rectOf(three)!);
    expect(Math.max(...slots.map((s) => s.x + s.w))).toBeLessThanOrEqual(r.x + r.w * 0.7 + 0.001);
    expect(shelfSlotsOf({ ...front, angle: 2 })).toHaveLength(15);
  });
});
