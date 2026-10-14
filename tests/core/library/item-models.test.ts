// tests/core/library/item-models.test.ts
import { describe, expect, it } from 'vitest';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { PX_PER_CM_X, PX_PER_CM_Y, faceCornersOf, openingOf, pieceBounds, renderModel, type Model, type Piece, type Shape } from '../../../src/core/library/furniture-render3d';
import { ITEM_MODELS, STEAMPUNK_MONITOR, bookColor, itemFootprintCm, itemPieces, type ItemShape } from '../../../src/core/library/item-models';

const CELL_W = 30;
const CELL_H = 510 / 18;
const ANGLES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const decals = (shapes: Shape[]) => shapes.flatMap((s) => (s.kind === 'poly' && s.decal ? [s.decal] : []));
const shelfWith = (...pieces: Piece[]): Model => ({ ...FURNITURE_MODELS.shelf, pieces: [...FURNITURE_MODELS.shelf.pieces, ...pieces] });
const decalKeys = (ps: Piece[]) => ps.flatMap((p) => (p.shape === 'box' ? (p.decals ?? []).map((d) => `${d.face}:${d.key}`) : []));

describe('ITEM_MODELS', () => {
  it('vraies dimensions (largeur de couverture × hauteur × épaisseur, en cm)', () => {
    const dims = (s: ItemShape) => [ITEM_MODELS[s].w, ITEM_MODELS[s].h, ITEM_MODELS[s].d];
    expect(dims('cd')).toEqual([14, 12.5, 1]);
    expect(dims('dvd')).toEqual([13.5, 19, 1.5]);
    expect(dims('game')).toEqual([13.5, 19, 1.5]);
    expect(dims('book')).toEqual([15, 23, 3]);
    expect(dims('monitor')).toEqual([55, 43, 16]);
    expect(dims('small-plant')).toEqual([15, 25, 15]);
    expect(dims('small-lamp')).toEqual([15, 30, 15]);
  });
  it('largeur occupée sur la tablette : la largeur de face, ou l’épaisseur sur la tranche', () => {
    expect(itemFootprintCm('cd', 'cover')).toBe(14);
    expect(itemFootprintCm('cd', 'spine')).toBe(1);
    expect(itemFootprintCm('book', 'spine')).toBe(3);
    expect(itemFootprintCm('dvd', 'cover')).toBe(13.5);
  });
  it('chaque objet rangé déclare sa couverture (face avant) et sa tranche (face gauche)', () => {
    for (const s of ['cd', 'dvd', 'game', 'book'] as const) {
      const keys = decalKeys(ITEM_MODELS[s].pieces).map((k) => k.split(':').slice(0, 2).join(':'));
      expect(keys).toContain('front:cover');
      expect(keys).toContain('left:spine');
    }
  });
  it('toutes les formes sont finies et restent dans leur boîte, à chaque angle (Steampunk compris)', () => {
    const all: [string, Model][] = [...(Object.keys(ITEM_MODELS) as ItemShape[]).map((s): [string, Model] => [s, ITEM_MODELS[s]]), ['steampunk', STEAMPUNK_MONITOR]];
    for (const [name, m] of all) {
      for (const a of ANGLES) {
        const r = renderModel(m, a);
        expect(r.shapes.length, `${name} ${a}`).toBeGreaterThan(0);
        // Le dessin est centré dans ses cases (layoutOf) : il ne déborde que si sa trace tournée est plus large qu'elles, de la moitié de l'excès.
        const t = (a * Math.PI) / 4;
        const traceW = m.round ? m.w : Math.abs(m.w * Math.cos(t)) + Math.abs(m.d * Math.sin(t));
        const over = Math.max(0, (traceW * PX_PER_CM_X - r.cols * CELL_W) / 2) + 0.5;
        for (const s of r.shapes) {
          const pts: [number, number][] = 'points' in s ? s.points : [[s.cx - s.rx, s.cy - s.ry], [s.cx + s.rx, s.cy + s.ry]];
          for (const [x, y] of pts) {
            expect(Number.isFinite(x) && Number.isFinite(y), `${name} ${a}`).toBe(true);
            expect(x, `${name} ${a}`).toBeGreaterThanOrEqual(-over);
            expect(x, `${name} ${a}`).toBeLessThanOrEqual(r.cols * CELL_W + over);
            expect(y, `${name} ${a}`).toBeGreaterThanOrEqual(-0.5);
            expect(y, `${name} ${a}`).toBeLessThanOrEqual(r.rows * CELL_H + 0.5);
          }
        }
      }
    }
  });
  it('l’écran se voit de face et de ¾, pas de dos', () => {
    for (const m of [ITEM_MODELS.monitor, STEAMPUNK_MONITOR]) {
      for (const a of [0, 1, 7] as const) expect(decals(renderModel(m, a).shapes).map((d) => d.key.split(':')[0])).toContain('screen');
      expect(decals(renderModel(m, 4).shapes)).toEqual([]);
    }
  });
  it('couleur du dos d’un livre : stable et en #RRGGBB', () => {
    expect(bookColor('Paris')).toMatch(/^#[0-9a-f]{6}$/);
    expect(bookColor('Paris')).toBe(bookColor('Paris'));
    expect(bookColor('Paris')).not.toBe(bookColor('Kiki'));
  });
});

describe('objets posés dans le repère de leur meuble', () => {
  it('posé de face : boîte à sa place, clés de décalque préfixées par l’objet', () => {
    const ps = itemPieces({ key: 'c1', shape: 'cd', display: 'cover', x: 10, y: 61, z: 27 });
    expect(pieceBounds(ps[0]!)).toEqual([10, 24, 61, 73.5, 27, 28]);
    expect(decalKeys(ps)).toContain('front:c1|cover:cd');
  });
  it('posé sur la tranche : tourné d’un quart, la tranche devant, la couverture à droite', () => {
    const [book] = itemPieces({ key: 'b', shape: 'book', display: 'spine', x: 5, y: 8, z: 1, color: '#336699' });
    expect(pieceBounds(book!)).toEqual([5, 8, 8, 31, 1, 16]);
    expect(decalKeys([book!])).toEqual(expect.arrayContaining(['front:b|spine:book', 'right:b|cover:book']));
    expect(book!.color).toBe('#336699');
  });
  it('un CD de face sur l’étagère à l’angle 0 montre sa couverture à sa vraie largeur', () => {
    const r = renderModel(shelfWith(...itemPieces({ key: 'c1', shape: 'cd', display: 'cover', x: 10, y: 61, z: 27 })), 0);
    const cover = decals(r.shapes).find((d) => d.key === 'c1|cover:cd')!;
    expect(cover.tr[0] - cover.tl[0]).toBeCloseTo(14 * PX_PER_CM_X, 6);
    expect(cover.bl[1] - cover.tl[1]).toBeCloseTo(12.5 * PX_PER_CM_Y, 6);
  });
  it('un CD de face vu de profil : plus de couverture ; sa tranche (titre) se voit de profil droit', () => {
    const keys = (a: 2 | 6) => decals(renderModel(ITEM_MODELS.cd, a).shapes).map((d) => d.key.split(':')[0]);
    expect(keys(2)).not.toContain('cover');
    expect(keys(6)).not.toContain('cover');
    expect(keys(6)).toContain('spine');
  });
  it('un livre sur la tranche : tranche visible de face, couverture visible de ¾ (angle 1)', () => {
    const shelf = shelfWith(...itemPieces({ key: 'b', shape: 'book', display: 'spine', x: 5, y: 8, z: 1 }));
    const at = (a: 0 | 1) => decals(renderModel(shelf, a).shapes);
    expect(at(0).map((d) => d.key)).toContain('b|spine:book');
    expect(at(0).map((d) => d.key)).not.toContain('b|cover:book');
    const spine = at(0).find((d) => d.key === 'b|spine:book')!;
    expect(spine.tr[0] - spine.tl[0]).toBeCloseTo(3 * PX_PER_CM_X, 6);
    expect(at(1).map((d) => d.key)).toContain('b|cover:book');
  });
  it('réveil, pendulette et station de table ont leurs dimensions et une face décorée', () => {
    expect([ITEM_MODELS['small-alarm'].w, ITEM_MODELS['small-alarm'].d, ITEM_MODELS['small-alarm'].h]).toEqual([18, 7, 9]);
    expect([ITEM_MODELS['small-clock'].w, ITEM_MODELS['small-clock'].d, ITEM_MODELS['small-clock'].h]).toEqual([14, 6, 16]);
    expect([ITEM_MODELS['small-station'].w, ITEM_MODELS['small-station'].d, ITEM_MODELS['small-station'].h]).toEqual([15, 6, 11]);
    for (const shape of ['small-alarm', 'small-clock', 'small-station'] as const) {
      const decals = ITEM_MODELS[shape].pieces.flatMap((p) => ('decals' in p && p.decals) || []);
      expect(decals).toContainEqual({ face: 'front', key: `face:${shape.slice(6)}` });
    }
  });
  it('de ¾, l’objet passe après la tablette qui le porte ; ses formes sont marquées « rangé »', () => {
    const tagged = FURNITURE_MODELS.shelf.pieces.map((p): Piece => (p.shape === 'box' && p.y === 58 ? { ...p, tag: 'board' } : p));
    const shelf: Model = { ...FURNITURE_MODELS.shelf, pieces: [...tagged, ...itemPieces({ key: 'g', shape: 'game', display: 'cover', x: 55, y: 61, z: 26.5 })] };
    const order = renderModel(shelf, 1).shapes;
    const cover = order.findIndex((s) => s.kind === 'poly' && s.decal?.key === 'g|cover:game');
    expect(cover).toBeGreaterThan(-1);
    expect(order.map((s) => s.tag).lastIndexOf('board')).toBeLessThan(cover);
    expect(order[cover]!.tag).toBe('stored:g');
  });
  it('ouverture de l’étagère : face avant entre montants, plinthe et dessus, projetée (parallélogramme de ¾), absente de profil et de dos', () => {
    for (const a of [0, 1, 7] as const) {
      const o = openingOf(FURNITURE_MODELS.shelf, a)!;
      const c = faceCornersOf(FURNITURE_MODELS.shelf, a)!;
      expect(o).toHaveLength(4);
      expect(o[0]).toEqual(c.tl);
      expect(o[1]).toEqual(c.tr);
      expect(o[3]).toEqual(c.bl);
      expect(o[2]![0]).toBeCloseTo(c.tr[0] + c.bl[0] - c.tl[0], 6);
    }
    for (const a of [2, 3, 4, 5, 6] as const) expect(openingOf(FURNITURE_MODELS.shelf, a)).toBeNull();
  });
  it('petite lampe : abat-jour étiqueté pour l’allumage', () => {
    const ps = itemPieces({ key: 'l', shape: 'small-lamp', x: 8, y: 75, z: 35 });
    expect(ps.some((p) => p.tag === 'glow:l')).toBe(true);
  });
});
