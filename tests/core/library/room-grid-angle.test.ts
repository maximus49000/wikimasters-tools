import { describe, expect, it } from 'vitest';
import { parseLibraryState } from '../../../src/core/library/library-book';
import { frontFaceRect } from '../../../src/core/library/footprint';
import { angleOf, byDrawOrder, canPlace, isStanding, moveStanding, placeStanding, pxRect, rectOf, setAngle, shelfSlotsOf, inSlot, slotAt, type Standing } from '../../../src/core/library/room-grid';
import type { Layout } from '../../../src/core/library/library-types';

describe('angle d’un meuble', () => {
  it('absent = 0, rectangle de face inchangé', () => {
    const p = { id: 'a', kind: 'sofa', col: 2, row: 12 } as const;
    expect(angleOf(p)).toBe(0);
    expect(rectOf(p)).toEqual({ col: 2, row: 12, w: 10, h: 6 });
  });
  it('de profil, le rectangle est celui de l’angle', () => {
    expect(rectOf({ id: 'a', kind: 'sofa', col: 2, row: 10, angle: 2 })).toEqual({ col: 2, row: 10, w: 4, h: 8 });
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
    // étagère de profil : 11 de haut depuis la ligne 5 → bas 16 ; canapé de face (6 de haut) ligne 11 → bas 17
    const layout: Layout = [{ id: 'sofa', kind: 'sofa', col: 0, row: 11 }, { id: 'shelf', kind: 'shelf', col: 12, row: 5, angle: 2 }];
    const order = byDrawOrder(layout, layout.filter((p): p is Standing => isStanding(p))).map((p) => p.id);
    expect(order).toEqual(['shelf', 'sofa']);
  });
});

const COLS = 24;

describe('collision par cases au sol', () => {
  it('deux canapés de face sur la même ligne se refusent, l’un de profil à côté passe', () => {
    const one = placeStanding([], COLS, 'sofa', 0, 12, 'a')!;
    expect(canPlace(one, COLS, 'sofa', 3, 12).ok).toBe(false);
    expect(canPlace(one, COLS, 'sofa', 10, 10, undefined, 2).ok).toBe(true);
  });
  it('en diagonale, seules les cases de l’escalier comptent', () => {
    // canapé angle 1 en (0,9) : ligne 16 occupée par les colonnes 3 à 8 seulement
    const diag = placeStanding([], COLS, 'sofa', 0, 9, 'a', 1)!;
    expect(canPlace(diag, COLS, 'bowl', 0, 16).ok).toBe(true);
    expect(canPlace(diag, COLS, 'bowl', 4, 16).ok).toBe(false);
  });
  it('le tapis reste dessous', () => {
    const rug = placeStanding([], COLS, 'rug', 0, 13, 'r', 1)!;
    expect(canPlace(rug, COLS, 'sofa', 0, 9, undefined, 1).ok).toBe(true);
  });
  it('une chaise se glisse sous un bureau, pas sous un canapé', () => {
    // Bureau en (2,11) : pied en ligne 15 ; la chaise en (3,10) pose son pied en ligne 15, sous le bureau.
    const desk = placeStanding([], COLS, 'desk', 2, 11, 'd')!;
    expect(canPlace(desk, COLS, 'chair', 3, 10).ok).toBe(true);
    // Canapé en (2,12) : pied en lignes 16-17 ; la chaise en (3,11) pose son pied en ligne 16.
    const sofa = placeStanding([], COLS, 'sofa', 2, 12, 's')!;
    expect(canPlace(sofa, COLS, 'chair', 3, 11)).toMatchObject({ ok: false, reason: 'taken' });
  });
  it('un canapé de face à cheval sur le mur et le sol est accepté', () => {
    expect(canPlace([], COLS, 'sofa', 0, 10).ok).toBe(true);
  });
  it('un profil qui sort de la pièce est refusé (bounds)', () => {
    // Canapé de profil : 4 colonnes, de la colonne 21 à 24 (hors pièce de 24 colonnes).
    expect(canPlace([], COLS, 'sofa', 21, 10, undefined, 2)).toMatchObject({ ok: false, reason: 'bounds' });
    expect(canPlace([], COLS, 'sofa', 20, 10, undefined, 2).ok).toBe(true);
  });
});

