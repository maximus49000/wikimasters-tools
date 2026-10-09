import { describe, expect, it } from 'vitest';
import { parseLibraryState } from '../../../src/core/library/library-book';
import type { Layout } from '../../../src/core/library/library-types';
import {
  SURFACE_SLOTS,
  canPlaceComputer,
  firstFreeSurfaceSlot,
  hasFreeHost,
  moveSmall,
  placeSmall,
  removeFurniture,
  shiftLayout,
  surfaceSlotRect,
} from '../../../src/core/library/room-grid';

const base: Layout = [
  { id: 'f1', kind: 'desk', col: 2, row: 14 },
  { id: 'f2', kind: 'shelf', col: 12, row: 10 },
];

describe('surfaces', () => {
  it('un bureau a 4 emplacements et une étagère 3', () => {
    expect(SURFACE_SLOTS).toEqual({ desk: 4, shelf: 3 });
  });

  it('pose dans le premier emplacement libre', () => {
    const one = placeSmall(base, 'f1', 'plant', 'f3')!;
    expect(one.find((p) => p.id === 'f3')).toMatchObject({ kind: 'small', item: 'plant', hostId: 'f1', slot: 0 });
    const two = placeSmall(one, 'f1', 'lamp', 'f4')!;
    expect(two.find((p) => p.id === 'f4')).toMatchObject({ slot: 1 });
  });

  it('refuse quand le porteur est plein ou n’en est pas un', () => {
    let layout = base;
    for (let i = 0; i < 3; i++) layout = placeSmall(layout, 'f2', 'plant', `s${i}`)!;
    expect(firstFreeSurfaceSlot(layout, 'f2')).toBeNull();
    expect(placeSmall(layout, 'f2', 'plant', 'sx')).toBeNull();
    expect(placeSmall(base, 'inconnu', 'plant', 'sx')).toBeNull();
  });

  it('l’ordinateur couvre les emplacements du milieu du bureau', () => {
    const withPc: Layout = [...base, { id: 'f9', kind: 'computer', deskId: 'f1' }];
    const a = placeSmall(withPc, 'f1', 'plant', 'a')!;
    const b = placeSmall(a, 'f1', 'lamp', 'b')!;
    expect(b.find((p) => p.id === 'a')).toMatchObject({ slot: 0 });
    expect(b.find((p) => p.id === 'b')).toMatchObject({ slot: 3 });
    expect(placeSmall(b, 'f1', 'plant', 'c')).toBeNull();
  });

  it('refuse un ordinateur sur un bureau dont le milieu est pris', () => {
    const layout: Layout = [...base, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', slot: 1 }];
    expect(canPlaceComputer(layout, 'f1')).toBe(false);
    const edge: Layout = [...base, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', slot: 0 }];
    expect(canPlaceComputer(edge, 'f1')).toBe(true);
  });

  it('hasFreeHost dit s’il reste une place quelque part', () => {
    expect(hasFreeHost([])).toBe(false);
    expect(hasFreeHost(base)).toBe(true);
    let layout = base;
    for (let i = 0; i < 4; i++) layout = placeSmall(layout, 'f1', 'plant', `d${i}`)!;
    for (let i = 0; i < 3; i++) layout = placeSmall(layout, 'f2', 'plant', `e${i}`)!;
    expect(hasFreeHost(layout)).toBe(false);
  });
});

describe('déplacer un petit objet', () => {
  const layout: Layout = [...base, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', slot: 2 }];

  it('garde son emplacement sur le même porteur', () => {
    expect(moveSmall(layout, 's', 'f1')!.find((p) => p.id === 's')).toMatchObject({ hostId: 'f1', slot: 2 });
  });

  it('prend le premier emplacement libre d’un autre porteur', () => {
    expect(moveSmall(layout, 's', 'f2')!.find((p) => p.id === 's')).toMatchObject({ hostId: 'f2', slot: 0 });
  });

  it('refuse un porteur inconnu ou plein', () => {
    expect(moveSmall(layout, 's', 'x')).toBeNull();
    let full = layout;
    for (let i = 0; i < 3; i++) full = placeSmall(full, 'f2', 'lamp', `p${i}`)!;
    expect(moveSmall(full, 's', 'f2')).toBeNull();
  });
});

describe('retrait et décalage', () => {
  it('retirer un porteur retire ses petits objets', () => {
    const layout: Layout = [...base, { id: 's', kind: 'small', item: 'lamp', hostId: 'f2', slot: 0 }];
    expect(removeFurniture(layout, 'f2').map((p) => p.id)).toEqual(['f1']);
  });

  it('décaler la pièce ne touche pas les petits objets', () => {
    const small = { id: 's', kind: 'small', item: 'lamp', hostId: 'f2', slot: 0 } as const;
    expect(shiftLayout([...base, small], 12).find((p) => p.id === 's')).toEqual(small);
  });
});

describe('surfaceSlotRect', () => {
  it('découpe le dessus du porteur en emplacements de 44 px de haut', () => {
    expect(surfaceSlotRect({ x: 60, y: 400, w: 150, h: 113 }, 4, 1)).toEqual({ x: 97.5, y: 358, w: 37.5, h: 44 });
  });
});

describe('lecture : nettoyage des petits objets', () => {
  const state = (layout: unknown[]) => ({
    version: 4,
    time: { mode: 'real' },
    activeRoomId: 'r1',
    homeRoomId: null,
    rooms: [{ id: 'r1', name: 'Salon', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, layout, pets: [] }],
  });
  const read = (layout: unknown[]) => parseLibraryState(state(layout)).rooms[0]!.layout.map((p) => p.id);
  const host = [{ id: 'f1', kind: 'desk', col: 2, row: 14 }, { id: 'f2', kind: 'shelf', col: 12, row: 10 }];

  it('garde un petit objet valide', () => {
    expect(read([...host, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', slot: 3 }])).toContain('s');
  });

  it('ignore un petit objet sans porteur, hors emplacements ou en double', () => {
    const ids = read([
      ...host,
      { id: 'a', kind: 'small', item: 'plant', hostId: 'absent', slot: 0 },
      { id: 'b', kind: 'small', item: 'plant', hostId: 'f2', slot: 3 },
      { id: 'c', kind: 'small', item: 'lamp', hostId: 'f1', slot: 0 },
      { id: 'd', kind: 'small', item: 'lamp', hostId: 'f1', slot: 0 },
    ]);
    expect(ids).toEqual(['f1', 'f2', 'c']);
  });

  it('ignore un petit objet sur le milieu d’un bureau qui porte un ordinateur', () => {
    const ids = read([...host, { id: 'pc', kind: 'computer', deskId: 'f1' }, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', slot: 1 }]);
    expect(ids).not.toContain('s');
  });
});
