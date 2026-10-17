import { describe, expect, it } from 'vitest';
import { smallPlacement } from '../../../src/core/library/carried-items';
import { ITEM_MODELS } from '../../../src/core/library/item-models';
import { createInitialState, parseStoredLibraryState } from '../../../src/core/library/library-book';
import type { Layout } from '../../../src/core/library/library-types';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { canHostSmall, canPlaceComputer, moveComputer, moveSmall, placeComputer, placeSmall } from '../../../src/core/library/room-grid';
import { firstFreeTopSpot } from '../../../src/core/library/surface';

const desk: Layout = [{ id: 'd', kind: 'desk', col: 4, row: 13 }];
const shelf: Layout = [{ id: 's', kind: 'shelf', col: 0, row: 8 }];
const smalls = (l: Layout) => l.flatMap((p) => (p.kind === 'small' && 'x' in p ? [[p.item, p.x, p.z]] : []));
const withLayout = (layout: unknown[]) => {
  const state = createInitialState();
  return { ...state, rooms: state.rooms.map((r, i) => (i === 0 ? { ...r, layout } : r)) };
};
const readLayout = (layout: unknown[]) => parseStoredLibraryState(withLayout(layout))!.rooms[0]!.layout;

describe('chaîne hi-fi : 56 × 26 cm plus la zone de la pochette, sur un bureau', () => {
  it('porteurs', () => {
    expect(canHostSmall('desk', 'hifi')).toBe(true);
    expect(canHostSmall('shelf', 'hifi')).toBe(false);
    expect(canHostSmall('shelf', 'plant')).toBe(true);
  });

  it('modèle : 56 × 26 × 18 cm avec décalques face:hifi et top:hifi', () => {
    const m = ITEM_MODELS['small-hifi'];
    expect([m.w, m.d, m.h]).toEqual([56, 26, 18]);
    const keys = m.pieces.flatMap((p) => (p.shape === 'box' ? (p.decals ?? []).map((d) => `${d.face}:${d.key}`) : []));
    expect(keys).toEqual(expect.arrayContaining(['front:face:hifi', 'top:top:hifi']));
  });

  it('sur un bureau vide : à l’avant gauche ; un autre petit objet se pose à côté', () => {
    const a = placeSmall(desk, 'd', 'hifi', 'h')!;
    expect(smalls(a)).toEqual([['hifi', 0, 0]]);
    expect(smalls(placeSmall(a, 'd', 'plant', 'p')!)).toEqual([['hifi', 0, 0], ['plant', 56, 0]]);
  });

  it('sur une étagère : refusé', () => {
    expect(placeSmall(shelf, 's', 'hifi', 'h')).toBeNull();
  });

  it('bureau avec ordinateur : la chaîne tient devant l’écran', () => {
    const pc: Layout = [...desk, { id: 'c', kind: 'computer', deskId: 'd' }];
    expect(smalls(placeSmall(pc, 'd', 'hifi', 'h')!)).toEqual([['hifi', 0, 0]]);
    expect(placeSmall(pc, 'd', 'plant', 'p')).not.toBeNull();
  });

  it('un petit objet à l’avant gauche décale la chaîne vers la droite ; sans place, refusée', () => {
    const plant0 = placeSmall(desk, 'd', 'plant', 'p')!;
    expect(smalls(placeSmall(plant0, 'd', 'hifi', 'h')!)).toEqual([['plant', 0, 0], ['hifi', 16, 0]]);
    // Deux plantes à mi-profondeur, à 40 et 85 cm : aucune place de 56 × 40,5 cm ne reste libre.
    const full: Layout = [...desk, { id: 'p', kind: 'small', item: 'plant', hostId: 'd', x: 40, z: 20 }, { id: 'q', kind: 'small', item: 'plant', hostId: 'd', x: 85, z: 20 }];
    expect(placeSmall(full, 'd', 'hifi', 'h')).toBeNull();
  });

  it('déplacement vers une étagère refusé, vers un autre bureau accepté', () => {
    const l: Layout = [...desk, ...shelf, { id: 'd2', kind: 'desk', col: 20, row: 13 }, { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', x: 2, z: 2.5 }];
    expect(moveSmall(l, 'h', 's')).toBeNull();
    const moved = moveSmall(l, 'h', 'd2')!;
    expect(moved.find((p) => p.id === 'h')).toMatchObject({ hostId: 'd2', x: 0, z: 0 });
  });

  it('smallPlacement : le poste derrière la zone de la pochette, à l’ancien centre des emplacements 0-1', () => {
    const w = FURNITURE_MODELS.desk.w;
    const p = smallPlacement('h', 'hifi', 'desk', 2, 2.5);
    expect(p.shape).toBe('small-hifi');
    expect(p.x + 56 / 2).toBeCloseTo(w / 4);
    expect(p.z).toBe(17);
  });

  it('validation : un objet qui chevauche la chaîne est replacé ; la chaîne sur une étagère est retirée', () => {
    const d = { id: 'd', kind: 'desk', col: 4, row: 13 };
    const hifi = { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', x: 32, z: 2.5 };
    const overlap = { id: 'p', kind: 'small', item: 'plant', hostId: 'd', x: 67.5, z: 22.5 };
    const read = readLayout([d, hifi, overlap]);
    expect(read.map((p) => p.id)).toEqual(['d', 'h', 'p']);
    expect(read[2]).toMatchObject(firstFreeTopSpot([d, hifi] as Layout, 'd', { item: 'plant' })!);
    const beside = { id: 'p', kind: 'small', item: 'plant', hostId: 'd', x: 97.5, z: 22.5 };
    expect(readLayout([d, hifi, beside])[2]).toEqual(beside);
    const sh = { id: 's', kind: 'shelf', col: 0, row: 8 };
    expect(readLayout([sh, { ...hifi, hostId: 's' }]).map((p) => p.id)).toEqual(['s']);
    const pc = { id: 'c', kind: 'computer', deskId: 'd' };
    expect(readLayout([d, pc, { ...hifi, x: 2 }])[2]).toMatchObject({ id: 'h', x: 0, z: 0 });
  });
});

describe('ordinateur et chaîne hi-fi', () => {
  const withHifi: Layout = [...desk, { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', x: 2, z: 2.5 }, { id: 'd2', kind: 'desk', col: 20, row: 13 }, { id: 'c', kind: 'computer', deskId: 'd2' }];
  it('refuse un ordinateur dont l’écran chevaucherait la chaîne', () => {
    expect(canPlaceComputer(withHifi, 'd')).toBe(false);
    expect(placeComputer(withHifi, 'd', 'n')).toBeNull();
    expect(moveComputer(withHifi, 'c', 'd')).toBeNull();
    const right: Layout = [...desk, { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', x: 62, z: 2.5 }];
    expect(canPlaceComputer(right, 'd')).toBe(false);
  });
  it('accepte l’ordinateur derrière une chaîne posée tout à l’avant', () => {
    const front: Layout = [...desk, { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', x: 0, z: 0 }];
    expect(canPlaceComputer(front, 'd')).toBe(true);
  });
});
