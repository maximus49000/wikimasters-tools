// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { RoomCardDialog } from '../../src/content/RoomCardDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(extra: Record<string, unknown> = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const handlers = { onOpenMarket: vi.fn(), onOpenCard: vi.fn(), onClose: vi.fn() };
  act(() => {
    createRoot(container).render(
      <RoomCardDialog slug="Paris" card={{ title: 'Paris', rarity: 'Rare', attack: 12, defense: 30, extract: 'Capitale de la France.', tags: [{ name: 'Ville' }] }} {...handlers} {...extra} />,
    );
  });
  return { container, ...handlers };
}
const click = (el: Element | null) => act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

describe('fiche d’une carte de la pièce', () => {
  it('affiche les données sauvegardées', () => {
    const { container } = mount();
    expect(container.textContent).toContain('Paris');
    expect(container.textContent).toContain('Rare');
    expect(container.textContent).toContain('Attaque 12 · Défense 30');
    expect(container.textContent).toContain('Capitale de la France.');
    expect(container.textContent).toContain('Ville');
  });

  it('propose le marché, la carte et la fermeture', () => {
    const { container, onOpenMarket, onOpenCard, onClose } = mount();
    click(container.querySelector('[data-action="market"]'));
    click(container.querySelector('[data-action="card"]'));
    click(container.querySelector('[data-action="close"]'));
    expect(onOpenMarket).toHaveBeenCalledWith('Paris');
    expect(onOpenCard).toHaveBeenCalledWith('Paris');
    expect(onClose).toHaveBeenCalled();
  });

  it('se ferme avec Échap', () => {
    const { onClose } = mount();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).toHaveBeenCalled();
  });
});
