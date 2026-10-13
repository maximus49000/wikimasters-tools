// tests/core/library/furniture-render3d.test.ts
import { describe, expect, it } from 'vitest';
import { DEPTH_PX_PER_CM, PX_PER_CM_X, PX_PER_CM_Y, frontFaceOf, poisOf3d, renderModel, type Model } from '../../../src/core/library/furniture-render3d';

const CELL_W = 30;
const CELL_H = 510 / 18;
const cube: Model = { w: 84, d: 50, h: 84, pieces: [{ shape: 'box', x: 0, y: 0, z: 0, w: 84, h: 84, d: 50, fill: 'wood' }], face: { x: 0, y: 0, w: 84, h: 84 } };
const ANGLES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

describe('échelle', () => {
  it('21 cm par case, 50 cm par rangée de sol', () => {
    expect(PX_PER_CM_X * 21).toBeCloseTo(CELL_W);
    expect(PX_PER_CM_Y * 21).toBeCloseTo(CELL_H);
    expect(DEPTH_PX_PER_CM * 50).toBeCloseTo(CELL_H);
  });
});

describe('renderModel', () => {
  it('cube de face : 4 colonnes, dessus visible, 1 rangée au sol × 4 colonnes', () => {
    const r = renderModel(cube, 0);
    expect(r.cols).toBe(4);
    expect(r.rows).toBe(5); // 84 cm de haut = 4 cases + 50 cm de profondeur qui remontent = 1 case
    expect(r.floor).toEqual([0, 1, 2, 3].map((col) => ({ col, row: 4 })));
    expect(r.shapes.some((s) => s.kind === 'poly' && s.shade === 1.12)).toBe(true); // dessus
  });
  it('toutes les formes sont finies et dans le rectangle, à chaque angle', () => {
    for (const a of ANGLES) {
      const r = renderModel(cube, a);
      for (const s of r.shapes) {
        const pts = s.kind === 'poly' ? s.points : [[s.cx - s.rx, s.cy - s.ry], [s.cx + s.rx, s.cy + s.ry]];
        for (const [x, y] of pts) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(-0.5);
          expect(x).toBeLessThanOrEqual(r.cols * CELL_W + 0.5);
          expect(y).toBeGreaterThanOrEqual(-0.5);
          expect(y).toBeLessThanOrEqual(r.rows * CELL_H + 0.5);
        }
      }
    }
  });
  it('hauteur constante à ± 1 case quel que soit l’angle', () => {
    const tall: Model = { w: 80, d: 30, h: 180, pieces: [{ shape: 'box', x: 0, y: 0, z: 0, w: 80, h: 180, d: 30, fill: 'wood' }] };
    const h0 = renderModel(tall, 0).rows;
    for (const a of ANGLES) expect(Math.abs(renderModel(tall, a).rows - h0)).toBeLessThanOrEqual(1);
  });
  it('de profil, la largeur dessinée est la profondeur', () => {
    const tall: Model = { w: 80, d: 30, h: 180, pieces: [{ shape: 'box', x: 0, y: 0, z: 0, w: 80, h: 180, d: 30, fill: 'wood' }] };
    expect(renderModel(tall, 2).cols).toBe(2); // 30 cm → 1,43 case → 2
    expect(renderModel(tall, 2).floor).toHaveLength(2); // 30 cm de large sur 80 cm de profondeur : les deux cases de la rangée de devant (la 2e rangée est couverte à moins de 50 %)
  });
  it('7 est le miroir de 1 pour un modèle symétrique', () => {
    const one = renderModel(cube, 1);
    const seven = renderModel(cube, 7);
    expect(seven.cols).toBe(one.cols);
    expect(seven.floor.map((c) => `${one.cols - 1 - c.col}-${c.row}`).sort()).toEqual(one.floor.map((c) => `${c.col}-${c.row}`).sort());
  });
  it('un objet minuscule en diagonale occupe exactement une case', () => {
    const tiny: Model = { w: 20, d: 20, h: 8, pieces: [{ shape: 'cyl', cx: 10, cz: 10, y: 0, r: 10, h: 8, fill: 'metal' }] };
    for (const a of ANGLES) expect(renderModel(tiny, a).floor).toHaveLength(1);
  });
  it('trace en diagonale : escalier, pas un rectangle plein', () => {
    const sofa: Model = { w: 200, d: 90, h: 85, pieces: [{ shape: 'box', x: 0, y: 0, z: 0, w: 200, h: 85, d: 90, fill: 'fabric' }] };
    const r = renderModel(sofa, 1);
    const rows = new Set(r.floor.map((c) => c.row));
    expect(rows.size).toBeGreaterThan(1);
    expect(r.floor.length).toBeLessThan(r.cols * rows.size);
  });
  it('un pied arrière est dessiné avant l’assise (ordre de profondeur)', () => {
    const chair: Model = {
      w: 45, d: 50, h: 90,
      pieces: [
        { shape: 'box', x: 2, y: 44, z: 2, w: 41, h: 4, d: 44, fill: 'desk' },
        { shape: 'box', x: 3, y: 0, z: 44, w: 3, h: 44, d: 3, fill: 'leg' },
      ],
    };
    const shapes = renderModel(chair, 0).shapes;
    const firstLeg = shapes.findIndex((s) => s.fill === 'leg');
    const lastSeat = shapes.map((s) => s.fill).lastIndexOf('desk');
    expect(firstLeg).toBeLessThan(lastSeat);
  });
});

describe('points d’intérêt et face avant', () => {
  it('un point au sol à l’avant tombe sur la dernière rangée', () => {
    const m: Model = { ...cube, pois: [{ type: 'eat', x: 10, y: 0, z: 5 }] };
    expect(poisOf3d(m, 0)).toEqual([{ type: 'eat', col: 0, row: 4 }]);
  });
  it('face avant visible de face et de ¾, cachée sinon', () => {
    expect(frontFaceOf(cube, 0)).not.toBeNull();
    expect(frontFaceOf(cube, 1)).not.toBeNull();
    expect(frontFaceOf(cube, 7)).not.toBeNull();
    for (const a of [2, 3, 4, 5, 6] as const) expect(frontFaceOf(cube, a)).toBeNull();
  });
});