describe('chevauchement ancien', () => {
  const old = [{ id: 'a', kind: 'sofa', col: 0, row: 10 }, { id: 'b', kind: 'sofa', col: 2, row: 10 }] as const;
  it('toléré tant qu’on n’y touche pas : un autre meuble se pose ailleurs', () => {
    expect(placeStanding([...old], COLS, 'bowl', 12, 16, 'c')).not.toBeNull();
  });
  it('refusé dès qu’on déplace ou tourne l’un des deux sur place', () => {
    expect(moveStanding([...old], COLS, 'b', 2, 10)).toBeNull();
    expect(moveStanding([...old], COLS, 'b', 2, 10, 2)).toBeNull(); // tourné sur place, il touche encore « a »
    expect(moveStanding([...old], COLS, 'b', 10, 10)).not.toBeNull(); // déplacé ailleurs : accepté
  });
});

describe('pose avec angle', () => {
  it('placeStanding écrit l’angle seulement s’il n’est pas 0', () => {
    expect(placeStanding([], COLS, 'sofa', 0, 9, 'a', 0)![0]).not.toHaveProperty('angle');
    expect(placeStanding([], COLS, 'sofa', 0, 9, 'a', 3)![0]).toMatchObject({ angle: 3 });
  });
  it('moveStanding garde l’angle du meuble par défaut', () => {
    const l = placeStanding([], COLS, 'sofa', 0, 9, 'a', 2)!;
    expect(moveStanding(l, COLS, 'a', 5, 9)![0]).toMatchObject({ col: 5, angle: 2 });
  });
  it('setAngle tourne sans vérifier et retire le champ à 0', () => {
    const l = placeStanding([], COLS, 'sofa', 0, 9, 'a')!;
    expect(setAngle(l, 'a', 5)[0]).toMatchObject({ angle: 5 });
    expect(setAngle(setAngle(l, 'a', 5), 'a', 0)[0]).not.toHaveProperty('angle');
  });
});

describe('emplacements d’une étagère tournée', () => {
  const front = { id: 's', kind: 'shelf', col: 0, row: 6 } as const;
  it('de face : 15 emplacements posés sur les tablettes du modèle, aucun à cheval sur une tablette', () => {
    const face = frontFaceRect(0, pxRect(rectOf(front)!), 'shelf')!;
    const k = face.h / 169; // face de l'étagère : 169 cm de haut (de 8 à 177 cm)
    const at = (cm: number) => face.y + (177 - cm) * k;
    const boards = [[121, 118], [61, 58]].map(([hi, lo]) => [at(hi!), at(lo!)] as const);
    const slots = shelfSlotsOf(front);
    expect(slots).toHaveLength(15);
    // Bas de chaque niveau = dessus de sa tablette (121, 61 cm) ou bas de la face (8 cm, dessus du socle).
    [121, 61, 8].forEach((cm, i) => { for (let j = 0; j < 5; j++) expect(slots[i * 5 + j]!.y + slots[i * 5 + j]!.h).toBeCloseTo(at(cm), 1); });
    for (const s of slots) {
      expect(s.y).toBeGreaterThanOrEqual(face.y);
      for (const [top, bottom] of boards) expect(s.y + s.h <= top + 1e-6 || s.y >= bottom - 1e-6).toBe(true);
      expect(s.x).toBeGreaterThanOrEqual(face.x);
      expect(s.x + s.w).toBeLessThanOrEqual(face.x + face.w + 1e-6);
    }
  });
  it('¾ : parallélogrammes sur la face inclinée ; le toucher suit le parallélogramme, pas le rectangle englobant', () => {
    for (const angle of [1, 7] as const) {
      const three = { ...front, angle };
      const slots = shelfSlotsOf(three);
      expect(slots).toHaveLength(15);
      const box = frontFaceRect(angle, pxRect(rectOf(three)!), 'shelf')!;
      slots.forEach((s, i) => {
        expect(Math.abs(s.quad[1]![1] - s.quad[0]![1]), 'bord du haut incliné').toBeGreaterThan(1);
        for (const [x, y] of s.quad) {
          expect(x).toBeGreaterThanOrEqual(box.x - 1e-6); expect(x).toBeLessThanOrEqual(box.x + box.w + 1e-6);
          expect(y).toBeGreaterThanOrEqual(box.y - 1e-6); expect(y).toBeLessThanOrEqual(box.y + box.h + 1e-6);
        }
        expect(slotAt([three], s.x + s.w / 2, s.y + s.h / 2)).toEqual({ shelfId: 's', slot: i });
        expect(inSlot(s, s.x + 0.5, s.y + 0.5) && inSlot(s, s.x + s.w - 0.5, s.y + 0.5)).toBe(false);
      });
    }
    for (const angle of [2, 3, 4, 5, 6] as const) expect(shelfSlotsOf({ ...front, angle })).toEqual([]);
  });
});
