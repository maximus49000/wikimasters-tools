import { describe, expect, it } from 'vitest';
import { boardTopCm, carriedPlacementOf, computerPlacement, hostPointPx, placementDepth, placementRectPx, screenQuad, smallPlacement, storedDrawOrder, storedFrontQuad, storedPlacementsOf } from '../../../src/core/library/carried-items';
import { drawSize, topPoint } from '../../../src/core/library/footprint';
import { bookColor } from '../../../src/core/library/item-models';
import type { Layout } from '../../../src/core/library/library-types';
import { pxRect, rectOf, shelfLayoutOf } from '../../../src/core/library/room-grid';

const shelfAt = (angle: 0 | 1 | 7 = 0) => ({ id: 's', kind: 'shelf', col: 2, row: 4, angle }) as const;
const stored: Layout = [
  shelfAt(),
  { id: 'a', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' },
  { id: 'b', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 1, slug: 'Dune' },
  { id: 'c', kind: 'stored', shape: 'dvd', shelfId: 's', level: 2, order: 0, display: 'spine', slug: 'Alien' },
];

describe('objets portés en 3D', () => {
  it('les tablettes portent les objets sur le dessus de leur planche (modèle de l’étagère)', () => {
    expect([boardTopCm(0), boardTopCm(1), boardTopCm(2)]).toEqual([121, 61, 8]);
  });

  it('tout objet rangé, de face ou sur la tranche, se tient près du bord avant, à la suite de ses voisins', () => {
    const pl = storedPlacementsOf(stored, 's');
    expect(pl.get('a')).toMatchObject({ shape: 'cd', display: 'cover', x: 3, y: 121, z: 2 });
    // Livre (sur la tranche par défaut) : après le CD (14 cm) et 1 cm d'écart ; couleur de dos de sa carte.
    expect(pl.get('b')).toMatchObject({ shape: 'book', display: 'spine', x: 18, y: 121, z: 2, color: bookColor('Dune') });
    expect(pl.get('c')).toMatchObject({ display: 'spine', x: 3, y: 8 });
    expect(carriedPlacementOf(stored, stored[2]!)?.placement).toEqual(pl.get('b'));
  });

  it('de face, la face avant d’un objet rangé tombe sur sa place de room-grid (même largeur, même bord gauche)', () => {
    const rect = pxRect(rectOf(stored[0]!)!);
    const pl = storedPlacementsOf(stored, 's');
    for (const box of shelfLayoutOf(stored, 's')) {
      const q = storedFrontQuad(0, rect, pl.get(box.id)!);
      expect(q[0]![0]).toBeCloseTo(box.x, 6);
      expect(q[1]![0] - q[0]![0]).toBeCloseTo(box.w, 6);
    }
  });

  it('de ¾, la face avant d’un objet est un parallélogramme', () => {
    const layout: Layout = [shelfAt(1), ...stored.slice(1)];
    const q = storedFrontQuad(1, pxRect(rectOf(layout[0]!)!), storedPlacementsOf(layout, 's').get('a')!);
    expect(q[1]![1]).not.toBeCloseTo(q[0]![1], 1);
    expect(q[1]![0] - q[0]![0]).toBeCloseTo(q[2]![0] - q[3]![0], 6);
  });

  it('l’écran est centré vers le fond du bureau et dépasse au-dessus de son rectangle', () => {
    const desk = { id: 'd', kind: 'desk', col: 2, row: 11 } as const;
    const rect = pxRect(rectOf(desk)!);
    const pc = computerPlacement('pc');
    expect(pc).toMatchObject({ shape: 'monitor', x: 32.5, y: 75, z: 40 });
    const box = placementRectPx('desk', 0, rect, pc);
    expect(box.y).toBeLessThan(rect.y);
    expect(box.x + box.w / 2).toBeCloseTo(rect.x + rect.w / 2, 6);
    // La vitre est dans l'écran.
    const glass = screenQuad(0, rect, pc);
    expect(glass).toHaveLength(4);
    for (const [x, y] of glass) {
      expect(x).toBeGreaterThanOrEqual(box.x - 1e-6);
      expect(x).toBeLessThanOrEqual(box.x + box.w + 1e-6);
      expect(y).toBeGreaterThanOrEqual(box.y - 1e-6);
      expect(y).toBeLessThanOrEqual(box.y + box.h + 1e-6);
    }
  });

  it('à chaque angle, le pied de l’écran reste sur le plateau (dans le rectangle de dessin, au-dessus des pieds du bureau)', () => {
    for (const angle of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const rect = pxRect({ col: 2, row: 6, ...drawSize('desk', angle) });
      const pc = computerPlacement('pc');
      const [x, y] = hostPointPx('desk', angle, rect, [pc.x + 27.5, pc.y, pc.z + 8]);
      expect(y, `angle ${angle}`).toBeGreaterThan(rect.y);
      expect(y, `angle ${angle}`).toBeLessThan(rect.y + rect.h * 0.6);
      expect(x).toBeGreaterThan(rect.x);
      expect(x).toBeLessThan(rect.x + rect.w);
    }
  });

  it('un petit objet est centré sur son emplacement (même point que topPoint), à tout angle', () => {
    for (const angle of [0, 1, 4] as const) {
      const desk = { id: 'd', kind: 'desk', col: 2, row: 11, angle } as const;
      const rect = pxRect(rectOf(desk)!);
      const pl = smallPlacement('o', 'plant', 'desk', 3);
      const [x, y] = hostPointPx('desk', angle, rect, [pl.x + 7.5, pl.y, pl.z + 7.5]);
      const [tx, ty] = topPoint('desk', angle, rect, 3.5 / 4, 0.5);
      expect(x).toBeCloseTo(tx, 6);
      expect(y).toBeCloseTo(ty, 6);
    }
  });

  it('de dos, l’écran passe devant les petits objets ; de face, derrière', () => {
    const pc = computerPlacement('pc');
    const lamp = smallPlacement('o', 'lamp', 'desk', 0);
    expect(placementDepth('desk', 0, pc)).toBeGreaterThan(placementDepth('desk', 0, lamp));
    expect(placementDepth('desk', 4, pc)).toBeLessThan(placementDepth('desk', 4, lamp));
  });

  it('les objets rangés se dessinent tablette du bas d’abord, puis du côté opposé au spectateur', () => {
    const items = [{ level: 0, order: 0 }, { level: 0, order: 1 }, { level: 2, order: 0 }] as const;
    expect(storedDrawOrder(items, 1)).toEqual([items[2], items[0], items[1]]);
    expect(storedDrawOrder(items, 7)).toEqual([items[2], items[1], items[0]]);
  });
});

describe('présentoir', () => {
  it('la zone touchable d’un CD de face suit sa couverture penchée : même largeur, haut remonté vers le fond', () => {
    const rect = pxRect(rectOf(shelfAt())!);
    const pl = storedPlacementsOf(stored, 's').get('a')!;
    const q = storedFrontQuad(0, rect, pl);
    const flat = storedFrontQuad(0, rect, { ...pl, display: 'spine' });
    expect(q[1]![0] - q[0]![0]).toBeGreaterThan(flat[1]![0] - flat[0]![0]);
    // Bas posé sur le socle (au-dessus de la tablette), haut au-dessus du bas.
    expect(q[3]![1]).toBeLessThan(flat[3]![1]);
    expect(q[0]![1]).toBeLessThan(q[3]![1]);
  });
});
