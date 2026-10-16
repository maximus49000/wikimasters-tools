import { describe, expect, it } from 'vitest';
import { smallPlacement } from '../../../src/core/library/carried-items';
import { ITEM_MODELS } from '../../../src/core/library/item-models';
import { createInitialState, parseStoredLibraryState } from '../../../src/core/library/library-book';
import type { Layout } from '../../../src/core/library/library-types';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { canHostSmall, canPlaceComputer, firstFreeSurfaceSlot, moveComputer, moveSmall, placeComputer, placeSmall, smallSpan, surfaceSlotRectOn } from '../../../src/core/library/room-grid';

const desk: Layout = [{ id: 'd', kind: 'desk', col: 4, row: 13 }];
const shelf: Layout = [{ id: 's', kind: 'shelf', col: 0, row: 8 }];
const smalls = (l: Layout) => l.filter((p) => p.kind === 'small').map((p) => (p.kind === 'small' ? [p.item, p.slot] : null));
const withLayout = (layout: unknown[]) => {
  const state = createInitialState();
  return { ...state, rooms: state.rooms.map((r, i) => (i === 0 ? { ...r, layout } : r)) };
};

describe('chaîne hi-fi : deux emplacements consécutifs sur un bureau', () => {
  it('emprise et porteurs', () => {
    expect(smallSpan('hifi')).toBe(2);
    expect(smallSpan('plant')).toBe(1);
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

  it('sur un bureau vide : slot 0, occupe 0 et 1 ; un autre petit objet prend le slot 2', () => {
    const a = placeSmall(desk, 'd', 'hifi', 'h')!;
    expect(smalls(a)).toEqual([['hifi', 0]]);
    expect(firstFreeSurfaceSlot(a, 'd')).toBe(2);
    expect(smalls(placeSmall(a, 'd', 'plant', 'p')!)).toEqual([['hifi', 0], ['plant', 2]]);
  });

  it('sur une étagère : refusé', () => {
    expect(placeSmall(shelf, 's', 'hifi', 'h')).toBeNull();
  });

  it('bureau avec ordinateur (emplacements 0 et 3 libres mais non contigus) : refusé', () => {
    const pc: Layout = [...desk, { id: 'c', kind: 'computer', deskId: 'd' }];
    expect(placeSmall(pc, 'd', 'hifi', 'h')).toBeNull();
    expect(placeSmall(pc, 'd', 'plant', 'p')).not.toBeNull();
  });

  it('un petit objet en slot 0 repousse la chaîne en 1-2, un en slot 1 en 2-3', () => {
    const plant0 = placeSmall(desk, 'd', 'plant', 'p')!;
    expect(smalls(placeSmall(plant0, 'd', 'hifi', 'h')!)).toEqual([['plant', 0], ['hifi', 1]]);
    const l: Layout = [...desk, { id: 'p', kind: 'small', item: 'plant', hostId: 'd', slot: 1 }];
    expect(smalls(placeSmall(l, 'd', 'hifi', 'h')!)).toEqual([['plant', 1], ['hifi', 2]]);
    const full: Layout = [...desk, { id: 'p', kind: 'small', item: 'plant', hostId: 'd', slot: 1 }, { id: 'q', kind: 'small', item: 'plant', hostId: 'd', slot: 3 }];
    expect(placeSmall(full, 'd', 'hifi', 'h')).toBeNull();
  });

  it('déplacement vers une étagère refusé, vers un autre bureau accepté', () => {
    const l: Layout = [...desk, ...shelf, { id: 'd2', kind: 'desk', col: 20, row: 13 }, { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', slot: 0 }];
    expect(moveSmall(l, 'h', 's')).toBeNull();
    const moved = moveSmall(l, 'h', 'd2')!;
    expect(moved.find((p) => p.id === 'h')).toMatchObject({ hostId: 'd2', slot: 0 });
  });

  it('smallPlacement du slot 0 : centré sur la largeur des deux emplacements', () => {
    const w = FURNITURE_MODELS.desk.w;
    const p = smallPlacement('h', 'hifi', 'desk', 0);
    expect(p.shape).toBe('small-hifi');
    expect(p.x + 56 / 2).toBeCloseTo(w / 4);
    expect(smallPlacement('h', 'hifi', 'desk', 2).x + 28).toBeCloseTo((w * 3) / 4);
  });

  it('rectangle d’emplacement : largeur double', () => {
    const host = { x: 0, y: 0, w: 120, h: 60 };
    expect(surfaceSlotRectOn(host, 'desk', 0, 0, 2).w).toBe(2 * surfaceSlotRectOn(host, 'desk', 0, 0).w);
  });

  it('validation : une chaîne chevauchant un autre petit objet, sur une étagère ou au slot 3 est retirée', () => {
    const d = { id: 'd', kind: 'desk', col: 4, row: 13 };
    const hifi = { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', slot: 1 };
    const overlap = { id: 'p', kind: 'small', item: 'plant', hostId: 'd', slot: 2 };
    expect(parseStoredLibraryState(withLayout([d, hifi, overlap]))!.rooms[0]!.layout.map((p) => p.id)).toEqual(['d', 'h']);
    const beside = { id: 'p', kind: 'small', item: 'plant', hostId: 'd', slot: 3 };
    expect(parseStoredLibraryState(withLayout([d, hifi, beside]))!.rooms[0]!.layout.map((p) => p.id)).toEqual(['d', 'h', 'p']);
    expect(parseStoredLibraryState(withLayout([d, { ...hifi, slot: 3 }]))!.rooms[0]!.layout.map((p) => p.id)).toEqual(['d']);
    const sh = { id: 's', kind: 'shelf', col: 0, row: 8 };
    expect(parseStoredLibraryState(withLayout([sh, { ...hifi, hostId: 's', slot: 0 }]))!.rooms[0]!.layout.map((p) => p.id)).toEqual(['s']);
    const pc = { id: 'c', kind: 'computer', deskId: 'd' };
    expect(parseStoredLibraryState(withLayout([d, pc, { ...hifi, slot: 0 }]))!.rooms[0]!.layout.map((p) => p.id)).toEqual(['d', 'c']);
  });
});

describe('ordinateur et chaîne hi-fi', () => {
  const withHifi: Layout = [...desk, { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', slot: 0 }, { id: 'd2', kind: 'desk', col: 20, row: 13 }, { id: 'c', kind: 'computer', deskId: 'd2' }];
  it('refuse un ordinateur sur un bureau dont la chaîne couvre l’emplacement 1', () => {
    expect(canPlaceComputer(withHifi, 'd')).toBe(false);
    expect(placeComputer(withHifi, 'd', 'n')).toBeNull();
    expect(moveComputer(withHifi, 'c', 'd')).toBeNull();
  });
  it('refuse aussi quand la chaîne est en 2-3 (couvre l’emplacement 2)', () => {
    const l: Layout = [...desk, { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', slot: 2 }];
    expect(canPlaceComputer(l, 'd')).toBe(false);
  });
});
