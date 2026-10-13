// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import { STANDING_KINDS, type Layout, type Room } from '../../src/core/library/library-types';
import { STEAMPUNK_ONLY } from '../../src/core/library/furniture-catalog';
import { pxRect, rectOf, shelfSlotsOf, surfaceSlotRectOn } from '../../src/core/library/room-grid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(layout: Layout, extra: Partial<Parameters<typeof RoomView>[0]> = {}) {
  const room: Room = { id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout };
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    createRoot(container).render(
      <RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined}
        cards={{ Daft_Punk: { title: 'Daft Punk' }, Paris: { title: 'Paris' } }} {...extra} />,
    );
  });
  return container;
}

describe('meubles tournés', () => {
  it('un canapé tourné est dessiné par son modèle 3D avec son angle', () => {
    const c = mount([{ id: 'a', kind: 'sofa', col: 2, row: 14, angle: 1 }]);
    const g = c.querySelector('[data-furniture="sofa"]')!;
    expect(g.getAttribute('data-angle')).toBe('1');
    expect(g.querySelectorAll('[data-model3d] polygon').length).toBeGreaterThan(3);
  });
  it('de face aussi : le modèle 3D, sans data-angle', () => {
    const c = mount([{ id: 'a', kind: 'sofa', col: 2, row: 14 }]);
    const g = c.querySelector('[data-furniture="sofa"]')!;
    expect(g.hasAttribute('data-angle')).toBe(false);
    expect(g.querySelector('[data-model3d]')).not.toBeNull();
  });
  it('chaque meuble debout, à chaque angle, est dessiné par son modèle 3D', () => {
    for (const kind of STANDING_KINDS.filter((k) => !(STEAMPUNK_ONLY as readonly string[]).includes(k))) {
      for (const angle of [0, 3, 6] as const) {
        const c = mount([{ id: 'a', kind, col: 2, row: 14, angle }]);
        expect(c.querySelector(`[data-furniture="${kind}"] [data-model3d]`), `${kind} ${angle}`).not.toBeNull();
      }
    }
  });
  it('en Aménager, les emplacements vides de l’étagère sont ceux où se rangent les cartes (face projetée)', () => {
    const shelf = { id: 's', kind: 'shelf', col: 0, row: 6, angle: 1 } as const;
    const c = mount([shelf, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', slot: 0, slug: 'Daft_Punk' }], { editing: true });
    const slots = shelfSlotsOf(shelf);
    const dashed = [...c.querySelectorAll('[data-furniture="shelf"] rect[stroke-dasharray="3 3"]')];
    expect(dashed).toHaveLength(14);
    // Pointillé = emplacement dans le repère de la face, posé par la même matrice que les cartes (face inclinée en ¾).
    expect(Number(dashed[0]!.getAttribute('x'))).toBeCloseTo(slots[1]!.local.x, 1);
    expect(Number(dashed[0]!.getAttribute('y'))).toBeCloseTo(slots[1]!.local.y, 1);
    expect(Number(dashed[0]!.getAttribute('width'))).toBeCloseTo(slots[1]!.local.w, 1);
    expect(dashed[0]!.parentElement!.getAttribute('transform')).toBe(`matrix(${slots[1]!.m.join(' ')})`);
    const card = c.querySelector('[data-card="Daft_Punk"]')!;
    expect(card.querySelector('g[transform]')!.getAttribute('transform')).toBe(`matrix(${slots[0]!.m.join(' ')})`);
  });
  it('petits objets sur un porteur tourné : dessinés du fond vers l’avant (le plus haut à l’écran d’abord)', () => {
    const smalls = [0, 1, 2].map((slot) => ({ id: `o${slot}`, kind: 'small', item: 'plant', hostId: 's', slot }) as const);
    const order = (angle: 0 | 1 | 7) => [...mount([{ id: 's', kind: 'shelf', col: 0, row: 6, angle }, ...smalls]).querySelectorAll('[data-furniture="small"]')].map((e) => e.getAttribute('data-id'));
    const byDepth = (angle: 1 | 7) => {
      const host = pxRect(rectOf({ id: 's', kind: 'shelf', col: 0, row: 6, angle })!);
      return [0, 1, 2].map((i) => ({ id: `o${i}`, y: surfaceSlotRectOn(host, 'shelf', angle, i).y })).sort((a, b) => a.y - b.y).map((o) => o.id);
    };
    expect(order(0)).toEqual(['o0', 'o1', 'o2']);
    expect(order(1)).toEqual(byDepth(1));
    expect(order(7)).toEqual(byDepth(7));
    expect(order(1)).toEqual([...order(7)].reverse());
  });
  it('étagère de profil en Aménager : pas d’emplacements (face cachée)', () => {
    const c = mount([{ id: 's', kind: 'shelf', col: 0, row: 6, angle: 2 }], { editing: true });
    expect(c.querySelectorAll('rect[stroke-dasharray="3 3"]')).toHaveLength(0);
  });
  it('les cartes rangées sont visibles de face et de ¾, cachées de profil', () => {
    const stored = { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', slot: 0, slug: 'Daft_Punk' } as const;
    expect(mount([{ id: 's', kind: 'shelf', col: 0, row: 6, angle: 1 }, stored]).querySelector('[data-card="Daft_Punk"]')).not.toBeNull();
    expect(mount([{ id: 's', kind: 'shelf', col: 0, row: 6, angle: 2 }, stored]).querySelector('[data-card="Daft_Punk"]')).toBeNull();
  });
  it('l’écran d’un bureau de dos n’est ni dessiné ni touchable', () => {
    const c = mount([{ id: 'd', kind: 'desk', col: 2, row: 11, angle: 4 }, { id: 'pc', kind: 'computer', deskId: 'd', slug: 'Paris' }]);
    expect(c.querySelector('[data-screen]')).toBeNull();
    expect(c.querySelector('[data-computer-back]')).not.toBeNull();
  });
  it('le fantôme montre ses cases au sol', () => {
    const c = mount([{ id: 'a', kind: 'sofa', col: 2, row: 14, angle: 1 }], {
      editing: true,
      placing: { id: 'a', ok: false, ghost: { col: 2, row: 14, w: 7, h: 3 }, floor: [{ col: 2, row: 14 }, { col: 3, row: 14 }] },
    });
    expect(c.querySelectorAll('[data-floor-cell="refused"]')).toHaveLength(2);
  });
});
