import { describe, expect, it } from 'vitest';
import '../../../src/core/library/cel/models/wood';
import { ROOM_CAMERA, yawOf } from '../../../src/core/library/cel/camera';
import { REST_LIFE } from '../../../src/core/library/cel/life-state';
import { lookOf } from '../../../src/core/library/cel/looks';
import { CEL_MODELS, celPartsOf } from '../../../src/core/library/cel/models';
import { EGG_HOOK, RUN_R, rockingRunners, SAG_BOARD, TASSEL_PIVOT } from '../../../src/core/library/cel/models/wood';
import { renderCel } from '../../../src/core/library/cel/raster';
import { LIFE_SPECS } from '../../../src/core/library/furniture-life-specs';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { STYLE_IDS } from '../../../src/core/library/library-types';
import { INK } from '../../../src/core/library/paint/cel';
import { checkCelModel, topAt } from './furniture-cel-checks';

const KINDS = ['rocking-chair', 'chair', 'egg-chair', 'peacock-chair', 'cat-tree'] as const;
const SEATS = ['rocking-chair', 'chair', 'egg-chair', 'peacock-chair'] as const;
const look = lookOf('scandinave');

// Centre du dessus praticable dans le repère centré (x à droite, z vers le spectateur).
function perchCenter(kind: (typeof KINDS)[number]): [number, number, number] {
  const m = FURNITURE_MODELS[kind], p = m.perch!;
  return [p.x + p.w / 2 - m.w / 2, p.y, m.d / 2 - (p.z + p.d / 2)];
}
const extent = (kind: (typeof KINDS)[number], dent: number) => {
  const vs = celPartsOf(kind, look, { ...REST_LIFE, dent }).flatMap((P) => P.m.v);
  return [0, 2].map((k) => [Math.min(...vs.map((v) => v[k]!)), Math.max(...vs.map((v) => v[k]!))]);
};
// Plus haute surface sous (x, z) parmi celles qui ne dépassent pas `maxY` (le fauteuil œuf a sa coque au-dessus de l'assise).
const seatTop = (parts: ReturnType<typeof celPartsOf>, x: number, z: number, maxY: number) =>
  topAt(parts.map((P) => ({ ...P, m: { ...P.m, t: P.m.t.filter(([a, b, c]) => Math.max(P.m.v[a]![1], P.m.v[b]![1], P.m.v[c]![1]) <= maxY) } })), x, z);

