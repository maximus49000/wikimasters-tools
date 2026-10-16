import { describe, expect, it } from 'vitest';
import { storedPlacementsOf } from '../../../src/core/library/carried-items';
import { itemFootprintCm, itemPieces, storedModel } from '../../../src/core/library/item-models';
import type { Layout } from '../../../src/core/library/library-types';
import { placeStanding, setStoredBox, storeCard, storedWidthCm } from '../../../src/core/library/room-grid';

const decalsOf = (ps: ReturnType<typeof itemPieces>) => ps.flatMap((p) => (p.shape === 'box' ? (p.decals ?? []).map((d) => `${d.face}:${d.key}`) : []));

describe('format de boîte et présentation de dos', () => {
  it('storedModel : dimensions du format, sinon modèle du type', () => {
    const sw = storedModel('game', 'switch');
    expect([sw.w, sw.h, sw.d]).toEqual([10.5, 17, 1.1]);
    const g = storedModel('game');
    expect([g.w, g.h, g.d]).toEqual([13.5, 19, 1.5]);
    // Le format ne concerne que les jeux.
    expect(storedModel('cd', 'switch').w).toBe(14);
    const body = sw.pieces[0]!;
    expect(body.shape === 'box' && body.color).toBe('#E60012');
  });

  it('empreinte : cover et back = largeur, spine = épaisseur', () => {
    expect(itemFootprintCm('game', 'back', 'bluray')).toBe(13.5);
    expect(itemFootprintCm('game', 'cover', 'switch')).toBe(10.5);
    expect(itemFootprintCm('game', 'spine', 'switch')).toBe(1.1);
    expect(storedWidthCm({ shape: 'game', box: 'ds' })).toBe(13.5);
    expect(storedWidthCm({ shape: 'game', box: 'psp' })).toBe(11);
  });

  it('de dos : le décalque du dos passe devant, la couverture derrière', () => {
    const front = decalsOf(itemPieces({ key: 'g', shape: 'game', display: 'cover', x: 0, y: 0, z: 0 }));
    expect(front).toContain('front:g|cover:game');
    expect(front).toContain('back:g|back:game');
    const back = decalsOf(itemPieces({ key: 'g', shape: 'game', display: 'back', x: 0, y: 0, z: 0 }));
    expect(back).toContain('front:g|back:game');
    expect(back).toContain('back:g|cover:game');
    expect(back).toContain('right:g|spine:game');
  });

  it('de dos : mêmes pièces que de face (présentoir compris)', () => {
    const a = itemPieces({ key: 'g', shape: 'game', display: 'cover', box: 'switch', x: 3, y: 4, z: 2 });
    const b = itemPieces({ key: 'g', shape: 'game', display: 'back', box: 'switch', x: 3, y: 4, z: 2 });
    expect(b.length).toBe(a.length);
    expect(b.length).toBeGreaterThan(1);
  });

  it('storedPlacement : box, et couleur du boîtier de la console', () => {
    let layout: Layout = placeStanding([], 24, 'shelf', 0, 7, 'f1')!;
    layout = storeCard(layout, 'f1', 0, 0, 'game', 'S1', 'g1')!;
    layout = setStoredBox(layout, 'g1', 'switch', '#107C10');
    const pl = storedPlacementsOf(layout, 'f1').get('g1')!;
    expect(pl.box).toBe('switch');
    expect(pl.color).toBe('#107C10');
    const body = itemPieces(pl).find((p) => p.shape === 'box' && p.decals);
    expect(body?.shape === 'box' && body.color).toBe('#107C10');
    expect(body?.shape === 'box' && body.w).toBe(10.5);
    // Sans couleur propre : plastique du format.
    layout = setStoredBox(layout, 'g1', 'switch');
    const pl2 = storedPlacementsOf(layout, 'f1').get('g1')!;
    expect(pl2.color).toBeUndefined();
    const body2 = itemPieces(pl2).find((p) => p.shape === 'box' && p.decals);
    expect(body2?.shape === 'box' && body2.color).toBe('#E60012');
  });

  it('setStoredBox sur une tablette pleine : rien ne bouge, rien n’est retiré', () => {
    let layout: Layout = placeStanding([], 24, 'shelf', 0, 7, 'f1')!;
    for (let i = 0; i < 5; i++) layout = storeCard(layout, 'f1', 0, i, 'game', `S${i}`, `g${i}`)!;
    const next = setStoredBox(layout, 'g2', 'bluray');
    expect(next).toHaveLength(layout.length);
    for (const p of layout) {
      const q = next.find((x) => x.id === p.id)!;
      expect(q).toMatchObject(p.kind === 'stored' ? { shelfId: p.shelfId, level: p.level, order: p.order } : {});
    }
    expect(next.find((p) => p.id === 'g2')).toMatchObject({ box: 'bluray' });
    // Un objet inconnu : inchangé.
    expect(setStoredBox(layout, 'nope', 'ds')).toBe(layout);
  });
});
