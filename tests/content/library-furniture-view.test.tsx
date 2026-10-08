// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import type { Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1',
  name: 'Salon',
  style: 'scandinave',
  orientation: 'landscape',
  cols: 48,
  layout: [
    { id: 'a', kind: 'sofa', col: 2, row: 12 },
    { id: 'b', kind: 'rug', col: 2, row: 15 },
    { id: 'c', kind: 'desk', col: 12, row: 14 },
    { id: 'd', kind: 'small', item: 'plant', hostId: 'c', slot: 0 },
    { id: 'e', kind: 'computer', deskId: 'c' },
    { id: 'f', kind: 'chair', col: 20, row: 15 },
    { id: 'g', kind: 'armchair', col: 24, row: 14 },
    { id: 'h', kind: 'basket', col: 28, row: 16 },
    { id: 'i', kind: 'bowl', col: 32, row: 17 },
    { id: 'j', kind: 'kennel', col: 34, row: 14 },
    { id: 'k', kind: 'plant', col: 40, row: 14 },
    { id: 'l', kind: 'lamp', col: 38, row: 13 },
    { id: 'm', kind: 'coffee-table', col: 3, row: 15 },
    { id: 'n', kind: 'shelf', col: 42, row: 10 },
    { id: 'o', kind: 'small', item: 'lamp', hostId: 'n', slot: 2 },
  ],
};

function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} />);
  });
  return container;
}

describe('RoomView : mobilier', () => {
  it('dessine chaque type de meuble', () => {
    const container = mount();
    for (const kind of ['sofa', 'rug', 'desk', 'small', 'computer', 'chair', 'armchair', 'basket', 'bowl', 'kennel', 'plant', 'lamp', 'coffee-table', 'shelf']) {
      expect(container.querySelector(`[data-furniture="${kind}"]`), kind).not.toBeNull();
    }
    expect(container.querySelectorAll('[data-furniture="small"]')).toHaveLength(2);
  });

  it('dessine le tapis sous les meubles et les petits objets sur leur porteur', () => {
    const order = [...mount().querySelectorAll('[data-furniture]')].map((el) => `${el.getAttribute('data-furniture')}:${el.getAttribute('data-id')}`);
    const at = (id: string) => order.findIndex((entry) => entry.endsWith(`:${id}`));
    expect(at('b')).toBeLessThan(at('a'));
    expect(at('c')).toBeLessThan(at('d'));
    expect(at('d')).toBeLessThan(at('e'));
    expect(at('n')).toBeLessThan(at('o'));
  });

  it('dessine le meuble le plus proche du spectateur en dernier', () => {
    const order = [...mount().querySelectorAll('[data-furniture]')].map((el) => el.getAttribute('data-id'));
    // la table basse (bas en ligne 17) passe devant le canapé (bas en ligne 15)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('m'));
  });
});
