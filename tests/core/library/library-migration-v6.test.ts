import { describe, expect, it } from 'vitest';
import { parseLibraryState, refitLayout } from '../../../src/core/library/library-book';
import { drawSize } from '../../../src/core/library/footprint';
import { canPlace, rectOf } from '../../../src/core/library/room-grid';

const v5 = (layout: unknown[], cols = 24) => ({ version: 5, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
  rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols, pets: [], layout }] });

describe('migration v6', () => {
  it('garde la colonne et la dernière rangée au sol, prend la nouvelle taille', () => {
    const s = parseLibraryState(v5([{ id: 'a', kind: 'shelf', col: 0, row: 6 }]));
    expect(s.version).toBe(6);
    const shelf = s.rooms[0]!.layout[0]!;
    const r = rectOf(shelf)!;
    expect(r.col).toBe(0);
    expect(r.row + r.h - 1).toBe(13); // ancienne dernière rangée : 6 + 8 − 1
  });
  it('un meuble agrandi qui déborde est déplacé à la place libre la plus proche, jamais supprimé', () => {
    const s = parseLibraryState(v5([{ id: 'a', kind: 'sofa', col: 18, row: 14 }]));
    const sofa = s.rooms[0]!.layout.find((p) => p.id === 'a')!;
    const r = rectOf(sofa)!;
    expect(r.col + r.w).toBeLessThanOrEqual(24);
  });
  it('deux meubles qui se chevauchent après agrandissement sont séparés quand une place existe', () => {
    const s = parseLibraryState(v5([{ id: 'a', kind: 'sofa', col: 0, row: 14 }, { id: 'b', kind: 'armchair', col: 7, row: 14 }]));
    const layout = s.rooms[0]!.layout;
    const b = layout.find((p) => p.id === 'b')!;
    expect(canPlace(layout, 24, 'armchair', (b as { col: number }).col, (b as { row: number }).row, 'b').ok).toBe(true);
  });
  it('sans aucune place, le meuble est gardé tel quel', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, kind: 'sofa', col: (i % 4) * 6, row: 12 + Math.floor(i / 4) * 2 }));
    const s = parseLibraryState(v5(many));
    expect(s.rooms[0]!.layout).toHaveLength(12);
  });
  it('idempotente', () => {
    const once = parseLibraryState(v5([{ id: 'a', kind: 'sofa', col: 0, row: 14 }, { id: 'b', kind: 'chair', col: 12, row: 13 }]));
    expect(parseLibraryState(once)).toEqual(once);
  });

  // v5 : dernière rangée d'une étagère de profil = row + (8 − 2 + 3) − 1 ; d'un bureau en ¾ = row + (4 − 2 + 3) − 1.
  it('une étagère de profil (angle 2) garde sa dernière rangée', () => {
    const s = parseLibraryState(v5([{ id: 'a', kind: 'shelf', col: 0, row: 4, angle: 2 }]));
    const r = rectOf(s.rooms[0]!.layout[0]!)!;
    expect(r.row + r.h - 1).toBe(4 + 9 - 1);
  });
  it('un bureau en ¾ (angle 1) garde sa dernière rangée', () => {
    const s = parseLibraryState(v5([{ id: 'a', kind: 'desk', col: 2, row: 10, angle: 1 }]));
    const r = rectOf(s.rooms[0]!.layout[0]!)!;
    expect(r.row + r.h - 1).toBe(10 + 5 - 1);
  });
  it('un tapis migre', () => {
    const s = parseLibraryState(v5([{ id: 'a', kind: 'rug', col: 3, row: 13 }]));
    const r = rectOf(s.rooms[0]!.layout[0]!)!;
    expect(r.row + r.h - 1).toBe(15);
  });
  it('ordinateur, objet posé et carte rangée restent attachés à leur hôte', () => {
    const s = parseLibraryState(v5([
      { id: 'd', kind: 'desk', col: 0, row: 12 }, { id: 'c', kind: 'computer', deskId: 'd' },
      { id: 'sh', kind: 'shelf', col: 10, row: 6 }, { id: 'st', kind: 'stored', shape: 'cd', shelfId: 'sh', slot: 0, slug: 'Daft_Punk' },
    ]));
    const layout = s.rooms[0]!.layout;
    expect(layout.find((p) => p.id === 'c')).toEqual({ id: 'c', kind: 'computer', deskId: 'd' });
    expect(layout.find((p) => p.id === 'st')).toMatchObject({ shelfId: 'sh', slot: 0 });
    expect(layout.some((p) => p.id === 'd') && layout.some((p) => p.id === 'sh')).toBe(true);
  });
  it('plusieurs pièces et la pièce maison sont conservées', () => {
    const base = v5([{ id: 'a', kind: 'sofa', col: 0, row: 14 }]);
    const second = { ...base.rooms[0]!, id: 'r2', name: 'Q' };
    const s = parseLibraryState({ ...base, homeRoomId: 'r2', rooms: [base.rooms[0], second] });
    expect(s.rooms.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(s.homeRoomId).toBe('r2');
    expect(s.rooms[1]!.layout).toHaveLength(1);
  });
  it('une pièce de 96 colonnes migre', () => {
    const s = parseLibraryState(v5([{ id: 'a', kind: 'sofa', col: 90, row: 14 }, { id: 'b', kind: 'armchair', col: 92, row: 14 }], 96));
    const layout = s.rooms[0]!.layout;
    expect(layout).toHaveLength(2);
    for (const p of layout) expect(rectOf(p)!.col + rectOf(p)!.w).toBeLessThanOrEqual(96);
  });
  it('sans place, le dernier canapé reste exactement à leur position calculée', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, kind: 'sofa', col: (i % 4) * 6, row: 12 + Math.floor(i / 4) * 2 }));
    const out = parseLibraryState(v5(many)).rooms[0]!.layout as unknown as { id: string; col: number; row: number }[];
    // Refusé = ne passe pas `canPlace` face aux autres : seule la branche « aucune place » peut l'avoir laissé là.
    // Le dernier canapé n'a plus de place : il reste à la position calculée (dernière rangée conservée) et gêne un autre (ou sort de la pièce).
    const last = out.find((p) => p.id === 's11')!;
    const o = many[11]!;
    expect({ col: last.col, row: last.row }).toEqual({ col: o.col, row: o.row + 3 - drawSize('sofa', 0).h });
    const others = out.filter((p) => p.id !== 's11');
    expect(canPlace(others as never, 24, 'sofa', last.col, last.row, 's11').ok).toBe(false);
  });
  it('refitLayout : ancienne taille fournie', () => {
    const out = refitLayout([{ id: 'a', kind: 'sofa', col: 0, row: 10 }] as never, 24, () => ({ w: 1, h: 5 }));
    expect((out[0] as { row: number }).row).toBe(10 + 5 - drawSize('sofa', 0).h);
  });
});