describe('bois, bascule, suspension et arbre à chat en cellulo', () => {
  for (const k of KINDS) it(`${k} : encombrement, dessus, tons, encre, 8 angles`, () => checkCelModel(k));

  it('chaque meuble a son dessin propre (pas de repli celFromModel)', () => {
    for (const k of KINDS) expect(CEL_MODELS[k], k).toBeDefined();
  });

  for (const k of SEATS)
    it(`${k} : dent = 1 abaisse le dessus de l'assise de 2,5 à 4 cm sans changer l'encombrement au sol`, () => {
      const [x, y, z] = perchCenter(k);
      const rest = seatTop(celPartsOf(k, look, REST_LIFE), x, z, y + 20);
      const sat = seatTop(celPartsOf(k, look, { ...REST_LIFE, dent: 1 }), x, z, y + 20);
      expect(Math.abs(rest - y), `${k} : dessus au repos`).toBeLessThanOrEqual(1.5);
      expect(rest - sat, `${k} : creux`).toBeGreaterThanOrEqual(2.5);
      expect(rest - sat, `${k} : creux`).toBeLessThanOrEqual(4);
      const [a, b] = [extent(k, 0), extent(k, 1)];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) expect(Math.abs(a[i]![j]! - b[i]![j]!), `${k} : emprise au sol`).toBeLessThanOrEqual(0.5);
    });

  it('à l’angle 2, les patins du rocking-chair dessinent un arc (au moins 5 pixels d’encre sur 3 lignes successives décalées)', () => {
    const img = renderCel(rockingRunners(look), { cam: ROOM_CAMERA, yaw: yawOf(2), side: 'left', px: 1, ss: 1, shadow: null });
    const ink = INK.toUpperCase();
    const rows: { count: number; minX: number }[] = [];
    for (let y = 0; y < img.h; y++) {
      let count = 0, minX = Infinity;
      for (let x = 0; x < img.w; x++) {
        const i = (y * img.w + x) * 4;
        if (img.rgba[i + 3] !== 255) continue;
        const c = '#' + [0, 1, 2].map((k) => img.rgba[i + k]!.toString(16).padStart(2, '0')).join('').toUpperCase();
        if (c === ink) { count++; minX = Math.min(minX, x); }
      }
      rows.push({ count, minX });
    }
    // Trois lignes successives, chacune avec au moins 5 pixels d'encre, dont le bord gauche se décale d'une ligne à l'autre : une courbe, pas une barre.
    const arc = rows.some((_, y) => y >= 2 && [y, y - 1, y - 2].every((r) => rows[r]!.count >= 5) && rows[y]!.minX !== rows[y - 1]!.minX && rows[y - 1]!.minX !== rows[y - 2]!.minX);
    expect(arc).toBe(true);
    // Les patins touchent le sol au milieu et remontent aux deux bouts (arc de rayon RUN_R).
    const ys = rockingRunners(look).flatMap((P) => P.m.v.map((v) => v[1]));
    expect(Math.min(...ys)).toBeLessThanOrEqual(0.5);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(8);
  });

  it('les patins du rocking-chair sont éclairés comme le reste du meuble (pas tout à l’ombre aux angles 3 et 7)', () => {
    for (const angle of [3, 7] as const) {
      const img = renderCel(rockingRunners(look), { cam: ROOM_CAMERA, yaw: yawOf(angle), side: 'left', px: 1, ss: 1, shadow: null });
      const shades = new Set(rockingRunners(look).map((P) => P.col.shade.toUpperCase()));
      let opaque = 0, shade = 0;
      for (let i = 0; i < img.w * img.h; i++) {
        if (img.rgba[i * 4 + 3] !== 255) continue;
        opaque++;
        const c = '#' + [0, 1, 2].map((k) => img.rgba[i * 4 + k]!.toString(16).padStart(2, '0')).join('').toUpperCase();
        if (shades.has(c)) shade++;
      }
      expect(shade / opaque, `angle ${angle}`).toBeLessThan(0.5);
    }
  });

  it('l’arbre à chat lit sag (le plateau d’arrivée ploie) et tassel (le pompon se balance autour de son accroche)', () => {
    const [x, , z] = perchCenter('cat-tree');
    const rest = celPartsOf('cat-tree', look, REST_LIFE), sagged = celPartsOf('cat-tree', look, { ...REST_LIFE, sag: 1.2 });
    expect(rest.length).toBe(sagged.length);
    // Le dessus praticable est sur le plateau qui ploie : sous l'animal il descend, d'au plus 1,2 cm, et le bord descend plus que le centre.
    const dropCenter = topAt(rest, x, z) - topAt(sagged, x, z);
    const dropEdge = topAt(rest, x + 16, z) - topAt(sagged, x + 16, z);
    expect(dropEdge).toBeGreaterThan(dropCenter);
    expect(dropEdge).toBeLessThanOrEqual(1.2001);
    expect(dropEdge).toBeGreaterThan(0.5);
    // Le pompon : au repos sous son accroche ; balancé de 0,4 rad, il s'écarte en x sans quitter la hauteur de l'accroche.
    const low = (parts: typeof rest) => parts.flatMap((P) => P.m.v).reduce((a, v) => (v[1] < a[1] && Math.abs(v[0] - TASSEL_PIVOT[0]) < 12 && v[1] > 72 && v[1] < 90 ? v : a), [0, Infinity, 0] as [number, number, number]);
    const p0 = low(rest), p1 = low(celPartsOf('cat-tree', look, { ...REST_LIFE, tassel: 0.4 }));
    expect(Math.abs(p0[0] - TASSEL_PIVOT[0])).toBeLessThan(0.5);
    expect(p1[0] - p0[0]).toBeGreaterThan(5);
    expect(p1[1]).toBeGreaterThan(p0[1]);
    expect(p1[1]).toBeLessThan(TASSEL_PIVOT[1]);
  });

  it('les données de mouvement sont déclarées : bascule du rocking-chair, accroche de l’œuf, plateau et pompon de l’arbre à chat', () => {
    expect(LIFE_SPECS['rocking-chair']?.rock).toEqual({ pivot: [0, RUN_R, 0], radius: RUN_R });
    expect(RUN_R).toBe(95);
    expect(LIFE_SPECS['egg-chair']?.swing?.pivot).toEqual(EGG_HOOK);
    // L'accroche est au-dessus de la coque, sous le bout du bras du pied.
    const vs = celPartsOf('egg-chair', look, REST_LIFE).flatMap((P) => P.m.v);
    expect(EGG_HOOK[1]).toBeLessThanOrEqual(Math.max(...vs.map((v) => v[1])));
    expect(EGG_HOOK[1]).toBeGreaterThan(150);
    expect(LIFE_SPECS['cat-tree']?.sag).toEqual({ board: SAG_BOARD, max: 1.2 });
    expect(LIFE_SPECS['cat-tree']?.tassel?.pivot).toEqual(TASSEL_PIVOT);
  });

  it('tous les styles se dessinent (variantes lues sans changer le volume)', () => {
    for (const style of STYLE_IDS)
      for (const k of KINDS) {
        const vs = celPartsOf(k, lookOf(style), REST_LIFE).flatMap((P) => P.m.v);
        const m = FURNITURE_MODELS[k];
        expect(Math.max(...vs.map((v) => v[1])), `${k} ${style}`).toBeLessThanOrEqual(m.h + 2);
        expect(Math.min(...vs.map((v) => v[1])), `${k} ${style}`).toBeGreaterThanOrEqual(-2);
        expect(Math.max(...vs.map((v) => Math.abs(v[0]))), `${k} ${style}`).toBeLessThanOrEqual(m.w / 2 + 2);
        expect(Math.max(...vs.map((v) => Math.abs(v[2]))), `${k} ${style}`).toBeLessThanOrEqual(m.d / 2 + 2);
      }
  });
});
