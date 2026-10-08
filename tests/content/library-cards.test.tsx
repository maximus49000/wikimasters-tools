// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import type { ImageService } from '../../src/core/images/image-service';
import { setImageService } from '../../src/content/image-registry';
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

describe('dessin détaillé', () => {
  const full: Room = {
    ...room,
    layout: [
      { id: 'f1', kind: 'shelf', col: 0, row: 4 },
      { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'Daft_Punk' },
      { id: 'f3', kind: 'wall', shape: 'poster', col: 10, row: 1, slug: 'Paris' },
      { id: 'd1', kind: 'desk', col: 14, row: 8 },
      { id: 'c1', kind: 'computer', deskId: 'd1', slug: 'Paris' },
    ],
  };
  const cards = { Daft_Punk: { title: 'Daft Punk' }, Paris: { title: 'Paris', imageUrl: 'own.png' } };
  const render = (editing: boolean, selectedId: string | null = null) => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<RoomView room={full} editing={editing} cellsActive={false} selectedId={selectedId} blink={[]} onCell={() => undefined} onPick={() => undefined} cards={cards} />);
    });
    return container;
  };

  it('ne dessine en pointillés que les emplacements vides', () => {
    const c = render(true);
    expect(c.querySelectorAll('rect[stroke-dasharray="3 3"]').length).toBe(14);
  });

  it('l’écran d’un ordinateur affichant une carte est touchable', () => {
    expect(render(false).querySelector('[data-screen="c1"]')).not.toBeNull();
  });

  it('contourne l’objet sélectionné en mode Aménager', () => {
    const c = render(true, 'f3');
    expect(c.querySelector('[data-id="f3"] rect[stroke-dasharray="6 4"]')).not.toBeNull();
    expect(c.querySelector('[data-id="f2"] rect[stroke-dasharray="6 4"]')).toBeNull();
  });

  it('prend l’image du service et se met à jour quand il notifie', () => {
    let url = 'a.png';
    const listeners = new Set<() => void>();
    setImageService({ displayUrl: () => url, subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); } } as unknown as ImageService);
    try {
      const c = render(false);
      expect(c.querySelector('[data-id="f3"] image')?.getAttribute('href')).toBe('a.png');
      url = 'b.png';
      act(() => listeners.forEach((l) => l()));
      expect(c.querySelector('[data-id="f3"] image')?.getAttribute('href')).toBe('b.png');
    } finally {
      setImageService(null);
    }
  });
});
