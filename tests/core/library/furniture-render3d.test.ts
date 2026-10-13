// tests/core/library/furniture-render3d.test.ts
import { describe, expect, it } from 'vitest';
import { DEPTH_PX_PER_CM, PX_PER_CM_X, PX_PER_CM_Y, frontFaceOf, localPointOf, occluderBoxesOf, perchOf, pieceBounds, poisOf3d, renderModel, type Model, type Piece } from '../../../src/core/library/furniture-render3d';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';

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
        const pts = 'points' in s ? s.points : [[s.cx - s.rx, s.cy - s.ry], [s.cx + s.rx, s.cy + s.ry]];
        for (const [x, y] of pts) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(-15.5); // débord horizontal d’une demi-case toléré
          expect(x).toBeLessThanOrEqual(r.cols * CELL_W + 15.5);
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
    expect(renderModel(tall, 2).cols).toBe(1); // 30 cm → 1,43 case → 1 (arrondi, dessin centré)
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

describe('corrections de revue', () => {
  const desk: Model = {
    w: 120, d: 60, h: 115,
    pieces: [
      { shape: 'box', x: 0, y: 72, z: 0, w: 120, h: 3, d: 60, fill: 'desk' },
      { shape: 'box', x: 40, y: 75, z: 40, w: 40, h: 40, d: 5, fill: 'metal' },
    ],
  };
  it('un objet posé au fond d’un plateau est dessiné après le dessus du plateau', () => {
    for (const a of [0, 1, 2, 4] as const) {
      const shapes = renderModel(desk, a).shapes;
      const lastDesk = shapes.map((s) => s.fill).lastIndexOf('desk');
      const firstMetal = shapes.findIndex((s) => s.fill === 'metal');
      expect(firstMetal, `angle ${a}`).toBeGreaterThan(lastDesk);
    }
  });
  it('le haut n’est jamais coupé et le dessin reste dans le rectangle (verticalement strict)', () => {
    const tall: Model = { w: 80, d: 30, h: 180, pieces: [{ shape: 'box', x: 0, y: 0, z: 0, w: 80, h: 180, d: 30, fill: 'wood' }] };
    for (const m of [cube, tall]) {
      for (const a of ANGLES) {
        const r = renderModel(m, a);
        for (const s of r.shapes) {
          const pts = 'points' in s ? s.points : [[s.cx - s.rx, s.cy - s.ry], [s.cx + s.rx, s.cy + s.ry]];
          for (const [x, y] of pts) {
            expect(y).toBeGreaterThanOrEqual(-0.5);
            expect(y).toBeLessThanOrEqual(r.rows * CELL_H + 0.5);
            expect(x).toBeGreaterThanOrEqual(-15.5);
            expect(x).toBeLessThanOrEqual(r.cols * CELL_W + 15.5);
          }
        }
      }
    }
  });
  it('éclairage fixe côté spectateur : le dos d’une boîte a une face à 1, un cylindre garde ses teintes', () => {
    expect(renderModel(cube, 4).shapes.some((s) => s.kind === 'poly' && s.shade === 1)).toBe(true);
    const cyl: Model = { w: 40, d: 40, h: 40, pieces: [{ shape: 'cyl', cx: 20, cz: 20, y: 0, r: 20, h: 40, fill: 'metal' }] };
    const shades = (a: 0 | 4) => renderModel(cyl, a).shapes.map((s) => s.shade.toFixed(3)).sort();
    expect(shades(4)).toEqual(shades(0));
  });
  it('une sphère de face est plus haute à l’écran que sa hauteur seule', () => {
    const ball: Model = { w: 40, d: 40, h: 40, pieces: [{ shape: 'ball', cx: 20, cy: 20, cz: 20, rx: 20, ry: 20, rz: 20, fill: 'metal' }] };
    const e = renderModel(ball, 0).shapes[0]!;
    expect(e.kind === 'ellipse' && e.ry > 20 * PX_PER_CM_Y).toBe(true);
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

describe('nouvelles formes (prisme, tige, feuillage, globe)', () => {
  const inRect = (r: ReturnType<typeof renderModel>) => {
    for (const s of r.shapes) {
      const pts = 'points' in s ? s.points : [[s.cx - s.rx, s.cy - s.ry], [s.cx + s.rx, s.cy + s.ry]];
      for (const [x, y] of pts) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(y).toBeGreaterThanOrEqual(-0.5);
        expect(y).toBeLessThanOrEqual(r.rows * CELL_H + 0.5);
      }
    }
  };
  const roof: Model = {
    w: 70, d: 90, h: 75,
    pieces: [
      { shape: 'prism', axis: 'z', profile: [[0, 43], [35, 71], [35, 75], [0, 47]], from: 0, to: 90, fill: 'door' },
      { shape: 'prism', axis: 'z', profile: [[35, 71], [70, 43], [70, 47], [35, 75]], from: 0, to: 90, fill: 'door' },
    ],
  };
  it('prisme : toit à deux pans, pans visibles de face avec une teinte entre côté et dessus', () => {
    const r = renderModel(roof, 0);
    const slopes = r.shapes.filter((s) => s.kind === 'poly' && s.shade > 0.82 && s.shade < 1.12 && s.shade !== 1);
    expect(slopes.length).toBeGreaterThanOrEqual(2);
    for (const a of ANGLES) inRect(renderModel(roof, a));
  });
  it('prisme : vu de profil, le pan arrière est caché', () => {
    const one = { ...roof, pieces: [roof.pieces[0]!] };
    // Angle 2 : le pan gauche (x petit) passe à l’arrière (le modèle tourne, la face avant vers la gauche).
    const lit = (a: 2 | 6) => renderModel(one, a).shapes.some((s) => s.shade > 1); // le pan tourné vers nous mêle face et dessus
    expect(lit(2)).not.toBe(lit(6));
  });
  it('tige : un disque tourné vers l’avant se voit de face et devient un trait de profil', () => {
    const disc: Model = { w: 40, d: 40, h: 40, pieces: [{ shape: 'rod', a: [20, 20, 2], b: [20, 20, 0], r: 10, fill: 'shade' }] };
    const width = (a: 0 | 2) => {
      const xs = renderModel(disc, a).shapes.flatMap((s) => ('points' in s ? s.points.map((p) => p[0]) : []));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(0)).toBeCloseTo(20 * PX_PER_CM_X, 0);
    expect(width(2)).toBeLessThan(3 * PX_PER_CM_X);
    for (const a of ANGLES) inRect(renderModel(disc, a));
  });
  it('tige minuscule (rivet de moins de 4 px à l’écran) : une seule ellipse, à chaque angle', () => {
    const stud: Model = { w: 10, d: 10, h: 10, pieces: [{ shape: 'rod', a: [5, 5, 0.4], b: [5, 5, 0], r: 1.3, fill: 'shade' }] };
    for (const a of ANGLES) {
      const s = renderModel(stud, a).shapes;
      expect(s, 'angle ' + a).toHaveLength(1);
      expect(s[0]!.kind).toBe('ellipse');
    }
  });
  it('tige horizontale vue de face : l’ombre nette est en bas', () => {
    const bar: Model = { w: 40, d: 10, h: 10, pieces: [{ shape: 'rod', a: [2, 5, 5], b: [38, 5, 5], r: 2, fill: 'metal' }] };
    const s = renderModel(bar, 0).shapes;
    const shadow = s.find((x) => x.kind === 'poly' && x.ink === 'none');
    const body = s.find((x) => x.kind === 'poly' && x.ink === undefined);
    if (shadow?.kind !== 'poly' || body?.kind !== 'poly') throw new Error('formes');
    const meanY = (pts: [number, number][]) => pts.reduce((m, p) => m + p[1], 0) / pts.length;
    expect(meanY(shadow.points)).toBeGreaterThan(meanY(body.points));
  });
  it('tige inclinée : silhouette d’un seul polygone + un bout visible, encombrement rayon compris', () => {
    const rod: Model = { w: 40, d: 40, h: 60, pieces: [{ shape: 'rod', a: [5, 0, 20], b: [35, 58, 20], r: 2, fill: 'metal' }] };
    for (const a of ANGLES) {
      const r = renderModel(rod, a);
      const inked = r.shapes.filter((s) => s.kind === 'poly' && s.ink === undefined);
      expect(inked.length).toBeGreaterThanOrEqual(1);
      expect(inked.length).toBeLessThanOrEqual(2);
      inRect(r);
    }
    // Encombrement exact d'un cylindre : rayon × √(1 − u²) sur chaque axe (u = direction de la tige).
    const [ux, uy] = [30 / Math.hypot(30, 58), 58 / Math.hypot(30, 58)];
    const want = [5 - 2 * Math.sqrt(1 - ux * ux), 35 + 2 * Math.sqrt(1 - ux * ux), -2 * Math.sqrt(1 - uy * uy), 58 + 2 * Math.sqrt(1 - uy * uy), 18, 22];
    pieceBounds(rod.pieces[0]!).forEach((v, i) => expect(v).toBeCloseTo(want[i]!));
    const disc: Piece = { shape: 'rod', a: [20, 20, 2], b: [20, 20, 0], r: 10, fill: 'shade' };
    expect(pieceBounds(disc)[4]).toBeCloseTo(0); // un disque tourné vers l'avant ne déborde pas en profondeur
  });
  it('feuillage : la feuille du fond est dessinée avant celle de devant, et l’inverse vu de dos', () => {
    const plant: Model = {
      w: 40, d: 40, h: 60,
      pieces: [{ shape: 'foliage', fill: 'leaf', leaves: [
        { base: [20, 10, 20], ctrl: [20, 40, 10], tip: [20, 30, 2], w: 6 },
        { base: [20, 10, 20], ctrl: [20, 40, 30], tip: [20, 30, 38], w: 6, fill: 'leafDark' },
      ] }],
    };
    const fills = (a: 0 | 4) => renderModel(plant, a).shapes.filter((s) => s.kind === 'poly').map((s) => s.fill);
    expect(fills(0)).toEqual(['leafDark', 'leaf']);
    expect(fills(4)).toEqual(['leaf', 'leafDark']);
    for (const a of ANGLES) inRect(renderModel(plant, a));
  });
  const globe: Model = {
    w: 50, d: 50, h: 50,
    pieces: [{
      shape: 'ball', cx: 25, cy: 25, cz: 25, rx: 19, ry: 19, rz: 19, fill: 'fabric', tilt: 23,
      marks: [{ fill: 'leaf', pts: [[20, -20], [20, 20], [-20, 20], [-20, -20]] }],
      lines: [{ lat: 0 }], lineFill: 'edge',
      rings: [{ lon: -90, from: -113, to: 90, r: 21, w: 3, fill: 'metal' }],
    }],
  };
  it('globe : le méridien passe derrière puis devant la sphère', () => {
    const s = renderModel(globe, 0).shapes;
    const ball = s.findIndex((x) => x.kind === 'ellipse');
    expect(s.slice(0, ball).some((x) => x.fill === 'metal')).toBe(true);
    expect(s.slice(ball + 1).some((x) => x.fill === 'metal')).toBe(true);
  });
  it('globe : un continent tourné vers l’avant se voit de face, pas de dos', () => {
    expect(renderModel(globe, 0).shapes.some((x) => x.fill === 'leaf')).toBe(true);
    expect(renderModel(globe, 4).shapes.some((x) => x.fill === 'leaf')).toBe(false);
  });
  it('globe : l’équateur est un trait dans l’ellipse de la sphère', () => {
    for (const a of ANGLES) {
      const s = renderModel(globe, a).shapes;
      const e = s.find((x) => x.kind === 'ellipse')!;
      const lines = s.filter((x) => x.kind === 'line');
      expect(lines.length).toBeGreaterThan(0);
      if (e.kind !== 'ellipse') throw new Error('ellipse');
      for (const l of lines) for (const [x, y] of 'points' in l ? l.points : []) expect(((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2).toBeLessThanOrEqual(1.02);
      inRect(renderModel(globe, a));
    }
  });
  it('teinte propre (tone) et couche de dessin (layer)', () => {
    const dark: Model = { ...cube, pieces: [{ ...cube.pieces[0]!, tone: 0.5 } as Piece] };
    expect(Math.max(...renderModel(dark, 0).shapes.map((s) => s.shade))).toBeCloseTo(0.56);
    const a: Piece = { shape: 'box', x: 0, y: 0, z: 0, w: 40, h: 40, d: 40, fill: 'wood', layer: 1 };
    const b: Piece = { shape: 'box', x: 10, y: 0, z: 0, w: 40, h: 60, d: 20, fill: 'metal' };
    const s = renderModel({ w: 60, d: 40, h: 60, pieces: [a, b] }, 0).shapes;
    expect(s.map((x) => x.fill).lastIndexOf('metal')).toBeLessThan(s.findIndex((x) => x.fill === 'wood'));
  });
  it('cylindre évasé (r2) : le dessus a le rayon du haut', () => {
    const pot: Model = { w: 40, d: 40, h: 30, pieces: [{ shape: 'cyl', cx: 20, cz: 20, y: 0, r: 12, r2: 18, h: 30, fill: 'warm' }] };
    const top = renderModel(pot, 0).shapes.find((s) => s.kind === 'poly' && s.shade === 1.12)!;
    const xs = 'points' in top ? top.points.map((p) => p[0]) : [];
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(36 * PX_PER_CM_X, 0);
    expect(pieceBounds(pot.pieces[0]!)).toEqual([2, 38, 0, 30, 2, 38]);
  });
  it('corps ronds en cellulo : silhouette lisse encrée, ombre nette sans trait côté droit, contour repassé par-dessus', () => {
    const can: Model = { w: 40, d: 40, h: 40, pieces: [{ shape: 'cyl', cx: 20, cz: 20, y: 0, r: 15, h: 40, fill: 'metal' }] };
    for (const a of ANGLES) {
      const s = renderModel(can, a).shapes;
      const shadow = s.filter((x) => x.kind === 'poly' && x.ink === 'none');
      const body = s.find((x) => x.kind === 'poly' && x.ink === undefined && x.shade === 1);
      expect(shadow, 'angle ' + a).toHaveLength(1);
      expect(s.some((x) => x.kind === 'poly' && x.ink === 'only')).toBe(true);
      const mean = (pts: [number, number][]) => pts.reduce((m, p) => m + p[0], 0) / pts.length;
      if (shadow[0]?.kind !== 'poly' || body?.kind !== 'poly') throw new Error('formes');
      expect(mean(shadow[0].points)).toBeGreaterThan(mean(body.points));
      expect(s[s.length - 1]!.kind === 'poly' && s[s.length - 1]!.shade === 1.12).toBe(true); // le dessus en dernier
    }
  });
  it('feuillage : une feuille qui retombe vers le spectateur garde ses deux bords de part et d’autre de la nervure (pas de nœud papillon)', () => {
    const leaf: Model = { w: 40, d: 40, h: 60, pieces: [{ shape: 'foliage', fill: 'leaf', leaves: [{ base: [20, 10, 20], ctrl: [20, 40, 10], tip: [20, 25, 2], w: 8 }] }] };
    const poly = renderModel(leaf, 0).shapes.find((x) => x.kind === 'poly')!;
    if (poly.kind !== 'poly') throw new Error('poly');
    const x0 = (renderModel(leaf, 0).cols * CELL_W) / 2; // nervure au milieu (x = 20 sur 40 cm, dessin centré)
    const a = poly.points.slice(0, 11).map((p) => p[0] - x0);
    const b = poly.points.slice(11).map((p) => p[0] - x0);
    const sideA = Math.sign(a.reduce((m, v) => m + v, 0));
    expect(a.every((v) => v * sideA >= -0.01)).toBe(true);
    expect(b.every((v) => v * sideA <= 0.01)).toBe(true);
    expect(Math.max(...a.map(Math.abs))).toBeGreaterThan(0.7 * 4 * PX_PER_CM_X); // la feuille vue de face garde sa largeur
  });
  it('modèle rond : même nombre de colonnes à chaque angle, au moins une case au sol ; un modèle carré reste inchangé', () => {
    const lamp: Model = { w: 40, d: 40, h: 160, round: true, pieces: [{ shape: 'cyl', cx: 20, cz: 20, y: 0, r: 15, h: 160, fill: 'metal' }] };
    for (const a of ANGLES) {
      const r = renderModel(lamp, a);
      expect(r.cols, 'angle ' + a).toBe(2);
      expect(r.floor.length).toBeGreaterThanOrEqual(1);
      inRect(r);
    }
    const square: Model = { ...lamp, round: undefined };
    expect(renderModel(square, 1).cols).toBe(3); // trace carrée tournée : 57 cm
  });
});

describe('occulteurs et dessus praticable (lumière, animaux)', () => {
  it('étagère de face : une boîte par pièce, toutes dans la boîte du meuble (dessin centré dans ses 4 colonnes)', () => {
    const shelf = FURNITURE_MODELS.shelf;
    const boxes = occluderBoxesOf(shelf, 0);
    expect(boxes).toHaveLength(7);
    const off = (4 * 21 - 80) / 2; // 84 cm de rectangle pour 80 cm de meuble
    for (const b of boxes) {
      expect(b.x0).toBeGreaterThanOrEqual(off - 1e-6);
      expect(b.x1).toBeLessThanOrEqual(off + 80 + 1e-6);
      expect(b.z0).toBeGreaterThanOrEqual(0);
      expect(b.z1).toBeLessThanOrEqual(180 + 1e-6);
      expect(b.d0).toBeGreaterThanOrEqual(-1e-6);
      expect(b.d1).toBeLessThanOrEqual(30 + 1e-6);
    }
    // Le fond (2 cm d'épaisseur) est au fond : de 28 à 30 cm depuis l'avant.
    expect(boxes.some((b) => Math.abs(b.d0 - 28) < 1e-6 && Math.abs(b.d1 - 30) < 1e-6 && b.z1 - b.z0 === 169)).toBe(true);
  });
  it('de profil, largeur et profondeur des boîtes sont échangées', () => {
    const front = occluderBoxesOf(FURNITURE_MODELS.shelf, 0);
    const side = occluderBoxesOf(FURNITURE_MODELS.shelf, 2);
    const span = (bs: typeof front, a: 'x' | 'd') => Math.max(...bs.map((b) => b[`${a}1`])) - Math.min(...bs.map((b) => b[`${a}0`]));
    expect(span(front, 'x')).toBeCloseTo(80, 6);
    expect(span(front, 'd')).toBeCloseTo(30, 6);
    expect(span(side, 'x')).toBeCloseTo(30, 6);
    expect(span(side, 'd')).toBeCloseTo(80, 6);
  });
  it('en diagonale, une pièce longue est découpée en tranches qui suivent sa diagonale (pas une grande boîte qui couvre le sol devant)', () => {
    const sofa = FURNITURE_MODELS.sofa;
    const boxes = occluderBoxesOf(sofa, 1);
    expect(boxes.length).toBeGreaterThan(occluderBoxesOf(sofa, 0).length);
    // Assise (200 cm × 90 cm à 45°) : aucune tranche n'est plus large que (40 + 90) cm × cos 45°.
    const base = boxes.filter((b) => b.z0 === 12 && b.z1 === 42);
    expect(base).toHaveLength(5);
    for (const b of base) expect(b.x1 - b.x0).toBeLessThanOrEqual((40 + 90) * Math.SQRT1_2 + 1e-6);
  });
  it('les décors affleurants et les pièces minuscules ne donnent pas de boîte (niche, embout de la lampe)', () => {
    expect(occluderBoxesOf(FURNITURE_MODELS.kennel, 0).length).toBeLessThan(FURNITURE_MODELS.kennel.pieces.length / 2);
    expect(occluderBoxesOf(FURNITURE_MODELS.lamp, 0)).toHaveLength(4);
  });
  it('le dessus praticable est le dessus d’une vraie pièce (assise, plateau, haut de l’étagère)', () => {
    for (const kind of ['shelf', 'desk', 'chair', 'sofa', 'armchair', 'coffee-table'] as const) {
      const m = FURNITURE_MODELS[kind];
      const p = m.perch!;
      expect(p, kind).toBeDefined();
      const [cx, cz] = [p.x + p.w / 2, p.z + p.d / 2];
      const tops = m.pieces.map(pieceBounds).filter(([x0, x1, , , z0, z1]) => x0 <= cx && cx <= x1 && z0 <= cz && cz <= z1).map((b) => b[3]);
      expect(tops, kind).toContain(p.y);
    }
  });
  it('un chat assis sur le canapé tourné reste sur son assise : le segment praticable est dans les coussins, à chaque angle', () => {
    const sofa = FURNITURE_MODELS.sofa;
    const p = sofa.perch!;
    for (const a of ANGLES) {
      const perch = perchOf(sofa, a)!;
      expect(perch.x1 - perch.x0, `angle ${a}`).toBeGreaterThan(40);
      // Point écran à la hauteur de l'assise → point du modèle (rotation inverse) : il doit tomber dans le rectangle des coussins.
      const t = (a * Math.PI) / 4;
      const [c, s] = [Math.cos(t), Math.sin(t)];
      const turn = (x: number, z: number): [number, number] => [100 + (x - 100) * c + (z - 45) * s, 45 - (x - 100) * s + (z - 45) * c];
      const base = [[0, 0], [200, 0], [200, 90], [0, 90]].map(([x, z]) => turn(x!, z!));
      const [minX, minZ] = [Math.min(...base.map((q) => q[0])), Math.min(...base.map((q) => q[1]))];
      const traceW = Math.max(...base.map((q) => q[0])) - minX;
      const r = renderModel(sofa, a);
      const offX = (r.cols * CELL_W - traceW * PX_PER_CM_X) / 2;
      for (const x of [perch.x0, (perch.x0 + perch.x1) / 2, perch.x1]) {
        const lx = (x - offX) / PX_PER_CM_X + minX;
        const lz = (r.rows * CELL_H - p.y * PX_PER_CM_Y - perch.y) / DEPTH_PX_PER_CM + minZ;
        // Rotation inverse autour du centre de la base.
        const [dx, dz] = [lx - 100, lz - 45];
        const [mx, mz] = [100 + dx * c - dz * s, 45 + dx * s + dz * c];
        expect(mx, `angle ${a}`).toBeGreaterThanOrEqual(p.x - 1e-6);
        expect(mx, `angle ${a}`).toBeLessThanOrEqual(p.x + p.w + 1e-6);
        expect(mz, `angle ${a}`).toBeGreaterThanOrEqual(p.z - 1e-6);
        expect(mz, `angle ${a}`).toBeLessThanOrEqual(p.z + p.d + 1e-6);
      }
    }
  });
  it('point du modèle → repère du rectangle : de face, le centre du dessus du bureau est au milieu, à mi-profondeur', () => {
    const q = localPointOf(FURNITURE_MODELS.desk, 0, [60, 75, 30]);
    expect(q.x).toBeCloseTo((6 * 21) / 2, 6);
    expect(q.y).toBe(75);
    expect(q.z).toBeCloseTo(30, 6);
  });
});

describe('ordre de dessin des pièces séparées', () => {
  // Livre debout au bout d'une tablette, contre le montant : les centres trompent (le livre paraît plus proche), la séparation en x tranche.
  const pair = (mirror: boolean): Model => ({
    w: 80, d: 30, h: 180,
    pieces: [
      { shape: 'box', x: mirror ? 0 : 77, y: 0, z: 0, w: 3, h: 180, d: 30, fill: 'wood', tag: 'montant' },
      { shape: 'box', x: mirror ? 5 : 72, y: 8, z: 2, w: 3, h: 23, d: 15, fill: 'desk', tag: 'livre' },
    ],
  });
  it('de ¾ et de profil, le montant le plus proche passe après le livre posé contre lui', () => {
    for (const [angle, mirror] of [[1, false], [7, true], [2, false], [6, true]] as const) {
      const tags = renderModel(pair(mirror), angle).shapes.map((s) => s.tag);
      expect(tags.lastIndexOf('livre'), `angle ${angle}`).toBeLessThan(tags.indexOf('montant'));
    }
  });
  it('du côté opposé, le montant lointain passe avant le livre', () => {
    for (const [angle, mirror] of [[7, false], [1, true]] as const) {
      const tags = renderModel(pair(mirror), angle).shapes.map((s) => s.tag);
      expect(tags.lastIndexOf('montant'), `angle ${angle}`).toBeLessThan(tags.indexOf('livre'));
    }
  });
});

describe('faces décorées (décalques) et couleurs propres', () => {
  const card: Model = {
    w: 14, d: 1, h: 12.5,
    pieces: [{ shape: 'box', x: 0, y: 0, z: 0, w: 14, h: 12.5, d: 1, fill: 'metal', color: '#112233', tag: 'corps', decals: [{ face: 'front', key: 'k|cover' }, { face: 'left', key: 'k|spine' }] }],
  };
  it('de face, la face avant porte son décalque avec ses trois coins projetés et sa taille en cm', () => {
    const s = renderModel(card, 0).shapes.find((q) => q.kind === 'poly' && q.decal?.key === 'k|cover');
    expect(s?.kind).toBe('poly');
    if (s?.kind !== 'poly' || !s.decal) return;
    const { tl, tr, bl, w, h } = s.decal;
    expect(tr[0] - tl[0]).toBeCloseTo(14 * PX_PER_CM_X, 6);
    expect(tr[1]).toBeCloseTo(tl[1], 6);
    expect(bl[1] - tl[1]).toBeCloseTo(12.5 * PX_PER_CM_Y, 6);
    expect([w, h]).toEqual([14, 12.5]);
  });
  it('un décalque sur une face cachée n’est pas émis ; la face gauche se voit de profil droit (angle 6)', () => {
    const keys = (a: 0 | 2 | 6) => renderModel(card, a).shapes.flatMap((q) => (q.kind === 'poly' && q.decal ? [q.decal.key] : []));
    expect(keys(0)).toEqual(['k|cover']);
    expect(keys(2)).toEqual([]);
    expect(keys(6)).toEqual(['k|spine']);
  });
  it('la couleur propre et l’étiquette de la pièce passent à ses formes', () => {
    const shapes = renderModel(card, 1).shapes;
    expect(shapes.length).toBeGreaterThan(0);
    for (const q of shapes) expect([q.color, q.tag]).toEqual(['#112233', 'corps']);
  });
});
