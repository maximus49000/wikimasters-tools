import { describe, expect, it } from 'vitest';
import GRILLE from './fixtures/grille-main.json';
import { applyFace, drawSize, faceFrame, floorOffsets, invertFace, topPoint, type Angle } from '../../../src/core/library/footprint';
import { CELL_H, CELL_W, faceQuadOf, projectOf, PLUNGE_CAMERA } from '../../../src/core/library/furniture-render3d';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { hitRectOf, pxRect } from '../../../src/core/library/room-grid';

const ANGLES = [0, 1, 2, 3, 4, 5, 6, 7] as Angle[];
describe('pièce en perspective', () => {
  it('la grille ne bouge pas : cases et emprise identiques à main', () => {
    for (const k of STANDING_KINDS) for (const a of ANGLES) {
      expect(drawSize(k, a)).toEqual((GRILLE as any)[k][a].size);
      expect(floorOffsets(k, a)).toEqual((GRILLE as any)[k][a].floor);
    }
  });
  it('le haut de la face d’une étagère vue de face est plus large que le bas', () => {
    const [tl, tr, br, bl] = faceQuadOf(FURNITURE_MODELS.shelf, 0)!;
    expect(tr[0] - tl[0]).toBeGreaterThan(br[0] - bl[0] + 2);
  });
  it('faceFrame : les 4 coins exacts, aller-retour au centième de pixel', () => {
    const rect = { x: 30, y: 40, w: 4 * CELL_W, h: 10 * CELL_H };
    const f = faceFrame('shelf', 1, rect)!;
    expect(applyFace(f, f.w, f.h)[0]).toBeCloseTo(f.quad[2]![0], 2);
    const [u, v] = invertFace(f, ...applyFace(f, 12.5, 40));
    expect(u).toBeCloseTo(12.5, 2); expect(v).toBeCloseTo(40, 2);
  });
  it('topPoint = projection exacte du dessus du bureau', () => {
    const m = FURNITURE_MODELS.desk; const { w, h } = drawSize('desk', 1);
    const rect = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
    expect(topPoint('desk', 1, rect, 0.3, 0.6)).toEqual(projectOf(m, 1, [0.3 * m.w, m.h, 0.6 * m.d]).map((v) => expect.closeTo(v, 6)));
  });
  it('la zone de toucher contient tout le dessin', () => {
    const p = { id: 's', kind: 'shelf', col: 2, row: 1, angle: 0 } as const;
    const hit = hitRectOf(p as any); const r = pxRect({ col: 2, row: 1, ...drawSize('shelf', 0) });
    const top = projectOf(FURNITURE_MODELS.shelf, 0, [0, FURNITURE_MODELS.shelf.h, 0]);
    expect(hit.y).toBeLessThanOrEqual(r.y + top[1]);
  });
  it('vue plongeante : on voit bien plus le dessus du bureau', () => {
    const depth = (cam?: typeof PLUNGE_CAMERA) => projectOf(FURNITURE_MODELS.desk, 0, [0, FURNITURE_MODELS.desk.h, 0], cam)[1] - projectOf(FURNITURE_MODELS.desk, 0, [0, FURNITURE_MODELS.desk.h, FURNITURE_MODELS.desk.d], cam)[1];
    expect(depth(PLUNGE_CAMERA)).toBeGreaterThan(2 * depth());
  });
});
