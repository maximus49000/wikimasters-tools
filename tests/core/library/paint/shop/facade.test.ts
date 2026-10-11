import { describe, expect, it } from 'vitest';
import { SHOP_TYPE_IDS } from '../../../../../src/core/library/city/shops/catalog';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { FAMILY } from '../../../../../src/core/library/paint/shop/families';
import { awningDrop, facadeGeometry, paintFacade, paintGlass, type FacadeSpec } from '../../../../../src/core/library/paint/shop/facade';
import { recordingCtx } from '../recording-ctx';

const spec = (o: Partial<FacadeSpec> = {}): FacadeSpec => ({ type: 'bakery', name: 'Au Pain Perdu', w: 44, doorSide: 'right', state: 'open', placard: false, night: false, lit: false, ...o });
const paint = (s: FacadeSpec) => {
  const rec = recordingCtx();
  paintFacade(tintedCtx(rec, (c) => c), s);
  return rec;
};

describe('façades', () => {
  it('six familles pour les 32 métiers', () => {
    expect(new Set(SHOP_TYPE_IDS.map((t) => FAMILY[t]))).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F']));
    expect(FAMILY.pharmacy).toBe('E');
    expect(FAMILY.records).toBe('D');
    expect(FAMILY.kebab).toBe('C');
  });

  it('déterministes, et le nom est peint', () => {
    for (const t of SHOP_TYPE_IDS) {
      const a = paint(spec({ type: t, name: 'Nom' }));
      const b = paint(spec({ type: t, name: 'Nom' }));
      expect(a.ops).toEqual(b.ops);
      expect(a.texts.join(' ')).toMatch(t === 'pharmacy' ? /PHARMACIE/ : /Nom/);
    }
  });

  it('vitrine percée (ouvert, fermé, travaux) : aucun aplat dans la partie vitrée', () => {
    for (const t of SHOP_TYPE_IDS) {
      for (const [doorSide, state] of [['left', 'open'], ['right', 'open'], ['right', 'closed'], ['left', 'works']] as const) {
        const s = spec({ type: t, doorSide, state });
        const { glass } = facadeGeometry(s);
        const rec = paint(s);
        const inside = rec.ops.filter((o) => o.op === 'fillRect' && o.args[0]! >= glass.x - 0.01 && o.args[1]! >= glass.y - 0.01 && o.args[0]! + o.args[2]! <= glass.x + glass.w + 0.01 && o.args[1]! + o.args[3]! <= glass.y + glass.h + 0.01 && o.args[2]! * o.args[3]! > glass.w * glass.h * 0.5);
        expect(inside).toEqual([]);
        const rects = rec.ops.filter((o) => o.op === 'rect' && o.args[2]! * o.args[3]! >= glass.w * glass.h * 0.9 && o.args[0]! >= glass.x - 0.01 && o.args[0]! + o.args[2]! <= glass.x + glass.w + 0.01 && o.args[1]! >= glass.y - 0.01 && o.args[1]! + o.args[3]! <= glass.y + glass.h + 0.01);
        // aucun chemin rempli couvrant la vitre (seul son cadre est tracé, par strokeRect)
        expect(rects.filter((o) => rec.ops[rec.ops.indexOf(o) + 1]?.op === 'fill')).toEqual([]);
      }
    }
  });

  it('nom comprimé : jamais plus large que le bandeau', () => {
    const rec = paint(spec({ type: 'cafe', name: 'Le Grand Café de la Place et du Commerce Réunis', w: 30 }));
    const sc = rec.ops.filter((o) => o.op === 'scale');
    expect(sc.length).toBeGreaterThan(0);
    expect(Math.min(...sc.map((o) => o.args[0]!))).toBeLessThan(1);
  });

  it('fermé la nuit : rien de lumineux', () => {
    for (const t of ['bar', 'pharmacy', 'restaurant', 'sushi', 'kebab', 'bakery'] as const) {
      const rec = recordingCtx();
      const ctx = tintedCtx(rec, () => '#000001');
      const glowing = ctx.glowing;
      let lights = 0;
      ctx.glowing = (fn: () => void): void => {
        lights++;
        glowing(fn);
      };
      paintFacade(ctx, spec({ type: t, state: 'closed', night: true, lit: false }));
      expect(lights).toBe(0);
    }
  });

  it('ouvert la nuit : le néon et la croix sont allumés', () => {
    for (const t of ['bar', 'pharmacy'] as const) {
      const rec = recordingCtx();
      const ctx = tintedCtx(rec, () => '#000001');
      paintFacade(ctx, spec({ type: t, state: 'open', night: true, lit: true }));
      expect(rec.fills.some((f) => f !== '#000001' && !f.startsWith('rgba(0,0,1'))).toBe(true);
    }
  });

  it('local vide : vitre passée au blanc et panneau À VENDRE', () => {
    const rec = paint(spec({ type: null, name: '', state: 'empty', placard: true }));
    expect(rec.texts).toEqual(['À VENDRE']);
  });

  it('travaux : vitre percée, enseigne déposée = bandeau nu, panneau si le local était à vendre', () => {
    expect(paint(spec({ type: null, name: '', state: 'works' })).texts).toEqual([]);
    expect(paint(spec({ type: null, name: '', state: 'works', placard: true })).texts).toEqual(['À VENDRE']);
    expect(paint(spec({ state: 'works' })).texts).toEqual(['Au Pain Perdu']);
  });

  it('local de 38 à 70 de large, porte des deux côtés : la vitre est dans le local', () => {
    for (const w of [38, 44, 56, 70]) for (const doorSide of ['left', 'right'] as const) {
      const { glass, door } = facadeGeometry(spec({ w, doorSide }));
      expect(glass.x).toBeGreaterThanOrEqual(0);
      expect(glass.x + glass.w).toBeLessThanOrEqual(w);
      expect(door.x + door.w).toBeLessThanOrEqual(w);
      expect(doorSide === 'left' ? door.x : w - door.x - door.w).toBe(0);
    }
  });

  it('vitre du premier plan : teinte, cadre, petits bois de la boiserie seulement', () => {
    const a = recordingCtx();
    paintGlass(a, spec({ type: 'bakery' }), 30, 18);
    const d = recordingCtx();
    paintGlass(d, spec({ type: 'records' }), 30, 18);
    expect(a.ops.some((o) => o.op === 'strokeRect' && o.args.join() === '0,0,30,18')).toBe(true);
    expect(a.ops.filter((o) => o.op === 'lineTo').length).toBeGreaterThan(d.ops.filter((o) => o.op === 'lineTo').length);
  });

  it('store : le personnel est rogné sous le lambrequin (étals et cafés ouverts seulement)', () => {
    expect(awningDrop(spec({ type: 'greengrocer' }))).toBeGreaterThan(5);
    expect(awningDrop(spec({ type: 'cafe' }))).toBeGreaterThan(awningDrop(spec({ type: 'greengrocer' })));
    expect(awningDrop(spec({ type: 'kebab' }))).toBe(0);
    expect(awningDrop(spec({ type: 'bakery' }))).toBe(0);
    expect(awningDrop(spec({ type: 'cafe', state: 'closed' }))).toBe(0);
  });
});
