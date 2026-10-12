import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { drawOrder, nextInStack, petSlot, stackAt } from '../../../src/core/library/depth-order';
import { CELL_H, CELL_W } from '../../../src/core/library/room-grid';
import type { PetState } from '../../../src/core/library/pets/motion';

const layout: Layout = [
  { id: 'tab', kind: 'coffee-table', col: 0, row: 14 }, // niveau 3, bas = 16
  { id: 'sh', kind: 'shelf', col: 0, row: 10 }, // niveau 1, bas = 18
  { id: 'arm', kind: 'armchair', col: 1, row: 13 }, // niveau 2, bas = 16
  { id: 'win', kind: 'window', col: 0, row: 1, w: 6, h: 5 },
];
const feet = (col: number, row: number): PetState => ({ pos: { x: (col + 0.5) * CELL_W, y: (row + 1) * CELL_H - 3 }, depthHosts: [] } as unknown as PetState);

describe('ordre de dessin', () => {
  it('trie par niveau d’abord, même si le bas du fond est plus bas', () => {
    expect(drawOrder(layout).map((p) => p.id)).toEqual(['sh', 'arm', 'tab']);
  });
});

describe('place d’un animal', () => {
  it('à découvert : niveau 2, derrière la table basse, devant l’étagère', () => {
    expect(petSlot(layout, feet(10, 17))).toBe(2);
  });
  it('sous la table basse : juste derrière elle', () => {
    const only: Layout = [{ id: 'tab', kind: 'coffee-table', col: 0, row: 14 }];
    expect(petSlot(only, feet(1, 15))).toBe(0);
  });
  it('derrière une étagère décollée du mur : juste derrière elle', () => {
    const only: Layout = [{ id: 'sh', kind: 'shelf', col: 0, row: 10 }];
    expect(petSlot(only, feet(2, 14))).toBe(0);
  });
  it('porté par le fauteuil : juste devant lui', () => {
    const onArm = { ...feet(2, 14), depthHosts: ['arm'] } as unknown as PetState;
    expect(petSlot(layout, onArm)).toBe(2);
  });
});

describe('sélection en pile', () => {
  it('liste les objets superposés, de l’avant vers le fond', () => {
    expect(stackAt(layout, 'tab')).toEqual(['tab', 'arm', 'sh']);
  });
  it('un nouveau toucher passe à l’objet derrière, puis revient au premier', () => {
    expect(nextInStack(layout, null, 'tab')).toBe('tab');
    expect(nextInStack(layout, 'tab', 'tab')).toBe('arm');
    // Le toucher arrive toujours à l'objet de devant : la pile continue.
    expect(nextInStack(layout, 'arm', 'tab')).toBe('sh');
    expect(nextInStack(layout, 'sh', 'tab')).toBe('tab');
  });
  it('un objet seul déjà sélectionné se désélectionne', () => {
    const alone: Layout = [{ id: 'x', kind: 'chair', col: 20, row: 15 }];
    expect(nextInStack(alone, 'x', 'x')).toBeNull();
  });
});
