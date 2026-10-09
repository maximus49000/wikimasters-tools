import { describe, expect, it } from 'vitest';
import { parseLibraryState } from '../../../src/core/library/library-book';
import { isLamp, isLit, moveStanding, shiftLayout, toggleLamp } from '../../../src/core/library/room-grid';
import type { Layout } from '../../../src/core/library/library-types';

const layout: Layout = [
  { id: 'f1', kind: 'lamp', col: 2, row: 12 },
  { id: 'f2', kind: 'desk', col: 6, row: 12 },
  { id: 'f3', kind: 'small', item: 'lamp', hostId: 'f2', slot: 0 },
  { id: 'f4', kind: 'small', item: 'plant', hostId: 'f2', slot: 3 },
];

describe('lampes', () => {
  it('reconnaît les lampes debout et posées', () => {
    expect(layout.map(isLamp)).toEqual([true, false, true, false]);
  });
  it('une lampe est allumée tant que lit n’est pas false', () => {
    expect(isLit(layout[0]!)).toBe(true);
    expect(isLit({ ...layout[0]!, lit: false } as never)).toBe(false);
  });
  it('toggleLamp bascule et rebascule', () => {
    const off = toggleLamp(layout, 'f1');
    expect(isLit(off.find((p) => p.id === 'f1')!)).toBe(false);
    expect(isLit(toggleLamp(off, 'f1').find((p) => p.id === 'f1')!)).toBe(true);
  });
  it('toggleLamp ignore un meuble qui n’est pas une lampe', () => {
    expect(toggleLamp(layout, 'f2')).toBe(layout);
    expect(toggleLamp(layout, 'zzz')).toBe(layout);
  });
  it('lit survit à la lecture de l’état et un champ lit sur un autre meuble est écarté', () => {
    const state = JSON.parse(JSON.stringify({
      version: 5, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
      rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [],
        layout: [{ id: 'f1', kind: 'lamp', col: 2, row: 12, lit: false }, { id: 'f2', kind: 'desk', col: 6, row: 12, lit: false }] }],
    }));
    const room = parseLibraryState(state).rooms[0]!;
    expect((room.layout[0] as { lit?: boolean }).lit).toBe(false);
    expect('lit' in room.layout[1]!).toBe(false);
  });
  it('lit survit au déplacement d’une lampe et au décalage de zone', () => {
    const eteinte = toggleLamp(layout, 'f1');
    const deplacee = moveStanding(eteinte, 48, 'f1', 20, 12);
    expect(deplacee).not.toBeNull();
    const lampe = deplacee!.find((p) => p.id === 'f1') as { col: number; lit?: boolean };
    expect(lampe.col).toBe(20);
    expect(lampe.lit).toBe(false);
    const decalee = shiftLayout(eteinte, 12).find((p) => p.id === 'f1') as { col: number; lit?: boolean };
    expect(decalee.col).toBe(14);
    expect(decalee.lit).toBe(false);
  });
});
