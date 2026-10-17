import { describe, expect, it } from 'vitest';
import { createInitialState, migrateV8, parseLibraryState, slotToTop } from '../../../src/core/library/library-book';
import { carriedPlacementOf, smallPlacement } from '../../../src/core/library/carried-items';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { ITEM_MODELS } from '../../../src/core/library/item-models';
import { SMALL_ITEMS, type Layout, type SmallItem, type SmallOnTop } from '../../../src/core/library/library-types';
import { firstFreeTopSpot } from '../../../src/core/library/surface';

const state = (version: number, layout: unknown[]) => ({ version, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
  rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout }] });
const desk = { id: 'h', kind: 'desk', col: 0, row: 10 };
const shelf = { id: 'h', kind: 'shelf', col: 0, row: 6 };
const layoutOf = (s: ReturnType<typeof parseLibraryState>): Layout => s.rooms[0]!.layout;

// Référence figée : la pose d'un petit objet en v8 (emplacements entiers, 4 sur un bureau, 3 sur une étagère, la chaîne sur deux).
const OLD_SLOTS = { desk: 4, shelf: 3 } as const;
function oldPlacement(hostKind: 'desk' | 'shelf', item: SmallItem, slot: number): { x: number; y: number; z: number } {
  const host = FURNITURE_MODELS[hostKind];
  const m = ITEM_MODELS[`small-${item}`];
  const span = item === 'hifi' ? 2 : 1;
  return { x: (host.w * (slot + span / 2)) / OLD_SLOTS[hostKind] - m.w / 2, y: host.h, z: host.d / 2 - m.d / 2 };
}

