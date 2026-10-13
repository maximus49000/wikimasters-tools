// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import type { Layout, Room } from '../../src/core/library/library-types';

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
  it('un canapé tourné est dessiné par le projecteur (polygones) avec son angle', () => {
    const c = mount([{ id: 'a', kind: 'sofa', col: 2, row: 14, angle: 1 }]);
    const g = c.querySelector('[data-furniture="sofa"]')!;
    expect(g.getAttribute('data-angle')).toBe('1');
    expect(g.querySelectorAll('polygon, path[data-face]').length).toBeGreaterThan(3);
  });
  it('de face : le dessin d’origine, sans data-angle', () => {
    const c = mount([{ id: 'a', kind: 'sofa', col: 2, row: 14 }]);
    expect(c.querySelector('[data-furniture="sofa"]')!.hasAttribute('data-angle')).toBe(false);
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
