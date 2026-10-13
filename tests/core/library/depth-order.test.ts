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
  it('le meuble le plus bas à l’écran passe devant, quel que soit son niveau', () => {
    // L'étagère (niveau 1) a ses pieds en ligne 18, sous ceux du fauteuil et de la table basse (ligne 16).
    expect(drawOrder(layout).map((p) => p.id)).toEqual(['arm', 'tab', 'sh']);
  });
  it('une étagère posée plus bas qu’un canapé passe devant lui', () => {
    const room: Layout = [
      { id: 'sofa', kind: 'sofa', col: 0, row: 13 },
      { id: 'sh', kind: 'shelf', col: 2, row: 10 },
    ];
    expect(drawOrder(room).map((p) => p.id)).toEqual(['sofa', 'sh']);
  });
  it('pieds sur la même ligne : le niveau départage', () => {
    const room: Layout = [
      { id: 'front', kind: 'armchair', col: 0, row: 13, depth: 3 },
      { id: 'back', kind: 'armchair', col: 0, row: 13, depth: 1 },
    ];
    expect(drawOrder(room).map((p) => p.id)).toEqual(['back', 'front']);
  });
});

describe('place d’un animal', () => {
  it('à découvert : devant les meubles dont les pieds sont plus haut, derrière l’étagère plus basse', () => {
    expect(petSlot(layout, feet(10, 16))).toBe(2);
    expect(petSlot(layout, feet(10, 14))).toBe(0);
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
    expect(petSlot(layout, onArm)).toBe(1);
  });
  it('devant un panier (niveau 3), sur le sol libre : dessiné après lui', () => {
    const only: Layout = [{ id: 'b', kind: 'basket', col: 2, row: 14 }];
    expect(petSlot(only, feet(3, 16))).toBe(1);
  });
  it('derrière une table basse qui ne le chevauche pas : inchangé, avant elle', () => {
    const only: Layout = [{ id: 'tab', kind: 'coffee-table', col: 10, row: 14 }];
    expect(petSlot(only, feet(1, 13))).toBe(0);
  });
  it('au-dessus d’une table basse qui le chevauche : derrière elle', () => {
    const only: Layout = [{ id: 'tab', kind: 'coffee-table', col: 0, row: 14 }];
    expect(petSlot(only, feet(1, 12))).toBe(0);
  });
  it('devant un panier mais derrière un fauteuil plus bas : entre les deux', () => {
    const two: Layout = [
      { id: 'b', kind: 'basket', col: 2, row: 12 }, // bas = 14
      { id: 'arm', kind: 'armchair', col: 2, row: 15 }, // bas = 18
    ];
    expect(petSlot(two, feet(3, 14))).toBe(1);
  });
});

describe('sélection en pile', () => {
  it('liste les objets superposés, de l’avant vers le fond', () => {
    expect(stackAt(layout, 'tab')).toEqual(['sh', 'tab', 'arm']);
  });
  it('un nouveau toucher passe à l’objet derrière, puis revient au premier', () => {
    expect(nextInStack(layout, null, 'tab', null)).toBe('tab');
    expect(nextInStack(layout, 'tab', 'tab', 'tab')).toBe('arm');
    // Le toucher arrive toujours à l'objet de devant : la pile continue tant qu'on touche le même objet.
    expect(nextInStack(layout, 'arm', 'tab', 'tab')).toBe('sh');
    expect(nextInStack(layout, 'sh', 'tab', 'tab')).toBe('tab');
  });
  it('toucher un autre objet le sélectionne, même s’il est dans la pile du sélectionné', () => {
    // Le fauteuil a été touché directement : toucher la table basse devant lui choisit la table, pas l'étagère.
    expect(nextInStack(layout, 'arm', 'tab', 'arm')).toBe('tab');
  });
  it('un objet seul déjà sélectionné se désélectionne', () => {
    const alone: Layout = [{ id: 'x', kind: 'chair', col: 20, row: 15 }];
    expect(nextInStack(alone, 'x', 'x', 'x')).toBeNull();
  });
  it('un objet hors pile (tapis, petit objet) déjà sélectionné se désélectionne aussi', () => {
    const lone: Layout = [{ id: 'r', kind: 'rug', col: 2, row: 15 }, { id: 'o', kind: 'lamp', col: 20, row: 15 }];
    expect(stackAt(lone, 'r')).toEqual(['r']);
    expect(nextInStack(lone, 'r', 'r', 'r')).toBeNull();
    expect(nextInStack(lone, 'o', 'o', 'o')).toBeNull();
  });
});