describe('migration v9 (petits objets en cm)', () => {
  it('slotToTop : centre de l’emplacement, mi-profondeur ; la chaîne compte sa zone de pochette', () => {
    expect(slotToTop('desk', 'alarm', 0)).toEqual({ x: 6, z: 26.5 });
    expect(slotToTop('desk', 'hifi', 2)).toEqual({ x: 62, z: 2.5 });
  });

  it('aucun objet ne bouge : même x, y, z qu’avant pour chaque objet, chaque emplacement, chaque porteur', () => {
    let checked = 0;
    for (const hostKind of ['desk', 'shelf'] as const) {
      for (const item of SMALL_ITEMS) {
        if (item === 'hifi' && hostKind !== 'desk') continue;
        const span = item === 'hifi' ? 2 : 1;
        for (let slot = 0; slot + span <= OLD_SLOTS[hostKind]; slot++) {
          const host = hostKind === 'desk' ? desk : shelf;
          const s = parseLibraryState(state(8, [host, { id: 'o', kind: 'small', item, hostId: 'h', slot }]));
          const o = layoutOf(s)[1] as SmallOnTop;
          expect(o, `${hostKind} ${item} ${slot}`).toMatchObject({ kind: 'small', item, hostId: 'h' });
          const pl = smallPlacement('o', item, hostKind, o.x, o.z);
          expect({ x: pl.x, y: pl.y, z: pl.z }, `${hostKind} ${item} ${slot}`).toEqual(oldPlacement(hostKind, item, slot));
          const carried = carriedPlacementOf(layoutOf(s), o)!.placement;
          expect({ x: carried.x, y: carried.y, z: carried.z }).toEqual(oldPlacement(hostKind, item, slot));
          checked++;
        }
      }
    }
    expect(checked).toBe(5 * 4 + 3 + 5 * 3);
  });

  it('un bureau à 4 petits objets migre sans perte, relecture idempotente', () => {
    const smalls = (['alarm', 'clock', 'station', 'plant'] as const).map((item, slot) => ({ id: `s${slot}`, kind: 'small', item, hostId: 'h', slot }));
    const once = parseLibraryState(state(8, [desk, ...smalls]));
    expect(once.version).toBe(9);
    expect(layoutOf(once).map((p) => p.id)).toEqual(['h', 's0', 's1', 's2', 's3']);
    expect(layoutOf(once)[1]).toEqual({ id: 's0', kind: 'small', item: 'alarm', hostId: 'h', ...slotToTop('desk', 'alarm', 0) });
    expect(parseLibraryState(once)).toEqual(once);
  });

  it('migrateV8 seule : version 9, idempotente', () => {
    const out = migrateV8(state(8, [desk, { id: 'o', kind: 'small', item: 'lamp', hostId: 'h', slot: 3 }])) as { version: number; rooms: { layout: unknown[] }[] };
    expect(out.version).toBe(9);
    expect(out.rooms[0]!.layout[1]).toEqual({ id: 'o', kind: 'small', item: 'lamp', hostId: 'h', ...slotToTop('desk', 'lamp', 3) });
    expect(migrateV8(out)).toBe(out);
  });

  it('emplacement abîmé : laissé tel quel, seul cet objet est écarté à la lecture (comme avant)', () => {
    expect(layoutOf(parseLibraryState(state(8, [desk, { id: 'o', kind: 'small', item: 'lamp', hostId: 'h', slot: 1.5 }]))).map((p) => p.id)).toEqual(['h']);
    expect((migrateV8(state(8, [desk, { id: 'o', kind: 'small', item: 'lamp', hostId: 'h', slot: 1.5 }])) as { rooms: { layout: unknown[] }[] }).rooms[0]!.layout[1]).toMatchObject({ slot: 1.5 });
  });

  it('deux petits objets qui se chevauchent : le second est replacé à la première place libre', () => {
    const a = { id: 'a', kind: 'small', item: 'alarm', hostId: 'h', x: 10, z: 10 };
    const s = parseLibraryState(state(9, [desk, a, { ...a, id: 'b' }]));
    const spot = firstFreeTopSpot([desk, a] as Layout, 'h', { item: 'alarm' })!;
    expect(layoutOf(s)[2]).toMatchObject({ id: 'b', ...spot });
  });

  it('second objet qui ne tient nulle part : retiré', () => {
    // Dessus d'étagère 80 × 30 : 10 plantes de 15 × 15 le remplissent (reste une bande de 5 cm).
    const plants = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, kind: 'small', item: 'plant', hostId: 'h', x: (i % 5) * 15, z: Math.floor(i / 5) * 15 }));
    const s = parseLibraryState(state(9, [shelf, ...plants, { ...plants[0]!, id: 'extra' }]));
    expect(layoutOf(s).map((p) => p.id)).not.toContain('extra');
    expect(layoutOf(s)).toHaveLength(11);
  });

  it('carte posée et carte rangée de même slug : la seconde est écartée', () => {
    const posed = { id: 'c', kind: 'posed', shape: 'cd', hostId: 'h', x: 0, z: 0, slug: 'Paris' };
    const s = parseLibraryState(state(9, [shelf, posed, { id: 'r', kind: 'stored', shape: 'cd', shelfId: 'h', level: 0, order: 0, slug: 'Paris' }]));
    expect(layoutOf(s).map((p) => p.id)).toEqual(['h', 'c']);
    const back = parseLibraryState(state(9, [shelf, { id: 'r', kind: 'stored', shape: 'cd', shelfId: 'h', level: 0, order: 0, slug: 'Paris' }, posed]));
    expect(layoutOf(back).map((p) => p.id)).toEqual(['h', 'r']);
  });

  it('carte posée : porteur bureau ou étagère obligatoire', () => {
    const s = parseLibraryState(state(9, [{ id: 'h', kind: 'sofa', col: 0, row: 12 }, { id: 'c', kind: 'posed', shape: 'cd', hostId: 'h', x: 0, z: 0, slug: 'Paris' }]));
    expect(layoutOf(s).map((p) => p.id)).toEqual(['h']);
  });

  it('petit objet sur tablette : seulement sur une étagère, rangs communs avec les objets rangés', () => {
    const onDesk = parseLibraryState(state(9, [desk, { id: 'l', kind: 'small', item: 'lamp', hostId: 'h', level: 1, order: 0 }]));
    expect(layoutOf(onDesk).map((p) => p.id)).toEqual(['h']);
    const s = parseLibraryState(state(9, [shelf,
      { id: 'r', kind: 'stored', shape: 'cd', shelfId: 'h', level: 1, order: 0, slug: 'Paris' },
      { id: 'dup', kind: 'small', item: 'clock', hostId: 'h', level: 1, order: 0 },
      { id: 'l', kind: 'small', item: 'lamp', hostId: 'h', level: 1, order: 5 }]));
    expect(layoutOf(s).map((p) => p.id)).toEqual(['h', 'r', 'l']);
    expect(layoutOf(s)[2]).toMatchObject({ level: 1, order: 1 });
  });

  describe('pièces v8 complètes : chaque objet à sa place, aucun retiré', () => {
    const small = (id: string, hostId: string, item: SmallItem, slot: number) => ({ id, kind: 'small', item, hostId, slot });
    const check = (layout: { id: string; kind: string; hostId?: string; item?: SmallItem; slot?: number }[], hostKind: 'desk' | 'shelf', style = 'scandinave') => {
      const raw = state(8, layout);
      raw.rooms[0]!.style = style;
      const read = layoutOf(parseLibraryState(raw));
      expect(read.map((p) => p.id)).toEqual(layout.map((p) => p.id));
      for (const p of layout) {
        if (p.kind !== 'small') continue;
        expect(read.find((q) => q.id === p.id), p.id).toEqual({ id: p.id, kind: 'small', item: p.item, hostId: p.hostId, ...slotToTop(hostKind, p.item!, p.slot!) });
      }
    };
    it('(a) bureau : chaîne en 0, réveil en 2', () => check([desk, small('c', 'h', 'hifi', 0), small('r', 'h', 'alarm', 2)], 'desk'));
    it('(b) bureau : chaîne en 1, plantes en 0 et 3', () => check([desk, small('c', 'h', 'hifi', 1), small('p0', 'h', 'plant', 0), small('p3', 'h', 'plant', 3)], 'desk'));
    const withPc = [desk, { id: 'pc', kind: 'computer', deskId: 'h' }, small('p0', 'h', 'plant', 0), small('p3', 'h', 'plant', 3)];
    it('(c) bureau avec ordinateur : plantes en 0 et 3', () => check(withPc, 'desk'));
    it('(d) étagère : 3 plantes', () => check([shelf, small('p0', 'h', 'plant', 0), small('p1', 'h', 'plant', 1), small('p2', 'h', 'plant', 2)], 'shelf'));
    it('(e) bureau avec ordinateur dans une pièce Steampunk', () => check(withPc, 'desk', 'steampunk'));
  });

  it('ce que la lecture v8 écartait reste écarté (rien ne change à la mise à jour)', () => {
    const read = (layout: unknown[]) => layoutOf(parseLibraryState(state(8, layout))).map((p) => p.id);
    // Hors des emplacements du porteur : plante en 3 sur une étagère, chaîne en 3 sur un bureau.
    expect(read([shelf, { id: 'o', kind: 'small', item: 'plant', hostId: 'h', slot: 3 }])).toEqual(['h']);
    expect(read([desk, { id: 'o', kind: 'small', item: 'hifi', hostId: 'h', slot: 3 }])).toEqual(['h']);
    // Emplacement déjà pris par un objet gardé avant lui (la chaîne en 0 couvre 0 et 1).
    expect(read([desk, { id: 'c', kind: 'small', item: 'hifi', hostId: 'h', slot: 0 }, { id: 'o', kind: 'small', item: 'plant', hostId: 'h', slot: 1 }])).toEqual(['h', 'c']);
    // Milieu d'un bureau qui porte un ordinateur.
    expect(read([desk, { id: 'pc', kind: 'computer', deskId: 'h' }, { id: 'o', kind: 'small', item: 'plant', hostId: 'h', slot: 2 }])).toEqual(['h', 'pc']);
    // Une chaîne sur une étagère (écartée) ne prend pas d'emplacement.
    expect(read([shelf, { id: 'c', kind: 'small', item: 'hifi', hostId: 'h', slot: 0 }, { id: 'o', kind: 'small', item: 'plant', hostId: 'h', slot: 1 }])).toEqual(['h', 'o']);
  });

  it('une chaîne sur une tablette d’étagère est écartée', () => {
    const s = parseLibraryState(state(9, [shelf, { id: 'c', kind: 'small', item: 'hifi', hostId: 'h', level: 0, order: 0 }, { id: 'l', kind: 'small', item: 'lamp', hostId: 'h', level: 0, order: 1 }]));
    expect(layoutOf(s).map((p) => p.id)).toEqual(['h', 'l']);
    expect(layoutOf(s)[1]).toMatchObject({ level: 0, order: 0 });
  });

  it('nouvel état : version 9', () => {
    expect(createInitialState().version).toBe(9);
  });
});
