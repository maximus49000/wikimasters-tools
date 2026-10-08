// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import type { Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1', name: 'Pièce 1', style: 'scandinave', orientation: 'landscape', cols: 24,
  layout: [
    { id: 'f1', kind: 'shelf', col: 0, row: 4 },
    { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'Daft_Punk' },
    { id: 'f3', kind: 'wall', shape: 'poster', col: 10, row: 1, slug: 'Paris' },
    { id: 'f4', kind: 'wall', shape: 'vinyl', col: 14, row: 1, slug: 'Inconnue' },
  ],
};

function mount(onCardTap = vi.fn()) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined}
        cards={{ Daft_Punk: { title: 'Daft Punk' }, Paris: { title: 'Paris' } }} onCardTap={onCardTap} />,
    );
  });
  return { container, onCardTap };
}

describe('cartes dans la pièce', () => {
  it('dessine les objets rangés et accrochés', () => {
    const { container } = mount();
    expect(container.querySelector('[data-card="Daft_Punk"]')).not.toBeNull();
    expect(container.querySelector('[data-card="Paris"]')).not.toBeNull();
  });

  it('grise une carte inconnue', () => {
    const { container } = mount();
    expect(container.querySelector('[data-card="Inconnue"]')?.getAttribute('data-missing')).toBe('true');
  });

  it('un toucher signale l’objet', () => {
    const { container, onCardTap } = mount();
    act(() => { container.querySelector('[data-card="Paris"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onCardTap).toHaveBeenCalledWith('f3');
  });
});
