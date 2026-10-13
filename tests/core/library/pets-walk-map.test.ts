import { describe, expect, it } from 'vitest';
import { CELL_H } from '../../../src/core/library/room-grid';
import { DEPTH_PX_PER_CM, PX_PER_CM_X, PX_PER_CM_Y } from '../../../src/core/library/furniture-render3d';
import type { Layout } from '../../../src/core/library/library-types';
import { buildWalkMap, cellOf, groundLeg, groundPath, isFree, standPoint, toSegments } from '../../../src/core/library/pets/walk-map';

const sofa: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];

describe('buildWalkMap', () => {
  it('bloque les cases des meubles au sol, pas celles des tapis ni du mur', () => {
    // Canapé en (2,12) : 10 × 6 cases, pied (90 cm de profondeur) sur les lignes 16-17 ; étagère en (12,7) : pied en ligne 16.
    const map = buildWalkMap([...sofa, { id: 'r', kind: 'rug', col: 2, row: 15 }, { id: 's', kind: 'shelf', col: 12, row: 7 }], 24);
    expect(isFree(map, 2, 16)).toBe(false); // le canapé bas est plein : tout son pied est bloqué
    expect(isFree(map, 2, 17)).toBe(false);
    expect(isFree(map, 11, 16)).toBe(false);
    expect(isFree(map, 2, 15)).toBe(true); // tapis, derrière le canapé
    expect(isFree(map, 12, 15)).toBe(true); // derrière l'étagère
    expect(isFree(map, 12, 16)).toBe(false);
    expect(isFree(map, 12, 17)).toBe(true); // devant l'étagère, à côté du canapé
    expect(isFree(map, 12, 11)).toBe(false);
    expect(isFree(map, -1, 15)).toBe(false);
    expect(isFree(map, 24, 15)).toBe(false);
  });

  it('crée une plateforme sur l’assise du canapé : coussins de 54 cm, de 22 à 178 cm, milieu à 35 cm du devant', () => {
    const [plat] = buildWalkMap(sofa, 24).platforms;
    expect(plat!.id).toBe('a');
    expect(plat!.top).toBe(54);
    // Bas du rectangle (ligne 18) − hauteur de l'assise − profondeur du milieu des coussins qui remonte.
    expect(plat!.y).toBeCloseTo(18 * CELL_H - 54 * PX_PER_CM_Y - 35 * DEPTH_PX_PER_CM, 6);
    const off = (300 - 200 * PX_PER_CM_X) / 2; // 200 cm centrés dans 10 colonnes
    expect(plat!.x0).toBeCloseTo(60 + off + 22 * PX_PER_CM_X + 6, 6);
    expect(plat!.x1).toBeCloseTo(60 + off + 178 * PX_PER_CM_X - 6, 6);
  });

  it('plateformes à la hauteur réelle des dessus : chaise 48, table basse 45, bureau 75, étagère 180 ; rien sur une lampe', () => {
    const map = buildWalkMap([
      { id: 'c', kind: 'chair', col: 0, row: 8 }, { id: 't', kind: 'coffee-table', col: 4, row: 10 },
      { id: 'd', kind: 'desk', col: 10, row: 9 }, { id: 's', kind: 'shelf', col: 17, row: 4 }, { id: 'l', kind: 'lamp', col: 22, row: 5 },
    ], 24);
    expect(Object.fromEntries(map.platforms.map((p) => [p.id, p.top]))).toEqual({ c: 48, t: 45, d: 75, s: 180 });
  });

  it('standPoint et cellOf sont inverses', () => {
    expect(cellOf(standPoint(5, 14))).toEqual({ col: 5, row: 14 });
  });
});

describe('groundPath', () => {
  const map = buildWalkMap(sofa, 24);

  it('contourne le canapé, case libre par case libre', () => {
    // Le pied du canapé barre les lignes 16-17 des colonnes 2 à 11 : on passe derrière lui.
    const path = groundPath(map, { col: 0, row: 17 }, { col: 13, row: 17 })!;
    expect(path[0]).toEqual({ col: 0, row: 17 });
    expect(path[path.length - 1]).toEqual({ col: 13, row: 17 });
    expect(path.some((c) => c.row < 16)).toBe(true);
    expect(path.every((c) => isFree(map, c.col, c.row))).toBe(true);
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i]!.col - path[i - 1]!.col)).toBeLessThanOrEqual(1);
      expect(Math.abs(path[i]!.row - path[i - 1]!.row)).toBeLessThanOrEqual(1);
    }
  });

  it('refuse une arrivée bloquée', () => {
    expect(groundPath(map, { col: 0, row: 16 }, { col: 3, row: 16 })).toBeNull();
  });
});

describe('segments de marche', () => {
  it('fusionne les points alignés', () => {
    const segs = toSegments([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }], null);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.to).toEqual({ x: 100, y: 0 });
    expect(segs[0]!.ms).toBe(Math.round((100 / 70) * 1000));
  });

  it('marche jusqu une destination dans un meuble, sans trou entre segments', () => {
    const map = buildWalkMap([{ id: 'b', kind: 'basket', col: 10, row: 16 }], 24);
    const from = standPoint(0, 14);
    const to = standPoint(11, 17);
    const segs = groundLeg(map, from, to)!;
    expect(segs[0]!.from).toEqual(from);
    expect(segs[segs.length - 1]!.to).toEqual(to);
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.from).toEqual(segs[i - 1]!.to);
  });

  it('un trajet de longueur nulle donne zéro segment', () => {
    const map = buildWalkMap([], 24);
    expect(groundLeg(map, standPoint(3, 14), standPoint(3, 14))).toEqual([]);
  });
});

describe('passer là où il y a la place', () => {
  it('bloque l’appui d’une étagère, laisse libre l’espace derrière elle', () => {
    // Étagère en (0,7) : 4 × 10 cases, pied (30 cm) sur la ligne 16 seulement.
    const map = buildWalkMap([{ id: 'sh', kind: 'shelf', col: 0, row: 7 }], 24);
    expect(isFree(map, 1, 16)).toBe(false);
    expect(isFree(map, 1, 13)).toBe(true);
  });
  it('étagère contre le mur : aucune case derrière', () => {
    // Pied sur la première ligne du sol (12) : rien derrière, la ligne de devant est libre.
    const map = buildWalkMap([{ id: 'sh', kind: 'shelf', col: 0, row: 3 }], 24);
    expect(isFree(map, 1, 12)).toBe(false);
    expect(isFree(map, 1, 13)).toBe(true);
  });
  it('passe sous une table basse, même avec une chaise collée', () => {
    const map = buildWalkMap([
      { id: 't', kind: 'coffee-table', col: 4, row: 13 }, // pied en ligne 16, colonnes 4 à 8
      { id: 'c', kind: 'chair', col: 9, row: 11 }, // pied en ligne 16, colonnes 9 et 10
    ], 24);
    const path = groundPath(map, { col: 2, row: 16 }, { col: 11, row: 16 });
    expect(path).not.toBeNull();
    expect(path!.every((c) => c.row === 16)).toBe(true);
  });
  it('deux étagères collées ne laissent rien entre elles', () => {
    const map = buildWalkMap([
      { id: 'a', kind: 'shelf', col: 0, row: 7 },
      { id: 'b', kind: 'shelf', col: 4, row: 7 },
    ], 24);
    expect(isFree(map, 3, 16)).toBe(false);
    expect(isFree(map, 4, 16)).toBe(false);
  });
});
