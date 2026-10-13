// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import { STANDING_KINDS, type Layout, type Room } from '../../src/core/library/library-types';
import { STEAMPUNK_ONLY } from '../../src/core/library/furniture-catalog';
import { shelfSlotsOf } from '../../src/core/library/room-grid';

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
    expect(Number(dashed[0]!.getAttribute('x'))).toBeCloseTo(slots[1]!.x, 1);
    expect(Number(dashed[0]!.getAttribute('y'))).toBeCloseTo(slots[1]!.y, 1);
    expect(Number(dashed[0]!.getAttribute('width'))).toBeCloseTo(slots[1]!.w, 1);
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
