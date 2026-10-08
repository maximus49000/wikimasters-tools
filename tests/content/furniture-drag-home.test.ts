import { describe, expect, it } from 'vitest';
import { dropTargetFor, hostAtCell } from '../../src/content/furniture-drag';
import type { Layout } from '../../src/core/library/library-types';
import { pxRect, rectOf, surfaceSlotRect } from '../../src/core/library/room-grid';

const layout: Layout = [
  { id: 'f1', kind: 'desk', col: 2, row: 14 },
  { id: 'f2', kind: 'small', item: 'plant', hostId: 'f1', slot: 0 },
  { id: 'f3', kind: 'shelf', col: 12, row: 10 },
  { id: 'r', kind: 'rug', col: 0, row: 15 },
  { id: 's', kind: 'sofa', col: 20, row: 14 },
];

describe('hostAtCell', () => {
  it('trouve le bureau ou l’étagère qui contient la case', () => {
    expect(hostAtCell(layout, 3, 15)).toBe('f1');
    expect(hostAtCell(layout, 13, 12)).toBe('f3');
    expect(hostAtCell(layout, 8, 15)).toBeNull();
  });
});

describe('dropTargetFor : petit objet', () => {
  it('se pose sur une étagère', () => {
    const target = dropTargetFor(layout, 48, 'f2', 13, 12);
    expect(target).toMatchObject({ ok: true, hostId: 'f3' });
  });

  it('reste valable sur son propre porteur', () => {
    expect(dropTargetFor(layout, 48, 'f2', 3, 15)).toMatchObject({ ok: true, hostId: 'f1' });
  });

  it('refuse hors d’un porteur', () => {
    expect(dropTargetFor(layout, 48, 'f2', 8, 15)).toMatchObject({ ok: false, reason: 'not-host' });
  });

  it('refuse un porteur plein', () => {
    let full: Layout = layout;
    for (let i = 0; i < 3; i++) full = [...full, { id: `x${i}`, kind: 'small', item: 'lamp', hostId: 'f3', slot: i }];
    expect(dropTargetFor(full, 48, 'f2', 13, 12)).toMatchObject({ ok: false, reason: 'host-busy' });
  });
});

describe('dropTargetFor : meubles et tapis', () => {
  it('un canapé se dépose avec le bas sur la case visée', () => {
    expect(dropTargetFor(layout, 48, 's', 30, 16)).toMatchObject({ ok: true, col: 30, top: 14 });
  });

  it('un tapis refuse le mur', () => {
    expect(dropTargetFor(layout, 48, 'r', 3, 5)).toMatchObject({ ok: false, reason: 'floor' });
  });

  it('un meuble peut être déposé sur un tapis', () => {
    const onRug: Layout = [
      { id: 'r', kind: 'rug', col: 0, row: 15 },
      { id: 's', kind: 'sofa', col: 20, row: 14 },
    ];
    expect(dropTargetFor(onRug, 48, 's', 0, 17)).toMatchObject({ ok: true, col: 0, top: 15 });
  });
});

describe('dropTargetFor : petit objet lâché sur la bande des objets', () => {
  const px = (id: string, slot: number, count: number) => {
    const host = layout.find((p) => p.id === id)!;
    const r = surfaceSlotRect(pxRect(rectOf(host)!), count, slot);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };

  it('accepte le pixel de son propre emplacement', () => {
    const { x, y } = px('f1', 0, 4);
    const target = dropTargetFor(layout, 48, 'f2', Math.floor(x / 36), Math.floor(y / 36), x, y);
    expect(target).toMatchObject({ ok: true, hostId: 'f1' });
  });

  it('accepte la bande au-dessus d’un autre porteur', () => {
    const { x, y } = px('f3', 0, 3);
    const target = dropTargetFor(layout, 48, 'f2', Math.floor(x / 36), Math.floor(y / 36), x, y);
    expect(target).toMatchObject({ ok: true, hostId: 'f3' });
  });
});

describe('dropTargetFor : ordinateur', () => {
  it('distingue un bureau déjà équipé d’un bureau au milieu occupé', () => {
    const base: Layout = [
      { id: 'd1', kind: 'desk', col: 2, row: 14 },
      { id: 'd2', kind: 'desk', col: 12, row: 14 },
      { id: 'c1', kind: 'computer', deskId: 'd2' },
      { id: 'c2', kind: 'computer', deskId: 'd1' },
      { id: 'o', kind: 'small', item: 'plant', hostId: 'd1', slot: 1 },
    ];
    const withoutC2 = base.filter((p) => p.id !== 'c2');
    expect(dropTargetFor(withoutC2, 48, 'c1', 3, 15)).toMatchObject({ ok: false, reason: 'desk-middle' });
    expect(dropTargetFor(base, 48, 'c1', 3, 15)).toMatchObject({ ok: false, reason: 'desk-busy' });
  });
});
