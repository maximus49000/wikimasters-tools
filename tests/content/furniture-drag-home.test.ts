import { describe, expect, it } from 'vitest';
import { dropTargetFor, hostAtCell, hostAtSurface } from '../../src/content/furniture-drag';
import type { Layout } from '../../src/core/library/library-types';
import { angleOf, pxRect, rectOf, topRectOn } from '../../src/core/library/room-grid';
import { HOST_TOP } from '../../src/core/library/surface';

// Rectangle visé d'une bande du plateau (une des `count` parts égales de sa largeur, sur toute sa profondeur).
const bandOn = (host: Layout[number], i: number, count: number) => {
  const kind = host.kind as 'desk' | 'shelf';
  const { w, d } = HOST_TOP[kind];
  return topRectOn(pxRect(rectOf(host)!), kind, angleOf(host), { x: (w * i) / count, z: 0, w: w / count, d });
};

const layout: Layout = [
  { id: 'f1', kind: 'desk', col: 2, row: 14 },
  { id: 'f2', kind: 'small', item: 'plant', hostId: 'f1', x: 7.5, z: 22.5 },
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
    // Dessus d'étagère (80 × 30 cm) couvert de 10 lampes de 15 × 15 : la bande restante (5 cm) est trop étroite.
    let full: Layout = layout;
    for (let i = 0; i < 10; i++) full = [...full, { id: `x${i}`, kind: 'small', item: 'lamp', hostId: 'f3', x: (i % 5) * 15, z: Math.floor(i / 5) * 15 }];
    expect(dropTargetFor(full, 48, 'f2', 13, 12)).toMatchObject({ ok: false, reason: 'host-busy' });
  });
});

describe('dropTargetFor : meubles et tapis', () => {
  it('un canapé se dépose avec le bas sur la case visée', () => {
    // Canapé de 6 rangées de haut : bas en ligne 16 → haut en ligne 11.
    expect(dropTargetFor(layout, 48, 's', 30, 16)).toMatchObject({ ok: true, col: 30, top: 11 });
  });

  it('un tapis refuse le mur', () => {
    expect(dropTargetFor(layout, 48, 'r', 3, 5)).toMatchObject({ ok: false, reason: 'floor' });
  });

  it('un meuble peut être déposé sur un tapis', () => {
    const onRug: Layout = [
      { id: 'r', kind: 'rug', col: 0, row: 15 },
      { id: 's', kind: 'sofa', col: 20, row: 14 },
    ];
    expect(dropTargetFor(onRug, 48, 's', 0, 17)).toMatchObject({ ok: true, col: 0, top: 12 });
  });
});

describe('dropTargetFor : petit objet lâché sur la bande des objets', () => {
  const px = (id: string, slot: number, count: number) => {
    const r = bandOn(layout.find((p) => p.id === id)!, slot, count);
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

describe('hostAtSurface : bande des petits objets sur le dessus projeté', () => {
  it('à tout angle, le haut d’un emplacement posé sur le dessus vise son porteur', () => {
    for (const angle of [0, 1, 2, 4, 7] as const) {
      const turned: Layout = [{ id: 'd', kind: 'desk', col: 4, row: 10, angle }];
      const r = bandOn(turned[0]!, 0, 4);
      expect(hostAtSurface(turned, r.x + r.w / 2, r.y + 4), 'angle ' + angle).toBe('d');
    }
  });
  it('au-dessus des objets posés (ancienne bande collée au haut du dessin) : rien', () => {
    const one: Layout = [{ id: 'd', kind: 'desk', col: 4, row: 10 }];
    const draw = pxRect(rectOf(one[0]!)!);
    const top = bandOn(one[0]!, 0, 1).y;
    expect(hostAtSurface(one, draw.x + 10, top - 6)).toBeNull();
  });
});

describe('dropTargetFor : ordinateur', () => {
  it('distingue un bureau déjà équipé d’un bureau au milieu occupé', () => {
    const base: Layout = [
      { id: 'd1', kind: 'desk', col: 2, row: 14 },
      { id: 'd2', kind: 'desk', col: 12, row: 14 },
      { id: 'c1', kind: 'computer', deskId: 'd2' },
      { id: 'c2', kind: 'computer', deskId: 'd1' },
      { id: 'o', kind: 'small', item: 'plant', hostId: 'd1', x: 40, z: 35 },
    ];
    const withoutC2 = base.filter((p) => p.id !== 'c2');
    expect(dropTargetFor(withoutC2, 48, 'c1', 3, 15)).toMatchObject({ ok: false, reason: 'desk-middle' });
    expect(dropTargetFor(base, 48, 'c1', 3, 15)).toMatchObject({ ok: false, reason: 'desk-busy' });
  });
});
