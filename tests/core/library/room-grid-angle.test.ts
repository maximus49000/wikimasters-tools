import { describe, expect, it } from 'vitest';
import { parseLibraryState } from '../../../src/core/library/library-book';
import { angleOf, byDrawOrder, isStanding, rectOf, type Standing } from '../../../src/core/library/room-grid';
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
